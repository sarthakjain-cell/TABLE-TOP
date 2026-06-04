'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Decimal } from 'decimal.js';

interface TableSessionState {
  sessionId: string;
  tableId: string;
  tableNumber: string;
  restaurantMode: 'FULL_SERVICE' | 'SELF_SERVICE';
  cart: {
    items: Array<{
      orderItemId: string;
      menuItemId: string;
      name: string;
      price: string;
      quantity: number;
      modifications: string[];
      subtotal: string;
    }>;
    subtotal: string;
  };
  orders: Array<{
    orderId: string;
    status: 'PENDING' | 'NEW' | 'PREPARING' | 'READY_TO_SERVE' | 'COMPLETED';
    createdAt: string;
    items: Array<{
      orderItemId: string;
      menuItemId: string;
      name: string;
      price: string;
      orderedQuantity: number;
      paidQuantity: number;
      unpaidQuantity: number;
      modifications: string[];
    }>;
  }>;
  billing: {
    totals: { subtotal: string; tax: string; grandTotal: string };
    paid: { subtotal: string; tax: string; grandTotal: string };
    remaining: { subtotal: string; tax: string; grandTotal: string };
  };
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  tableSession: TableSessionState | null;
  joinTableSession: (tableId: string, sessionId: string) => void;
  addItemToCart: (menuItemId: string, quantity: number, modifications?: string[]) => void;
  submitCart: () => void;
  requestHelp: (requestType: string) => void;
  authToken: string | null;
  setAuthToken: (token: string | null) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

const getSocketUrl = () => {
  if (typeof window !== 'undefined') {
    // If accessed from a mobile phone / local network IP, override env and connect to that IP at port 3001
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocalhost) {
      return `${window.location.protocol}//${window.location.hostname}:3001`;
    }
    return process.env.NEXT_PUBLIC_API_URL || `${window.location.protocol}//${window.location.hostname}:3001`;
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
};

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [authToken, setAuthTokenState] = useState<string | null>(null);
  const [tableSession, setTableSession] = useState<TableSessionState | null>(null);

  // Keep track of parameters in ref to handle connection drop catch-up synchronizations
  const sessionParams = useRef<{ tableId: string; sessionId: string } | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Expose function to store auth headers for RBAC API routes (e.g. Admin/Kitchen dashboards)
  const setAuthToken = (token: string | null) => {
    setAuthTokenState(token);
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('tabletop_auth_token', token);
        document.cookie = `tabletop_auth_token=${token}; path=/; max-age=86400; SameSite=Strict; Secure`;
      } else {
        localStorage.removeItem('tabletop_auth_token');
        document.cookie = 'tabletop_auth_token=; path=/; max-age=0; SameSite=Strict; Secure';
      }
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasCookie = document.cookie.includes('tabletop_auth_token=');
      const savedToken = localStorage.getItem('tabletop_auth_token');
      if (savedToken && hasCookie) {
        setAuthTokenState(savedToken);
      } else if (savedToken && !hasCookie) {
        localStorage.removeItem('tabletop_auth_token');
      }
    }

    // Initialize Socket client
    const socketInstance = io(getSocketUrl(), {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });
    socketRef.current = socketInstance;

    socketInstance.on('connect', () => {
      setIsConnected(true);
      console.log('Socket.io connected:', socketInstance.id);

      // Connection drop catch-up resync logic
      if (sessionParams.current) {
        const { tableId, sessionId } = sessionParams.current;
        socketInstance.emit('joinSession', { tableId, sessionId }, (res: any) => {
          if (res?.success) {
            console.log('Resynced session state successfully on socket reconnection');
            setTableSession(res.state);
          }
        });
      }
    });

    socketInstance.on('disconnect', (reason) => {
      setIsConnected(false);
      console.warn('Socket.io disconnected, reason:', reason);
    });

    // Capture explicit resync events
    socketInstance.on('sessionSynced', (data: TableSessionState) => {
      console.log('Received exclusive session sync payload:', data);
      setTableSession(data);
    });

    socketInstance.on('cartUpdated', ({ cart }) => {
      console.log('Real-time cart sync update:', cart);
      setTableSession((prev) => {
        if (!prev) return null;
        return { ...prev, cart };
      });
    });

    socketInstance.on('orderStatusUpdated', (data) => {
      console.log('Real-time order status update:', data);
      if (sessionParams.current) {
        socketInstance.emit('joinSession', sessionParams.current, (res: any) => {
          if (res?.success) setTableSession(res.state);
        });
      }
    });

    socketInstance.on('pickupReady', (data) => {
      console.log('Pickup ready:', data);
      window.dispatchEvent(new CustomEvent('pickup-ready', { detail: data }));
    });

    socketInstance.on('menuItemAvailabilityChanged', ({ menuItemId, isAvailable }) => {
      console.log(`Menu Item ${menuItemId} availability changed:`, isAvailable);
      window.dispatchEvent(new CustomEvent('menu-updated'));
      // Fetches updated state if item availability shifts
      if (sessionParams.current) {
        socketInstance.emit('joinSession', sessionParams.current, (res: any) => {
          if (res?.success) setTableSession(res.state);
        });
      }
    });

    socketInstance.on('menuUpdated', () => {
      console.log('Menu catalog updated, forcing refresh');
      window.dispatchEvent(new CustomEvent('menu-updated'));
    });

    socketInstance.on('operationalModeChanged', ({ mode }) => {
      console.log('Operational mode toggled:', mode);
      setTableSession((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          restaurantMode: mode,
        };
      });
    });

    socketInstance.on('error', (err) => {
      console.error('Socket server error returned:', err);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.off('connect');
      socketInstance.off('disconnect');
      socketInstance.off('sessionSynced');
      socketInstance.off('cartUpdated');
      socketInstance.off('orderStatusUpdated');
      socketInstance.off('pickupReady');
      socketInstance.off('menuItemAvailabilityChanged');
      socketInstance.off('menuUpdated');
      socketInstance.off('operationalModeChanged');
      socketInstance.off('error');
      socketInstance.close();
      socketRef.current = null;
    };
  }, []);

  const joinTableSession = (tableId: string, sessionId: string) => {
    sessionParams.current = { tableId, sessionId };
    const currentSocket = socketRef.current;
    if (currentSocket && currentSocket.connected) {
      currentSocket.emit('joinSession', { tableId, sessionId }, (res: any) => {
        if (res?.success) {
          console.log('Joined session room successfully:', sessionId);
          setTableSession(res.state);
        } else {
          console.error('Failed to join session room:', res?.error);
        }
      });
    }
  };

  const addItemToCart = (menuItemId: string, quantity: number, modifications?: string[]) => {
    const currentSocket = socketRef.current;
    if (currentSocket && currentSocket.connected) {
      currentSocket.emit('addItemToCart', { menuItemId, quantity, modifications }, (res: any) => {
        if (!res?.success) {
          console.error('Error adding item to cart:', res?.error);
        }
      });
    }
  };

  const submitCart = () => {
    const currentSocket = socketRef.current;
    if (currentSocket && currentSocket.connected) {
      currentSocket.emit('submitCart', (res: any) => {
        if (!res?.success) {
          console.error('Error submitting table cart:', res?.error);
        }
      });
    }
  };

  const requestHelp = (requestType: string) => {
    const currentSocket = socketRef.current;
    if (currentSocket && currentSocket.connected && sessionParams.current) {
      currentSocket.emit('requestHelp', {
        tableId: sessionParams.current.tableId,
        requestType,
      });
    }
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        tableSession,
        joinTableSession,
        addItemToCart,
        submitCart,
        requestHelp,
        authToken,
        setAuthToken,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

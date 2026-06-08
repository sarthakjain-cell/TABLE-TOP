'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Decimal } from 'decimal.js';

export interface TableSessionState {
  sessionId: string;
  tableId: string;
  tableNumber: string;
  restaurantMode: 'FULL_SERVICE' | 'SELF_SERVICE';
  paymentMode: 'PRE_PAY' | 'POST_PAY';
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
  submitCart: () => Promise<{ success: boolean; error?: string }>;
  requestHelp: (requestType: string) => void;
  authToken: string | null;
  setAuthToken: (token: string | null) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

const getSocketUrl = () => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }
  
  return 'http://localhost:3001';
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
        try {
          const raw = atob(token.replace(/-/g, '+').replace(/_/g, '/'));
          const parsed = JSON.parse(raw);
          const payload = JSON.parse(parsed.payload);
          if (payload.restaurantId) {
             localStorage.setItem('tabletop_restaurant_id', payload.restaurantId);
          }
        } catch (e) {
          console.error('Failed to decode token restaurantId', e);
        }
      } else {
        localStorage.removeItem('tabletop_auth_token');
        localStorage.removeItem('tabletop_restaurant_id');
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
        try {
          const raw = atob(savedToken.replace(/-/g, '+').replace(/_/g, '/'));
          const parsed = JSON.parse(raw);
          const payload = JSON.parse(parsed.payload);
          if (payload.restaurantId) {
             localStorage.setItem('tabletop_restaurant_id', payload.restaurantId);
          }
        } catch (e) {
          console.error('Failed to decode token restaurantId', e);
        }
      } else if (savedToken && !hasCookie) {
        localStorage.removeItem('tabletop_auth_token');
        localStorage.removeItem('tabletop_restaurant_id');
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
      window.dispatchEvent(new CustomEvent('order-status-updated', { detail: data }));
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

    // BFCache (Back/Forward Cache) Optimization
    // Browsers will not cache pages with open WebSockets. We must explicitly close it when the page hides.
    const handlePageHide = () => {
      if (socketInstance.connected) {
        socketInstance.disconnect();
      }
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      // If the page is restored from the BFCache, reconnect the socket
      if (event.persisted || socketInstance.disconnected) {
        socketInstance.connect();
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);

    setSocket(socketInstance);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
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

  const submitCart = (): Promise<{success: boolean; error?: string}> => {
    return new Promise((resolve) => {
      const currentSocket = socketRef.current;
      if (currentSocket && currentSocket.connected) {
        currentSocket.emit('submitCart', (res: any) => {
          if (!res?.success) {
            console.error('Error submitting table cart:', res?.error);
          }
          resolve(res);
        });
      } else {
        resolve({ success: false, error: 'Socket not connected' });
      }
    });
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

'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useSocket } from '../../../context/SocketContext';
import { decimalMath } from '../../../utils/decimalMath';
import nextDynamic from 'next/dynamic';
import Script from 'next/script';
import { CheckCircle, Users } from 'lucide-react';

const QRCodeSVG = nextDynamic(() => import('qrcode.react').then((mod) => mod.QRCodeSVG), {
  ssr: false,
  loading: () => <div className="w-[200px] h-[200px] flex items-center justify-center bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl"><span className="text-sm font-bold text-gray-400">Loading QR...</span></div>
});

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: string;
  halfPrice?: string | null;
  hasHalfPortion?: boolean;
  category?: string;
  isAvailable: boolean;
  modifierGroups?: any;
  imageUrl?: string;
}

export const dynamic = 'force-dynamic';

export default function CustomerPage({ params }: { params: { tableToken: string } }) {
  const { tableToken } = params;
  const {
    socket,
    isConnected,
    tableSession,
    joinTableSession,
    addItemToCart,
    submitCart,
    requestHelp,
  } = useSocket();

  const [restaurant, setRestaurant] = useState<any>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'menu' | 'cart' | 'orders' | 'billing'>('menu');
  const [checkoutMode, setCheckoutMode] = useState<'IDLE' | 'CHOICE' | 'PAY_FULL' | 'SPLIT' | 'CHARGE_ROOM' | 'SUCCESS'>('IDLE');
  const [showBellModal, setShowBellModal] = useState(false);
  const [showPickupAlert, setShowPickupAlert] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  
  // Optimistic UI state for cart quantities
  const [itemBeingCustomized, setItemBeingCustomized] = useState<MenuItem | null>(null);
  const [customMods, setCustomMods] = useState<string[]>([]);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, string[]>>({});
  const [isHalfPortionMod, setIsHalfPortionMod] = useState(false);

  const [optimisticQuantities, setOptimisticQuantities] = useState<Record<string, number>>({});
  
  // Clear optimistic state when real server state updates
  useEffect(() => {
    setOptimisticQuantities({});
  }, [tableSession?.cart?.items]);

  const handleOptimisticAdd = (menuItemId: string, quantity: number, modifications: string[] = []) => {
    const key = `${menuItemId}-${JSON.stringify(modifications)}`;
    
    const serverItem = tableSession?.cart?.items?.find((i: any) => i.menuItemId === menuItemId && JSON.stringify(i.modifications || []) === JSON.stringify(modifications));
    const baseQuantity = serverItem ? serverItem.quantity : 0;
    
    setOptimisticQuantities(prev => ({
      ...prev,
      [key]: Math.max(0, (prev[key] !== undefined ? prev[key] : baseQuantity) + quantity)
    }));
    
    addItemToCart(menuItemId, quantity, modifications.length > 0 ? modifications : undefined);
  };
  
  const addDebugLog = (msg: string) => {
    console.log(msg);
    setDebugLogs(prev => [...prev, new Date().toLocaleTimeString() + ': ' + msg]);
  };
  
  // Splitwise style contributors state
  const [contributors, setContributors] = useState([{ id: Date.now(), name: "Payer 1", amount: "" }]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [completedTransactionId, setCompletedTransactionId] = useState<string | null>(null);
  const [receiptPhone, setReceiptPhone] = useState('');
  const [sendingReceipt, setSendingReceipt] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [visibleItemCount, setVisibleItemCount] = useState(10);
  const loaderRef = useRef<HTMLDivElement>(null);
  const imageCacheBuster = useRef(Date.now());
  const categories = ['All', ...Array.from(new Set(menuItems.map(m => m.category || 'Main Course')))];

  const [waitingForWaiterApproval, setWaitingForWaiterApproval] = useState(false);
  const [waitingOrderIds, setWaitingOrderIds] = useState<string[]>([]);

  // Robust Waiter Approval listener that survives BFCache / tab switching
  useEffect(() => {
    if (waitingForWaiterApproval && tableSession && waitingOrderIds.length > 0) {
      // Check if ALL of the waiting orders have transitioned OUT of PAYMENT_PENDING
      const areAllApproved = waitingOrderIds.every(orderId => {
        const order = tableSession.orders.find(o => o.orderId === orderId);
        return order && (order.status as string) !== 'PAYMENT_PENDING';
      });

      if (areAllApproved) {
        // The waiter approved our specific PAYMENT_PENDING orders
        setWaitingForWaiterApproval(false);
        setWaitingOrderIds([]);
        setCheckoutMode('SUCCESS');
        setActiveTab('billing');
      }
    }
  }, [tableSession?.orders, waitingForWaiterApproval, waitingOrderIds]);

  // Handle Android hardware back button gracefully to unclaim splits
  useEffect(() => {
    const handleStatusUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { status, orderId } = customEvent.detail;
      if (orderId === 'SESSION_COMPLETE' && status === 'COMPLETED' && tableSession?.paymentMode === 'POST_PAY') {
        setCheckoutMode('SUCCESS');
        setActiveTab('billing');
      }
    };

    window.addEventListener('order-status-updated', handleStatusUpdate);
    return () => window.removeEventListener('order-status-updated', handleStatusUpdate);
  }, [tableSession?.paymentMode]);

  const [showUpiOptions, setShowUpiOptions] = useState(false);

  // Multiplayer Split State
  interface SplitPortion {
    id: string;
    name: string;
    amount: number;
    status: 'PENDING' | 'CLAIMED' | 'PAID';
  }

  interface SplitLobby {
    sessionId: string;
    splits: SplitPortion[];
    isComplete: boolean;
  }

  const [splitLobby, setSplitLobby] = useState<SplitLobby | null>(null);
  const [localClaimedSplitId, setLocalClaimedSplitId] = useState<string | null>(null);
  useEffect(() => {
    const handlePopState = () => {
      if (localClaimedSplitId) {
        socket?.emit('unclaimSplitPayment', { splitId: localClaimedSplitId });
        setLocalClaimedSplitId(null);
        setPaymentProcessing(false);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [localClaimedSplitId, socket]);


  // 1. Verify token & join table room on mount
  useEffect(() => {
    if (tableToken) {
      const fetchVerifyUrl = `/api/tables/verify?token=${tableToken}`;
      fetch(fetchVerifyUrl)
        .then((res) => {
          if (!res.ok) throw new Error('Invalid table scan token');
          return res.json();
        })
        .then((data) => {
          setRestaurant(data.restaurant);
          joinTableSession(data.tableId, data.session.id);
          
          // Fetch menu items securely via the new table token endpoint
          // This endpoint was specifically built for the customer portal to only return available items
          return fetch(`/api/table/${tableToken}/menu`);
        })
        .then((res) => res.json())
        .then((items) => {
          if (Array.isArray(items)) {
            setMenuItems(items);
          } else if (items?.error) {
            setError(items.error);
          }
        })
        .catch((err) => {
          setError(err.message || 'Failed to sync with table session');
        });
    }
  }, [tableToken]);

  // 2. Register real-time pickup audio chime listeners
  useEffect(() => {
    const handlePickupAlert = () => {
      const audio = new Audio('/assets/audio/chime.mp3');
      audio.play().catch((err) => console.log('Audio autoplay blocked:', err));
      setShowPickupAlert(true);
    };

    if (tableSession?.sessionId) {
      // Listen for socket events
      window.addEventListener('pickup-ready', handlePickupAlert);
    }
    
    const handleMenuUpdate = () => {
      fetch(`/api/table/${tableToken}/menu`)
        .then((res) => res?.json())
        .then((items) => {
          if (items && !items.error) {
            imageCacheBuster.current = Date.now();
            setMenuItems(items);
          }
        })
        .catch((err) => console.error('Silent menu update failed', err));
    };

    window.addEventListener('menu-updated', handleMenuUpdate);

    return () => {
      window.removeEventListener('pickup-ready', handlePickupAlert);
      window.removeEventListener('menu-updated', handleMenuUpdate);
    };
  }, [tableSession]);

  // 3. Intersection Observer for Infinite Scroll (Fixes Total Blocking Time)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleItemCount((prev) => prev + 10);
        }
      },
      { threshold: 0.1 }
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => {
      // Cleanup if needed
    };
  }, [tableToken, joinTableSession]);

  // Handle Multiplayer Split Socket Sync
  useEffect(() => {
    if (!socket) return;
    
    const handleSplitSync = ({ lobby }: { lobby: SplitLobby | null }) => {
      setSplitLobby(lobby);
    };
    
    socket.on('splitPaymentSync', handleSplitSync);
    return () => {
      socket.off('splitPaymentSync', handleSplitSync);
    };
  }, [socket]);

  const getFullUnpaidItemsPayload = () => {
    const items: any[] = [];
    tableSession?.orders?.flatMap((o: any) => o.items).forEach((item: any) => {
      if (item.unpaidQuantity > 0) {
        items.push({ orderItemId: item.orderItemId, quantityToPay: item.unpaidQuantity });
      }
    });
    return items;
  };

  const isHotel = restaurant?.establishmentType === 'HOTEL';
  const roomServiceFee = isHotel ? parseFloat(restaurant?.roomServiceFee || '0') : 0;
  
  const subtotalGrand = parseFloat(tableSession?.billing?.remaining?.grandTotal || '0');
  const cartSubtotal = parseFloat(tableSession?.cart?.subtotal || '0');
  const isCartCheckout = isHotel && cartSubtotal > 0;
  
  const grandTotal = isCartCheckout 
    ? cartSubtotal + roomServiceFee 
    : (subtotalGrand > 0 ? subtotalGrand + roomServiceFee : 0);
  
  const totalAllocated = contributors.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
  const remaining = grandTotal - totalAllocated;

  const executeCheckout = async (paymentMethod: 'CASH' | 'CARD' | 'UPI' | 'ROOM') => {
    addDebugLog('executeCheckout started with ' + paymentMethod);
    if (!tableSession) {
      addDebugLog('tableSession is null');
      return;
    }
    setPaymentProcessing(true);

    try {
      if (isCartCheckout || checkoutMode === 'CHARGE_ROOM') {
        addDebugLog('Attempting cart/room checkout');
        const response = await fetch(`/api/sessions/${tableSession?.sessionId}/checkout-cart`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerName, customerPhone })
        });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Cart checkout failed');
        }
        
        const resData = await response.json();
        setCompletedTransactionId(resData.transaction?.id || null);
      } else {
        const payloadItems = getFullUnpaidItemsPayload();
        addDebugLog('Payload Items Length: ' + payloadItems.length);
        if (payloadItems.length === 0) {
          addDebugLog('payloadItems is EMPTY! Session orders: ' + JSON.stringify(tableSession?.orders));
          setPaymentProcessing(false);
          return;
        }
        addDebugLog('Calling /pay-split with items...');
        
        const response = await fetch(`/api/sessions/${tableSession?.sessionId}/pay-split`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName,
            customerPhone,
            paymentMethod,
            items: payloadItems
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          addDebugLog('pay-split returned error: ' + (errData.error || 'Unknown error'));
          throw new Error(errData.error || 'Payment failed');
        }
        
        const resData = await response.json();
        const newTxId = resData.transactionId || resData.transaction?.id || null;
        const razorpayOrderId = resData.razorpayOrderId;
        const amountInPaise = resData.amount;
        
        addDebugLog('pay-split success! Transaction ID: ' + newTxId);
        setCompletedTransactionId(newTxId);

        if (paymentMethod === 'CASH') {
          // Skip Razorpay for CASH
          setContributors([{ id: Date.now(), name: "Payer 1", amount: "" }]);
          setShowUpiOptions(false);
          setCheckoutMode('SUCCESS');
          setPaymentProcessing(false);
          return;
        }

        // Initialize Razorpay
        const options = {
          key: 'rzp_live_Szz1d4E7cQBqbS', // Hardcoded to bypass Vercel old env cache
          amount: amountInPaise,
          currency: "INR",
          name: restaurant?.name || "Table Top",
          description: "Order Payment",
          order_id: razorpayOrderId,
          handler: async function (response: any) {
            addDebugLog('Razorpay Payment Success: ' + response.razorpay_payment_id);
            setPaymentProcessing(true);
            try {
              const verifyRes = await fetch(`/api/sessions/${tableSession?.sessionId}/verify-payment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature
                })
              });
              
              if (!verifyRes.ok) {
                const errData = await verifyRes.json();
                throw new Error(errData.error || 'Payment verification failed');
              }
              
              // Automatically trigger WhatsApp receipt
              if (newTxId && customerPhone) {
                addDebugLog('Auto-sending WhatsApp receipt to ' + customerPhone);
                try {
                  const receiptRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/receipt`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: customerPhone, transactionId: newTxId })
                  });
                  if (!receiptRes.ok) {
                    const errTxt = await receiptRes.text();
                    alert('Backend receipt error: ' + errTxt);
                  } else {
                    const resJson = await receiptRes.json();
                    alert('Backend Response: ' + resJson.message);
                    addDebugLog('Receipt API returned OK: ' + resJson.message);
                  }
                } catch (err: any) {
                  alert('Network error while sending receipt: ' + err.message);
                  addDebugLog('Failed to auto-send receipt');
                }
              }
              
              setContributors([{ id: Date.now(), name: "Payer 1", amount: "" }]);
              setShowUpiOptions(false);
              setCheckoutMode('SUCCESS');
            } catch (err: any) {
               addDebugLog('Verification error: ' + err.message);
               alert('Payment successful but verification failed: ' + err.message);
            } finally {
               setPaymentProcessing(false);
            }
          },
          prefill: {
            name: customerName,
            contact: customerPhone
          },
          theme: {
            color: "#F97316"
          },
          modal: {
            ondismiss: function() {
              setPaymentProcessing(false);
            }
          }
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.on('payment.failed', function (response: any) {
           addDebugLog('Razorpay Payment Failed: ' + response.error.description);
           setPaymentProcessing(false);
        });
        rzp.open();
      }

    } catch (err: any) {
      addDebugLog('PAYMENT ERROR: ' + (err.message || 'Payment execution failed'));
      setPaymentProcessing(false);
    }
  };

  // Automatically execute checkout if the lobby is complete
  useEffect(() => {
    if (splitLobby?.isComplete) {
      executeCheckout('UPI');
      setSplitLobby(null);
      setLocalClaimedSplitId(null);
    }
  }, [splitLobby?.isComplete]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            ⚠️
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Scan Verification Failed</h1>
          <p className="text-gray-500 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-red-600 text-white py-3 rounded-xl font-semibold shadow-md active:bg-red-700 transition"
          >
            Retry Scan Scan
          </button>
        </div>
      </div>
    );
  }

  if (!tableSession) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600 mb-4"></div>
        <p className="text-gray-500 font-medium">Syncing table session state...</p>
      </div>
    );
  }

  const cartSubtotalCalc = parseFloat(tableSession?.cart?.subtotal || '0');
  const calculatedTax = parseFloat(decimalMath.calculateTax(cartSubtotalCalc, restaurant?.taxRate || 0));
  const checkoutGrandTotal = parseFloat(decimalMath.add(cartSubtotalCalc, calculatedTax));
  
  const encodedMerchantName = encodeURIComponent(restaurant?.merchantName || '');
  const encodedUpiId = encodeURIComponent(restaurant?.upiId || '');
  const upiString = `upi://pay?pa=${encodedUpiId}&pn=${encodedMerchantName}&am=${grandTotal.toFixed(2)}&cu=INR&tn=Session_${tableSession?.sessionId}`;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto relative shadow-2xl pb-24">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      {/* 1. Contextual Mode Header */}
      <header className="bg-white border-b sticky top-0 z-40 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">{restaurant?.name || 'Table Top'}</h1>
            <p className="text-xs text-gray-500 font-medium">{isHotel ? 'Room' : 'Table'} Number: {tableSession.tableNumber}</p>
          </div>
          {tableSession.restaurantMode === 'FULL_SERVICE' ? (
            <button
              onClick={() => setShowBellModal(true)}
              className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-sm font-semibold active:bg-indigo-100 flex items-center gap-1 border border-indigo-100 shadow-sm"
            >
              🔔 {isHotel ? 'Room Service' : 'Call Waiter'}
            </button>
          ) : (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1 rounded-full text-xs font-semibold animate-pulse">
              Self-Service Mode
            </div>
          )}
        </div>
      </header>

      {/* 2. Self Service Pickup Alert Overlay */}
      {showPickupAlert && (
        <div className="bg-emerald-600 text-white p-4 text-center font-bold text-sm shadow-md animate-bounce sticky top-16 z-50 flex items-center justify-between">
          <span>🔔 Please collect your order from the counter!</span>
          <button onClick={() => setShowPickupAlert(false)} className="text-white font-extrabold text-lg px-2">×</button>
        </div>
      )}

      {/* 3. Main Views Branching */}
      <main className="flex-1 p-4 overflow-y-auto">
        {paymentSuccess && (
          <div className="bg-emerald-100 text-emerald-800 p-4 rounded-xl text-center font-semibold mb-4 border border-emerald-200 animate-fade-in shadow-sm">
            🎉 Payment Successful! Thank you.
          </div>
        )}

        {activeTab === 'menu' && (
          <div className="pb-8">
            <div className="sticky top-0 z-50 bg-white/90 backdrop-blur-md py-3 mb-2 -mx-4 px-4 border-b border-gray-100">
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                {categories.map(c => (
                  <button 
                    key={c}
                    onClick={() => setActiveCategory(c)}
                    className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm ${
                      activeCategory === c 
                        ? 'bg-gray-900 text-white' 
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col">
              {menuItems
                .filter(item => activeCategory === 'All' || (item.category || 'Main Course') === activeCategory)
                .slice(0, visibleItemCount)
                .map((item) => (
                <div
                  key={item.id}
                  className="border-b border-gray-100 py-6 last:border-none flex justify-between items-start gap-4"
                >
                  {/* Left Column */}
                  <div className={`flex flex-col ${item.imageUrl ? 'w-[65%]' : 'w-full'}`}>
                    {/* Mock Veg Tag */}
                    <div className="w-3.5 h-3.5 border-2 border-green-600 flex items-center justify-center rounded-sm mb-1.5 opacity-80">
                      <div className="w-1.5 h-1.5 bg-green-600 rounded-full"></div>
                    </div>
                    
                    <h3 className="text-lg font-bold text-gray-800 leading-tight">
                      {item.name}
                    </h3>
                    <div className="text-sm font-semibold text-gray-600 mt-0.5">
                      ${decimalMath.formatCurrency(item.price)}
                      {item.hasHalfPortion && item.halfPrice && (
                        <span className="ml-2 text-xs text-blue-600">Half: ${decimalMath.formatCurrency(item.halfPrice)}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5 line-clamp-2 leading-relaxed pr-2">
                      {item.description || 'No description available.'}
                    </p>
                    
                    {!item.imageUrl && (
                      <div className="mt-4">
                        {item.isAvailable ? (
                          item.hasHalfPortion ? (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleOptimisticAdd(item.id, 1)}
                                className="bg-white text-green-600 border border-green-600 shadow-sm font-bold text-[11px] px-3 py-2 rounded-lg uppercase transition-all active:scale-95"
                              >
                                ADD FULL
                              </button>
                              <button
                                onClick={() => handleOptimisticAdd(item.id, 1, ['Half Portion'])}
                                className="bg-white text-blue-600 border border-blue-600 shadow-sm font-bold text-[11px] px-3 py-2 rounded-lg uppercase transition-all active:scale-95"
                              >
                                ADD HALF
                              </button>
                              {((() => { try { const g = typeof item.modifierGroups === "string" ? JSON.parse(item.modifierGroups) : item.modifierGroups; return Array.isArray(g) && g.length > 0; } catch { return false; } })()) && (
                                <button onClick={() => setItemBeingCustomized(item)} className="bg-gray-100 text-gray-600 shadow-sm font-bold text-[11px] px-2 py-2 rounded-lg transition-all active:scale-95">
                                  ⚙️
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleOptimisticAdd(item.id, 1)}
                                className="bg-white text-green-600 border border-green-600 shadow-sm font-bold text-xs px-6 py-2 rounded-lg uppercase transition-all active:scale-95"
                              >
                                ADD
                              </button>
                              {((() => { try { const g = typeof item.modifierGroups === "string" ? JSON.parse(item.modifierGroups) : item.modifierGroups; return Array.isArray(g) && g.length > 0; } catch { return false; } })()) && (
                                <button onClick={() => setItemBeingCustomized(item)} className="bg-gray-100 text-gray-600 shadow-sm font-bold text-xs px-3 py-2 rounded-lg transition-all active:scale-95">
                                  ⚙️
                                </button>
                              )}
                            </div>
                          )
                        ) : (
                          <span className="text-xs text-red-500 font-extrabold">Out of Stock</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right Column */}
                  {item.imageUrl && (
                    <div className="relative w-[35%] max-w-[140px] shrink-0">
                      <div className="aspect-square w-full rounded-2xl overflow-hidden bg-gray-50 shadow-sm border border-gray-100">
                        <img 
                          src={`${item.imageUrl}?v=${imageCacheBuster.current}`}
                          alt={item.name} 
                          className={`w-full h-full object-cover ${!item.isAvailable ? 'grayscale opacity-60' : ''}`}
                          loading="lazy"
                        />
                      </div>
                      
                      {item.isAvailable ? (
                        item.hasHalfPortion ? (
                          <div className="absolute bottom-[-16px] left-1/2 transform -translate-x-1/2 flex gap-1 w-full justify-center px-1">
                            <button
                              onClick={() => handleOptimisticAdd(item.id, 1)}
                              className="bg-white text-green-600 border border-gray-200 shadow-md font-extrabold text-[9px] px-1 py-2 rounded-lg uppercase whitespace-nowrap active:scale-95 transition-transform flex-1 text-center"
                            >
                              FULL
                            </button>
                            <button
                              onClick={() => handleOptimisticAdd(item.id, 1, ['Half Portion'])}
                              className="bg-white text-blue-600 border border-gray-200 shadow-md font-extrabold text-[9px] px-1 py-2 rounded-lg uppercase whitespace-nowrap active:scale-95 transition-transform flex-1 text-center"
                            >
                              HALF
                            </button>
                            {((() => { try { const g = typeof item.modifierGroups === "string" ? JSON.parse(item.modifierGroups) : item.modifierGroups; return Array.isArray(g) && g.length > 0; } catch { return false; } })()) && (
                              <button onClick={() => setItemBeingCustomized(item)} className="bg-white text-gray-600 border border-gray-200 shadow-md font-extrabold text-[9px] px-1 py-2 rounded-lg active:scale-95 transition-transform">
                                ⚙️
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="absolute bottom-[-12px] left-1/2 transform -translate-x-1/2 flex gap-1">
                            <button
                              onClick={() => handleOptimisticAdd(item.id, 1)}
                              className="bg-white text-green-600 border border-gray-200 shadow-md font-extrabold text-xs px-4 py-2 rounded-lg uppercase whitespace-nowrap active:scale-95 transition-transform"
                            >
                              ADD
                            </button>
                            {((() => { try { const g = typeof item.modifierGroups === "string" ? JSON.parse(item.modifierGroups) : item.modifierGroups; return Array.isArray(g) && g.length > 0; } catch { return false; } })()) && (
                              <button onClick={() => setItemBeingCustomized(item)} className="bg-white text-gray-600 border border-gray-200 shadow-md font-extrabold text-xs px-2 py-2 rounded-lg active:scale-95 transition-transform">
                                ⚙️
                              </button>
                            )}
                          </div>
                        )
                      ) : (
                        <div className="absolute bottom-[-12px] left-1/2 transform -translate-x-1/2 bg-gray-100 text-gray-400 border border-gray-200 shadow-sm font-bold text-[10px] px-3 py-1 rounded-lg uppercase whitespace-nowrap">
                          Sold Out
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              
              {/* Loader Trigger for Infinite Scroll */}
              <div ref={loaderRef} className="h-20 w-full flex items-center justify-center">
                {visibleItemCount < menuItems.filter(item => activeCategory === 'All' || (item.category || 'Main Course') === activeCategory).length && (
                  <div className="animate-pulse w-8 h-8 rounded-full border-4 border-gray-200 border-t-indigo-600"></div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'cart' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold text-gray-800 flex items-center gap-2">
                <span>🛒</span> Shared Table Cart
              </h2>
              <span className="text-xs bg-indigo-50 border border-indigo-100 text-indigo-600 px-3 py-1 rounded-full font-bold">
                Live State
              </span>
            </div>

            {tableSession.cart.items.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400 text-sm">Cart is currently empty. Tap items in the menu to add them.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border p-4 space-y-3 shadow-sm">
                  {tableSession.cart.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <h4 className="font-bold text-gray-800 text-sm">{item.name}</h4>
                        <span className="text-xs text-gray-400">Qty: {item.quantity}</span>
                        {item.modifications.length > 0 && (
                          <div className="text-xs text-amber-600 mt-0.5">({item.modifications.join(', ')})</div>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-extrabold text-gray-800">${item.subtotal}</span>
                        <div className="flex items-center border rounded-lg overflow-hidden">
                          <button
                            onClick={() => handleOptimisticAdd(item.menuItemId, -1, item.modifications)}
                            className="bg-gray-100 hover:bg-gray-200 px-2 py-1 text-xs font-bold"
                          >
                            -
                          </button>
                          <span className="px-2 text-xs font-bold">
                            {optimisticQuantities[`${item.menuItemId}-${JSON.stringify(item.modifications || [])}`] ?? item.quantity}
                          </span>
                          <button
                            onClick={() => handleOptimisticAdd(item.menuItemId, 1, item.modifications)}
                            className="bg-gray-100 hover:bg-gray-200 px-2 py-1 text-xs font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 font-bold text-gray-800">
                    <span>Subtotal:</span>
                    <span>${tableSession.cart.subtotal}</span>
                  </div>
                </div>

                {isHotel ? (
                  <button
                    onClick={() => {
                      setCheckoutMode('CHARGE_ROOM');
                      setActiveTab('billing');
                    }}
                    className="w-full bg-purple-600 text-white font-bold py-3.5 rounded-xl shadow-md hover:bg-purple-700 active:scale-[0.99] transition mt-6"
                  >
                    🛎️ Proceed to Checkout
                  </button>
                ) : (
                  <div className="mt-6 space-y-3">
                    <button
                      onClick={async () => {
                        setPaymentProcessing(true);
                        const res = await submitCart();
                        setPaymentProcessing(false);
                        if (res?.success) {
                          if (tableSession.paymentMode === 'PRE_PAY') {
                            setSelectedModifiers({});
                            setCheckoutMode('PAY_FULL');
                            setActiveTab('billing');
                          } else {
                            setActiveTab('orders');
                          }
                        } else {
                          alert(res?.error || 'Failed to place order');
                        }
                      }}
                      disabled={paymentProcessing}
                      className="w-full bg-emerald-600 text-white font-bold py-3.5 rounded-xl shadow-md hover:bg-emerald-700 active:scale-[0.99] transition flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {tableSession.paymentMode === 'PRE_PAY' ? '💳 Pay to Place Order' : '🍳 Place Order'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="animate-fade-in">
            <h2 className="text-lg font-extrabold text-gray-800 mb-4 flex items-center gap-2">
              <span>🚚</span> Track Your Orders
            </h2>
            {tableSession.orders.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400 text-sm">You haven't placed any orders yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {[...tableSession.orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(order => {
                  let statusColor = "bg-gray-100 text-gray-600 border-gray-200";
                  let statusText: string = order.status;
                  if (order.status === 'NEW') { statusColor = "bg-emerald-50 text-emerald-700 border-emerald-200"; statusText = "Sent to Kitchen"; }
                  else if (order.status === 'PREPARING') { statusColor = "bg-amber-50 text-amber-700 border-amber-200"; statusText = "Preparing"; }
                  else if (order.status === 'READY_TO_SERVE') { statusColor = "bg-indigo-50 text-indigo-700 border-indigo-200"; statusText = "Ready to Serve"; }
                  else if (order.status === 'COMPLETED') { statusColor = "bg-gray-100 text-gray-500 border-gray-200"; statusText = "Completed"; }
                  
                  return (
                    <div key={order.orderId} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex flex-col gap-3">
                      <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                        <span className="text-xs font-bold text-gray-400">
                          {new Date(order.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                        <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full border ${statusColor}`}>
                          {statusText}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {order.items.map(item => (
                          <div key={item.orderItemId} className="flex justify-between items-start">
                            <div>
                              <p className="text-sm font-bold text-gray-800">{item.orderedQuantity}x {item.name}</p>
                              {item.modifications && item.modifications.length > 0 && (
                                <p className="text-xs text-amber-500 font-bold">({item.modifications.join(', ')})</p>
                              )}
                            </div>
                            <span className="text-sm font-extrabold text-indigo-600">${item.price}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'billing' && (
          <div>
            {checkoutMode === 'CHOICE' && (
              <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-end sm:items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                <div className="bg-white w-full max-w-md rounded-[2rem] p-8 shadow-2xl animate-scale-up space-y-6">
                  <div className="text-center">
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">How would you like to pay?</h2>
                    <p className="text-gray-500 text-sm mt-2 font-medium">Choose a payment method for this table.</p>
                  </div>
                  {debugLogs.length > 0 && (
                    <div className="bg-black text-green-400 p-4 rounded-xl text-xs font-mono overflow-auto max-h-40">
                      <strong>DEBUG LOGS:</strong>
                      {debugLogs.map((log, i) => <div key={i}>{log}</div>)}
                    </div>
                  )}
                  <div className="space-y-4">
                    <button
                      onClick={() => setCheckoutMode('PAY_FULL')}
                      className="w-full h-20 bg-blue-600 hover:bg-blue-700 active:scale-95 transition-transform rounded-2xl flex flex-col items-center justify-center text-white shadow-lg shadow-blue-600/30 border border-blue-500"
                    >
                      <span className="font-black text-xl tracking-tight">Pay Full Bill</span>
                      <span className="text-xs text-blue-200 font-bold tracking-wide">Cover the entire table's check</span>
                    </button>
                    {tableSession?.paymentMode !== 'PRE_PAY' && (
                      <button
                        onClick={() => {
                          setContributors([{ id: Date.now(), name: "Payer 1", amount: "" }]);
                          setCheckoutMode('SPLIT');
                        }}
                        className="w-full h-20 border-2 border-gray-200 hover:bg-gray-50 active:scale-95 transition-transform rounded-2xl flex flex-col items-center justify-center text-gray-800"
                      >
                        <span className="font-black text-xl tracking-tight">Split Bill</span>
                        <span className="text-xs text-gray-500 font-bold tracking-wide">Pay only for what you ordered</span>
                      </button>
                    )}
                  </div>
                  <button 
                    onClick={() => {
                      setCheckoutMode('IDLE');
                      setActiveTab('menu');
                    }}
                    className="w-full py-4 text-sm font-black text-gray-400 hover:text-gray-600 transition-colors uppercase tracking-widest"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {checkoutMode === 'PAY_FULL' && (
              <div className="animate-fade-in space-y-6 pb-8">
                <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                  <span>💳</span> Full Checkout
                </h2>
                {debugLogs.length > 0 && (
                  <div className="bg-black text-green-400 p-4 rounded-xl text-xs font-mono overflow-auto max-h-40">
                    <strong>DEBUG LOGS:</strong>
                    {debugLogs.map((log, i) => <div key={i}>{log}</div>)}
                  </div>
                )}
                <div className="bg-blue-50 border border-blue-100 rounded-[2rem] p-8 shadow-sm text-center relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-4 opacity-10">
                     <span className="text-6xl">💰</span>
                   </div>
                   <p className="text-blue-800 font-bold mb-2 uppercase tracking-widest text-xs relative z-10">Total Remaining Balance</p>
                   <p className="text-6xl font-black text-blue-600 tabular-nums tracking-tighter relative z-10">${tableSession?.billing?.remaining?.grandTotal || '0.00'}</p>
                </div>
                
                <div className="bg-white border border-gray-200 rounded-[2rem] p-6 shadow-sm space-y-4">
                  <input
                    type="text" placeholder="Your Name" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 font-bold text-gray-900 placeholder-gray-400"
                  />
                  <input
                    type="tel" placeholder="Your Phone Number" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 font-bold text-gray-900 placeholder-gray-400"
                  />
                  
                  {!showUpiOptions && (
                    <>
                      <button
                        onClick={() => executeCheckout('UPI')}
                        disabled={!customerName || paymentProcessing}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-95 transition-transform text-white font-black py-5 rounded-xl shadow-lg shadow-indigo-600/30 disabled:opacity-50 mt-2 text-lg tracking-tight flex items-center justify-center gap-2"
                      >
                        💸 {paymentProcessing ? 'Processing...' : 'Pay via UPI / Cards'}
                      </button>
                      <button
                        onClick={() => executeCheckout('CASH')}
                        disabled={!customerName || paymentProcessing}
                        className="w-full bg-white text-gray-700 border-2 border-gray-200 font-black py-5 rounded-xl shadow-sm hover:bg-gray-50 active:scale-95 transition-transform disabled:opacity-50 text-lg tracking-tight flex items-center justify-center gap-2"
                      >
                        💵 Pay Cash / Card to Waiter
                      </button>
                    </>
                  )}


                  <button 
                    onClick={() => setCheckoutMode('CHOICE')} 
                    className="w-full py-4 text-xs font-black text-gray-400 hover:text-gray-600 uppercase tracking-widest transition-colors mt-4"
                  >
                    Change Payment Method
                  </button>
                </div>
              </div>
            )}

            {checkoutMode === 'SPLIT' && (
              <div className="animate-fade-in space-y-6 pb-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                    <span>🧾</span> Custom Split
                  </h2>
                  <button 
                    onClick={() => setCheckoutMode('CHOICE')} 
                    className="text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg active:scale-95 transition-transform"
                  >
                    Back to Options
                  </button>
                </div>

                {/* Tracker Header */}
                <div className="bg-indigo-50 border border-indigo-100 rounded-[2rem] p-6 shadow-sm text-center relative overflow-hidden">
                  <p className="text-indigo-800 font-bold mb-1 uppercase tracking-widest text-xs">Total Bill</p>
                  <p className="text-5xl font-black text-indigo-600 tabular-nums tracking-tighter">${grandTotal.toFixed(2)}</p>
                  
                  <div className="mt-4 p-3 bg-white/60 rounded-xl">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Remaining to Allocate</p>
                    <p className={`text-2xl font-black tabular-nums transition-colors ${
                      Math.abs(remaining) <= 0.01 ? 'text-emerald-500' : 
                      remaining < -0.01 ? 'text-red-500' : 'text-gray-800'
                    }`}>
                      ${Math.abs(remaining).toFixed(2)}
                    </p>
                    {Math.abs(remaining) <= 0.01 && <p className="text-emerald-600 text-sm font-bold mt-1">✨ Bill fully allocated!</p>}
                    {remaining < -0.01 && <p className="text-red-600 text-sm font-bold mt-1">⚠️ Exceeds total by ${Math.abs(remaining).toFixed(2)}</p>}
                  </div>
                </div>

                {/* Dynamic Rows */}
                <div className="space-y-3">
                  {contributors.map((contributor, index) => (
                    <div key={contributor.id} className="flex gap-2 items-center bg-white border border-gray-200 p-2 rounded-2xl shadow-sm">
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder="Name"
                          value={contributor.name}
                          onChange={(e) => {
                            const newC = [...contributors];
                            newC[index].name = e.target.value;
                            setContributors(newC);
                          }}
                          className="w-full px-3 py-2 bg-transparent text-sm font-bold text-gray-800 focus:outline-none"
                        />
                      </div>
                      <div className="w-1/3 relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                        <input
                          type="number"
                          placeholder="0.00"
                          value={contributor.amount}
                          onChange={(e) => {
                            const newC = [...contributors];
                            newC[index].amount = e.target.value;
                            setContributors(newC);
                          }}
                          className="w-full pl-7 pr-3 py-2 bg-gray-50 rounded-xl text-sm font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      {contributors.length > 2 && (
                        <button
                          onClick={() => setContributors(contributors.filter((_, i) => i !== index))}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                  
                  <button
                    onClick={() => setContributors([...contributors, { id: Date.now(), name: `Payer ${contributors.length + 1}`, amount: "" }])}
                    className="w-full py-3 border-2 border-dashed border-gray-300 rounded-2xl text-gray-500 font-bold text-sm hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                  >
                    + Add Person
                  </button>
                </div>

                <button
                    onClick={() => {
                      const validSplits = contributors.filter(c => parseFloat(c.amount) > 0);
                      socket?.emit('initiateSplitPayment', { splits: validSplits.map(c => ({ ...c, amount: parseFloat(c.amount) })) });
                    }}
                    disabled={paymentProcessing || Math.abs(remaining) > 0.01}
                    className="w-full bg-indigo-500 hover:bg-indigo-600 active:scale-95 transition-transform text-white font-black py-5 rounded-xl shadow-lg shadow-indigo-500/30 disabled:opacity-50 mt-4 text-lg tracking-tight flex items-center justify-center gap-2"
                  >
                    <Users size={24} /> Start Multiplayer Split
                  </button>
                </div>
              )}

            {checkoutMode === 'CHARGE_ROOM' && (
              <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-end sm:items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                <div className="bg-white w-full max-w-md rounded-[2rem] p-8 shadow-2xl animate-scale-up space-y-6">
                  <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2 text-center justify-center">
                    <span>🛎️</span> Charge to Room
                  </h2>
                  <div className="bg-purple-50 border border-purple-100 rounded-[2rem] p-8 shadow-sm text-center relative overflow-hidden">
                     <div className="absolute top-0 right-0 p-4 opacity-10">
                       <span className="text-6xl">🏨</span>
                     </div>
                     <p className="text-purple-800 font-bold mb-2 uppercase tracking-widest text-xs relative z-10">Total Bill</p>
                     <p className="text-6xl font-black text-purple-600 tabular-nums tracking-tighter relative z-10">${grandTotal.toFixed(2)}</p>
                  </div>
                  
                  <div className="bg-white border border-gray-200 rounded-[2rem] p-6 shadow-sm space-y-4">
                    <input
                      type="text" placeholder="Last Name on Reservation" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600 font-bold text-gray-900 placeholder-gray-400"
                    />
                    <input
                      type="text" placeholder="Room Number" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600 font-bold text-gray-900 placeholder-gray-400"
                    />
                    <button
                      onClick={() => executeCheckout('ROOM')}
                      disabled={paymentProcessing || !customerName || !customerPhone}
                      className="w-full bg-purple-600 hover:bg-purple-700 active:scale-95 transition-transform text-white font-black py-5 rounded-xl shadow-lg shadow-purple-600/30 disabled:opacity-50 mt-2 text-lg tracking-tight"
                    >
                      {paymentProcessing ? 'Processing...' : 'Confirm Order'}
                    </button>
                    <button 
                      onClick={() => setCheckoutMode('IDLE')} 
                      className="w-full py-4 text-xs font-black text-gray-400 hover:text-gray-600 uppercase tracking-widest transition-colors mt-2"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {checkoutMode === 'SUCCESS' && (
              <div className="fixed inset-0 bg-slate-900/60 z-[70] flex items-end sm:items-center justify-center p-4 backdrop-blur-md animate-fade-in">
                <div className="bg-white w-full max-w-md rounded-[2rem] p-8 shadow-2xl animate-scale-up space-y-6 text-center">
                  <div className="mx-auto w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-4">
                    <span className="text-5xl">✅</span>
                  </div>
                  <h2 className="text-3xl font-black text-gray-900 tracking-tight">Payment Successful</h2>
                  <p className="text-gray-500 font-medium leading-relaxed text-lg">Your order has been paid completely.</p>
                  
                  <div className="bg-green-50 border border-green-200 rounded-2xl p-6 mt-6 shadow-inner">
                    <p className="text-green-800 font-extrabold flex items-center justify-center gap-2 text-lg">
                      <span>📱</span> Receipt Sent via WhatsApp!
                    </p>
                    <p className="text-green-600 text-sm mt-2 font-medium">
                      We've automatically sent your digital bill to {customerPhone}.
                    </p>
                  </div>
                  
                  <button
                    onClick={() => {
                      setCheckoutMode('IDLE');
                      setActiveTab('orders');
                    }}
                    className="w-full bg-gray-900 hover:bg-gray-800 text-white font-black px-6 py-4 rounded-xl transition active:scale-95 text-lg shadow-lg mt-4"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 5. Multiplayer Split Payment Lobby Modal */}
        {splitLobby && !splitLobby.isComplete && (
          <div className="fixed inset-0 bg-slate-900/80 z-[60] flex items-center justify-center p-4 backdrop-blur-xl animate-fade-in">
            <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl relative overflow-hidden">
                            {localClaimedSplitId ? (() => {
                const mySplit = splitLobby.splits.find(s => s.id === localClaimedSplitId);
                if (!mySplit) return null;
                
                const handleRazorpaySplit = async () => {
                  if (!tableSession?.sessionId) return;
                  setPaymentProcessing(true);
                  console.log("Starting Razorpay custom split for amount:", mySplit.amount);
                  try {
                    const response = await fetch(`/api/sessions/${tableSession.sessionId}/pay-custom-amount`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        customerName: customerName || mySplit.name,
                        customerPhone: customerPhone || '9999999999',
                        amountToPay: mySplit.amount
                      })
                    });
                    
                    if (!response.ok) {
                      const errData = await response.json();
                      throw new Error(errData.error || 'Payment failed');
                    }
                    
                    const resData = await response.json();
                    
                    const options = {
                      key: 'rzp_live_Szz1d4E7cQBqbS', // Hardcoded to bypass Vercel env cache
                      amount: resData.amount,
                      currency: "INR",
                      name: restaurant?.name || "Table Top",
                      description: `Split Payment for ${mySplit.name}`,
                      order_id: resData.razorpayOrderId,
                      handler: async function (razorpayResponse: any) {
                        try {
                          const verifyRes = await fetch(`/api/sessions/${tableSession?.sessionId}/verify-payment`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              razorpay_order_id: razorpayResponse.razorpay_order_id,
                              razorpay_payment_id: razorpayResponse.razorpay_payment_id,
                              razorpay_signature: razorpayResponse.razorpay_signature
                            })
                          });
                          
                          if (!verifyRes.ok) {
                            const errData = await verifyRes.json();
                            throw new Error(errData.error || 'Payment verification failed');
                          }
                          
                          socket?.emit('confirmSplitPayment', { splitId: mySplit.id });
                        } catch (err: any) {
                          alert('Payment successful but verification failed: ' + err.message);
                        } finally {
                          setLocalClaimedSplitId(null);
                          setPaymentProcessing(false);
                        }
                      },
                      prefill: {
                        name: customerName || mySplit.name,
                        contact: customerPhone || ''
                      },
                      theme: {
                        color: "#4f46e5"
                      },
                      modal: {
                        ondismiss: function() {
                          setPaymentProcessing(false);
                          socket?.emit('unclaimSplitPayment', { splitId: mySplit.id });
                          setLocalClaimedSplitId(null);
                        }
                      }
                    };
                    
                    const rzp = new (window as any).Razorpay(options);
                    rzp.on('payment.failed', function (response: any) {
                      alert(response.error.description || 'Payment failed');
                      setPaymentProcessing(false);
                      socket?.emit('unclaimSplitPayment', { splitId: mySplit.id });
                      setLocalClaimedSplitId(null);
                    });
                    rzp.open();
                  } catch (error: any) {
                    alert(error.message);
                    setPaymentProcessing(false);
                    socket?.emit('unclaimSplitPayment', { splitId: mySplit.id });
                    setLocalClaimedSplitId(null);
                  }
                };
                
                return (
                  <div className="text-center space-y-6">
                    <h3 className="text-2xl font-black text-gray-800">Pay Your Share</h3>
                    <p className="text-gray-500 font-medium">Paying ${mySplit.amount.toFixed(2)} for {mySplit.name}</p>
                    
                    <button 
                      onClick={handleRazorpaySplit}
                      disabled={paymentProcessing}
                      className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-black py-4 rounded-xl shadow-lg active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {paymentProcessing ? 'Processing...' : 'Pay via Razorpay'}
                    </button>
                    
                    <button 
                      onClick={() => {
                        socket?.emit('unclaimSplitPayment', { splitId: mySplit.id });
                        setLocalClaimedSplitId(null);
                        window.history.back();
                      }}
                      disabled={paymentProcessing}
                      className="w-full text-gray-500 hover:text-gray-700 font-bold py-2 text-sm uppercase tracking-widest"
                    >
                      Cancel
                    </button>
                  </div>
                );
              })() : (

                <div className="space-y-6">
                   <h3 className="text-2xl font-black text-gray-800 text-center mb-4">Multiplayer Split</h3>
                   <div className="space-y-3">
                     {splitLobby.splits.map(split => (
                       <div key={split.id} className={`p-4 rounded-2xl border-2 flex items-center justify-between transition-all ${
                         split.status === 'PAID' ? 'bg-emerald-50 border-emerald-200' :
                         split.status === 'CLAIMED' ? 'bg-amber-50 border-amber-200 opacity-50' :
                         'bg-white border-gray-200 hover:border-indigo-400'
                       }`}>
                         <div>
                           <p className="font-bold text-gray-800">{split.name}</p>
                           <p className="text-sm font-bold text-gray-500">${split.amount.toFixed(2)}</p>
                         </div>
                         <div>
                           {split.status === 'PAID' && <span className="text-emerald-600 font-black flex items-center gap-1"><CheckCircle size={18}/> PAID</span>}
                           {split.status === 'CLAIMED' && <span className="text-amber-600 font-bold text-sm">Paying...</span>}
                           {split.status === 'PENDING' && (
                             <button 
                               onClick={() => {
                                 window.history.pushState({ splitScreen: true }, '');
                                 setLocalClaimedSplitId(split.id);
                                 socket?.emit('claimSplitPayment', { splitId: split.id });
                               }}
                               className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-md active:scale-95 transition-transform"
                             >
                               Pay This
                             </button>
                           )}
                         </div>
                       </div>
                     ))}
                   </div>
                </div>
              )}
            </div>
          </div>
        )}

      {/* Customization Modal */}
      {itemBeingCustomized && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end justify-center z-[100] animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-t-3xl shadow-2xl p-6 flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-black text-gray-900 tracking-tight">Customize {itemBeingCustomized.name} {isHalfPortionMod && '(Half)'}</h3>
              <button onClick={() => setItemBeingCustomized(null)} className="text-gray-400 hover:text-gray-600 bg-gray-100 rounded-full p-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            
            <div className="overflow-y-auto custom-scrollbar pr-2 mb-4">
              {(() => {
                let groups = [];
                try {
                  groups = typeof itemBeingCustomized.modifierGroups === 'string' 
                    ? JSON.parse(itemBeingCustomized.modifierGroups) 
                    : itemBeingCustomized.modifierGroups || [];
                } catch(e) {}
                
                if (groups.length === 0) {
                  return (
                    <div className="text-gray-500 italic text-center py-4">No custom options available.</div>
                  );
                }

                return groups.map((group: any, gIdx: number) => (
                  <div key={gIdx} className="mb-6">
                    <div className="flex justify-between items-end mb-3">
                      <p className="text-sm font-bold text-gray-800 uppercase tracking-widest">{group.name}</p>
                      <span className="text-xs font-semibold text-gray-400">
                        {group.isRequired ? 'Required' : 'Optional'} 
                        {group.max > 1 ? ` (Up to ${group.max})` : ''}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {group.options.map((opt: any) => {
                        const isSelected = (selectedModifiers[group.name] || []).includes(opt.name);
                        return (
                          <button
                            key={opt.name}
                            onClick={() => {
                              setSelectedModifiers(prev => {
                                const current = prev[group.name] || [];
                                if (isSelected) {
                                  return { ...prev, [group.name]: current.filter(x => x !== opt.name) };
                                } else {
                                  if (group.max === 1) {
                                    return { ...prev, [group.name]: [opt.name] };
                                  } else if (current.length < group.max) {
                                    return { ...prev, [group.name]: [...current, opt.name] };
                                  }
                                  return prev;
                                }
                              });
                            }}
                            className={`px-4 py-2 rounded-full text-sm font-bold border-2 transition-all flex items-center gap-2 ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-indigo-300'}`}
                          >
                            {opt.name}
                            {opt.price > 0 && <span className={`text-xs ${isSelected ? 'text-indigo-200' : 'text-gray-400'}`}>+${opt.price}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>

            <div className="mt-auto pt-4 border-t border-gray-100">
              {(() => {
                let groups = [];
                try {
                  groups = typeof itemBeingCustomized.modifierGroups === 'string' 
                    ? JSON.parse(itemBeingCustomized.modifierGroups) 
                    : itemBeingCustomized.modifierGroups || [];
                } catch(e) {}
                
                // Validate required groups
                const missingRequired = groups.some((g: any) => g.isRequired && (selectedModifiers[g.name] || []).length < g.min);
                
                // Calculate total price
                const basePrice = isHalfPortionMod ? parseFloat(itemBeingCustomized.halfPrice || '0') : parseFloat(itemBeingCustomized.price);
                let extraPrice = 0;
                groups.forEach((g: any) => {
                  const selected = selectedModifiers[g.name] || [];
                  g.options.forEach((opt: any) => {
                    if (selected.includes(opt.name)) {
                      extraPrice += parseFloat(opt.price || 0);
                    }
                  });
                });
                const finalPrice = basePrice + extraPrice;

                return (
                  <button
                    disabled={missingRequired}
                    onClick={() => {
                      let finalMods = [];
                      if (isHalfPortionMod) finalMods.push('Half Portion');
                      Object.values(selectedModifiers).forEach(arr => {
                        finalMods.push(...arr);
                      });
                      handleOptimisticAdd(itemBeingCustomized.id, 1, finalMods);
                      setItemBeingCustomized(null);
                    }}
                    className={`w-full font-black text-lg py-4 rounded-2xl shadow-xl active:scale-[0.98] transition-all ${missingRequired ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none' : 'bg-indigo-600 text-white shadow-indigo-600/30'}`}
                  >
                    {missingRequired ? 'Complete Required Selections' : `Add to Cart $${finalPrice.toFixed(2)}`}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}
  
      </main>

      {/* 4. Digital Call Bell Grid Modal */}
      {showBellModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-xs w-full shadow-2xl border animate-scale-up">
            <h3 className="font-bold text-gray-800 text-center mb-4">Request Service</h3>
            <div className="grid grid-cols-2 gap-3">
              {(isHotel ? ['Clear Tray', 'Ice Bucket', 'Extra Cutlery', 'Bottled Water'] : ['Water', 'Cutlery', 'Service Refill', 'Ask for Bill']).map((req) => (
                <button
                  key={req}
                  onClick={() => {
                    setSelectedModifiers({});
                    requestHelp(req);
                    setShowBellModal(false);
                    alert(`Request sent: ${req}`);
                  }}
                  className="bg-gray-50 border border-gray-100 hover:bg-indigo-50 hover:text-indigo-600 p-4 rounded-2xl text-xs font-semibold text-gray-600 text-center transition active:scale-95 shadow-sm"
                >
                  {req}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowBellModal(false)}
              className="w-full mt-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-2 rounded-xl text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* 5. Sticky Bottom Action Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t p-2 flex justify-around items-center z-40 shadow-lg">
        <button
          onClick={() => setActiveTab('menu')}
          className={`flex flex-col items-center gap-1 py-1.5 px-4 rounded-xl ${
            activeTab === 'menu' ? 'text-indigo-600 bg-indigo-50 font-bold' : 'text-gray-400 font-medium'
          }`}
        >
          <span className="text-xl">📋</span>
          <span className="text-[10px]">Menu</span>
        </button>
        <button
          onClick={() => setActiveTab('cart')}
          className={`flex flex-col items-center gap-1 py-1.5 px-4 rounded-xl relative ${
            activeTab === 'cart' ? 'text-indigo-600 bg-indigo-50 font-bold' : 'text-gray-400 font-medium'
          }`}
        >
          <span className="text-xl">🛒</span>
          <span className="text-[10px]">Shared Cart</span>
          {tableSession.cart.items.length > 0 && (
            <span className="absolute top-1 right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center font-bold border border-white text-[10px]">
              {tableSession.cart.items.reduce((acc, i) => acc + (optimisticQuantities[`${i.menuItemId}-${JSON.stringify(i.modifications || [])}`] ?? i.quantity), 0)}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`flex flex-col items-center gap-1 py-1.5 px-4 rounded-xl ${
            activeTab === 'orders' ? 'text-indigo-600 bg-indigo-50 font-bold' : 'text-gray-400 font-medium'
          }`}
        >
          <span className="text-xl">🚚</span>
          <span className="text-[10px]">Orders</span>
        </button>
        {!isHotel && (
          <button
            onClick={() => {
              setActiveTab('billing');
              if (checkoutMode === 'IDLE') setCheckoutMode('CHOICE');
            }}
            className={`flex flex-col items-center gap-1 py-1.5 px-4 rounded-xl ${
              activeTab === 'billing' ? 'text-indigo-600 bg-indigo-50 font-bold' : 'text-gray-400 font-medium'
            }`}
          >
            <span className="text-xl">🧾</span>
            <span className="text-[10px]">Checkout</span>
          </button>
        )}
      </nav>
    </div>
  );
}

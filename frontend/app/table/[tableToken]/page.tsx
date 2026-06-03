'use client';

import React, { useEffect, useState } from 'react';
import { useSocket } from '../../../context/SocketContext';
import { decimalMath } from '../../../utils/decimalMath';

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: string;
  isAvailable: boolean;
}

export default function CustomerPage({ params }: { params: { tableToken: string } }) {
  const { tableToken } = params;
  const {
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
  const [checkoutMode, setCheckoutMode] = useState<'IDLE' | 'CHOICE' | 'PAY_FULL' | 'SPLIT'>('IDLE');
  const [showBellModal, setShowBellModal] = useState(false);
  const [showPickupAlert, setShowPickupAlert] = useState(false);
  
  // Split billing selection state
  // Map of orderItemId -> quantitySelectedToPay
  const [splitSelection, setSplitSelection] = useState<Map<string, number>>(new Map());
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

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
          
          // Fetch menu items
          return fetch(`/api/menu?restaurantId=${data.restaurant.id}`);
        })
        .then((res) => res?.json())
        .then((items) => {
          if (items) setMenuItems(items);
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
    return () => {
      window.removeEventListener('pickup-ready', handlePickupAlert);
    };
  }, [tableSession]);

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

  const handleSplitQtyChange = (orderItemId: string, amount: number, maxQty: number) => {
    const nextMap = new Map(splitSelection);
    const current = nextMap.get(orderItemId) || 0;
    const nextQty = Math.max(0, Math.min(maxQty, Number((current + amount).toFixed(2))));
    
    if (nextQty === 0) {
      nextMap.delete(orderItemId);
    } else {
      nextMap.set(orderItemId, nextQty);
    }
    setSplitSelection(nextMap);
  };

  // Perform split checkout calculation using high precision client-side decimal math
  let selectedSubtotal = '0.00';
  let selectedTax = '0.00';
  let selectedGrandTotal = '0.00';
  const taxRate = restaurant?.taxRate || '0.0825';

  splitSelection.forEach((qty, orderItemId) => {
    const item = tableSession.orders
      .flatMap((o) => o.items)
      .find((i) => i.orderItemId === orderItemId);
    
    if (item) {
      const sub = decimalMath.multiply(item.price, qty);
      selectedSubtotal = decimalMath.add(selectedSubtotal, sub);
    }
  });
  selectedTax = decimalMath.calculateTax(selectedSubtotal, taxRate);
  selectedGrandTotal = decimalMath.add(selectedSubtotal, selectedTax);

  const executeCheckout = async () => {
    if (splitSelection.size === 0) return;
    setPaymentProcessing(true);

    const payloadItems = Array.from(splitSelection.entries()).map(([orderItemId, quantityToPay]) => ({
      orderItemId,
      quantityToPay
    }));

    try {
      const response = await fetch(`/api/sessions/${tableSession.sessionId}/pay-split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          customerPhone,
          items: payloadItems
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Payment failed');
      }

      // Clear splits selection on success
      setSplitSelection(new Map());
      setPaymentSuccess(true);
      setTimeout(() => setPaymentSuccess(false), 5000);
      setActiveTab('menu');
    } catch (err: any) {
      alert(err.message || 'Payment execution failed');
    } finally {
      setPaymentProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto relative shadow-2xl pb-24">
      {/* 1. Contextual Mode Header */}
      <header className="bg-white border-b sticky top-0 z-40 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">{restaurant?.name || 'Table Top'}</h1>
            <p className="text-xs text-gray-500 font-medium">Table Number: {tableSession.tableNumber}</p>
          </div>
          {tableSession.restaurantMode === 'FULL_SERVICE' ? (
            <button
              onClick={() => setShowBellModal(true)}
              className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-sm font-semibold active:bg-indigo-100 flex items-center gap-1 border border-indigo-100 shadow-sm"
            >
              🔔 Call Waiter
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
          <div>
            <h2 className="text-lg font-extrabold text-gray-800 mb-4 flex items-center gap-2">
              <span>🍽️</span> Digital Menu
            </h2>
            <div className="space-y-4">
              {menuItems.map((item) => (
                <div
                  key={item.id}
                  className={`bg-white p-4 rounded-2xl shadow-sm border transition flex flex-col justify-between ${
                    item.isAvailable ? 'border-gray-100 hover:shadow-md' : 'border-gray-200 opacity-60 bg-gray-100'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2 gap-4">
                    <div className="flex gap-3 flex-1">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="w-16 h-16 rounded-xl object-cover shadow-sm border border-gray-100 flex-shrink-0" />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-2xl flex-shrink-0">
                          🍽️
                        </div>
                      )}
                      <div>
                        <h3 className="font-bold text-gray-800 leading-tight">{item.name}</h3>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{item.description || 'No description available.'}</p>
                      </div>
                    </div>
                    <span className="font-extrabold text-indigo-600 text-sm whitespace-nowrap">
                      ${decimalMath.formatCurrency(item.price)}
                    </span>
                  </div>

                  <div className="mt-3 flex justify-end">
                    {item.isAvailable ? (
                      <button
                        onClick={() => addItemToCart(item.id, 1)}
                        className="bg-indigo-600 text-white text-xs px-4 py-2 rounded-xl font-bold hover:bg-indigo-700 active:scale-95 transition shadow-sm"
                      >
                        + Add to Table Cart
                      </button>
                    ) : (
                      <span className="text-xs text-red-500 font-extrabold bg-red-50 border border-red-200 px-3 py-1 rounded-xl">
                        86'ed / Sold Out
                      </span>
                    )}
                  </div>
                </div>
              ))}
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
                            onClick={() => addItemToCart(item.menuItemId, -1, item.modifications)}
                            className="bg-gray-100 hover:bg-gray-200 px-2 py-1 text-xs font-bold"
                          >
                            -
                          </button>
                          <span className="px-2 text-xs font-bold">{item.quantity}</span>
                          <button
                            onClick={() => addItemToCart(item.menuItemId, 1, item.modifications)}
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

                <button
                  onClick={() => {
                    submitCart();
                    setActiveTab('orders');
                  }}
                  className="w-full bg-indigo-600 text-white font-bold py-3.5 rounded-xl shadow-md hover:bg-indigo-700 active:scale-[0.99] transition mt-6"
                >
                  🚀 Submit Order to Kitchen
                </button>
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
                  let statusText = order.status;
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
                  <div className="space-y-4">
                    <button
                      onClick={() => {
                        const newSelection = new Map<string, number>();
                        tableSession.orders.flatMap((o: any) => o.items).forEach((item: any) => {
                          if (item.unpaidQuantity > 0) {
                            newSelection.set(item.orderItemId, item.unpaidQuantity);
                          }
                        });
                        setSplitSelection(newSelection);
                        setCheckoutMode('PAY_FULL');
                      }}
                      className="w-full h-20 bg-blue-600 hover:bg-blue-700 active:scale-95 transition-transform rounded-2xl flex flex-col items-center justify-center text-white shadow-lg shadow-blue-600/30 border border-blue-500"
                    >
                      <span className="font-black text-xl tracking-tight">Pay Full Bill</span>
                      <span className="text-xs text-blue-200 font-bold tracking-wide">Cover the entire table's check</span>
                    </button>
                    <button
                      onClick={() => {
                        setSplitSelection(new Map());
                        setCheckoutMode('SPLIT');
                      }}
                      className="w-full h-20 border-2 border-gray-200 hover:bg-gray-50 active:scale-95 transition-transform rounded-2xl flex flex-col items-center justify-center text-gray-800"
                    >
                      <span className="font-black text-xl tracking-tight">Split Bill</span>
                      <span className="text-xs text-gray-500 font-bold tracking-wide">Pay only for what you ordered</span>
                    </button>
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
              <div className="animate-fade-in space-y-6">
                <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                  <span>💳</span> Full Checkout
                </h2>
                <div className="bg-blue-50 border border-blue-100 rounded-[2rem] p-8 shadow-sm text-center relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-4 opacity-10">
                     <span className="text-6xl">💰</span>
                   </div>
                   <p className="text-blue-800 font-bold mb-2 uppercase tracking-widest text-xs relative z-10">Total Remaining Balance</p>
                   <p className="text-6xl font-black text-blue-600 tabular-nums tracking-tighter relative z-10">${selectedGrandTotal}</p>
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
                  <button
                    onClick={executeCheckout}
                    disabled={paymentProcessing || !customerName}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 active:scale-95 transition-transform text-white font-black py-5 rounded-xl shadow-lg shadow-emerald-500/30 disabled:opacity-50 mt-2 text-lg tracking-tight"
                  >
                    {paymentProcessing ? 'Processing...' : 'Submit Payment'}
                  </button>
                  <button 
                    onClick={() => setCheckoutMode('CHOICE')} 
                    className="w-full py-4 text-xs font-black text-gray-400 hover:text-gray-600 uppercase tracking-widest transition-colors"
                  >
                    Change Payment Method
                  </button>
                </div>
              </div>
            )}

            {checkoutMode === 'SPLIT' && (
              <div className="animate-fade-in">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-extrabold text-gray-800 flex items-center gap-2">
                    <span>🧾</span> Split Billing
                  </h2>
                  <button 
                    onClick={() => setCheckoutMode('CHOICE')} 
                    className="text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg active:scale-95 transition-transform"
                  >
                    Back to Options
                  </button>
                </div>
                <div className="bg-white border rounded-2xl p-4 shadow-sm mb-6">
                  <h3 className="font-extrabold text-sm text-gray-800 border-b pb-2 mb-3">Claim Items You Ate</h3>
                  
                  {tableSession.orders.flatMap((o: any) => o.items).length === 0 ? (
                    <p className="text-center py-6 text-gray-400 text-sm">No items submitted yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {tableSession.orders
                        .flatMap((o: any) => o.items)
                        .map((item: any) => {
                          const maxQty = item.unpaidQuantity;
                          const selected = splitSelection.get(item.orderItemId) || 0;

                          return (
                            <div key={item.orderItemId} className="flex justify-between items-center py-2 border-b last:border-0">
                              <div>
                                <h4 className="font-bold text-gray-800 text-sm">{item.name}</h4>
                                <div className="flex gap-2 mt-0.5">
                                  <span className="text-xs text-gray-400">Total: {item.orderedQuantity}</span>
                                  <span className="text-xs text-emerald-600">Paid: {item.paidQuantity}</span>
                                  <span className="text-xs text-amber-600">Unpaid: {maxQty}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                <span className="text-xs text-indigo-600 font-extrabold">${item.price} ea</span>
                                <div className="flex items-center border rounded-lg overflow-hidden bg-gray-50">
                                  <button
                                    onClick={() => handleSplitQtyChange(item.orderItemId, -0.5, maxQty)}
                                    disabled={selected <= 0}
                                    className="bg-gray-100 hover:bg-gray-200 px-2 py-1 text-xs font-bold disabled:opacity-30"
                                  >
                                    -0.5
                                  </button>
                                  <span className="px-2 text-xs font-extrabold text-gray-800">{selected}</span>
                                  <button
                                    onClick={() => handleSplitQtyChange(item.orderItemId, 0.5, maxQty)}
                                    disabled={selected >= maxQty}
                                    className="bg-gray-100 hover:bg-gray-200 px-2 py-1 text-xs font-bold disabled:opacity-30"
                                  >
                                    +0.5
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>

                {splitSelection.size > 0 && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 shadow-sm space-y-3 mb-6">
                    <h3 className="font-bold text-indigo-900 text-sm">Your Personal Invoice Segment</h3>
                    <div className="space-y-1.5 text-xs text-indigo-700">
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span className="font-bold">${selectedSubtotal}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Fractional Tax ({(Number(taxRate) * 100).toFixed(2)}%):</span>
                        <span className="font-bold">${decimalMath.formatCurrency(selectedTax)}</span>
                      </div>
                      <div className="flex justify-between border-t border-indigo-200 pt-2 text-sm text-indigo-950 font-extrabold">
                        <span>Grand Total:</span>
                        <span>${selectedGrandTotal}</span>
                      </div>
                    </div>

                    <div className="space-y-3 pt-3">
                      <input
                        type="text"
                        placeholder="Your Name"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full text-xs px-3 py-2 border rounded-lg focus:outline-indigo-500"
                      />
                      <input
                        type="tel"
                        placeholder="Your Phone Number"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        className="w-full text-xs px-3 py-2 border rounded-lg focus:outline-indigo-500"
                      />
                      <button
                        onClick={executeCheckout}
                        disabled={paymentProcessing || !customerName}
                        className="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl hover:bg-emerald-700 active:scale-95 transition-transform disabled:opacity-40 shadow-sm"
                      >
                        {paymentProcessing ? 'Processing Split Payment...' : 'Proceed to Checkout Payment'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* 4. Digital Call Bell Grid Modal */}
      {showBellModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-xs w-full shadow-2xl border animate-scale-up">
            <h3 className="font-bold text-gray-800 text-center mb-4">Request Service</h3>
            <div className="grid grid-cols-2 gap-3">
              {['Water', 'Cutlery', 'Service Refill', 'Ask for Bill'].map((req) => (
                <button
                  key={req}
                  onClick={() => {
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
            <span className="absolute top-1 right-3 bg-red-500 text-white rounded-full text-[9px] w-4.5 h-4.5 flex items-center justify-center font-bold border border-white">
              {tableSession.cart.items.reduce((acc, i) => acc + i.quantity, 0)}
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
      </nav>
    </div>
  );
}

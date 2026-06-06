'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useSocket } from '../../context/SocketContext';
import { Clock, ToggleLeft, ToggleRight, CheckCircle, Flame, History, X, Bell } from 'lucide-react';

interface KitchenTicket {
  id: string;
  tableNumber: string;
  status: 'PAYMENT_PENDING' | 'NEW' | 'PREPARING' | 'READY_TO_SERVE' | 'COMPLETED';
  createdAt: string;
  paymentMethod?: string;
  totalAmount?: string;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    modifications: string[];
  }>;
  guestClaim?: {
    name: string;
    room: string;
  };
}

interface MenuItem {
  id: string;
  name: string;
  isAvailable: boolean;
}

export default function KitchenPage() {
  const { isConnected, socket, authToken, setAuthToken } = useSocket();
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [historyTickets, setHistoryTickets] = useState<KitchenTicket[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [restaurantId, setRestaurantId] = useState<string>('');
  const [operationalMode, setOperationalMode] = useState<'FULL_SERVICE' | 'SELF_SERVICE'>('FULL_SERVICE');
  const [establishmentType, setEstablishmentType] = useState<'RESTAURANT' | 'HOTEL'>('RESTAURANT');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inputTokenStr, setInputTokenStr] = useState<string>('');
  
  const [shiftStarted, setShiftStarted] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const initAudio = () => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
    setShiftStarted(true);
  };

  const playDing = () => {
    if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    }
  };

  useEffect(() => {
    const initData = async () => {
      let storedRestId = typeof window !== 'undefined' ? localStorage.getItem('tabletop_restaurant_id') || '' : '';
      
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storedRestId);
      if (storedRestId && !isUUID) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('tabletop_restaurant_id');
        }
        storedRestId = '';
      }
      
      if (!storedRestId && authToken) {
         setErrorMessage("Restaurant ID not found");
      }
      
      setRestaurantId(storedRestId);

      if (storedRestId) {
        const headers: HeadersInit = { 'Content-Type': 'application/json' };
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

        fetch(`/api/restaurants/${storedRestId}`, { headers })
          .then(res => res.json())
          .then(async data => {
            if (data.error) {
               setErrorMessage(data.error);
            }
            else {
              setOperationalMode(data.operationalMode);
              setEstablishmentType(data.establishmentType);
            }
          })
          .catch(console.error);

        fetch(`/api/orders/active?restaurantId=${storedRestId}`, { headers })
          .then(res => res.json())
          .then(data => {
            if (Array.isArray(data)) {
              setTickets(data.filter((t: KitchenTicket) => t.status !== 'COMPLETED'));
            }
          })
          .catch(console.error);

        fetch(`/api/menu?restaurantId=${storedRestId}`, { headers })
          .then(res => res.json())
          .then(data => {
            if (Array.isArray(data)) setMenuItems(data);
          })
          .catch(console.error);
      }
    };
    initData();
  }, [authToken]);

  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleNewOrder = (data: any) => {
      setTickets(prev => [...prev, data.order]);
      playDing();
    };

    const handleStatusUpdated = (data: any) => {
      setTickets(prev => {
        const orderExists = prev.find(t => t.id === data.orderId);
        if (orderExists && data.status === 'COMPLETED') {
          setHistoryTickets(hist => {
            const newHist = [{ ...orderExists, status: data.status }, ...hist];
            return newHist.slice(0, 5);
          });
          return prev.filter(t => t.id !== data.orderId);
        }
        return prev.map(t => t.id === data.orderId ? { ...t, status: data.status } : t);
      });
    };

    const handleAdminSync = () => {
      if (restaurantId) {
        fetch(`/api/menu?restaurantId=${restaurantId}`, { 
          headers: { 'Authorization': `Bearer ${authToken}` }
        })
          .then(res => res.json())
          .then(data => {
            if (Array.isArray(data)) setMenuItems(data);
          });
      }
    };

    const handleModeChange = (data: { restaurantId: string, mode: 'FULL_SERVICE' | 'SELF_SERVICE' }) => {
      if (data.restaurantId === restaurantId) setOperationalMode(data.mode);
    };

    const handleSettingsChange = (data: { restaurantId: string, establishmentType: 'RESTAURANT' | 'HOTEL' }) => {
      if (data.restaurantId === restaurantId) setEstablishmentType(data.establishmentType);
    };
    
    socket.on('newOrderReceived', handleNewOrder);
    socket.on('newOrderSubmitted', handleNewOrder);
    socket.on('orderStatusUpdated', handleStatusUpdated);
    socket.on('adminStateSynced', handleAdminSync);
    socket.on('operationalModeChanged', handleModeChange);
    socket.on('modeToggled', handleModeChange);
    socket.on('establishmentSettingsChanged', handleSettingsChange);

    return () => {
      socket.off('newOrderReceived', handleNewOrder);
      socket.off('newOrderSubmitted', handleNewOrder);
      socket.off('orderStatusUpdated', handleStatusUpdated);
      socket.off('adminStateSynced', handleAdminSync);
      socket.off('operationalModeChanged', handleModeChange);
      socket.off('modeToggled', handleModeChange);
      socket.off('establishmentSettingsChanged', handleSettingsChange);
    };
  }, [socket, isConnected, restaurantId, authToken]);

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) {
        throw new Error('Failed to update status');
      }
    } catch (err) {
      console.error(err);
      alert('Network error advancing ticket.');
    }
  };

  const toggleDishAvailability = async (id: string, currentStatus: boolean) => {
    // Optimistic UI Update - instantly reflect change
    setMenuItems(prev => prev.map(m => m.id === id ? { ...m, isAvailable: !currentStatus } : m));

    try {
      const res = await fetch(`/api/menu/${id}/availability`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ isAvailable: !currentStatus })
      });
      if (!res.ok) {
        throw new Error('Failed to update dish availability');
      }
    } catch (err) {
      console.error(err);
      // Revert on failure
      setMenuItems(prev => prev.map(m => m.id === id ? { ...m, isAvailable: currentStatus } : m));
    }
  };

  if (!authToken) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans text-white">
        <div className="max-w-md w-full bg-slate-900/80 backdrop-blur-md rounded-2xl shadow-[0_0_40px_rgba(14,165,233,0.15)] border border-cyan-900/50 p-8 space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-black tracking-tight text-white flex justify-center items-center gap-3">
              <Flame className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" size={32} /> NEON KDS
            </h1>
            <p className="text-cyan-200/60 text-sm mt-2 font-bold tracking-widest uppercase">Secure Kitchen Access</p>
          </div>
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (inputTokenStr.trim()) setAuthToken(inputTokenStr.trim());
            }} 
            className="space-y-4"
          >
            <input
              type="password"
              placeholder="Enter Kitchen Token"
              value={inputTokenStr}
              onChange={e => setInputTokenStr(e.target.value)}
              className="w-full bg-slate-950/50 border-2 border-cyan-900/50 text-cyan-50 px-5 py-4 rounded-xl focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_15px_rgba(34,211,238,0.3)] font-bold text-center text-lg transition-all"
            />
            <button
              type="submit"
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black py-4 rounded-xl text-xl active:scale-95 transition-all shadow-[0_0_20px_rgba(34,211,238,0.4)]"
            >
              INITIALIZE SYSTEM
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!shiftStarted) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-900/20 via-slate-950 to-slate-950"></div>
        <div className="max-w-lg w-full text-center space-y-8 relative z-10">
           <Flame className="text-cyan-400 mx-auto animate-pulse drop-shadow-[0_0_15px_rgba(34,211,238,0.8)]" size={80} />
           <h1 className="text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 drop-shadow-[0_0_10px_rgba(34,211,238,0.3)]">KITCHEN MAINFRAME</h1>
           <p className="text-cyan-200/60 font-bold text-lg tracking-widest uppercase">System Audio Standby. Awaiting Authorization.</p>
           <button 
             onClick={initAudio}
             className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-3xl font-black py-8 rounded-2xl active:scale-95 transition-all shadow-[0_0_30px_rgba(16,185,129,0.5)] border-4 border-emerald-400 hover:shadow-[0_0_40px_rgba(16,185,129,0.8)]"
           >
             ENGAGE SHIFT
           </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-white flex flex-col overflow-hidden selection:bg-cyan-500/30">
      {/* Top Status Bar */}
      <header className="h-16 bg-slate-900/80 backdrop-blur-md border-b border-cyan-900/50 px-6 flex items-center justify-between shrink-0 relative z-20 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Flame className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" size={24} />
            <h1 className="text-2xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">NEON_KDS</h1>
          </div>
          <div className="h-8 w-[2px] bg-slate-800 rounded-full"></div>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full shadow-[0_0_8px_currentColor] ${isConnected ? 'bg-emerald-400 text-emerald-400 animate-pulse' : 'bg-rose-500 text-rose-500'}`} />
            <span className="font-black text-slate-300 tracking-[0.2em] text-sm">{isConnected ? 'UPLINK_SECURE' : 'CONNECTION_LOST'}</span>
          </div>
          <div className="h-8 w-[2px] bg-slate-800 rounded-full"></div>
          <div className="font-black text-cyan-400 tracking-[0.2em] text-sm drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]">
            {operationalMode.replace('_', ' ')}
          </div>
        </div>

        <div className="flex items-center gap-6">
          <button 
            onClick={() => setShowHistoryModal(true)}
            className="flex items-center gap-2 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700 px-4 py-2 rounded-lg font-bold transition-all text-cyan-100 hover:text-cyan-50 hover:shadow-[0_0_15px_rgba(34,211,238,0.2)]"
          >
            <History size={18} /> DATA_LOG
          </button>
          <div className="flex items-center gap-2 font-mono text-3xl font-black tracking-tight text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]">
            <Clock size={28} />
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </div>
      </header>

      {/* Main Two-Column Layout */}
      <main className="flex-1 flex overflow-hidden relative z-10">
        
        {/* Left: Main Ticket Rail (75%) */}
        <section className="w-3/4 p-6 overflow-y-auto custom-scrollbar relative">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.8)_2px,transparent_2px),linear-gradient(90deg,rgba(15,23,42,0.8)_2px,transparent_2px)] bg-[size:40px_40px] [mask-image:linear-gradient(to_bottom,white,transparent)] opacity-20 pointer-events-none"></div>
          {tickets.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-40 relative z-10">
              <CheckCircle size={100} className="text-cyan-500/50 mb-6 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
              <h2 className="text-4xl font-black text-cyan-500/50 tracking-[0.2em]">QUEUE EMPTY</h2>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 items-start auto-rows-max relative z-10">
              {tickets.map(ticket => {
                const elapsedMs = currentTime.getTime() - new Date(ticket.createdAt).getTime();
                const elapsedMins = Math.floor(elapsedMs / 60000);
                const isDelayed = elapsedMins >= 15;
                
                const isNew = ticket.status === 'NEW';
                const isPreparing = ticket.status === 'PREPARING';
                const isPaymentPending = ticket.status === 'PAYMENT_PENDING';
                
                let borderColor = 'border-slate-800';
                let shadowColor = 'shadow-none';
                if (isPaymentPending) { borderColor = 'border-indigo-500'; shadowColor = 'shadow-[0_0_20px_rgba(99,102,241,0.3)] animate-pulse'; }
                else if (isDelayed) { borderColor = 'border-rose-500'; shadowColor = 'shadow-[0_0_20px_rgba(244,63,94,0.3)] animate-pulse'; }
                else if (isPreparing) { borderColor = 'border-amber-400'; shadowColor = 'shadow-[0_0_15px_rgba(251,191,36,0.2)]'; }
                else if (isNew) { borderColor = 'border-cyan-500'; shadowColor = 'shadow-[0_0_15px_rgba(34,211,238,0.2)]'; }

                return (
                  <div key={ticket.id} className={`bg-slate-900/80 backdrop-blur-md rounded-2xl border-2 ${borderColor} flex flex-col ${shadowColor} overflow-hidden transition-all`}>
                    
                    {/* Ticket Header */}
                    <div className={`p-4 flex justify-between items-start border-b border-slate-800 ${isPaymentPending ? 'bg-indigo-500/10' : isPreparing ? 'bg-amber-400/5' : isDelayed ? 'bg-rose-500/5' : 'bg-cyan-500/5'}`}>
                       <div className="flex-1">
                         {establishmentType === 'HOTEL' && ticket.guestClaim && (
                           <div className="bg-rose-600 text-white font-black p-2 text-center uppercase tracking-widest animate-pulse mb-3 rounded shadow-[0_0_15px_rgba(225,29,72,0.6)]">
                             GUEST CLAIM: {ticket.guestClaim.name}, RM {ticket.guestClaim.room}
                           </div>
                         )}
                         <h3 className="text-3xl font-black tracking-tighter text-white leading-none drop-shadow-md">
                           {establishmentType === 'HOTEL' ? 'RM' : 'TBL'} {ticket.tableNumber}
                         </h3>
                         <span className="inline-block mt-2 font-black text-cyan-400/70 tracking-[0.2em] text-xs bg-cyan-950/50 border border-cyan-900 px-2 py-1 rounded">
                           ID:{ticket.id.slice(-6).toUpperCase()}
                         </span>
                       </div>
                       <div className={`text-right ${isDelayed ? 'text-rose-400 drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]' : 'text-slate-400'}`}>
                         <div className={`text-3xl font-black tabular-nums leading-none ${isDelayed ? 'animate-bounce' : ''}`}>
                           {elapsedMins}m
                         </div>
                         <div className="font-black text-xs tracking-[0.2em] mt-1 opacity-70">ELAPSED</div>
                       </div>
                    </div>

                    {/* Ticket Body (Items) */}
                    <div className="p-5 flex-1 space-y-4">
                      {ticket.items.map((item, idx) => (
                        <div key={idx} className="flex gap-4 items-start pb-4 border-b border-slate-800/50 last:border-0 last:pb-0">
                           <div className="bg-slate-800 text-cyan-400 font-black text-2xl px-3 py-1 rounded-lg border border-cyan-900/50 shrink-0 shadow-[0_0_10px_rgba(34,211,238,0.1)]">
                             {item.quantity}x
                           </div>
                           <div className="pt-1">
                             <div className="text-2xl font-bold text-slate-100 leading-tight tracking-tight">
                               {item.name}
                             </div>
                             {item.modifications && item.modifications.length > 0 && (
                               <div className="mt-2 space-y-1">
                                 {item.modifications.map((mod, mIdx) => (
                                   <div key={mIdx} className="text-amber-400 font-bold text-sm tracking-wide flex items-center gap-2">
                                     <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_5px_rgba(251,191,36,0.8)]" /> {mod}
                                   </div>
                                 ))}
                               </div>
                             )}
                           </div>
                        </div>
                      ))}
                    </div>

                    {/* Ticket Footer Action */}
                    <div className="p-3 bg-slate-900/90 border-t border-slate-800 backdrop-blur-md">
                      {ticket.status === 'PAYMENT_PENDING' && (
                        <div className="space-y-2">
                          <div className="bg-indigo-900/40 border border-indigo-500/50 text-indigo-300 px-3 py-2 rounded-lg text-center font-bold text-sm uppercase tracking-widest animate-pulse">
                            Verify: {ticket.paymentMethod === 'UPI' ? 'UPI' : 'CASH/CARD'} ₹{ticket.totalAmount || '0.00'}
                          </div>
                          <button 
                            onClick={() => updateOrderStatus(ticket.id, 'NEW')}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black text-lg py-4 rounded-xl active:scale-95 transition-all tracking-widest shadow-md"
                          >
                            CONFIRM PAYMENT & COOK
                          </button>
                        </div>
                      )}

                      {ticket.status === 'NEW' && (
                        <button 
                          onClick={() => updateOrderStatus(ticket.id, 'PREPARING')}
                          className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-amber-500/50 text-slate-300 hover:text-amber-400 font-black text-xl py-5 rounded-xl active:scale-95 transition-all tracking-widest shadow-inner"
                        >
                          INIT PREP
                        </button>
                      )}

                      {ticket.status === 'PREPARING' && (
                        <button 
                          onClick={() => updateOrderStatus(ticket.id, 'READY_TO_SERVE')}
                          className={`w-full text-slate-950 font-black text-xl py-5 rounded-xl active:scale-95 transition-all shadow-[0_0_20px_currentColor] flex items-center justify-center gap-3 tracking-widest ${
                            operationalMode === 'FULL_SERVICE' 
                              ? 'bg-emerald-400 hover:bg-emerald-300 text-emerald-400 shadow-emerald-400/40' 
                              : 'bg-amber-400 hover:bg-amber-300 text-amber-400 shadow-amber-400/40'
                          }`}
                          style={{ color: '#020617' /* slate-950 text */ }}
                        >
                          {operationalMode === 'FULL_SERVICE' ? 'READY_SRV' : <><Bell size={24} /> PING_COLLECT</>}
                        </button>
                      )}

                      {ticket.status === 'READY_TO_SERVE' && (
                        <button 
                          onClick={() => updateOrderStatus(ticket.id, 'COMPLETED')}
                          className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xl py-5 rounded-xl active:scale-95 transition-all shadow-[0_0_20px_rgba(34,211,238,0.4)] flex items-center justify-center gap-2 tracking-widest"
                        >
                          <CheckCircle size={24} /> PURGE_TICKET
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Right: The 86 Switchboard (25%) */}
        <aside className="w-1/4 border-l border-cyan-900/30 bg-slate-900/50 backdrop-blur-xl flex flex-col shadow-2xl z-20">
          <div className="p-5 border-b border-cyan-900/30 bg-slate-900/80 backdrop-blur-md">
            <h2 className="text-2xl font-black tracking-[0.1em] text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-amber-500">SYS_86_BOARD</h2>
            <p className="text-slate-400 font-bold text-xs mt-1 tracking-widest uppercase">Inventory Override Override</p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {menuItems.map(item => (
              <button
                key={item.id}
                onClick={() => toggleDishAvailability(item.id, item.isAvailable)}
                className={`w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between active:scale-95 backdrop-blur-sm ${
                  item.isAvailable 
                    ? 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800 hover:border-cyan-500/30 hover:shadow-[0_0_15px_rgba(34,211,238,0.1)]' 
                    : 'bg-rose-950/40 border-rose-500/50 text-rose-400 shadow-[inset_0_0_15px_rgba(244,63,94,0.2)]'
                }`}
              >
                <span className={`font-black text-lg tracking-tight truncate pr-4 ${item.isAvailable ? 'text-slate-200' : 'text-rose-400 line-through opacity-70'}`}>
                  {item.name}
                </span>
                {item.isAvailable ? (
                  <ToggleRight size={32} className="text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.6)] shrink-0" />
                ) : (
                  <ToggleLeft size={32} className="text-rose-500 drop-shadow-[0_0_5px_rgba(244,63,94,0.6)] shrink-0" />
                )}
              </button>
            ))}
          </div>
        </aside>

      </main>

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-6 backdrop-blur-lg">
          <div className="bg-slate-900 w-full max-w-4xl rounded-2xl border border-cyan-500/30 flex flex-col max-h-[90vh] shadow-[0_0_50px_rgba(34,211,238,0.15)]">
             <div className="p-6 border-b border-cyan-900/50 flex items-center justify-between bg-slate-900/80 rounded-t-2xl">
               <h2 className="text-2xl font-black tracking-[0.2em] text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]">ARCHIVE_LOG</h2>
               <button onClick={() => setShowHistoryModal(false)} className="text-cyan-600 hover:text-cyan-300 hover:drop-shadow-[0_0_8px_rgba(34,211,238,0.8)] p-2 transition-all">
                 <X size={32} />
               </button>
             </div>
             <div className="p-6 overflow-y-auto space-y-4 custom-scrollbar">
               {historyTickets.length === 0 ? (
                 <div className="text-center py-20 opacity-50">
                    <History size={48} className="mx-auto text-cyan-800 mb-4" />
                    <p className="text-cyan-800 font-black tracking-widest text-xl">NO RECORDS FOUND</p>
                 </div>
               ) : (
                 historyTickets.map(ticket => (
                   <div key={ticket.id} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 border-l-4 border-l-cyan-500/50 flex justify-between items-center hover:bg-slate-800 transition-colors">
                     <div>
                       <span className="text-xl font-black tracking-tight text-white drop-shadow-md">TBL {ticket.tableNumber}</span>
                       <span className="ml-4 text-cyan-500/70 font-black tracking-widest text-sm bg-cyan-950/50 px-2 py-1 rounded">ID:{ticket.id.slice(-6).toUpperCase()}</span>
                       <div className="mt-3 text-slate-300 font-bold tracking-wide">
                         {ticket.items.map(i => `${i.quantity}x ${i.name}`).join(' • ')}
                       </div>
                     </div>
                     <div className="text-right">
                       <span className="bg-emerald-950/50 text-emerald-400 font-black px-4 py-2 rounded-lg border border-emerald-900/50 tracking-widest text-sm shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                         PURGED
                       </span>
                       <div className="mt-3 text-xs text-slate-500 font-black tracking-widest">
                         {new Date(ticket.createdAt).toLocaleTimeString()}
                       </div>
                     </div>
                   </div>
                 ))
               )}
             </div>
          </div>
        </div>
      )}
      
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.5); 
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(34, 211, 238, 0.2); 
          border-radius: 4px;
          border: 1px solid rgba(15, 23, 42, 0.8);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(34, 211, 238, 0.5); 
        }
      `}} />
    </div>
  );
}

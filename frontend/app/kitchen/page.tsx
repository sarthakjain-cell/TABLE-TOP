'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useSocket } from '../../context/SocketContext';
import { Clock, ToggleLeft, ToggleRight, CheckCircle, Flame, History, X, Bell } from 'lucide-react';

interface KitchenTicket {
  id: string;
  tableNumber: string;
  status: 'NEW' | 'PREPARING' | 'READY_TO_SERVE' | 'COMPLETED';
  createdAt: string;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    modifications: string[];
  }>;
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
        try {
          const res = await fetch('/api/restaurants');
          const data = await res.json();
          if (data && data.length > 0) {
            storedRestId = data[0].id;
            localStorage.setItem('tabletop_restaurant_id', storedRestId);
          }
        } catch (e) {
          console.error('Failed to auto-fetch default restaurant', e);
        }
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
               const r = await fetch('/api/restaurants');
               const d = await r.json();
               if (d && d.length > 0) {
                  const newId = d[0].id;
                  localStorage.setItem('tabletop_restaurant_id', newId);
                  window.location.reload();
               }
            }
            else setOperationalMode(data.operationalMode);
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

    socket.on('newOrderReceived', handleNewOrder);
    socket.on('orderStatusUpdated', handleStatusUpdated);
    socket.on('adminStateSynced', handleAdminSync);

    return () => {
      socket.off('newOrderReceived', handleNewOrder);
      socket.off('orderStatusUpdated', handleStatusUpdated);
      socket.off('adminStateSynced', handleAdminSync);
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
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 font-sans text-white">
        <div className="max-w-md w-full bg-gray-800 rounded-xl shadow-2xl border border-gray-700 p-8 space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-black tracking-tight text-white flex justify-center items-center gap-3">
              <Flame className="text-amber-500" size={32} /> KDS Auth
            </h1>
            <p className="text-gray-400 text-sm mt-2 font-bold">Kitchen Display System Access</p>
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
              className="w-full bg-gray-900 border-2 border-gray-700 text-white px-5 py-4 rounded-xl focus:outline-none focus:border-amber-500 font-bold text-center text-lg"
            />
            <button
              type="submit"
              className="w-full bg-amber-600 hover:bg-amber-500 text-white font-black py-4 rounded-xl text-xl active:scale-95 transition-transform shadow-lg shadow-amber-900/50"
            >
              Access Line
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!shiftStarted) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6 text-white">
        <div className="max-w-lg w-full text-center space-y-8">
           <Flame className="text-amber-500 mx-auto animate-pulse" size={80} />
           <h1 className="text-5xl font-black tracking-tight">KITCHEN LINE</h1>
           <p className="text-gray-400 font-bold text-lg">Click below to unlock system audio and begin receiving tickets.</p>
           <button 
             onClick={initAudio}
             className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-3xl font-black py-8 rounded-2xl active:scale-95 transition-transform shadow-2xl shadow-emerald-900/50 border-4 border-emerald-500"
           >
             START SHIFT
           </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 font-sans text-white flex flex-col overflow-hidden">
      {/* Top Status Bar */}
      <header className="h-16 bg-gray-800 border-b-4 border-gray-700 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Flame className="text-amber-500" size={24} />
            <h1 className="text-2xl font-black tracking-tighter">KDS</h1>
          </div>
          <div className="h-8 w-1 bg-gray-700 rounded-full"></div>
          <div className="flex items-center gap-2">
            <div className={`w-4 h-4 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="font-bold text-gray-300 tracking-widest">{isConnected ? 'ONLINE' : 'OFFLINE'}</span>
          </div>
          <div className="h-8 w-1 bg-gray-700 rounded-full"></div>
          <div className="font-bold text-amber-500 tracking-widest">
            {operationalMode.replace('_', ' ')}
          </div>
        </div>

        <div className="flex items-center gap-6">
          <button 
            onClick={() => setShowHistoryModal(true)}
            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg font-bold transition-colors"
          >
            <History size={18} /> History
          </button>
          <div className="flex items-center gap-2 font-mono text-3xl font-black tracking-tight text-amber-400">
            <Clock size={28} />
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </div>
      </header>

      {/* Main Two-Column Layout */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* Left: Main Ticket Rail (75%) */}
        <section className="w-3/4 p-6 overflow-y-auto bg-gray-900 custom-scrollbar">
          {tickets.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-50">
              <CheckCircle size={80} className="text-gray-600 mb-6" />
              <h2 className="text-4xl font-black text-gray-600">NO ACTIVE TICKETS</h2>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 items-start auto-rows-max">
              {tickets.map(ticket => {
                const elapsedMs = currentTime.getTime() - new Date(ticket.createdAt).getTime();
                const elapsedMins = Math.floor(elapsedMs / 60000);
                const isDelayed = elapsedMins >= 15;
                
                const isNew = ticket.status === 'NEW';
                const isPreparing = ticket.status === 'PREPARING';
                
                let borderColor = 'border-gray-600';
                if (isDelayed) borderColor = 'border-red-600 animate-pulse';
                else if (isPreparing) borderColor = 'border-amber-500';

                return (
                  <div key={ticket.id} className={`bg-gray-800 rounded-2xl border-4 ${borderColor} flex flex-col shadow-2xl overflow-hidden`}>
                    
                    {/* Ticket Header */}
                    <div className={`p-4 flex justify-between items-start border-b-4 ${isPreparing ? 'border-amber-500/30' : 'border-gray-700'}`}>
                       <div>
                         <h3 className="text-4xl font-black tracking-tighter text-white leading-none">
                           TABLE {ticket.tableNumber}
                         </h3>
                         <span className="inline-block mt-2 font-bold text-gray-400 tracking-widest text-sm bg-gray-900 px-3 py-1 rounded-md">
                           #{ticket.id.slice(-6).toUpperCase()}
                         </span>
                       </div>
                       <div className={`text-right ${isDelayed ? 'text-red-500' : 'text-gray-400'}`}>
                         <div className={`text-3xl font-black tabular-nums leading-none ${isDelayed ? 'animate-bounce' : ''}`}>
                           {elapsedMins}m
                         </div>
                         <div className="font-bold text-sm tracking-widest uppercase mt-1">Ago</div>
                       </div>
                    </div>

                    {/* Ticket Body (Items) */}
                    <div className="p-5 flex-1 space-y-4 bg-gray-800">
                      {ticket.items.map((item, idx) => (
                        <div key={idx} className="flex gap-4 items-start pb-4 border-b-2 border-gray-700 last:border-0 last:pb-0">
                           <div className="bg-gray-900 text-white font-black text-2xl px-3 py-1 rounded-lg border-2 border-gray-700 shrink-0">
                             {item.quantity}x
                           </div>
                           <div className="pt-1">
                             <div className="text-2xl font-bold text-white leading-tight">
                               {item.name}
                             </div>
                             {item.modifications && item.modifications.length > 0 && (
                               <div className="mt-2 space-y-1">
                                 {item.modifications.map((mod, mIdx) => (
                                   <div key={mIdx} className="text-amber-400 font-bold text-lg flex items-center gap-2">
                                     <div className="w-2 h-2 rounded-full bg-amber-400" /> {mod}
                                   </div>
                                 ))}
                               </div>
                             )}
                           </div>
                        </div>
                      ))}
                    </div>

                    {/* Ticket Footer Action */}
                    <div className="p-3 bg-gray-900 border-t-4 border-gray-700">
                      {ticket.status === 'NEW' && (
                        <button 
                          onClick={() => updateOrderStatus(ticket.id, 'PREPARING')}
                          className="w-full bg-gray-700 hover:bg-gray-600 text-white font-black text-2xl py-6 rounded-xl active:scale-95 transition-transform"
                        >
                          MARK PREPARING
                        </button>
                      )}

                      {ticket.status === 'PREPARING' && (
                        <button 
                          onClick={() => updateOrderStatus(ticket.id, 'READY_TO_SERVE')}
                          className={`w-full text-white font-black text-2xl py-6 rounded-xl active:scale-95 transition-transform shadow-lg flex items-center justify-center gap-3 ${
                            operationalMode === 'FULL_SERVICE' 
                              ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900' 
                              : 'bg-amber-600 hover:bg-amber-500 shadow-amber-900'
                          }`}
                        >
                          {operationalMode === 'FULL_SERVICE' ? 'READY FOR SERVICE' : <><Bell size={28} /> SIGNAL COLLECTION</>}
                        </button>
                      )}

                      {ticket.status === 'READY_TO_SERVE' && (
                        <button 
                          onClick={() => updateOrderStatus(ticket.id, 'COMPLETED')}
                          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black text-2xl py-6 rounded-xl active:scale-95 transition-transform shadow-lg shadow-blue-900 flex items-center justify-center gap-2"
                        >
                          <CheckCircle size={28} /> CLEAR TICKET
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
        <aside className="w-1/4 border-l-4 border-gray-700 bg-gray-800 flex flex-col shadow-2xl z-10">
          <div className="p-5 border-b-4 border-gray-700 bg-gray-900">
            <h2 className="text-2xl font-black tracking-tighter text-white">THE 86 BOARD</h2>
            <p className="text-gray-400 font-bold text-sm mt-1">Tap to mark out of stock</p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {menuItems.map(item => (
              <button
                key={item.id}
                onClick={() => toggleDishAvailability(item.id, item.isAvailable)}
                className={`w-full text-left p-4 rounded-xl border-4 transition-colors flex items-center justify-between active:scale-95 ${
                  item.isAvailable 
                    ? 'bg-gray-700 border-gray-600 hover:border-gray-500' 
                    : 'bg-red-900/30 border-red-600 text-red-400'
                }`}
              >
                <span className={`font-bold text-xl truncate pr-4 ${item.isAvailable ? 'text-white' : 'text-red-400 line-through'}`}>
                  {item.name}
                </span>
                {item.isAvailable ? (
                  <ToggleRight size={32} className="text-emerald-500 shrink-0" />
                ) : (
                  <ToggleLeft size={32} className="text-red-500 shrink-0" />
                )}
              </button>
            ))}
          </div>
        </aside>

      </main>

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="bg-gray-800 w-full max-w-4xl rounded-2xl border-4 border-gray-700 flex flex-col max-h-[90vh]">
             <div className="p-6 border-b-4 border-gray-700 flex items-center justify-between bg-gray-900 rounded-t-xl">
               <h2 className="text-3xl font-black tracking-tighter">RECENTLY COMPLETED</h2>
               <button onClick={() => setShowHistoryModal(false)} className="text-gray-400 hover:text-white p-2">
                 <X size={32} />
               </button>
             </div>
             <div className="p-6 overflow-y-auto space-y-4">
               {historyTickets.length === 0 ? (
                 <p className="text-gray-500 font-bold text-center text-xl py-10">No history yet.</p>
               ) : (
                 historyTickets.map(ticket => (
                   <div key={ticket.id} className="bg-gray-700 rounded-xl p-4 border-l-8 border-gray-500 flex justify-between items-center">
                     <div>
                       <span className="text-2xl font-black">TABLE {ticket.tableNumber}</span>
                       <span className="ml-4 text-gray-400 font-bold">#{ticket.id.slice(-6).toUpperCase()}</span>
                       <div className="mt-2 text-gray-300 font-bold">
                         {ticket.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                       </div>
                     </div>
                     <div className="text-right">
                       <span className="bg-gray-900 text-gray-400 font-black px-4 py-2 rounded-lg uppercase tracking-widest">
                         Completed
                       </span>
                       <div className="mt-2 text-sm text-gray-500 font-bold">
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
          width: 12px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #111827; 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #374151; 
          border-radius: 6px;
          border: 3px solid #111827;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #4B5563; 
        }
      `}} />
    </div>
  );
}

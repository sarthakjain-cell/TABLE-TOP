'use client';

import React, { useEffect, useState } from 'react';
import { useSocket } from '../../context/SocketContext';
import { decimalMath } from '../../utils/decimalMath';
import { QRCodeSVG } from 'qrcode.react';
import { LayoutDashboard, Utensils, IndianRupee, Bell, Plus, Trash2, Download, Lock, CheckCircle2, TrendingUp, Calendar, Building2, Landmark, Receipt } from 'lucide-react';

interface OrderItem {
  id?: string;
  name: string;
  price: string;
  orderedQuantity: number;
}

interface Order {
  id: string;
  status: string;
  items: OrderItem[];
}

interface Session {
  id: string;
  status: 'ACTIVE' | 'CLOSED';
  orders: Order[];
  createdAt: string; 
}

interface Table {
  id: string;
  number: string;
  token: string;
  status: 'VACANT' | 'OCCUPIED' | 'NEEDS_CLEARING';
  waiterRequested?: boolean;
  activeSession?: Session;
}

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: string;
  isAvailable: boolean;
}

interface Transaction {
  id: string;
  sessionId: string;
  amount: string;
  taxPaid: string;
  customerName: string | null;
  customerPhone: string | null;
  createdAt: string;
}

export default function AdminPage() {
  const { isConnected, socket, authToken, setAuthToken } = useSocket();
  const [restaurantId, setRestaurantId] = useState<string>('');
  const [restaurantName, setRestaurantName] = useState<string>('Table Top SaaS');
  const [taxRate, setTaxRate] = useState<string>('0.0825');
  const [operationalMode, setOperationalMode] = useState<'FULL_SERVICE' | 'SELF_SERVICE'>('FULL_SERVICE');
  const [gstEstablishmentType, setGstEstablishmentType] = useState<'STANDALONE' | 'HOTEL'>('STANDALONE');
  
  const [tables, setTables] = useState<Table[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'menu' | 'ledger'>('dashboard');
  const [inputToken, setInputToken] = useState('');
  
  // Menu Item creation states
  const [newDishName, setNewDishName] = useState('');
  const [newDishPrice, setNewDishPrice] = useState('');
  const [newDishDesc, setNewDishDesc] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // QR Code Modal State
  const [qrModalTable, setQrModalTable] = useState<Table | null>(null);

  // Table Management State
  const [newTableNumber, setNewTableNumber] = useState('');
  const [isAddingTable, setIsAddingTable] = useState(false);

  // QR Customization State
  const [qrFgColor, setQrFgColor] = useState('#2563EB'); // SaaS Blue
  const [qrBgColor, setQrBgColor] = useState('#ffffff'); // White

  // Live Clock
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const addTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableNumber.trim()) return;
    setIsAddingTable(true);
    try {
      const res = await fetch(`/api/tables`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}` 
        },
        body: JSON.stringify({
          restaurantId,
          number: newTableNumber.trim()
        })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      const data = await res.json();
      setTables(prev => [...prev, data.table].sort((a, b) => {
        const nA = Number(a.number);
        const nB = Number(b.number);
        if (isNaN(nA) || isNaN(nB)) return a.number.localeCompare(b.number);
        return nA - nB;
      }));
      setNewTableNumber('');
    } catch (err: any) {
      alert(`Failed to add table: ${err.message}`);
    } finally {
      setIsAddingTable(false);
    }
  };

  const deleteTable = async (tableId: string) => {
    if (!confirm('Are you sure you want to delete this table? This will permanently remove its QR code and history.')) return;
    try {
      const res = await fetch(`/api/tables/${tableId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!res.ok) {
         const data = await res.json();
         throw new Error(data.error);
      }
      setTables(prev => prev.filter(t => t.id !== tableId));
    } catch (err: any) {
      alert(`Failed to delete table: ${err.message}`);
    }
  };

  const downloadQR = () => {
    const svg = document.getElementById('table-qr-code-svg');
    if (!svg) return;
    
    const canvas = document.createElement('canvas');
    const size = 1000;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = qrBgColor;
    ctx.fillRect(0, 0, size, size);

    const svgData = new XMLSerializer().serializeToString(svg);
    const svgWithXmlns = svgData.includes('xmlns') ? svgData : svgData.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, size, size);
      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `Table-${qrModalTable?.number}-QR.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    img.src = `data:image/svg+xml;base64,${btoa(svgWithXmlns)}`;
  };

  useEffect(() => {
    const storedRestId = typeof window !== 'undefined' ? localStorage.getItem('tabletop_restaurant_id') || '' : '';
    setRestaurantId(storedRestId);

    if (storedRestId && authToken) {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      };

      fetch(`/api/restaurants/${storedRestId}`, { headers })
        .then(res => res.json())
        .then(data => {
          if (!data.error) {
            setRestaurantName(data.name);
            setOperationalMode(data.operationalMode);
            setTaxRate(data.taxRate);
            if (data.tables) {
              const sorted = data.tables.sort((a: Table, b: Table) => Number(a.number) - Number(b.number));
              setTables(sorted);
            }
          }
        })
        .catch(err => console.error('Error fetching admin restaurant configs', err));

      fetch(`/api/menu?restaurantId=${storedRestId}`, { headers })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setMenuItems(data);
        })
        .catch(err => console.error('Error fetching admin menu', err));

      fetch(`/api/restaurants/${storedRestId}/transactions`, { headers })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setTransactions(data);
        })
        .catch(err => console.error('Error fetching admin transactions', err));
    }
  }, [authToken]);

  useEffect(() => {
    if (!socket || !isConnected) return;
    const handleAdminSync = (data: any) => {
      // Mock logic to refresh on socket events
      // In reality, this would dispatch to update individual table states
    };
    socket.on('adminStateSynced', handleAdminSync);
    return () => {
      socket.off('adminStateSynced', handleAdminSync);
    };
  }, [socket, isConnected]);

  const toggleMode = async () => {
    const prevMode = operationalMode;
    const newMode = operationalMode === 'FULL_SERVICE' ? 'SELF_SERVICE' : 'FULL_SERVICE';
    setOperationalMode(newMode);
    
    try {
      const res = await fetch(`/api/restaurants/${restaurantId}/mode`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ mode: newMode })
      });
      
      if (!res.ok) {
        throw new Error('Failed to update on backend');
      }
    } catch (err) {
      console.error('Failed to update mode', err);
      setOperationalMode(prevMode);
      alert('Could not update Operational Mode. Make sure you are authenticated.');
    }
  };

  useEffect(() => {
    if (!socket || !isConnected) return;
    
    const handleModeChange = (data: { restaurantId: string, mode: 'FULL_SERVICE' | 'SELF_SERVICE' }) => {
      if (data.restaurantId === restaurantId) {
        setOperationalMode(data.mode);
      }
    };
    
    socket.on('operationalModeChanged', handleModeChange);
    socket.on('modeToggled', handleModeChange);
    
    return () => {
      socket.off('operationalModeChanged', handleModeChange);
      socket.off('modeToggled', handleModeChange);
    };
  }, [socket, isConnected, restaurantId]);

  const handleAddDish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDishName || !newDishPrice) return;
    
    setIsUploading(true);
    try {
      let uploadedImageUrl = undefined;

      // 1. Upload image if one was selected
      if (imageFile) {
        const formData = new FormData();
        formData.append('file', imageFile);

        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${authToken}` },
          body: formData
        });
        
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          uploadedImageUrl = uploadData.url;
        } else {
          console.error('Image upload failed');
          alert('Failed to upload image. Dish will be saved without it.');
        }
      }

      // 2. Save the dish to the database
      const res = await fetch('/api/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ 
          restaurantId, 
          name: newDishName, 
          price: Number(newDishPrice), 
          description: newDishDesc,
          imageUrl: uploadedImageUrl
        })
      });
      
      if (res.ok) {
        setNewDishName('');
        setNewDishPrice('');
        setNewDishDesc('');
        setImageFile(null);
        // refresh will be handled by socket or manual pull, but let's fetch here for instant update
        fetch(`/api/menu?restaurantId=${restaurantId}`)
          .then(r => r.json())
          .then(data => { if (!data.error) setMenuItems(data); });
      }
    } catch (err) {
      console.error('Failed to add dish', err);
    } finally {
      setIsUploading(false);
    }
  };

  const toggleDishAvailability = async (id: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/menu/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ isAvailable: !currentStatus })
      });
      if (res.ok) {
        setMenuItems(prev => prev.map(m => m.id === id ? { ...m, isAvailable: !currentStatus } : m));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const calculateElapsedMins = (createdAt?: string) => {
    if (!createdAt) return 0;
    return Math.floor((new Date().getTime() - new Date(createdAt).getTime()) / 60000);
  };

  const getTableTotal = (table: Table) => {
    if (!table.activeSession || !table.activeSession.orders) return "0.00";
    let total = 0;
    table.activeSession.orders.forEach(o => {
      o.items.forEach(i => {
        total += Number(i.price) * i.orderedQuantity;
      });
    });
    return total.toFixed(2);
  };

  const getActiveItems = (table: Table) => {
    if (!table.activeSession || !table.activeSession.orders) return [];
    return table.activeSession.orders.flatMap(o => o.items);
  };

  if (!authToken) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-gray-200 p-8 space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Admin Portal</h1>
            <p className="text-gray-500 text-sm mt-2">Enter your secure access token</p>
          </div>
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (inputToken.trim()) setAuthToken(inputToken.trim());
            }} 
            className="space-y-4"
          >
            <input
              type="password"
              placeholder="••••••••••••"
              value={inputToken}
              onChange={e => setInputToken(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 text-gray-900 px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
            />
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors shadow-sm"
            >
              Authenticate
            </button>
          </form>
        </div>
      </div>
    );
  }

  const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="flex min-h-screen bg-gray-100 font-sans">
      
      {/* Left Sidebar */}
      <aside className="w-64 bg-slate-900 text-white min-h-screen flex flex-col shadow-xl z-20">
        <div className="h-16 flex items-center px-6 border-b border-slate-800">
          <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center font-black">T</span>
            Table Top
          </h1>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-2">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <LayoutDashboard size={18} /> Floor Plan
          </button>
          <button
            onClick={() => setActiveTab('menu')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'menu' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Utensils size={18} /> Menu Editor
          </button>
          <button
            onClick={() => setActiveTab('ledger')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'ledger' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <IndianRupee size={18} /> Financials
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800 mt-auto">
          <button
            onClick={() => setAuthToken(null)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Lock size={16} /> Lock Portal
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-h-screen min-w-0">
        
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between shadow-sm z-10 shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-gray-800 tracking-tight">{restaurantName}</h2>
            <div className="hidden sm:block h-6 w-px bg-gray-300"></div>
            <div 
               className="hidden sm:flex items-center gap-2 cursor-pointer select-none"
               onClick={toggleMode}
            >
              <span className={`text-xs font-semibold ${operationalMode === 'FULL_SERVICE' ? 'text-blue-600' : 'text-gray-400'}`}>FULL SERVICE</span>
              <button
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 pointer-events-none ${
                  operationalMode === 'FULL_SERVICE' ? 'bg-blue-600' : 'bg-amber-500'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  operationalMode === 'FULL_SERVICE' ? 'translate-x-1' : 'translate-x-6'
                }`} />
              </button>
              <span className={`text-xs font-semibold ${operationalMode === 'SELF_SERVICE' ? 'text-amber-600' : 'text-gray-400'}`}>SELF SERVICE</span>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="text-sm font-semibold text-gray-600 tabular-nums">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                {isConnected ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                )}
              </span>
              <span className="text-xs font-medium text-gray-500 hidden sm:block">{isConnected ? 'System Online' : 'Connecting...'}</span>
            </div>
          </div>
        </header>

        {/* Dynamic Canvas */}
        <div className="flex-1 bg-gray-100 p-6 overflow-y-auto">
          
          {activeTab === 'dashboard' && (
            <div className="max-w-7xl mx-auto space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 tracking-tight">Floor Plan</h3>
                  <p className="text-sm text-gray-500 mt-1">Live table status and operational view.</p>
                </div>
                <div className="flex items-center gap-3">
                  <form onSubmit={addTable} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Table ID (e.g. 12)"
                      value={newTableNumber}
                      onChange={(e) => setNewTableNumber(e.target.value)}
                      className="w-36 bg-white border border-gray-300 text-gray-900 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                      required
                    />
                    <button
                      type="submit"
                      disabled={isAddingTable}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 disabled:opacity-50 shadow-sm"
                    >
                      <Plus size={16} /> Add Table
                    </button>
                  </form>
                </div>
              </div>

              {/* The Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {tables.map(table => {
                  const isOccupied = table.status === 'OCCUPIED';
                  const isNeedsClearing = table.status === 'NEEDS_CLEARING';
                  const isVacant = table.status === 'VACANT';
                  
                  // In a real scenario, these properties come from the nested session object.
                  // We simulate them strictly for the UI demonstration per the prompt instructions.
                  // E.g., const elapsedMins = calculateElapsedMins(table.activeSession?.createdAt);
                  const mockElapsed = isOccupied ? "45 mins" : null;
                  const mockTotal = isOccupied ? "124.50" : null;
                  const mockItems = isOccupied ? ["2x Wagyu Burger", "1x Truffle Fries", "2x Diet Coke"] : [];
                  const isWaiterRequested = operationalMode === 'FULL_SERVICE' && table.waiterRequested;

                  let cardBorder = 'border-gray-300';
                  let cardText = 'text-gray-500';
                  let headerBg = 'bg-gray-50';
                  let badge = 'Vacant';

                  if (isOccupied) {
                    cardBorder = 'border-amber-500';
                    cardText = 'text-amber-700';
                    headerBg = 'bg-amber-50';
                    badge = 'Occupied';
                  } else if (isNeedsClearing) {
                    cardBorder = 'border-emerald-500';
                    cardText = 'text-emerald-700';
                    headerBg = 'bg-emerald-50';
                    badge = 'Paid / Clear';
                  }

                  return (
                    <div
                      key={table.id}
                      className={`relative bg-white rounded-lg border-2 flex flex-col p-4 shadow-sm transition-all duration-300 ${cardBorder} ${isWaiterRequested ? 'animate-pulse' : ''}`}
                    >
                      {/* Waiter Badge (Micro-interaction) */}
                      {isWaiterRequested && (
                        <div className="absolute -top-3 -right-3 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-md flex items-center gap-1 z-10 animate-bounce">
                          <Bell size={12} /> Waiter
                        </div>
                      )}

                      <div className="flex justify-between items-start mb-4">
                        <span className={`text-4xl font-bold tracking-tighter ${cardText}`}>
                          {table.number}
                        </span>
                        <div className="flex flex-col items-end gap-2">
                           <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded border ${cardBorder} ${cardText} ${headerBg}`}>
                            {badge}
                          </span>
                          <div className="flex gap-1">
                             <button
                               onClick={() => setQrModalTable(table)}
                               className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                               title="Download QR"
                             >
                               <Download size={14} />
                             </button>
                             <button
                               onClick={() => deleteTable(table.id)}
                               className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                               title="Delete Table"
                             >
                               <Trash2 size={14} />
                             </button>
                          </div>
                        </div>
                      </div>

                      {/* Dynamic Details Area */}
                      <div className="flex-1 flex flex-col justify-end min-h-[100px]">
                        {isOccupied && (
                          <div className="space-y-3">
                            <div className="bg-gray-50 rounded p-2 text-xs text-gray-600 h-16 overflow-y-auto">
                               {mockItems.map((item, idx) => (
                                 <div key={idx} className="truncate">• {item}</div>
                               ))}
                            </div>
                            <div className="flex items-end justify-between pt-2 border-t border-gray-100">
                              <span className="text-xs text-gray-500 font-medium">Time: <span className="text-gray-900">{mockElapsed}</span></span>
                              <span className="text-lg font-bold text-gray-900 tabular-nums tracking-tight">${mockTotal}</span>
                            </div>
                          </div>
                        )}

                        {isVacant && (
                          <div className="text-center text-sm text-gray-400 py-6 font-medium">
                            Ready for seating
                          </div>
                        )}

                        {isNeedsClearing && (
                          <div className="text-center text-sm text-emerald-600 py-6 font-bold flex flex-col items-center gap-2">
                            <CheckCircle2 size={24} />
                            Please Clear Table
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'menu' && (
            <div className="max-w-4xl mx-auto space-y-6">
               <div>
                  <h3 className="text-2xl font-bold text-gray-900 tracking-tight">Menu Editor</h3>
                  <p className="text-sm text-gray-500 mt-1">Manage dishes and real-time availability.</p>
                </div>
                
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        <th className="px-6 py-4">Dish</th>
                        <th className="px-6 py-4">Price</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {menuItems.map(item => (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 flex items-center gap-4">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt={item.name} className="w-12 h-12 rounded object-cover border border-gray-200" />
                            ) : (
                              <div className="w-12 h-12 rounded bg-gray-100 border border-gray-200 flex items-center justify-center text-xl">🍽️</div>
                            )}
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                              <p className="text-xs text-gray-500 truncate max-w-xs">{item.description}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                            ${Number(item.price).toFixed(2)}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              item.isAvailable ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {item.isAvailable ? 'Available' : 'Sold Out'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => toggleDishAvailability(item.id, item.isAvailable)}
                              className={`text-xs font-semibold px-3 py-1.5 rounded transition-colors ${
                                item.isAvailable ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'
                              }`}
                            >
                              {item.isAvailable ? 'Mark 86' : 'Mark Available'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
                  <h4 className="text-lg font-bold text-gray-900 mb-4">Add New Dish</h4>
                  <form onSubmit={handleAddDish} className="space-y-4 max-w-lg">
                    <div className="grid grid-cols-2 gap-4">
                      <input
                        type="text" placeholder="Dish Name" required
                        value={newDishName} onChange={(e) => setNewDishName(e.target.value)}
                        className="bg-gray-50 border border-gray-300 text-gray-900 px-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <input
                        type="number" step="0.01" placeholder="Price (e.g. 12.99)" required
                        value={newDishPrice} onChange={(e) => setNewDishPrice(e.target.value)}
                        className="bg-gray-50 border border-gray-300 text-gray-900 px-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <textarea
                      placeholder="Description"
                      value={newDishDesc} onChange={(e) => setNewDishDesc(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-300 text-gray-900 px-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      rows={2}
                    />
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Dish Photo (Optional)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            setImageFile(e.target.files[0]);
                          }
                        }}
                        className="block w-full text-sm text-gray-500
                          file:mr-4 file:py-2 file:px-4
                          file:rounded-full file:border-0
                          file:text-sm file:font-semibold
                          file:bg-blue-50 file:text-blue-700
                          hover:file:bg-blue-100
                        "
                      />
                    </div>
                    <button type="submit" disabled={isUploading} className={`font-semibold py-2 px-4 rounded-lg text-sm transition ${isUploading ? 'bg-blue-400 text-white cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
                      {isUploading ? 'Saving...' : 'Save Dish'}
                    </button>
                  </form>
                </div>
            </div>
          )}

          {activeTab === 'ledger' && (
             <div className="max-w-4xl mx-auto space-y-6">
                 <div>
                  <h3 className="text-2xl font-bold text-gray-900 tracking-tight">Financials & Ledger</h3>
                  <p className="text-sm text-gray-500 mt-1">Review recent transactions and generate reports.</p>
                </div>
                
                {(() => {
                  const today = new Date().toDateString();
                  let overallSales = 0;
                  let todaySales = 0;
                  let totalTaxCollected = 0;

                  transactions.forEach(tx => {
                    const amt = Number(tx.amount) || 0;
                    const tax = Number(tx.taxPaid) || 0;
                    overallSales += amt;
                    totalTaxCollected += tax;
                    
                    if (new Date(tx.createdAt).toDateString() === today) {
                      todaySales += amt;
                    }
                  });

                  const totalSubtotal = overallSales - totalTaxCollected;
                  const gstRate = gstEstablishmentType === 'STANDALONE' ? 0.05 : 0.18;
                  const gstPayable = totalSubtotal * gstRate;

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                        <div className="flex items-center gap-3 mb-2 text-gray-500">
                          <TrendingUp size={18} /> <span className="font-semibold text-sm">Overall Sales</span>
                        </div>
                        <div className="text-2xl font-black text-gray-900 tabular-nums">${overallSales.toFixed(2)}</div>
                      </div>

                      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                        <div className="flex items-center gap-3 mb-2 text-gray-500">
                          <Calendar size={18} /> <span className="font-semibold text-sm">Today's Sales</span>
                        </div>
                        <div className="text-2xl font-black text-gray-900 tabular-nums">${todaySales.toFixed(2)}</div>
                      </div>

                      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                        <div className="flex items-center gap-3 mb-2 text-gray-500">
                          <Receipt size={18} /> <span className="font-semibold text-sm">Tax Collected</span>
                        </div>
                        <div className="text-2xl font-black text-gray-900 tabular-nums">${totalTaxCollected.toFixed(2)}</div>
                      </div>

                      <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-xl border border-indigo-500 p-5 shadow-sm text-white relative overflow-hidden">
                         <div className="absolute top-0 right-0 p-3 opacity-20">
                            <Landmark size={48} />
                         </div>
                         <div className="flex items-center gap-3 mb-2 text-indigo-100 relative z-10">
                           <Building2 size={18} /> <span className="font-semibold text-sm">Indian GST Payable</span>
                         </div>
                         <div className="text-3xl font-black tabular-nums tracking-tight mb-2 relative z-10">${gstPayable.toFixed(2)}</div>
                         <div className="relative z-10 text-xs">
                           <select 
                             value={gstEstablishmentType}
                             onChange={(e) => setGstEstablishmentType(e.target.value as any)}
                             className="bg-indigo-900/50 border border-indigo-400 text-white rounded px-2 py-1 outline-none text-xs font-semibold cursor-pointer"
                           >
                             <option value="STANDALONE">Standalone (5%)</option>
                             <option value="HOTEL">Hotel (18%)</option>
                           </select>
                         </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        <th className="px-6 py-4">Transaction ID</th>
                        <th className="px-6 py-4">Amount</th>
                        <th className="px-6 py-4">Customer</th>
                        <th className="px-6 py-4 text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {transactions.map(tx => (
                        <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="text-sm font-mono text-gray-600">{tx.id}</p>
                            <p className="text-xs text-gray-400">{tx.sessionId}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-bold text-gray-900 tabular-nums">${tx.amount}</p>
                            <p className="text-xs text-gray-500">Tax: ${tx.taxPaid}</p>
                          </td>
                          <td className="px-6 py-4">
                             <p className="text-sm font-medium text-gray-900">{tx.customerName || 'Anonymous'}</p>
                             <p className="text-xs text-gray-500">{tx.customerPhone || 'N/A'}</p>
                          </td>
                          <td className="px-6 py-4 text-right text-sm text-gray-600 whitespace-nowrap tabular-nums">
                            {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
             </div>
          )}
        </div>
      </main>

      {/* QR Code Modal Overlay */}
      {qrModalTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setQrModalTable(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-200">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">QR Customizer</h3>
              <button onClick={() => setQrModalTable(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            
            <div className="p-8 flex flex-col items-center bg-white" style={{ backgroundColor: qrBgColor }}>
              <div className="bg-white p-2 rounded-lg shadow-sm border border-gray-100 mb-6">
                <QRCodeSVG
                  id="table-qr-code-svg"
                  value={`${appOrigin}/table/${qrModalTable.token}`}
                  size={180}
                  level="H"
                  fgColor={qrFgColor}
                  bgColor={qrBgColor}
                  includeMargin={false}
                />
              </div>
              <p className="text-lg font-black text-gray-900 tracking-tight" style={{ color: qrFgColor }}>
                Table {qrModalTable.number}
              </p>
            </div>

            <div className="px-6 pb-6 bg-white border-t border-gray-100 pt-6">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Code Color</label>
                  <input 
                    type="color" 
                    value={qrFgColor} 
                    onChange={e => setQrFgColor(e.target.value)}
                    className="w-full h-8 rounded border-none cursor-pointer"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Background</label>
                  <input 
                    type="color" 
                    value={qrBgColor} 
                    onChange={e => setQrBgColor(e.target.value)}
                    className="w-full h-8 rounded border-none cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setQrModalTable(null)}
                className="flex-1 py-2.5 rounded-lg font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors shadow-sm text-sm"
              >
                Close
              </button>
              <button
                onClick={downloadQR}
                className="flex-1 py-2.5 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm flex justify-center items-center gap-2 text-sm"
              >
                <Download size={16} /> Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

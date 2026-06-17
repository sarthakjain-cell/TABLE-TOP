'use client';

import React, { useEffect, useState } from 'react';
import { useSocket } from '../../context/SocketContext';
import { decimalMath } from '../../utils/decimalMath';
import { QRCodeSVG } from 'qrcode.react';
import { useRouter } from 'next/navigation';
import ModifierBuilder from './ModifierBuilder';
import { LayoutDashboard, Utensils, IndianRupee, Bell, Plus, Trash2, Download, Lock, CheckCircle2, TrendingUp, Calendar, Building2, Landmark, Receipt, UploadCloud, Loader2, X, Settings } from 'lucide-react';

interface OrderItem {
  orderedQuantity: number;
  id?: string;
  name: string;
  price: string;
  quantity: number;
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
  transactions?: any[];
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
  halfPrice?: string | null;
  hasHalfPortion?: boolean;
  category?: string;
  isAvailable: boolean;
  isVeg?: boolean;
  modifierGroups?: any;
  imageUrl?: string;
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
  const router = useRouter();
  const { isConnected, socket, authToken, setAuthToken } = useSocket();
  const [restaurantId, setRestaurantId] = useState<string>('');
  const [restaurantName, setRestaurantName] = useState('');
  const [allRestaurants, setAllRestaurants] = useState<{id: string, name: string}[]>([]);
  const [operationalMode, setOperationalMode] = useState<'FULL_SERVICE' | 'SELF_SERVICE'>('FULL_SERVICE');
  const [establishmentType, setEstablishmentType] = useState<'RESTAURANT' | 'HOTEL'>('RESTAURANT');
  const [roomServiceFee, setRoomServiceFee] = useState<string>('0');
  const [taxRate, setTaxRate] = useState<number>(0);
  const [upiId, setUpiId] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [restaurantLogoUrl, setRestaurantLogoUrl] = useState('');
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'PRE_PAY' | 'POST_PAY'>('POST_PAY');
  
  const [tables, setTables] = useState<Table[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [ledgerFilterDate, setLedgerFilterDate] = useState<string>('');
  const [ledgerFilterMonth, setLedgerFilterMonth] = useState<string>('');
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'menu' | 'ledger' | 'settings'>('dashboard');
  const [inputRestaurantId, setInputRestaurantId] = useState('');
  const [inputPasscode, setInputPasscode] = useState('');
  const [loginError, setLoginError] = useState('');
  // Menu Item creation states
  const [newDishName, setNewDishName] = useState('');
  const [newDishPrice, setNewDishPrice] = useState('');
  const [newDishHasHalfPortion, setNewDishHasHalfPortion] = useState(false);
  const [newDishHalfPrice, setNewDishHalfPrice] = useState('');
  const [newDishDesc, setNewDishDesc] = useState('');
  const [newDishCategory, setNewDishCategory] = useState('');
  const [newDishImageUrl, setNewDishImageUrl] = useState('');
  const [newDishIsVeg, setNewDishIsVeg] = useState(true);
  const [newDishModifierGroups, setNewDishModifierGroups] = useState<any[]>([]);
  const [isSavingDish, setIsSavingDish] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Menu Item Editing states
  const [editingDish, setEditingDish] = useState<MenuItem | null>(null);
  const [editDishName, setEditDishName] = useState('');
  const [editDishPrice, setEditDishPrice] = useState('');
  const [editDishHasHalfPortion, setEditDishHasHalfPortion] = useState(false);
  const [editDishHalfPrice, setEditDishHalfPrice] = useState('');
  const [editDishDesc, setEditDishDesc] = useState('');
  const [editDishCategory, setEditDishCategory] = useState('');
  const [editDishImageUrl, setEditDishImageUrl] = useState('');
  const [editDishIsVeg, setEditDishIsVeg] = useState(true);
  const [editDishModifierGroups, setEditDishModifierGroups] = useState<any[]>([]);
  const [isUpdatingDish, setIsUpdatingDish] = useState(false);
  const [isDeletingDish, setIsDeletingDish] = useState(false);
  const editFileInputRef = React.useRef<HTMLInputElement>(null);

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
  const handleForceCloseSession = async (sessionId: string, tableId: string) => {
    if (!confirm('Are you sure you want to mark this table as paid manually? This will clear the table, and the money will NOT be recorded in the digital ledger.')) return;
    
    try {
      const res = await fetch(`/api/sessions/${sessionId}/close`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!res.ok) {
         const data = await res.json();
         throw new Error(data.error);
      }
      
      // Optimistically update the UI to vacate the table
      setTables(prev => prev.map(t => {
        if (t.id === tableId) {
          return { ...t, status: 'VACANT', activeSession: undefined };
        }
        return t;
      }));
    } catch (err: any) {
      alert(`Failed to manually close session: ${err.message}`);
    }
  };

  const handleApprovePayment = async (orderId: string) => {
    if (!confirm('Are you sure you want to approve this payment and send the order to the kitchen?')) return;
    
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}` 
        },
        body: JSON.stringify({ status: 'NEW' })
      });
      if (!res.ok) {
         const data = await res.json();
         throw new Error(data.error);
      }
      // Optimistically update the table state so the button disappears instantly
      setTables(prev => prev.map(t => {
         const newT = { ...t, waiterRequested: false };
         if (newT.activeSession && newT.activeSession.orders) {
           newT.activeSession.orders = newT.activeSession.orders.map((o: any) => 
              o.id === orderId ? { ...o, status: 'NEW' } : o
           );
         }
         return newT;
      }));
    } catch (err: any) {
      alert(`Failed to approve payment: ${err.message}`);
    }
  };

  const handleVerifyCashTransaction = async (transactionId: string) => {
    if (!confirm('Are you sure you want to verify this cash payment?')) return;
    
    try {
      const res = await fetch(`/api/transactions/${transactionId}/verify`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}` 
        }
      });
      if (!res.ok) {
         const data = await res.json();
         throw new Error(data.error);
      }
      
      // Optimistically update tables
      setTables(prev => prev.map(t => {
         const newT = { ...t, waiterRequested: false };
         if (newT.activeSession && newT.activeSession.transactions) {
           newT.activeSession.transactions = newT.activeSession.transactions.map((tx: any) => 
              tx.id === transactionId ? { ...tx, status: 'COMPLETED' } : tx
           );
         }
         return newT;
      }));
    } catch (err: any) {
      alert(err.message || 'Failed to verify transaction');
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
    const initData = async () => {
      let storedRestId = typeof window !== 'undefined' ? localStorage.getItem('tabletop_restaurant_id') || '' : '';
      
      setRestaurantId(storedRestId);

      if (storedRestId && authToken) {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      };

      fetch(`/api/restaurants/${storedRestId}?t=${Date.now()}`, { headers, cache: 'no-store' })
        .then(res => res.json())
        .then(async data => {
          if (!data.error) {
            setRestaurantName(data.name);
            setOperationalMode(data.operationalMode);
            setEstablishmentType(data.establishmentType);
            setRoomServiceFee(data.roomServiceFee?.toString() || '0');
            setUpiId(data.upiId || '');
            setMerchantName(data.merchantName || '');
            setPaymentMode(data.paymentMode || 'POST_PAY');
            if (data.tables) {
              const mapped = data.tables.map((t: any) => ({
                ...t,
                activeSession: t.sessions && t.sessions.length > 0 ? t.sessions[0] : undefined
              }));
              const sorted = mapped.sort((a: Table, b: Table) => Number(a.number) - Number(b.number));
              setTables(sorted);
            }
          } else {
             // Auth failed or restaurant not found, clear token
             setAuthToken(null);
             if (typeof window !== 'undefined') localStorage.removeItem('tabletop_restaurant_id');
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
    };
    if (isConnected) {
      initData();
    }
  }, [authToken, isConnected]);

  useEffect(() => {
    if (!socket || !isConnected) return;
    const handleAdminSync = (data: any) => {
      let storedRestId = typeof window !== 'undefined' ? localStorage.getItem('tabletop_restaurant_id') || '' : '';
      if (storedRestId) {
        const headers = { 'Authorization': `Bearer ${authToken}` };
        fetch(`/api/restaurants/${storedRestId}`, { headers }).then(res => res.json()).then(data => {
          if(data && data.tables && Array.isArray(data.tables)) {
            const mapped = data.tables.map((t: any) => ({ ...t, activeSession: t.sessions && t.sessions.length > 0 ? t.sessions[0] : undefined }));
            setTables(mapped.sort((a: any, b: any) => Number(a.number) - Number(b.number)));
          }
        });
        fetch(`/api/restaurants/${storedRestId}/transactions`, { headers }).then(res => res.json()).then(data => {
          if(Array.isArray(data)) setTransactions(data);
        });
      }
    };
    
    const handleHelpRequested = ({ tableNumber, requestType }: { tableNumber: string, requestType: string }) => {
      // Note: backend emits the table's ID as tableNumber here
      setTables(prev => prev.map(t => t.id === tableNumber ? { ...t, waiterRequested: true } : t));
      const audio = new Audio('/assets/audio/chime.mp3');
      audio.play().catch(err => console.log('Audio blocked', err));
      handleAdminSync(null);
    };

    socket.on('adminStateSynced', handleAdminSync);
    socket.on('helpRequested', handleHelpRequested);
    socket.on('newOrderReceived', handleAdminSync);
    socket.on('orderStatusUpdated', handleAdminSync);
    return () => {
      socket.off('adminStateSynced', handleAdminSync);
      socket.off('helpRequested', handleHelpRequested);
      socket.off('newOrderReceived', handleAdminSync);
      socket.off('orderStatusUpdated', handleAdminSync);
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

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    e.preventDefault();
    const file = 'dataTransfer' in e ? (e as React.DragEvent).dataTransfer.files[0] : (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be less than 5MB");
      return;
    }

    setIsUploadingLogo(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const uploadEndpoint = apiUrl ? `${apiUrl}/api/upload` : '/api/upload';

      const response = await fetch(uploadEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');
      const data = await response.json();
      setRestaurantLogoUrl(data.url);
    } catch (err) {
      console.error('Image upload failed:', err);
      alert('Failed to upload image. Please try again.');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const savePaymentSettings = async () => {
    try {
      const res = await fetch(`/api/restaurants/${restaurantId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ establishmentType, paymentMode, upiId, merchantName, logoUrl: restaurantLogoUrl })
      });
      if (!res.ok) throw new Error('Failed to save settings');
      alert('Payment settings saved successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to save payment settings');
    }
  };

  useEffect(() => {
    if (!socket || !isConnected) return;
    
    const handleModeChange = (data: { restaurantId: string, mode: 'FULL_SERVICE' | 'SELF_SERVICE' }) => {
      if (data.restaurantId === restaurantId) {
        setOperationalMode(data.mode);
      }
    };

    const handleSettingsChange = (data: { restaurantId: string, establishmentType: 'RESTAURANT' | 'HOTEL', paymentMode: 'PRE_PAY' | 'POST_PAY', roomServiceFee: string, upiId?: string, merchantName?: string, logoUrl?: string }) => {
      if (data.restaurantId === restaurantId) {
        setEstablishmentType(data.establishmentType);
        if (data.paymentMode) setPaymentMode(data.paymentMode);
        if (data.roomServiceFee) setRoomServiceFee(data.roomServiceFee.toString());
        if (data.upiId !== undefined) setUpiId(data.upiId);
        if (data.merchantName !== undefined) setMerchantName(data.merchantName);
        if (data.logoUrl !== undefined) setRestaurantLogoUrl(data.logoUrl || '');
      }
    };
    
    socket.on('operationalModeChanged', handleModeChange);
    socket.on('modeToggled', handleModeChange);
    socket.on('establishmentSettingsChanged', handleSettingsChange);
    
    return () => {
      socket.off('operationalModeChanged', handleModeChange);
      socket.off('modeToggled', handleModeChange);
      socket.off('establishmentSettingsChanged', handleSettingsChange);
    };
  }, [socket, isConnected, restaurantId]);

  const toggleEstablishmentType = async () => {
    const prevType = establishmentType;
    const newType = establishmentType === 'RESTAURANT' ? 'HOTEL' : 'RESTAURANT';
    setEstablishmentType(newType);
    
    try {
      const res = await fetch(`/api/restaurants/${restaurantId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ establishmentType: newType })
      });
      
      if (!res.ok) throw new Error('Failed to update settings');
    } catch (err) {
      console.error('Failed to update establishment type', err);
      setEstablishmentType(prevType);
      alert('Could not update Establishment Type.');
    }
  };

  const saveRoomServiceFee = async (fee: string) => {
    try {
      const res = await fetch(`/api/restaurants/${restaurantId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ establishmentType, paymentMode, roomServiceFee: parseFloat(roomServiceFee), upiId, merchantName })
      });
      
      if (!res.ok) throw new Error('Failed to save fee');
    } catch (err) {
      console.error(err);
      alert('Failed to save Room Service Fee.');
    }
  };

  const uploadToCloudinary = async (file: File, isEdit: boolean = false) => {
    setIsUploadingImage(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const uploadEndpoint = apiUrl ? `${apiUrl}/api/upload` : '/api/upload';

      const response = await fetch(uploadEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Upload failed with status: ${response.status}`);
      }

      const data = await response.json();
      if (isEdit) {
        setEditDishImageUrl(data.url);
      } else {
        setNewDishImageUrl(data.url);
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      setUploadError(error.message || 'Failed to upload image. Please try again.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean = false) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadToCloudinary(file, isEdit);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, isEdit: boolean = false) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      uploadToCloudinary(file, isEdit);
    }
  };

  const handleRemoveImage = async (isEdit: boolean = false) => {
    if (isEdit) {
      setEditDishImageUrl('');
      if (editFileInputRef.current) editFileInputRef.current.value = '';

      // Optimistic UI for image removal on existing dish
      if (editingDish) {
        setMenuItems(prev => prev.map(m => m.id === editingDish.id ? { ...m, imageUrl: '' } : m));
        try {
          const res = await fetch(`/api/menu/${editingDish.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ imageUrl: null })
          });
          if (res.ok) router.refresh();
        } catch (err) {
          console.error('Failed to remove image in backend', err);
        }
      }
    } else {
      setNewDishImageUrl('');
        setNewDishIsVeg(true);
        setNewDishModifierGroups([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddDish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDishName || !newDishPrice) return;
    
    setIsSavingDish(true);
    try {
      const res = await fetch('/api/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ 
          restaurantId, 
          name: newDishName, 
          price: Number(newDishPrice), 
          halfPrice: newDishHasHalfPortion ? Number(newDishHalfPrice) : null,
          hasHalfPortion: newDishHasHalfPortion,
          description: newDishDesc,
          category: newDishCategory || "Main Course",
          imageUrl: newDishImageUrl || undefined,
          modifierGroups: newDishModifierGroups
        })
      });
      
      if (res.ok) {
        setNewDishName('');
        setNewDishPrice('');
        setNewDishHasHalfPortion(false);
        setNewDishHalfPrice('');
        setNewDishModifierGroups([]);
        setNewDishCategory('');
        setNewDishImageUrl('');
        fetch(`/api/menu?restaurantId=${restaurantId}`)
          .then(r => r.json())
          .then(data => { if (!data.error) setMenuItems(data); });
        router.refresh();
      }
    } catch (err) {
      console.error('Failed to add dish', err);
    } finally {
      setIsSavingDish(false);
    }
  };

  const handleUpdateDish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDish || !editDishName || !editDishPrice) return;
    
    setIsUpdatingDish(true);
    try {
      const res = await fetch(`/api/menu/${editingDish.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ 
          name: editDishName, 
          price: Number(editDishPrice), 
          halfPrice: editDishHasHalfPortion ? Number(editDishHalfPrice) : null,
          hasHalfPortion: editDishHasHalfPortion,
          description: editDishDesc,
          category: editDishCategory || "Main Course",
          imageUrl: editDishImageUrl || undefined,
          modifierGroups: editDishModifierGroups
        })
      });
      
      if (res.ok) {
        setEditingDish(null);
        fetch(`/api/menu?restaurantId=${restaurantId}`)
          .then(r => r.json())
          .then(data => { if (!data.error) setMenuItems(data); });
        router.refresh();
      }
    } catch (err) {
      console.error('Failed to update dish', err);
    } finally {
      setIsUpdatingDish(false);
    }
  };

  const handleDeleteDish = async (id: string) => {
    if (!confirm('Are you sure you want to delete this dish?')) return;
    setIsDeletingDish(true);
    try {
      const res = await fetch(`/api/menu/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        setEditingDish(null);
        fetch(`/api/menu?restaurantId=${restaurantId}`)
          .then(r => r.json())
          .then(data => { if (!data.error) setMenuItems(data); });
        router.refresh();
      } else {
        const errorData = await res.json();
        alert(`Could not delete: ${errorData.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Failed to delete dish', err);
      alert('An error occurred while deleting the dish.');
    } finally {
      setIsDeletingDish(false);
    }
  };

  const openEditModal = (item: MenuItem) => {
    setEditingDish(item);
    setEditDishName(item.name);
    setEditDishPrice(item.price);
    setEditDishHasHalfPortion(!!item.hasHalfPortion);
    setEditDishHalfPrice(item.halfPrice || '');
    setEditDishDesc(item.description || '');
    setEditDishCategory(item.category || 'Main Course');
    setEditDishImageUrl(item.imageUrl || '');
    setEditDishModifierGroups(typeof item.modifierGroups === 'string' ? JSON.parse(item.modifierGroups) : item.modifierGroups || []);
    setEditingDish(item);
  };

  const toggleDishAvailability = async (id: string, currentStatus: boolean) => {
    // Optimistic UI Update - instantly reflect change
    setMenuItems(prev => prev.map(m => m.id === id ? { ...m, isAvailable: !currentStatus } : m));

    try {
      const res = await fetch(`/api/menu/${id}/availability`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
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

  const calculateElapsedMins = (createdAt?: string) => {
    if (!createdAt) return 0;
    return Math.floor((new Date().getTime() - new Date(createdAt).getTime()) / 60000);
  };

  const getTableTotal = (table: Table) => {
    if (!table.activeSession || !table.activeSession.orders) return "0.00";
    let subtotal = '0.00';
    table.activeSession.orders.forEach(o => {
      o.items.forEach(i => {
        subtotal = decimalMath.add(subtotal, decimalMath.multiply(i.price.toString(), (i.orderedQuantity || i.quantity || 1).toString()));
      });
    });
    const tax = decimalMath.calculateTax(subtotal, taxRate || 0);
    return decimalMath.add(subtotal, tax);
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
            <p className="text-gray-500 text-sm mt-2">Enter your Restaurant ID and secure Passcode</p>
          </div>
          <form 
            onSubmit={async (e) => {
              e.preventDefault();
              setLoginError('');
              if (!inputRestaurantId.trim() || !inputPasscode.trim()) {
                setLoginError('Both fields are required');
                return;
              }
              try {
                const res = await fetch('/api/auth/login', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ restaurantId: inputRestaurantId.trim(), passcode: inputPasscode.trim() })
                });
                const data = await res.json();
                if (res.ok && data.token) {
                  localStorage.setItem('tabletop_restaurant_id', data.restaurant.id);
                  setAuthToken(data.token);
                } else {
                  setLoginError(data.error || 'Authentication failed');
                }
              } catch (err) {
                setLoginError('Network error. Please try again.');
              }
            }} 
            className="space-y-4"
          >
            {loginError && <div className="p-3 bg-red-100 border border-red-200 text-red-600 rounded text-sm text-center font-semibold">{loginError}</div>}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Restaurant ID</label>
              <input
                type="text"
                placeholder="e.g. 123e4567-e89b-12d3..."
                value={inputRestaurantId}
                onChange={e => setInputRestaurantId(e.target.value)}
                className="w-full bg-gray-50 border border-gray-300 text-gray-900 px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Passcode</label>
              <input
                type="password"
                placeholder="••••••••"
                value={inputPasscode}
                onChange={e => setInputPasscode(e.target.value)}
                className="w-full bg-gray-50 border border-gray-300 text-gray-900 px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors shadow-sm"
            >
              Secure Login
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
            <LayoutDashboard size={18} /> {establishmentType === 'HOTEL' ? 'Room Management' : 'Floor Plan'}
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
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'settings' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Settings size={18} /> Settings
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
            {establishmentType === 'RESTAURANT' && (
              <button 
                 className="hidden sm:flex items-center gap-2 cursor-pointer select-none focus:outline-none bg-gray-100 p-1 rounded-full border border-gray-200"
                 onClick={toggleMode}
              >
                <span className={`text-xs font-bold px-3 py-1 rounded-full transition-colors ${operationalMode === 'FULL_SERVICE' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}>Waitstaff</span>
                <span className={`text-xs font-bold px-3 py-1 rounded-full transition-colors ${operationalMode === 'SELF_SERVICE' ? 'bg-amber-500 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}>Self-Serve</span>
              </button>
            )}
            <div className="hidden sm:flex items-center gap-2 select-none bg-gray-100 p-1 rounded-full border border-gray-200 opacity-90 cursor-default">
              <span className={`text-xs font-bold px-3 py-1 rounded-full transition-colors ${establishmentType === 'RESTAURANT' ? 'bg-blue-600 text-white shadow-sm' : 'hidden'}`}>Restaurant Account</span>
              <span className={`text-xs font-bold px-3 py-1 rounded-full transition-colors ${establishmentType === 'HOTEL' ? 'bg-purple-600 text-white shadow-sm' : 'hidden'}`}>Hotel Account</span>
            </div>
            {establishmentType === 'HOTEL' && (
              <div className="hidden sm:flex items-center gap-2 text-sm text-gray-700 font-semibold bg-gray-100 px-3 py-1.5 rounded border border-gray-200">
                <span>Fee: ₹</span>
                <input 
                  type="number" 
                  value={roomServiceFee} 
                  onChange={(e) => setRoomServiceFee(e.target.value)}
                  onBlur={() => saveRoomServiceFee(roomServiceFee)}
                  className="w-16 bg-white border border-gray-300 rounded px-1 outline-none focus:border-blue-500" 
                />
              </div>
            )}
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
                  <h3 className="text-2xl font-bold text-gray-900 tracking-tight">{establishmentType === 'HOTEL' ? 'Room Management' : 'Floor Plan'}</h3>
                  <p className="text-sm text-gray-500 mt-1">Live {establishmentType === 'HOTEL' ? 'room' : 'table'} status and operational view.</p>
                </div>
                <div className="flex items-center gap-3">
                  <form onSubmit={addTable} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={`${establishmentType === 'HOTEL' ? 'Room' : 'Table'} ID (e.g. 101)`}
                      value={newTableNumber}
                      onChange={(e) => setNewTableNumber(e.target.value)}
                      className="w-40 bg-white border border-gray-300 text-gray-900 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                      required
                    />
                    <button
                      type="submit"
                      disabled={isAddingTable}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 disabled:opacity-50 shadow-sm"
                    >
                      <Plus size={16} /> Add {establishmentType === 'HOTEL' ? 'Room' : 'Table'}
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
                  
                  let realElapsed: string | null = null;
                  let realTotal: string | null = null;
                  let realItems: string[] = [];
                  let pendingPaymentOrderId: string | null = null;
                  let pendingTransactionId: string | null = null;
                  let hasPendingTransaction = false;

                  if (isOccupied && table.activeSession) {
                    const diffMs = Date.now() - new Date(table.activeSession.createdAt).getTime();
                    const diffMins = Math.floor(diffMs / 60000);
                    realElapsed = `${diffMins} mins`;
                    
                    const pendingTx = table.activeSession.transactions?.find((t: any) => t.status === 'PENDING');
                    if (pendingTx) {
                      hasPendingTransaction = true;
                      pendingTransactionId = pendingTx.id;
                    }
                    
                    let subtotal = '0.00';
                    table.activeSession.orders?.forEach((order: any) => {
                      if (order.status === 'PAYMENT_PENDING') {
                        pendingPaymentOrderId = order.id;
                      }
                      if (order.status !== 'CANCELLED') {
                        order.items?.forEach((item: any) => {
                          const itemTotal = decimalMath.multiply(item.price.toString(), item.quantity.toString());
                          subtotal = decimalMath.add(subtotal, itemTotal);
                        });
                      }
                    });
                    const taxAmt = decimalMath.calculateTax(subtotal, taxRate || 0);
                    realTotal = decimalMath.add(subtotal, taxAmt);
                    
                    table.activeSession.orders?.forEach((order: any) => {
                       if (order.status !== 'CANCELLED') {
                         order.items?.forEach((item: any) => {
                           const qty = item.quantity || item.orderedQuantity;
                           const name = item.menuItem?.name || item.name || 'Item';
                           if (order.status === 'COMPLETED') {
                             realItems.push(`✅ ${qty}x ${name}`);
                           } else {
                             realItems.push(`${qty}x ${name}`);
                           }
                         });
                       }
                    });
                  }

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
                        <button 
                          onClick={() => setTables(prev => prev.map(t => t.id === table.id ? { ...t, waiterRequested: false } : t))}
                          className="absolute -top-3 -right-3 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-md flex items-center gap-1 z-10 animate-bounce cursor-pointer active:scale-95 transition-transform"
                        >
                          <Bell size={12} /> Clear Waiter
                        </button>
                      )}
                      
                      {/* Payment Pending Badge */}
                      {(hasPendingTransaction || pendingPaymentOrderId) && !isWaiterRequested && (
                        <div className="absolute -top-3 -right-3 bg-orange-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-md z-10 animate-pulse">
                          Pending Payment
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
                               {realItems.length > 0 ? realItems.map((item, idx) => (
                                 <div key={idx} className="truncate">• {item}</div>
                               )) : <div className="text-gray-400 italic">No items ordered yet</div>}
                            </div>
                            <div className="flex items-end justify-between pt-2 border-t border-gray-100">
                              <span className="text-xs text-gray-500 font-medium">Time: <span className="text-gray-900">{realElapsed || '0 mins'}</span></span>
                              <span className="text-lg font-bold text-gray-900 tabular-nums tracking-tight">${realTotal || '0.00'}</span>
                            </div>
                            {table.activeSession && (
                              <button
                                onClick={() => handleForceCloseSession(table.activeSession!.id, table.id)}
                                className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-bold py-2 rounded-lg text-[10px] uppercase tracking-wider transition-colors border border-red-200"
                              >
                                Bill Paid Manually / Vacate
                              </button>
                            )}
                            {pendingPaymentOrderId && (
                              <button
                                onClick={() => handleApprovePayment(pendingPaymentOrderId!)}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg text-[10px] uppercase tracking-wider transition-colors shadow-sm animate-pulse"
                              >
                                Verify & Approve Payment
                              </button>
                            )}
                            {pendingTransactionId && (
                              <div className="flex items-center justify-between bg-green-50 rounded-lg p-3 border border-green-200 mt-2">
                                <span className="text-xs font-bold text-green-800 flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                  Cash Payment Received?
                                </span>
                                <button
                                  onClick={() => handleVerifyCashTransaction(pendingTransactionId!)}
                                  className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-300 transition-colors hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                                >
                                  <span className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform translate-x-1" />
                                </button>
                              </div>
                            )}
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
                            {item.hasHalfPortion && item.halfPrice && (
                              <span className="block text-xs text-blue-600 mt-1">Half: ${Number(item.halfPrice).toFixed(2)}</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              item.isAvailable ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {item.isAvailable ? 'Available' : 'Sold Out'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEditModal(item)}
                              className="text-xs font-semibold px-3 py-1.5 rounded transition-colors text-blue-600 hover:bg-blue-50"
                            >
                              Edit
                            </button>
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
                    <div className="flex items-center gap-2 mb-2">
                      <input 
                        type="checkbox" 
                        id="newHalfPortion"
                        checked={newDishHasHalfPortion}
                        onChange={(e) => setNewDishHasHalfPortion(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <label htmlFor="newHalfPortion" className="text-sm font-medium text-gray-700">Offers Half Portion?</label>
                    </div>
                    {newDishHasHalfPortion && (
                      <div className="mb-4">
                        <input
                          type="number" step="0.01" placeholder="Half Portion Price" required
                          value={newDishHalfPrice} onChange={(e) => setNewDishHalfPrice(e.target.value)}
                          className="w-1/2 bg-gray-50 border border-gray-300 text-gray-900 px-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <input
                        type="text" list="categories" placeholder="Category (e.g. Breads)" required
                        value={newDishCategory} onChange={(e) => setNewDishCategory(e.target.value)}
                        className="bg-gray-50 border border-gray-300 text-gray-900 px-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <textarea
                        placeholder="Description"
                        value={newDishDesc} onChange={(e) => setNewDishDesc(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-300 text-gray-900 px-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                        rows={1}
                      />
                    </div>
                    <datalist id="categories">
                      <option value="Breakfast" />
                      <option value="Snacks" />
                      <option value="Main Course" />
                      <option value="Dinner" />
                      <option value="Breads" />
                      <option value="Desserts" />
                      <option value="Beverages" />
                    </datalist>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Dish Photo (Optional)</label>
                      {newDishImageUrl ? (
                        <div className="relative rounded-lg overflow-hidden border border-gray-200">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img 
                            src={newDishImageUrl} 
                            alt="Dish preview" 
                            className="w-full h-48 object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(false)}
                            className="absolute top-2 right-2 p-1 bg-white rounded-full shadow-sm hover:bg-red-50 text-gray-600 hover:text-red-600 transition-colors"
                            aria-label="Remove image"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div 
                          className={`
                            relative flex flex-col items-center justify-center p-6 
                            border-2 border-dashed rounded-lg transition-colors cursor-pointer
                            ${isUploadingImage 
                              ? 'border-blue-400 bg-blue-50' 
                              : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50 bg-gray-50'
                            }
                          `}
                          onDragOver={handleDragOver}
                          onDrop={handleDrop}
                          onClick={() => !isUploadingImage && fileInputRef.current?.click()}
                        >
                          <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept="image/*"
                            onChange={(e) => handleImageUpload(e, false)}
                            disabled={isUploadingImage}
                          />
                          
                          {isUploadingImage ? (
                            <>
                              <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-2" />
                              <span className="text-sm text-blue-600 font-medium">Uploading...</span>
                            </>
                          ) : (
                            <>
                              <UploadCloud className="w-8 h-8 text-gray-400 mb-2" />
                              <span className="text-sm text-gray-600 text-center">
                                Click or drag image to upload
                              </span>
                            </>
                          )}
                        </div>
                      )}
                      {uploadError && (
                        <p className="text-sm text-red-500 mt-1">{uploadError}</p>
                      )}
                    </div>
                    <div className="mb-4 border-t border-gray-200 pt-4 mt-2">
                      <ModifierBuilder groups={newDishModifierGroups} onChange={setNewDishModifierGroups} />
                    </div>
                    <button 
                      type="submit" 
                      disabled={isSavingDish || isUploadingImage} 
                      className={`font-semibold py-2 px-4 rounded-lg text-sm transition ${isSavingDish || isUploadingImage ? 'bg-blue-400 text-white cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                    >
                      {isUploadingImage ? 'Uploading Image...' : isSavingDish ? 'Saving...' : 'Save Dish'}
                    </button>
                  </form>
                </div>
            </div>
          )}

          {activeTab === 'ledger' && (
             <div className="max-w-4xl mx-auto space-y-6">
                 <div className="flex justify-between items-end">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 tracking-tight">Financials & Ledger</h3>
                    <p className="text-sm text-gray-500 mt-1">Review recent transactions and generate reports.</p>
                  </div>
                  <div className="flex gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Filter by Date</label>
                      <input 
                        type="date" 
                        value={ledgerFilterDate} 
                        onChange={(e) => { setLedgerFilterDate(e.target.value); setLedgerFilterMonth(''); }}
                        className="bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-sm outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Filter by Month</label>
                      <input 
                        type="month" 
                        value={ledgerFilterMonth} 
                        onChange={(e) => { setLedgerFilterMonth(e.target.value); setLedgerFilterDate(''); }}
                        className="bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-sm outline-none focus:border-blue-500"
                      />
                    </div>
                    {(ledgerFilterDate || ledgerFilterMonth) && (
                      <button 
                        onClick={() => { setLedgerFilterDate(''); setLedgerFilterMonth(''); }}
                        className="text-xs text-blue-600 font-semibold mb-2 hover:underline self-end"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                
                {(() => {
                  const today = new Date().toDateString();
                  let overallSales = 0;
                  let todaySales = 0;
                  let totalTaxCollected = 0;

                  const filteredTransactions = transactions.filter(tx => {
                    if (!tx.createdAt) return false;
                    const txDate = new Date(tx.createdAt);
                    if (ledgerFilterDate) {
                      const tzOffset = txDate.getTimezoneOffset() * 60000;
                      const localISOTime = (new Date(txDate.getTime() - tzOffset)).toISOString().split('T')[0];
                      return localISOTime === ledgerFilterDate;
                    }
                    if (ledgerFilterMonth) {
                      const tzOffset = txDate.getTimezoneOffset() * 60000;
                      const localISOMonth = (new Date(txDate.getTime() - tzOffset)).toISOString().slice(0, 7);
                      return localISOMonth === ledgerFilterMonth;
                    }
                    return true;
                  });

                  filteredTransactions.forEach(tx => {
                    const amt = Number(tx.amount) || 0;
                    const tax = Number(tx.taxPaid) || 0;
                    overallSales += amt;
                    totalTaxCollected += tax;
                    
                    if (new Date(tx.createdAt).toDateString() === today) {
                      todaySales += amt;
                    }
                  });

                  const totalSubtotal = overallSales - totalTaxCollected;
                  const gstRate = establishmentType === 'RESTAURANT' ? 0.05 : 0.18;
                  const gstPayable = totalSubtotal * gstRate;

                  return (
                    <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                        <div className="flex items-center gap-3 mb-2 text-gray-500">
                          <TrendingUp size={18} /> <span className="font-semibold text-sm">{ledgerFilterDate || ledgerFilterMonth ? 'Filtered Sales' : 'Overall Sales'}</span>
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
                          <Receipt size={18} /> <span className="font-semibold text-sm">{ledgerFilterDate || ledgerFilterMonth ? 'Filtered Tax' : 'Tax Collected'}</span>
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
                           <span className="bg-indigo-900/50 border border-indigo-400 text-white rounded px-2 py-1 outline-none text-xs font-semibold">
                             {establishmentType === 'HOTEL' ? 'Hotel (18%)' : 'Restaurant (5%)'}
                           </span>
                         </div>
                      </div>
                    </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        <th className="px-6 py-4">Transaction ID</th>
                        <th className="px-6 py-4">Amount</th>
                        <th className="px-6 py-4">Customer</th>
                        <th className="px-6 py-4 text-right">Date & Time</th>
                        <th className="px-6 py-4 text-center">Receipt Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredTransactions.map(tx => (
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
                            {new Date(tx.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} <br/>
                            <span className="text-xs text-gray-400">{new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-2 items-center">
                              <a 
                                href={`/receipt/${tx.id}?admin=true`} 
                                target="_blank" 
                                className="text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 py-1.5 px-3 rounded-lg flex items-center justify-center gap-1 w-full text-center transition-colors border border-gray-200 shadow-sm"
                              >
                                View / Download Bill
                              </a>
                              {tx.customerPhone && (
                                <a 
                                  href={`https://wa.me/${tx.customerPhone.startsWith('+') ? tx.customerPhone.replace('+', '') : (tx.customerPhone.startsWith('91') ? tx.customerPhone : '91' + tx.customerPhone)}?text=${encodeURIComponent('Here is your digital bill from ' + (merchantName || 'our restaurant') + ': ' + (typeof window !== 'undefined' ? window.location.origin : '') + '/receipt/' + tx.id)}`}
                                  target="_blank"
                                  className="text-xs font-bold bg-[#25D366] hover:bg-[#1ebd5a] text-white py-1.5 px-3 rounded-lg flex items-center justify-center gap-1 w-full text-center transition-colors shadow-sm"
                                >
                                  WhatsApp Receipt
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredTransactions.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-8 text-center text-gray-500 text-sm">
                            No transactions found for the selected filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                </>
                  );
                })()}
             </div>
          )}

          {activeTab === 'settings' && (
            <div className="p-6 max-w-2xl mx-auto animate-fade-in space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
                  <h2 className="text-lg font-bold text-gray-900">Payment Settings</h2>
                  <p className="text-sm text-gray-500 mt-1">Configure Direct UPI to avoid gateway fees.</p>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Collection Mode</label>
                    <div className="flex flex-col gap-3 mt-2">
                      <label className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${paymentMode === 'PRE_PAY' ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                        <div className="flex items-center h-5">
                          <input
                            type="radio"
                            name="paymentMode"
                            checked={paymentMode === 'PRE_PAY'}
                            onChange={() => setPaymentMode('PRE_PAY')}
                            className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                          />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-900">Require Payment Upfront (Pre-Pay)</span>
                          <span className="text-xs text-gray-500 mt-1">Best for Cafes, Quick Service, and high-traffic areas. Waiter must manually verify the transaction before the kitchen receives the ticket.</span>
                        </div>
                      </label>

                      <label className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${paymentMode === 'POST_PAY' ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                        <div className="flex items-center h-5">
                          <input
                            type="radio"
                            name="paymentMode"
                            checked={paymentMode === 'POST_PAY'}
                            onChange={() => setPaymentMode('POST_PAY')}
                            className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                          />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-900">Open Tab / Pay at End (Post-Pay)</span>
                          <span className="text-xs text-gray-500 mt-1">Best for Fine Dining, Bars, and heavy upsell environments. Orders go straight to the kitchen instantly.</span>
                        </div>
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 mt-4">UPI ID (VPA)</label>
                    <input
                      type="text"
                      placeholder="e.g. merchant@sbi"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Merchant Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Table Top Cafe"
                      value={merchantName}
                      onChange={(e) => setMerchantName(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="pt-4 border-t border-gray-200 mt-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Brand Logo</label>
                    <div className="flex items-center gap-6">
                      <div className="w-24 h-24 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50 shrink-0">
                        {restaurantLogoUrl ? (
                          <img src={restaurantLogoUrl} alt="Logo" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-gray-400 text-xs text-center px-2">No Logo</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <input
                          type="file"
                          id="logoUpload"
                          className="hidden"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          disabled={isUploadingLogo}
                        />
                        <label
                          htmlFor="logoUpload"
                          className={`inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer ${isUploadingLogo ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {isUploadingLogo ? 'Uploading...' : 'Upload New Logo'}
                        </label>
                        <p className="mt-2 text-xs text-gray-500">JPG, PNG, GIF up to 5MB. Recommended size: 512x512px.</p>
                        {restaurantLogoUrl && (
                          <button onClick={() => setRestaurantLogoUrl('')} className="mt-2 text-xs text-red-600 hover:text-red-800 font-medium">Remove Logo</button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="pt-6 flex justify-end">
                    <button
                      onClick={savePaymentSettings}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg shadow-sm transition-colors"
                    >
                      Save Settings
                    </button>
                  </div>
                </div>
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

              <div className="p-6 space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="text-xs font-semibold text-gray-600 block mb-1">Theme Color</label>
                     <input 
                       type="color" 
                       value={qrFgColor} 
                       onChange={e => setQrFgColor(e.target.value)}
                       className="w-full h-8 rounded cursor-pointer border border-gray-200"
                     />
                   </div>
                   <div>
                     <label className="text-xs font-semibold text-gray-600 block mb-1">Background</label>
                     <input 
                       type="color" 
                       value={qrBgColor} 
                       onChange={e => setQrBgColor(e.target.value)}
                       className="w-full h-8 rounded cursor-pointer border border-gray-200"
                     />
                   </div>
                 </div>

                 <div className="flex gap-3 pt-2">
                   <button
                     onClick={() => setQrModalTable(null)}
                     className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
                   >
                     Close
                   </button>
                   <button
                     onClick={downloadQR}
                     className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm flex items-center justify-center gap-2"
                   >
                     <Download size={16} /> Save SVG
                   </button>
                 </div>
              </div>
            </div>
          </div>
        </div>
      )}

        {/* Edit Dish Modal */}
        {editingDish && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-scale-up">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-900 tracking-tight">Edit Dish</h3>
                <button onClick={() => setEditingDish(null)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6">
                <form onSubmit={handleUpdateDish} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="text" placeholder="Dish Name" required
                      value={editDishName} onChange={(e) => setEditDishName(e.target.value)}
                      className="bg-gray-50 border border-gray-300 text-gray-900 px-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <input
                      type="number" step="0.01" placeholder="Price (e.g. 12.99)" required
                      value={editDishPrice} onChange={(e) => setEditDishPrice(e.target.value)}
                      className="bg-gray-50 border border-gray-300 text-gray-900 px-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <input 
                      type="checkbox" 
                      id="editHalfPortion"
                      checked={editDishHasHalfPortion}
                      onChange={(e) => setEditDishHasHalfPortion(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <label htmlFor="editHalfPortion" className="text-sm font-medium text-gray-700">Offers Half Portion?</label>
                  </div>
                  {editDishHasHalfPortion && (
                    <div className="mb-4">
                      <input
                        type="number" step="0.01" placeholder="Half Portion Price" required
                        value={editDishHalfPrice} onChange={(e) => setEditDishHalfPrice(e.target.value)}
                        className="w-1/2 bg-gray-50 border border-gray-300 text-gray-900 px-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="text" list="categories" placeholder="Category (e.g. Breads)" required
                      value={editDishCategory} onChange={(e) => setEditDishCategory(e.target.value)}
                      className="bg-gray-50 border border-gray-300 text-gray-900 px-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <textarea
                      placeholder="Description"
                      value={editDishDesc} onChange={(e) => setEditDishDesc(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-300 text-gray-900 px-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      rows={1}
                    />
                  </div>
                  <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <span className="text-sm font-bold text-gray-700">Dietary Preference:</span>
                    <button
                      type="button"
                      onClick={() => setEditDishIsVeg(true)}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${editDishIsVeg ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-white text-gray-500 border border-gray-300'}`}
                    >
                      🟢 VEG
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditDishIsVeg(false)}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${!editDishIsVeg ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-white text-gray-500 border border-gray-300'}`}
                    >
                      🔺 NON-VEG
                    </button>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Dish Photo</label>
                    {editDishImageUrl ? (
                      <div className="relative rounded-lg overflow-hidden border border-gray-200">
                        <img 
                          src={editDishImageUrl} 
                          alt="Dish preview" 
                          className="w-full h-48 object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(true)}
                          className="absolute top-2 right-2 p-1 bg-white rounded-full shadow-sm hover:bg-red-50 text-gray-600 hover:text-red-600 transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div 
                        className={`relative flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg transition-colors cursor-pointer ${isUploadingImage ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50 bg-gray-50'}`}
                        onDragOver={(e) => handleDragOver(e)}
                        onDrop={(e) => handleDrop(e, true)}
                        onClick={() => !isUploadingImage && editFileInputRef.current?.click()}
                      >
                        <input
                          type="file"
                          ref={editFileInputRef}
                          className="hidden"
                          accept="image/*"
                          onChange={(e) => handleImageUpload(e, true)}
                          disabled={isUploadingImage}
                        />
                        {isUploadingImage ? (
                          <><Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-2" /><span className="text-sm text-blue-600 font-medium">Uploading...</span></>
                        ) : (
                          <><UploadCloud className="w-8 h-8 text-gray-400 mb-2" /><span className="text-sm text-gray-600 text-center">Click or drag image to upload</span></>
                        )}
                      </div>
                    )}
                    {uploadError && <p className="text-sm text-red-500 mt-1">{uploadError}</p>}
                  </div>
                  
                  <div className="mb-4 border-t border-gray-200 pt-4 mt-2">
                    <ModifierBuilder groups={editDishModifierGroups} onChange={setEditDishModifierGroups} />
                  </div>
                  
                  <div className="flex gap-3 pt-2">
                    <button 
                      type="button" 
                      onClick={() => editingDish && handleDeleteDish(editingDish.id)}
                      disabled={isDeletingDish}
                      className="px-4 py-2 rounded-lg text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors flex items-center gap-1 border border-red-100"
                    >
                      <Trash2 size={16} />
                    </button>
                    <button type="button" onClick={() => setEditingDish(null)} className="flex-1 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors">
                      Cancel
                    </button>
                    <button type="submit" disabled={isUpdatingDish || isUploadingImage || isDeletingDish} className={`flex-1 font-semibold py-2 rounded-lg text-sm transition ${isUpdatingDish || isUploadingImage || isDeletingDish ? 'bg-blue-400 text-white cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
                      {isUploadingImage ? 'Uploading...' : isUpdatingDish ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

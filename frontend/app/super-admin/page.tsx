'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Plus, Trash2, KeyRound, ArrowRight, ShieldCheck, Lock } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';

export default function SuperAdminPage() {
  const router = useRouter();
  const { authToken, setAuthToken, userRole } = useSocket();
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [newRestaurantName, setNewRestaurantName] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginPasscode, setLoginPasscode] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState('');

  const fetchRestaurants = async () => {
    if (!authToken || userRole !== 'SUPER_ADMIN') return;
    try {
      const res = await fetch('/api/restaurants', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRestaurants(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (authToken && userRole === 'SUPER_ADMIN') {
      fetchRestaurants();
    }
  }, [authToken, userRole]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId: 'SUPER', passcode: loginPasscode.trim() })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        setAuthToken(data.token, data.role);
      } else {
        setError(data.error || 'Invalid passcode');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleCreateRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRestaurantName) return;
    setLoading(true);
    try {
      const res = await fetch('/api/restaurants', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ name: newRestaurantName })
      });
      if (res.ok) {
        setNewRestaurantName('');
        fetchRestaurants();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSetPasscode = async (id: string, type: 'MANAGER' | 'WAITER' | 'KITCHEN') => {
    const newPasscode = prompt(`Enter new 4-6 digit passcode for ${type}:`);
    if (!newPasscode) return;
    try {
      const res = await fetch(`/api/restaurants/${id}/passcode`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ type, passcode: newPasscode })
      });
      if (res.ok) {
        alert(`${type} Passcode updated successfully!`);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update passcode');
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (userRole !== 'SUPER_ADMIN') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-2xl p-8 space-y-6">
          <div className="text-center">
            <ShieldCheck className="w-16 h-16 text-indigo-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Super Admin</h1>
            <p className="text-gray-500 text-sm mt-2">Platform Owner Access Only</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && <div className="p-3 bg-red-100 text-red-600 rounded text-sm text-center font-semibold">{error}</div>}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Master Passcode</label>
              <input
                type="password"
                placeholder="••••••••"
                value={loginPasscode}
                onChange={e => setLoginPasscode(e.target.value)}
                className="w-full bg-gray-50 border border-gray-300 text-gray-900 px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg transition-colors shadow-sm disabled:opacity-50"
            >
              {isLoggingIn ? 'Verifying...' : 'Unlock Console'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      <header className="bg-indigo-700 text-white p-6 shadow-md flex justify-between items-center">
        <div className="flex items-center gap-3">
          <ShieldCheck size={28} />
          <h1 className="text-2xl font-bold tracking-tight">Platform Control Center</h1>
        </div>
        <button 
          onClick={() => { setAuthToken(null, null); router.push('/admin'); }}
          className="flex items-center gap-2 bg-indigo-800 hover:bg-indigo-900 px-4 py-2 rounded-lg font-medium transition-colors"
        >
          <Lock size={16} /> Logout
        </button>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-8 space-y-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Onboard New Restaurant</h2>
            <p className="text-gray-500 text-sm mt-1">Create a new tenant workspace and generate their ID.</p>
          </div>
          <form onSubmit={handleCreateRestaurant} className="flex gap-3">
            <input 
              type="text" 
              placeholder="Restaurant Name"
              value={newRestaurantName}
              onChange={(e) => setNewRestaurantName(e.target.value)}
              className="bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 w-64 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <button 
              type="submit"
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg font-bold shadow-sm transition flex items-center gap-2 disabled:opacity-50"
            >
              <Plus size={18} /> Create Tenant
            </button>
          </form>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {restaurants.map(rest => (
            <div key={rest.id} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-500"></div>
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-bold text-xl text-gray-900 truncate pr-4">{rest.name}</h3>
                <span className="bg-blue-100 text-blue-800 text-xs font-black px-2 py-1 rounded uppercase tracking-wide">{rest.operationalMode}</span>
              </div>
              <p className="text-xs text-gray-400 font-mono mb-4 break-all bg-gray-50 p-2 rounded border border-gray-100">
                ID: {rest.id}
              </p>
              
              <div className="space-y-2 mt-6 border-t border-gray-100 pt-4">
                <button 
                  onClick={() => handleSetPasscode(rest.id, 'MANAGER')}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors"
                >
                  <span className="flex items-center gap-2"><KeyRound size={14} className="text-amber-600" /> Manager Passcode</span>
                  <ArrowRight size={14} className="text-gray-400" />
                </button>
                <button 
                  onClick={() => handleSetPasscode(rest.id, 'WAITER')}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors"
                >
                  <span className="flex items-center gap-2"><KeyRound size={14} className="text-blue-600" /> Waiter Passcode</span>
                  <ArrowRight size={14} className="text-gray-400" />
                </button>
                <button 
                  onClick={() => handleSetPasscode(rest.id, 'KITCHEN')}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors"
                >
                  <span className="flex items-center gap-2"><KeyRound size={14} className="text-emerald-600" /> Kitchen Passcode</span>
                  <ArrowRight size={14} className="text-gray-400" />
                </button>
              </div>
            </div>
          ))}
          {restaurants.length === 0 && (
            <div className="col-span-full py-12 text-center text-gray-500 font-medium bg-white rounded-2xl border border-dashed border-gray-300">
              No restaurants created yet.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

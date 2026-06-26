'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '../../../context/SocketContext';
import { formatDateTime } from '../../../utils/date';
import { LayoutDashboard, Utensils, IndianRupee, Lock, Calendar, TrendingUp, Receipt, Building2, Banknote, CreditCard } from 'lucide-react';

export default function FinanceDashboard() {
  const router = useRouter();
  const { authToken, setAuthToken } = useSocket();
  const [metrics, setMetrics] = useState<any>({ totalRevenue: '0.00', totalOrders: 0, totalDeliveryFees: '0.00', totalCash: '0.00', totalOnline: '0.00', totalMlRevenue: '0.00' });
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Quick filters
  const [activeFilter, setActiveFilter] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all' | 'custom'>('today');
  const [methodFilter, setMethodFilter] = useState<'ALL' | 'CASH' | 'ONLINE'>('ALL');
  const [customDate, setCustomDate] = useState('');

  useEffect(() => {
    if (!authToken) {
      router.push('/admin');
      return;
    }
    
    fetchData(activeFilter, customDate);
  }, [activeFilter, customDate, authToken]);

  const fetchData = async (filter: string, dateStr?: string) => {
    setLoading(true);
    try {
      const now = new Date();
      let startDate: string | undefined;
      let endDate: string | undefined;
      
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      if (filter === 'custom' && dateStr) {
        const d = new Date(dateStr);
        startDate = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
        endDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();
      } else if (filter === 'today') {
        startDate = startOfDay.toISOString();
      } else if (filter === 'yesterday') {
        const yesterday = new Date(startOfDay);
        yesterday.setDate(yesterday.getDate() - 1);
        startDate = yesterday.toISOString();
        endDate = startOfDay.toISOString();
      } else if (filter === 'week') {
        const weekAgo = new Date(startOfDay);
        weekAgo.setDate(weekAgo.getDate() - 7);
        startDate = weekAgo.toISOString();
      } else if (filter === 'month') {
        const monthAgo = new Date(startOfDay);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        startDate = monthAgo.toISOString();
      }

      let url = '/api/finance/metrics';
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      if (params.toString()) {
        url += '?' + params.toString();
      }

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setMetrics(data.metrics);
        setTransactions(data.transactions);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const navItemClass = "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors text-slate-400 hover:bg-slate-800 hover:text-white";

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans">
      
      {/* Left Sidebar */}
      <aside className="w-64 bg-slate-900 text-white min-h-screen flex flex-col shadow-xl z-20">
        <div className="h-16 flex items-center px-6 border-b border-slate-800">
          <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center font-black">T</span>
            Table Top
          </h1>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-2">
          <button onClick={() => router.push('/admin')} className={navItemClass}>
            <LayoutDashboard size={18} /> Floor Plan
          </button>
          <button onClick={() => router.push('/admin?tab=menu')} className={navItemClass}>
            <Utensils size={18} /> Menu Editor
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors bg-blue-600 text-white shadow-md">
            <IndianRupee size={18} /> Financials
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800 mt-auto">
          <button
            onClick={() => { setAuthToken(null); router.push('/admin'); }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Lock size={16} /> Lock Portal
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col max-h-screen overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
              <TrendingUp size={20} />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-gray-800 leading-tight">Financial Dashboard</h2>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Real-time Metrics</p>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          
          <div className="flex items-center gap-2 overflow-x-auto pb-8 scrollbar-hide">
            <button
              onClick={() => setActiveFilter('today')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${activeFilter === 'today' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              Today
            </button>
            <button
              onClick={() => setActiveFilter('yesterday')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${activeFilter === 'yesterday' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              Yesterday
            </button>
            <button
              onClick={() => setActiveFilter('week')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${activeFilter === 'week' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              This Week
            </button>
            <button
              onClick={() => setActiveFilter('month')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${activeFilter === 'month' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              This Month
            </button>
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${activeFilter === 'all' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              All Time
            </button>
            
            <div className="h-6 w-px bg-gray-300 mx-2"></div>

            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2 py-1 shadow-sm">
              <Calendar size={16} className="text-gray-400" />
              <input
                type="date"
                value={customDate}
                onChange={(e) => {
                  setCustomDate(e.target.value);
                  if (e.target.value) setActiveFilter('custom');
                }}
                className="text-sm font-semibold text-gray-700 outline-none bg-transparent"
              />
            </div>
            
            <div className="h-6 w-px bg-gray-300 mx-2"></div>
            
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value as any)}
              className="bg-white border border-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm outline-none focus:border-blue-500 font-semibold shadow-sm"
            >
              <option value="ALL">All Payments</option>
              <option value="CASH">Cash Only</option>
              <option value="ONLINE">Online Only</option>
            </select>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 flex items-center gap-6 relative overflow-hidden group">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <IndianRupee className="text-emerald-600" size={32} />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">Total Rev</p>
                <p className="text-3xl font-black text-emerald-600 tabular-nums">${metrics.totalRevenue}</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 flex items-center gap-6 relative overflow-hidden group">
              <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <Banknote className="text-amber-600" size={32} />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">Cash</p>
                <p className="text-3xl font-black text-amber-600 tabular-nums">${metrics.totalCash}</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 flex items-center gap-6 relative overflow-hidden group">
              <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <CreditCard className="text-blue-600" size={32} />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">Online</p>
                <p className="text-3xl font-black text-blue-600 tabular-nums">${metrics.totalOnline}</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 flex items-center gap-6 relative overflow-hidden group">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <Receipt className="text-slate-600" size={32} />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">Orders</p>
                <p className="text-3xl font-black text-gray-800 tabular-nums">{metrics.totalOrders}</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 flex items-center gap-6 relative overflow-hidden group">
              <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <Building2 className="text-purple-600" size={32} />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">Del. Profit</p>
                <p className="text-3xl font-black text-purple-600 tabular-nums">${metrics.totalDeliveryFees}</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 flex items-center gap-6 relative overflow-hidden group">
              <div className="w-16 h-16 rounded-2xl bg-fuchsia-100 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <TrendingUp className="text-fuchsia-600" size={32} />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">AI Upsell</p>
                <p className="text-3xl font-black text-fuchsia-600 tabular-nums">${metrics.totalMlRevenue || '0.00'}</p>
              </div>
            </div>
          </div>

          {/* Data Table */}
          <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-black text-gray-800">Transaction History</h3>
              {loading && <span className="text-sm font-bold text-indigo-500 animate-pulse">Refreshing...</span>}
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-xs font-black text-gray-500 uppercase tracking-widest">
                    <th className="px-6 py-4 border-b border-gray-200">Date & Time</th>
                    <th className="px-6 py-4 border-b border-gray-200">Table/Room</th>
                    <th className="px-6 py-4 border-b border-gray-200">Guest Details</th>
                    <th className="px-6 py-4 border-b border-gray-200">Method</th>
                    <th className="px-6 py-4 border-b border-gray-200">Amount</th>
                    <th className="px-6 py-4 border-b border-gray-200">Delivery Fee</th>
                    <th className="px-6 py-4 border-b border-gray-200 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transactions
                    .filter(tx => {
                      if (methodFilter === 'CASH') return tx.paymentMethod === 'CASH';
                      if (methodFilter === 'ONLINE') return tx.paymentMethod !== 'CASH';
                      return true;
                    })
                    .map((tx: any) => (
                    <tr key={tx.id} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="px-6 py-4 font-semibold text-gray-600 whitespace-nowrap">
                        {formatDateTime(tx.createdAt)}
                      </td>
                      <td className="px-6 py-4 font-black text-gray-800">
                        {tx.roomOrTable}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-800">{tx.customerName || '-'}</div>
                        <div className="text-xs font-semibold text-indigo-500 mt-0.5">{tx.customerPhone || 'N/A'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${tx.paymentMethod === 'CASH' ? 'bg-amber-50 text-amber-600 border-amber-200' : tx.paymentMethod === 'ONLINE' || tx.paymentMethod === 'UPI' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                          {tx.paymentMethod === 'CASH' ? 'CASH' : tx.paymentMethod === 'ONLINE' || tx.paymentMethod === 'UPI' ? 'ONLINE' : 'UNKNOWN'}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-black text-emerald-600">
                        ${Number(tx.amount).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 font-black text-purple-600">
                        ${Number(tx.deliveryFeeApplied).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <a href={`/receipt/${tx.id}`} target="_blank" rel="noopener noreferrer" className="text-xs font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors inline-block">
                          📄 View
                        </a>
                      </td>
                    </tr>
                  ))}
                  {transactions.length === 0 && !loading && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-400 font-semibold">
                        No transactions found for the selected period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          
        </div>
      </main>
    </div>
  );
}

import Link from 'next/link';
import React from 'react';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center font-sans">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 border shadow-lg space-y-6">
        <span className="text-5xl">🍽️</span>
        <h1 className="text-2xl font-black text-gray-800">Table Top</h1>
        <p className="text-sm text-gray-500">Real-Time Collaborative Restaurant Ordering & Management System</p>
        
        <div className="flex flex-col gap-3 pt-4">
          <Link 
            href="/admin" 
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl text-xs shadow-md transition active:scale-95 text-center"
          >
            📊 Owner (Admin) Dashboard
          </Link>
          <Link 
            href="/kitchen" 
            className="bg-gray-900 hover:bg-gray-850 text-white font-bold py-3.5 rounded-xl text-xs shadow-md transition active:scale-95 text-center"
          >
            🍳 Kitchen Display (KDS)
          </Link>
          <div className="border-t pt-4 text-xs text-gray-400">
            Scan a QR Code to access table customer menus.
          </div>
        </div>
      </div>
    </div>
  );
}

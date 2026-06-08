'use client';
import { useEffect, useState } from 'react';

export default function ReceiptPage({ params }: { params: { transactionId: string } }) {
  const [transaction, setTransaction] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/transactions/${params.transactionId}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setTransaction(data);
      })
      .catch(err => setError('Failed to load receipt'));
  }, [params.transactionId]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-red-50 text-red-500 p-8 rounded-2xl shadow-sm text-center">
          <h1 className="text-xl font-bold mb-2">Receipt Unavailable</h1>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse text-gray-400 font-bold tracking-widest uppercase">
          Loading Digital Bill...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 py-12 px-4 sm:px-6 flex justify-center font-sans text-slate-800">
      <div className="bg-white max-w-md w-full shadow-2xl rounded-sm overflow-hidden relative border-t-8 border-indigo-600">
        {/* Receipt Header */}
        <div className="p-8 text-center border-b border-dashed border-gray-300">
          <h1 className="text-2xl font-black tracking-tight text-gray-900 mb-1 uppercase">
            {transaction.session.table.restaurant.name}
          </h1>
          <p className="text-gray-500 text-sm">Table #{transaction.session.table.number}</p>
          <div className="mt-6 inline-flex items-center justify-center bg-green-100 text-green-700 px-4 py-1.5 rounded-full text-sm font-bold tracking-wider">
            ✓ PAID IN FULL
          </div>
        </div>

        {/* Receipt Details */}
        <div className="p-8 space-y-6">
          <div className="flex justify-between text-xs text-gray-500 uppercase tracking-wider font-bold">
            <span>Date</span>
            <span>{new Date(transaction.createdAt).toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-500 uppercase tracking-wider font-bold">
            <span>Trx ID</span>
            <span className="font-mono">{transaction.id.split('-')[0]}</span>
          </div>

          <hr className="border-dashed border-gray-300" />

          {/* Items */}
          <div className="space-y-4">
            {transaction.paymentItems.map((pi: any) => (
              <div key={pi.id} className="flex justify-between text-sm items-start">
                <div>
                  <div className="font-bold text-gray-800">{pi.orderItem.menuItem.name}</div>
                  <div className="text-xs text-gray-400">Qty: {pi.quantityPaid}</div>
                </div>
                <div className="font-bold">${pi.amount}</div>
              </div>
            ))}
          </div>

          <hr className="border-dashed border-gray-300" />

          {/* Totals */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span>
              <span>${(transaction.amount - transaction.taxPaid - transaction.deliveryFeeApplied).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Tax</span>
              <span>${transaction.taxPaid}</span>
            </div>
            {parseFloat(transaction.deliveryFeeApplied) > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Room Service Fee</span>
                <span>${transaction.deliveryFeeApplied}</span>
              </div>
            )}
          </div>

          <div className="flex justify-between items-center text-xl font-black pt-4 border-t border-gray-900">
            <span>TOTAL</span>
            <span>${transaction.amount}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 p-6 text-center text-xs text-gray-400">
          <p>Thank you for dining with us!</p>
          <p className="mt-1">Powered by OnTable</p>
        </div>
      </div>
    </div>
  );
}

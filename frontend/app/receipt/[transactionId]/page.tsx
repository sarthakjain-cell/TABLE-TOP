'use client';
import { useEffect, useState } from 'react';
import Script from 'next/script';

export default function ReceiptPage({ params }: { params: { transactionId: string } }) {
  const [transaction, setTransaction] = useState<any>(null);
  const [error, setError] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  const [waPhone, setWaPhone] = useState('');
  const [isSendingWa, setIsSendingWa] = useState(false);

  useEffect(() => {
    fetch(`/api/transactions/${params.transactionId}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) setError(data.error);
        else {
          setTransaction(data);
          if (data.customerPhone) {
            setWaPhone(data.customerPhone);
            if (typeof window !== 'undefined' && window.location.search.includes('admin=true')) {
              setIsVerified(true);
            }
          } else {
            setIsVerified(true); // If no phone is attached, skip verification
          }
        }
      })
      .catch(err => setError('Failed to load receipt'));
  }, [params.transactionId]);

  const handleVerify = () => {
    if (!transaction?.customerPhone) return;
    
    // Simple verification (strip non-digits for comparison)
    const expected = transaction.customerPhone.replace(/\D/g, '');
    const entered = phoneInput.replace(/\D/g, '');
    
    // Match exactly, or if user forgot country code (e.g. 919050634840 includes 9050634840)
    if (entered && expected && (entered === expected || expected.includes(entered) || entered.includes(expected))) {
      setIsVerified(true);
    } else {
      alert('Incorrect phone number. Please try again.');
    }
  };



  const handleDownloadPDF = async () => {
    if (typeof window === 'undefined' || !(window as any).html2pdf) {
      alert('PDF generation library is still loading. Please try again in a second.');
      return;
    }
    
    setIsDownloading(true);
    const element = document.getElementById('receipt-container');
    
    const opt = {
      margin:       [10, 0, 10, 0], // top, left, bottom, right
      filename:     `receipt-${transaction.id.split('-')[0]}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, scrollY: 0 },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
      await (window as any).html2pdf().set(opt).from(element).save();
    } catch (e) {
      console.error('PDF generation failed', e);
      alert('Failed to generate PDF');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleResendWhatsApp = async () => {
    if (!waPhone) {
      alert('Please enter a phone number first.');
      return;
    }
    
    let formattedPhone = waPhone.replace(/\D/g, '');
    if (formattedPhone.length === 10) {
      formattedPhone = '91' + formattedPhone;
    }

    setIsSendingWa(true);
    try {
      const res = await fetch('/api/receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formattedPhone, transactionId: params.transactionId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send WhatsApp receipt');
      alert('WhatsApp Receipt sent successfully!');
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setIsSendingWa(false);
    }
  };

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

  if (!isVerified) {
    return (
      <div className="min-h-screen bg-slate-100 py-12 px-4 flex items-center justify-center font-sans">
        <div className="bg-white max-w-sm w-full shadow-xl rounded-3xl p-8 text-center animate-fade-in border border-gray-100">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl">
            🔒
          </div>
          <h2 className="text-2xl font-black text-gray-900 mb-2">Secure Receipt</h2>
          <p className="text-gray-500 text-sm font-medium mb-8">
            Please verify the phone number you used during checkout to view your itemized bill.
          </p>
          
          <div className="space-y-4">
            <input 
              type="tel"
              placeholder="Enter Phone Number"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
              className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-gray-900 text-center tracking-wider"
            />
            <button 
              onClick={handleVerify}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-xl shadow-lg shadow-indigo-600/30 active:scale-95 transition-transform"
            >
              Verify & View Receipt
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js" strategy="lazyOnload" />
      <div className="min-h-screen bg-slate-100 py-8 px-4 sm:px-6 flex flex-col items-center font-sans text-slate-800">
        
        <div id="receipt-container" className="bg-white max-w-md w-full shadow-2xl rounded-sm overflow-hidden relative border-t-8 border-indigo-600 animate-scale-up">
          {/* Receipt Header */}
          <div className="p-8 text-center border-b border-gray-200 bg-white relative">
            {transaction.status === 'PRE_PAYMENT_BILL' && (
              <div className="absolute top-4 right-4 bg-red-50 text-red-600 border border-red-200 px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase">
                Unpaid Bill
              </div>
            )}
            <div className="w-16 h-16 bg-slate-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-md">
              <span className="text-2xl font-black">{transaction.session.table.restaurant.name.charAt(0)}</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-gray-900 mb-1 uppercase">
              {transaction.session.table.restaurant.name}
            </h1>
            <p className="text-gray-500 text-sm font-bold">Table #{transaction.session.table.number}</p>
            
            {transaction.status === 'COMPLETED' ? (
              <div className="mt-4 inline-flex items-center justify-center bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-1.5 rounded-full text-xs font-black tracking-widest">
                ✓ PAID IN FULL
              </div>
            ) : (
              <div className="mt-4 inline-flex items-center justify-center bg-orange-50 text-orange-700 border border-orange-200 px-4 py-1.5 rounded-full text-xs font-black tracking-widest">
                PLEASE PAY WAITER
              </div>
            )}
          </div>

          {/* Receipt Meta Details */}
          <div className="px-8 py-6 space-y-3 bg-slate-50 border-b border-gray-200">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500 font-semibold">Date & Time</span>
              <span className="text-gray-900 font-bold">{new Date(transaction.createdAt).toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500 font-semibold">{transaction.status === 'PRE_PAYMENT_BILL' ? 'Order ID' : 'Receipt No.'}</span>
              <span className="text-gray-900 font-mono font-bold">{transaction.id.split('-')[0].toUpperCase()}</span>
            </div>
            {transaction.customerPhone && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500 font-semibold">Customer</span>
                <span className="text-gray-900 font-mono font-bold">{transaction.customerPhone}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500 font-semibold">Payment Method</span>
              <span className="text-gray-900 font-bold">{transaction.status === 'COMPLETED' ? 'Digital/Card' : 'Pending Cash'}</span>
            </div>
          </div>

          {/* Items Breakdown Table */}
          <div className="p-8 bg-white">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Order Details</h3>
            
            <table className="w-full text-sm mb-6">
              <thead>
                <tr className="border-b-2 border-gray-100 text-gray-400 uppercase text-[10px] tracking-widest font-black text-left">
                  <th className="pb-3 w-1/2">Item</th>
                  <th className="pb-3 text-center">Qty</th>
                  <th className="pb-3 text-right">Price</th>
                  <th className="pb-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {transaction.paymentItems.map((pi: any) => (
                  <tr key={pi.id}>
                    <td className="py-4 pr-2">
                      <div className="font-bold text-gray-900">{pi.orderItem.menuItem.name}</div>
                      {pi.orderItem.modifications && pi.orderItem.modifications.length > 0 && (
                        <div className="text-[11px] text-gray-400 font-medium mt-1">
                          {pi.orderItem.modifications.join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="py-4 text-center font-semibold text-gray-700">{pi.quantityPaid}</td>
                    <td className="py-4 text-right font-semibold text-gray-500">${parseFloat(pi.orderItem.price).toFixed(2)}</td>
                    <td className="py-4 text-right font-bold text-gray-900">${parseFloat(pi.amount).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals Section */}
            <div className="bg-slate-50 rounded-2xl p-5 space-y-3 border border-gray-100">
              <div className="flex justify-between text-sm text-gray-500 font-bold">
                <span>Subtotal</span>
                <span>${(parseFloat(transaction.amount) - parseFloat(transaction.taxPaid) - parseFloat(transaction.deliveryFeeApplied)).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500 font-bold">
                <span>Tax ({transaction.session.table.restaurant.taxRate}%)</span>
                <span>${parseFloat(transaction.taxPaid).toFixed(2)}</span>
              </div>
              {parseFloat(transaction.deliveryFeeApplied) > 0 && (
                <div className="flex justify-between text-sm text-gray-500 font-bold">
                  <span>Room Service Fee</span>
                  <span>${parseFloat(transaction.deliveryFeeApplied).toFixed(2)}</span>
                </div>
              )}
              
              <div className="pt-3 mt-3 border-t border-dashed border-gray-300 flex justify-between items-center text-xl font-black text-gray-900">
                <span>Grand Total</span>
                <span>${parseFloat(transaction.amount).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-slate-900 p-6 text-center text-gray-400 font-medium text-xs">
            <p className="text-white font-bold mb-1 text-sm tracking-wide">Thank you for dining with us!</p>
            <p className="opacity-60">Powered by OnTable AI</p>
          </div>
        </div>

        {/* Download Button (Outside the PDF container) */}
        <div className="mt-6 w-full max-w-md px-4">
          <button
            id="download-pdf-btn"
            onClick={handleDownloadPDF}
            disabled={isDownloading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-xl shadow-lg active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2 mb-4"
          >
            {isDownloading ? 'Generating PDF...' : '📄 Download as PDF'}
          </button>
          
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Resend via WhatsApp</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-500 font-bold">+91</span>
                  <span className="text-gray-300 mx-2">|</span>
                </div>
                <input 
                  type="tel" 
                  placeholder="Phone Number" 
                  value={waPhone} 
                  onChange={(e) => setWaPhone(e.target.value.replace(/\D/g, ''))}
                  maxLength={10}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-14 pr-4 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <button 
                onClick={handleResendWhatsApp}
                disabled={isSendingWa || !waPhone}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-6 rounded-lg active:scale-95 transition-transform disabled:opacity-50 flex items-center gap-2"
              >
                {isSendingWa ? 'Sending...' : '💬 Send'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

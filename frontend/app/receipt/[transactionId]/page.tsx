'use client';
import { useEffect, useState } from 'react';
import Script from 'next/script';

export default function ReceiptPage({ params }: { params: { transactionId: string } }) {
  const [transaction, setTransaction] = useState<any>(null);
  const [error, setError] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    fetch(`/api/transactions/${params.transactionId}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) setError(data.error);
        else {
          setTransaction(data);
          if (!data.customerPhone) {
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
          <div className="p-8 text-center border-b border-dashed border-gray-300 bg-white">
            <h1 className="text-2xl font-black tracking-tight text-gray-900 mb-1 uppercase">
              {transaction.session.table.restaurant.name}
            </h1>
            <p className="text-gray-500 text-sm font-bold">Table #{transaction.session.table.number}</p>
            <div className="mt-6 inline-flex items-center justify-center bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-1.5 rounded-full text-xs font-black tracking-widest">
              ✓ PAID IN FULL
            </div>
          </div>

          {/* Receipt Details */}
          <div className="p-8 space-y-6 bg-white">
            <div className="flex justify-between text-xs text-gray-500 uppercase tracking-wider font-bold">
              <span>Date</span>
              <span>{new Date(transaction.createdAt).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-500 uppercase tracking-wider font-bold">
              <span>Trx ID</span>
              <span className="font-mono">{transaction.id.split('-')[0]}</span>
            </div>
            {transaction.customerPhone && (
              <div className="flex justify-between text-xs text-gray-500 uppercase tracking-wider font-bold">
                <span>Customer Phone</span>
                <span className="font-mono">{transaction.customerPhone}</span>
              </div>
            )}

            <hr className="border-dashed border-gray-300" />

            {/* Items */}
            <div className="space-y-4">
              {transaction.paymentItems.map((pi: any) => (
                <div key={pi.id} className="flex justify-between text-sm items-start">
                  <div>
                    <div className="font-bold text-gray-800">{pi.orderItem.menuItem.name}</div>
                    <div className="text-xs text-gray-400 font-medium">Qty: {pi.quantityPaid}</div>
                  </div>
                  <div className="font-bold text-gray-900">₹{pi.amount}</div>
                </div>
              ))}
            </div>

            <hr className="border-dashed border-gray-300" />

            {/* Totals */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-500 font-bold">
                <span>Subtotal</span>
                <span>₹{(transaction.amount - transaction.taxPaid - transaction.deliveryFeeApplied).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-500 font-bold">
                <span>Tax</span>
                <span>₹{transaction.taxPaid}</span>
              </div>
              {parseFloat(transaction.deliveryFeeApplied) > 0 && (
                <div className="flex justify-between text-gray-500 font-bold">
                  <span>Room Service Fee</span>
                  <span>₹{transaction.deliveryFeeApplied}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center text-2xl font-black pt-6 border-t border-gray-900 mt-4">
              <span>TOTAL</span>
              <span>₹{transaction.amount}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-slate-50 p-6 text-center text-xs text-gray-400 font-medium border-t border-gray-100">
            <p>Thank you for dining with us!</p>
            <p className="mt-1">Powered by OnTable</p>
          </div>
        </div>

        {/* Download Button (Outside the PDF container) */}
        <div className="mt-6 w-full max-w-md px-4">
          <button
            id="download-pdf-btn"
            onClick={handleDownloadPDF}
            disabled={isDownloading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-xl shadow-lg active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isDownloading ? 'Generating PDF...' : '📄 Download as PDF'}
          </button>
        </div>
      </div>
    </>
  );
}

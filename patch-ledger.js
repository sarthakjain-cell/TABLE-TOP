const fs = require('fs');

const file = 'frontend/app/admin/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add state variable
content = content.replace(
  `const [ledgerFilterDate, setLedgerFilterDate] = useState<string>('');`,
  `const [ledgerFilterDate, setLedgerFilterDate] = useState<string>('');
  const [ledgerFilterMethod, setLedgerFilterMethod] = useState<'ALL' | 'CASH' | 'ONLINE'>('ALL');`
);

// 2. Add filter dropdown
content = content.replace(
  `                    {(ledgerFilterDate || ledgerFilterMonth) && (
                      <button 
                        onClick={() => { setLedgerFilterDate(''); setLedgerFilterMonth(''); }}
                        className="text-xs text-blue-600 font-semibold mb-2 hover:underline self-end"
                      >
                        Clear
                      </button>
                    )}`,
  `                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Filter by Method</label>
                      <select
                        value={ledgerFilterMethod}
                        onChange={(e) => setLedgerFilterMethod(e.target.value as any)}
                        className="bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-sm outline-none focus:border-blue-500"
                      >
                        <option value="ALL">All Payments</option>
                        <option value="CASH">Cash</option>
                        <option value="ONLINE">Online (UPI/Cards)</option>
                      </select>
                    </div>
                    {(ledgerFilterDate || ledgerFilterMonth || ledgerFilterMethod !== 'ALL') && (
                      <button 
                        onClick={() => { setLedgerFilterDate(''); setLedgerFilterMonth(''); setLedgerFilterMethod('ALL'); }}
                        className="text-xs text-blue-600 font-semibold mb-2 hover:underline self-end"
                      >
                        Clear
                      </button>
                    )}`
);

// 3. Update filter logic
content = content.replace(
  `                  const filteredTransactions = transactions.filter(tx => {
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
                  });`,
  `                  const filteredTransactions = transactions.filter(tx => {
                    if (!tx.createdAt) return false;
                    const txDate = new Date(tx.createdAt);
                    if (ledgerFilterDate) {
                      const tzOffset = txDate.getTimezoneOffset() * 60000;
                      const localISOTime = (new Date(txDate.getTime() - tzOffset)).toISOString().split('T')[0];
                      if (localISOTime !== ledgerFilterDate) return false;
                    }
                    if (ledgerFilterMonth) {
                      const tzOffset = txDate.getTimezoneOffset() * 60000;
                      const localISOMonth = (new Date(txDate.getTime() - tzOffset)).toISOString().slice(0, 7);
                      if (localISOMonth !== ledgerFilterMonth) return false;
                    }
                    if (ledgerFilterMethod !== 'ALL') {
                      const method = tx.paymentMethod || 'ONLINE';
                      const isCash = method === 'CASH';
                      if (ledgerFilterMethod === 'CASH' && !isCash) return false;
                      if (ledgerFilterMethod === 'ONLINE' && isCash) return false;
                    }
                    return true;
                  });`
);

// 4. Update table row to include badge
content = content.replace(
  `                        <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="text-sm font-mono text-gray-600">{tx.id}</p>
                            <p className="text-xs text-gray-400">{tx.sessionId}</p>
                          </td>`,
  `                        <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm font-mono text-gray-600 truncate max-w-[120px]" title={tx.id}>{tx.id}</p>
                              {tx.paymentMethod === 'CASH' ? (
                                <span className="bg-orange-100 text-orange-800 text-[10px] font-bold px-2 py-0.5 rounded border border-orange-200">CASH</span>
                              ) : (
                                <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-200">ONLINE</span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 truncate max-w-[150px]">{tx.sessionId}</p>
                          </td>`
);

fs.writeFileSync(file, content);
console.log('Finance ledger patched with Cash/Online filters and badges.');

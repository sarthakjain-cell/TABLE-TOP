const fs = require('fs');

const file = 'frontend/app/admin/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// Fix 1: Preserve waiterRequested state during sync
content = content.replace(
  `            const mapped = data.tables.map((t: any) => ({ ...t, activeSession: t.sessions && t.sessions.length > 0 ? t.sessions[0] : undefined }));
            setTables(mapped.sort((a: any, b: any) => Number(a.number) - Number(b.number)));`,
  `            setTables((prevTables: any) => {
              const mapped = data.tables.map((t: any) => {
                const existing = prevTables.find((pt: any) => pt.id === t.id);
                return { 
                  ...t, 
                  activeSession: t.sessions && t.sessions.length > 0 ? t.sessions[0] : undefined,
                  waiterRequested: existing ? existing.waiterRequested : false
                };
              });
              return mapped.sort((a: any, b: any) => Number(a.number) - Number(b.number));
            });`
);

// Fix 2: Change the Green Toggle to a Blue Button so the user recognizes it as the Verify button
content = content.replace(
  `                            {pendingTransactionId && (
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
                            )}`,
  `                            {pendingTransactionId && (
                              <button
                                onClick={() => handleVerifyCashTransaction(pendingTransactionId!)}
                                className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg text-[10px] uppercase tracking-wider transition-colors shadow-sm animate-pulse"
                              >
                                Verify & Approve Cash Payment
                              </button>
                            )}`
);

fs.writeFileSync(file, content);
console.log('Frontend admin portal patched to replace Green Toggle with Blue Button and preserve Waiter Requested state.');

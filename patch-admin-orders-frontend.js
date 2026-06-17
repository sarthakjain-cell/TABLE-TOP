const fs = require('fs');

const file = 'frontend/app/admin/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Change realItems type
content = content.replace(
  `                  let realItems: string[] = [];`,
  `                  let realItems: any[] = [];`
);

// 2. Add payment logic and push JSX
content = content.replace(
  `                    table.activeSession.orders?.forEach((order: any) => {
                       if (order.status !== 'CANCELLED') {
                         order.items?.forEach((item: any) => {
                           const qty = item.quantity || item.orderedQuantity;
                           const name = item.menuItem?.name || item.name || 'Item';
                           if (order.status === 'COMPLETED') {
                             realItems.push(\`✅ \${qty}x \${name}\`);
                           } else {
                             realItems.push(\`\${qty}x \${name}\`);
                           }
                         });
                       }
                    });`,
  `                    const paidQuantityMap = new Map<string, number>();
                    table.activeSession.transactions?.forEach((tx: any) => {
                      if (tx.status === 'COMPLETED') {
                        tx.paymentItems?.forEach((pi: any) => {
                          const current = paidQuantityMap.get(pi.orderItemId) || 0;
                          paidQuantityMap.set(pi.orderItemId, current + Number(pi.quantityPaid));
                        });
                      }
                    });

                    table.activeSession.orders?.forEach((order: any) => {
                       if (order.status !== 'CANCELLED') {
                         order.items?.forEach((item: any) => {
                           const qty = Number(item.quantity || item.orderedQuantity);
                           const name = item.menuItem?.name || item.name || 'Item';
                           const paidQty = paidQuantityMap.get(item.id) || 0;
                           const isPaid = paidQty >= qty;
                           
                           realItems.push(
                             <div key={item.id} className="flex justify-between items-center w-full truncate border-b border-gray-100 last:border-0 pb-1 mb-1">
                               <span className="truncate pr-2 text-[11px]">• {qty}x {name}</span>
                               {isPaid ? (
                                 <span className="bg-green-100 text-green-700 text-[9px] font-black px-1.5 py-0.5 rounded border border-green-200 uppercase flex-shrink-0">PAID</span>
                               ) : paidQty > 0 ? (
                                 <span className="bg-amber-100 text-amber-700 text-[9px] font-black px-1.5 py-0.5 rounded border border-amber-200 uppercase flex-shrink-0">{paidQty}/{qty} PAID</span>
                               ) : (
                                 <span className="bg-red-50 text-red-500 text-[9px] font-black px-1.5 py-0.5 rounded border border-red-100 uppercase flex-shrink-0">UNPAID</span>
                               )}
                             </div>
                           );
                         });
                       }
                    });`
);

// 3. Render realItems directly since it's already JSX
content = content.replace(
  `                            <div className="bg-gray-50 rounded p-2 text-xs text-gray-600 h-16 overflow-y-auto">
                               {realItems.length > 0 ? realItems.map((item, idx) => (
                                 <div key={idx} className="truncate">• {item}</div>
                               )) : <div className="text-gray-400 italic">No items ordered yet</div>}
                            </div>`,
  `                            <div className="bg-gray-50 rounded p-2 text-xs text-gray-600 h-16 overflow-y-auto">
                               {realItems.length > 0 ? realItems : <div className="text-gray-400 italic">No items ordered yet</div>}
                            </div>`
);

fs.writeFileSync(file, content);
console.log('Frontend admin portal patched to show Paid/Unpaid badges on table cards.');

const fs = require('fs');

const file = 'frontend/app/table/[tableToken]/page.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  `                            <div>
                              <p className="text-sm font-bold text-gray-800">{item.orderedQuantity}x {item.name}</p>
                              {item.modifications && item.modifications.length > 0 && (
                                <p className="text-xs text-amber-500 font-bold">({item.modifications.join(', ')})</p>
                              )}
                            </div>`,
  `                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-gray-800">{item.orderedQuantity}x {item.name}</p>
                                {item.unpaidQuantity === 0 ? (
                                  <span className="bg-green-100 text-green-700 text-[9px] font-black px-1.5 py-0.5 rounded border border-green-200">PAID</span>
                                ) : item.paidQuantity > 0 ? (
                                  <span className="bg-amber-100 text-amber-700 text-[9px] font-black px-1.5 py-0.5 rounded border border-amber-200">{item.paidQuantity}/{item.orderedQuantity} PAID</span>
                                ) : (
                                  <span className="bg-red-50 text-red-500 text-[9px] font-black px-1.5 py-0.5 rounded border border-red-100">UNPAID</span>
                                )}
                              </div>
                              {item.modifications && item.modifications.length > 0 && (
                                <p className="text-xs text-amber-500 font-bold">({item.modifications.join(', ')})</p>
                              )}
                            </div>`
);

fs.writeFileSync(file, content);
console.log('Customer portal Orders tab patched with Paid/Unpaid badges.');

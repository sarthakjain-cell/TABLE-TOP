const fs = require('fs');
const file = 'frontend/app/table/[tableToken]/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `                            <div>
                              <p className="text-sm font-bold text-gray-800">{item.orderedQuantity}x {item.name}</p>
                              {item.modifications && item.modifications.length > 0 && (
                                <p className="text-xs text-amber-500 font-bold">({item.modifications.join(', ')})</p>
                              )}
                            </div>
                            <span className="text-sm font-extrabold text-indigo-600">\${item.price}</span>`;

const replacement = `                            <div>
                              <p className="text-sm font-bold text-gray-800">{item.orderedQuantity}x {item.name}</p>
                              {item.modifications && item.modifications.length > 0 && (
                                <p className="text-xs text-amber-500 font-bold">({item.modifications.join(', ')})</p>
                              )}
                            </div>
                            <div className="text-right flex flex-col items-end">
                               <span className="text-sm font-extrabold text-indigo-600">\${item.price}</span>
                               {(() => {
                                 let baseP = 0;
                                 restaurant?.categories?.forEach((cat: any) => {
                                   cat.items?.forEach((mi: any) => {
                                     if (mi.id === item.menuItemId) {
                                       baseP = item.modifications?.includes('Half Portion') && mi.halfPrice ? parseFloat(mi.halfPrice) : parseFloat(mi.price);
                                     }
                                   });
                                 });
                                 if (baseP === 0) baseP = parseFloat(item.price);
                                 const modTotal = parseFloat(item.price) - baseP;
                                 if (modTotal > 0.001) {
                                   return (
                                     <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">
                                       (Includes \${modTotal.toFixed(2)} Cust.)
                                     </span>
                                   );
                                 }
                                 return null;
                               })()}
                            </div>`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content);
console.log('Orders breakdown added.');

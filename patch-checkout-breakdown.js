const fs = require('fs');
const file = 'frontend/app/table/[tableToken]/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `<p className="text-6xl font-black text-blue-600 tabular-nums tracking-tighter relative z-10">\${tableSession?.billing?.remaining?.grandTotal || '0.00'}</p>
                </div>`;

const replacement = `<p className="text-6xl font-black text-blue-600 tabular-nums tracking-tighter relative z-10">\${tableSession?.billing?.remaining?.grandTotal || '0.00'}</p>
                   {(() => {
                     let calcBaseItemsTotal = 0;
                     let calcCustomizationsTotal = 0;
                     tableSession?.orders?.filter((o: any) => o.status !== 'CANCELLED').forEach((o: any) => {
                       o.items?.forEach((item: any) => {
                         let baseP = 0;
                         restaurant?.categories?.forEach((cat: any) => {
                           cat.items?.forEach((mi: any) => {
                             if (mi.id === item.menuItemId) {
                               baseP = item.modifications?.includes('Half Portion') && mi.halfPrice ? parseFloat(mi.halfPrice) : parseFloat(mi.price);
                             }
                           });
                         });
                         if (baseP === 0) baseP = parseFloat(item.price);
                         
                         const itemQty = item.quantity || item.orderedQuantity || 1;
                         const itemT = parseFloat(item.price) * itemQty;
                         const baseT = baseP * itemQty;
                         const modT = itemT - baseT;
                         
                         calcBaseItemsTotal += baseT;
                         calcCustomizationsTotal += (modT > 0.001 ? modT : 0);
                       });
                     });
                     
                     if (calcBaseItemsTotal > 0) {
                       return (
                         <div className="mt-6 pt-6 border-t border-blue-200/50 text-left space-y-2 text-sm text-blue-900 relative z-10">
                           <div className="flex justify-between font-bold">
                             <span>Food & Beverage</span>
                             <span>\${calcBaseItemsTotal.toFixed(2)}</span>
                           </div>
                           {calcCustomizationsTotal > 0.001 && (
                             <div className="flex justify-between font-bold">
                               <span>Customization Charges</span>
                               <span>\${calcCustomizationsTotal.toFixed(2)}</span>
                             </div>
                           )}
                           {isHotel && (
                             <div className="flex justify-between font-bold">
                               <span>Room Service Fee</span>
                               <span>\${( (parseFloat(tableSession?.billing?.totals?.subtotal || '0') - calcBaseItemsTotal - calcCustomizationsTotal) > 0 ? (parseFloat(tableSession?.billing?.totals?.subtotal || '0') - calcBaseItemsTotal - calcCustomizationsTotal) : 0 ).toFixed(2)}</span>
                             </div>
                           )}
                           <div className="flex justify-between font-bold">
                             <span>Taxes (GST)</span>
                             <span>\${tableSession?.billing?.totals?.tax || '0.00'}</span>
                           </div>
                         </div>
                       );
                     }
                     return null;
                   })()}
                </div>`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content);
console.log('Checkout breakdown added.');

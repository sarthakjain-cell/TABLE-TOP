const fs = require('fs');
const path = require('path');
const file = path.join('frontend', 'app', 'admin', 'page.tsx');
let content = fs.readFileSync(file, 'utf8');

// Update Interface
content = content.replace(
  /interface OrderItem \{\s*orderedQuantity: number;\s*id\?: string;\s*name: string;\s*price: string;\s*quantity: number;\s*\}/g,
  `interface OrderItem {
  orderedQuantity: number;
  id?: string;
  orderItemId?: string;
  name: string;
  price: string;
  quantity: number;
  isServed?: boolean;
}`
);

// Add toggle function
const toggleFunc = `
  const toggleDishServed = async (itemId: string, currentStatus: boolean, orderId: string, tableId: string) => {
    // Optimistic Update
    setTables(prev => prev.map(t => {
      if (t.id === tableId && t.activeSession && t.activeSession.orders) {
         t.activeSession.orders = t.activeSession.orders.map((o: any) => {
           if (o.id === orderId) {
             return {
               ...o,
               items: o.items.map((i: any) => (i.id === itemId || i.orderItemId === itemId) ? { ...i, isServed: !currentStatus } : i)
             };
           }
           return o;
         });
      }
      return t;
    }));

    try {
      const res = await fetch(\`/api/order-items/\${itemId}/served\`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${authToken}\` },
        body: JSON.stringify({ isServed: !currentStatus })
      });
      if (!res.ok) throw new Error('Failed to update dish status');
    } catch (err) {
      console.error(err);
      // Revert on failure
      setTables(prev => prev.map(t => {
        if (t.id === tableId && t.activeSession && t.activeSession.orders) {
           t.activeSession.orders = t.activeSession.orders.map((o: any) => {
             if (o.id === orderId) {
               return {
                 ...o,
                 items: o.items.map((i: any) => (i.id === itemId || i.orderItemId === itemId) ? { ...i, isServed: currentStatus } : i)
               };
             }
             return o;
           });
        }
        return t;
      }));
    }
  };
`;

content = content.replace(/const deleteTable = async.*?\}\;/s, match => match + '\n\n' + toggleFunc);

// Update Render UI
const targetRender = `                          realItems.push(
                            <div key={item.id} className="flex justify-between items-center w-full truncate border-b border-gray-100 last:border-0 pb-1 mb-1">
                              <span className="truncate pr-2 text-[11px]">{qty}x {name}</span>
                              {isPaid ? (
                                <span className="bg-green-100 text-green-700 text-[9px] font-black px-1.5 py-0.5 rounded border border-green-200 uppercase flex-shrink-0">PAID</span>
                              ) : paidQty > 0 ? (
                                <span className="bg-amber-100 text-amber-700 text-[9px] font-black px-1.5 py-0.5 rounded border border-amber-200 uppercase flex-shrink-0">{paidQty}/{qty} PAID</span>
                              ) : (
                                <span className="bg-red-50 text-red-500 text-[9px] font-black px-1.5 py-0.5 rounded border border-red-100 uppercase flex-shrink-0">UNPAID</span>
                              )}
                            </div>
                          );`;

const newRender = `                          const itemId = item.id || item.orderItemId;
                          realItems.push(
                            <div key={itemId} className="flex justify-between items-center w-full border-b border-gray-100 last:border-0 pb-1 mb-1 gap-2">
                              <div className="flex items-center gap-2 overflow-hidden">
                                <button
                                  onClick={() => toggleDishServed(itemId, !!item.isServed, order.id, table.id)}
                                  className={\`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors \${item.isServed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 bg-white'}\`}
                                >
                                  {item.isServed && <CheckCircle2 size={10} strokeWidth={3} />}
                                </button>
                                <span className={\`truncate text-[11px] \${item.isServed ? 'line-through text-gray-400' : 'text-gray-700'}\`}>{qty}x {name}</span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {isPaid ? (
                                  <span className="bg-green-100 text-green-700 text-[9px] font-black px-1.5 py-0.5 rounded border border-green-200 uppercase flex-shrink-0">PAID</span>
                                ) : paidQty > 0 ? (
                                  <span className="bg-amber-100 text-amber-700 text-[9px] font-black px-1.5 py-0.5 rounded border border-amber-200 uppercase flex-shrink-0">{paidQty}/{qty} PAID</span>
                                ) : (
                                  <span className="bg-red-50 text-red-500 text-[9px] font-black px-1.5 py-0.5 rounded border border-red-100 uppercase flex-shrink-0">UNPAID</span>
                                )}
                              </div>
                            </div>
                          );`;

content = content.replace(targetRender, newRender);

fs.writeFileSync(file, content);

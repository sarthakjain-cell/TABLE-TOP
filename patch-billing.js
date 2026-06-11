const fs = require('fs');

let code = fs.readFileSync('backend/src/routes/billing.ts', 'utf8');

// 1. Fix the `verify-payment` condition to always emit session updated
const verifyTarget = `      if (transaction.status === 'COMPLETED') {
        return reply.code(200).send({ success: true, message: 'Already verified' });
      }`;

const verifyReplacement = `      if (transaction.status === 'COMPLETED') {
        const updatedSession = await prisma.session.findUnique({
          where: { id: transaction.sessionId },
          include: {
            table: { include: { restaurant: true } },
            orders: { include: { items: { include: { menuItem: true } } } },
            transactions: { where: { status: 'COMPLETED' }, include: { paymentItems: true } }
          }
        });
        if (updatedSession) {
          const io = require('../socket').getIO();
          io.to(\`session:\${transaction.sessionId}\`).emit('sessionUpdated', updatedSession);
        }
        return reply.code(200).send({ success: true, message: 'Already verified' });
      }`;

if (code.includes(verifyTarget)) {
  code = code.replace(verifyTarget, verifyReplacement);
  console.log("Patched verify target");
} else {
  console.log("Could not find verifyTarget");
}

// 2. Fix the webhook transition logic
const webhookTarget = `              // Fire WebSocket KDS events
              const io = getIO();
              io.emit('helpRequested', {
                tableNumber: session.table.number,
                requestType: 'CHECKOUT_COMPLETE'
              });
              io.to(\`session:\${session.id}\`).emit('orderStatusUpdated', {
                orderId: 'SESSION_COMPLETE',
                status: 'COMPLETED'
              });
            }
          });
        }
      }

      return reply.code(200).send({ status: 'ok' });`;

const webhookReplacement = `              // Fire WebSocket KDS events
              const io = getIO();
              io.emit('helpRequested', {
                tableNumber: session.table.number,
                requestType: 'CHECKOUT_COMPLETE'
              });
              io.to(\`session:\${session.id}\`).emit('orderStatusUpdated', {
                orderId: 'SESSION_COMPLETE',
                status: 'COMPLETED'
              });
            }
            
            // Transition PAYMENT_PENDING orders to NEW
            const paidOrderItemIds = new Set(transaction.paymentItems.map(pi => pi.orderItemId));
            const affectedOrders = session.orders.filter(o => 
              o.status === 'PAYMENT_PENDING' && o.items.some(i => paidOrderItemIds.has(i.id))
            );

            for (const order of affectedOrders) {
              await tx.order.update({
                where: { id: order.id },
                data: { status: 'NEW' }
              });

              const io = getIO();
              io.to(session.restaurantId).emit('orderCreated', {
                order: {
                  orderId: order.id,
                  status: 'NEW',
                  tableNumber: session.table.number,
                  restaurantId: session.restaurantId,
                  paymentMethod: 'ONLINE',
                  items: order.items.map(i => ({
                    name: i.menuItem?.name || 'Item',
                    quantity: new Decimal(i.quantity.toString()).toNumber(),
                    modifications: i.modifications
                  })),
                  createdAt: order.createdAt,
                  totalAmount: transaction.amount.toString()
                }
              });
            }
            
            const updatedSession = await tx.session.findUnique({
              where: { id: session.id },
              include: {
                table: { include: { restaurant: true } },
                orders: { include: { items: { include: { menuItem: true } } } },
                transactions: { where: { status: 'COMPLETED' }, include: { paymentItems: true } }
              }
            });
            if (updatedSession) {
              const io = getIO();
              io.to(\`session:\${session.id}\`).emit('sessionUpdated', updatedSession);
            }
          });
        }
      }

      return reply.code(200).send({ status: 'ok' });`;

if (code.includes(webhookTarget)) {
  code = code.replace(webhookTarget, webhookReplacement);
  console.log("Patched webhook target");
} else {
  console.log("Could not find webhookTarget");
}

fs.writeFileSync('backend/src/routes/billing.ts', code);
console.log('Done!');

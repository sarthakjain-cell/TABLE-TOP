const fs = require('fs');
let code = fs.readFileSync('backend/src/routes/billing.ts', 'utf8');

const transitionLogic = `
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
`;

const webhookMarker = `              io.to(\`session:\${session.id}\`).emit('orderStatusUpdated', {
                orderId: 'SESSION_COMPLETE',
                status: 'COMPLETED'
              });
            }
          });
        }
      }

      return reply.code(200).send({ status: 'ok' });`;

const newWebhookEnd = `              io.to(\`session:\${session.id}\`).emit('orderStatusUpdated', {
                orderId: 'SESSION_COMPLETE',
                status: 'COMPLETED'
              });
            }
${transitionLogic}
            
            const updatedSession = await tx.session.findUnique({
              where: { id: session.id },
              include: {
                table: { include: { restaurant: true } },
                orders: { include: { items: { include: { menuItem: true } } } },
                transactions: { where: { status: 'COMPLETED' }, include: { paymentItems: true } }
              }
            });
            const io = getIO();
            io.to(\`session:\${session.id}\`).emit('sessionUpdated', updatedSession);
          });
        }
      }

      return reply.code(200).send({ status: 'ok' });`;

code = code.replace(webhookMarker, newWebhookEnd);

// Also modify verify-payment so that if it says 'Already verified', we still trigger a session update refresh to the frontend just in case!
const verifyMarker = `      if (transaction.status === 'COMPLETED') {
        return reply.code(200).send({ success: true, message: 'Already verified' });
      }`;

const newVerifyLogic = `      if (transaction.status === 'COMPLETED') {
        // Even if verified, push the updated session to the frontend so it clears the cart and moves on!
        const updatedSession = await prisma.session.findUnique({
          where: { id: transaction.sessionId },
          include: {
            table: { include: { restaurant: true } },
            orders: { include: { items: { include: { menuItem: true } } } },
            transactions: { where: { status: 'COMPLETED' }, include: { paymentItems: true } }
          }
        });
        if (updatedSession) {
          getIO().to(\`session:\${transaction.sessionId}\`).emit('sessionUpdated', updatedSession);
        }
        return reply.code(200).send({ success: true, message: 'Already verified' });
      }`;

code = code.replace(verifyMarker, newVerifyLogic);

fs.writeFileSync('backend/src/routes/billing.ts', code);
console.log('Fixed race condition successfully!');

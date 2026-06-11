const fs = require('fs');

const routeCode = `
  fastify.post<{ Params: { sessionId: string }; Body: VerifyPaymentBody }>('/api/sessions/:sessionId/verify-payment', async (request, reply) => {
    try {
      const { sessionId } = request.params;
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = request.body;

      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return reply.code(400).send({ error: 'Missing Razorpay signature details' });
      }

      // Verify cryptographic signature
      const secret = '0PQLgUWfsMW7lXYMOLk1O2mH'; // Hardcoded for Vercel/Railway bypass consistency
      const expectedSignature = require('crypto').createHmac('sha256', secret)
        .update(razorpay_order_id + '|' + razorpay_payment_id)
        .digest('hex');

      if (expectedSignature !== razorpay_signature) {
        return reply.code(400).send({ error: 'Invalid payment signature' });
      }

      // Find transaction
      const transaction = await prisma.transaction.findUnique({
        where: { razorpayOrderId: razorpay_order_id },
        include: { 
          session: { 
            include: { 
              table: { include: { restaurant: true } }, 
              orders: { include: { items: { include: { menuItem: true } } } } 
            } 
          }, 
          paymentItems: true 
        }
      });

      if (!transaction) return reply.code(404).send({ error: 'Transaction not found' });
      
      if (transaction.status === 'COMPLETED') {
        return reply.code(200).send({ success: true, message: 'Already verified' });
      }

      await prisma.$transaction(async (tx) => {
        await tx.transaction.update({
          where: { id: transaction.id },
          data: {
            status: 'COMPLETED',
            razorpayPaymentId: razorpay_payment_id,
            razorpaySignature: razorpay_signature
          }
        });

        const session = transaction.session;
        const allCompletedTxs = await tx.transaction.findMany({
          where: { sessionId: session.id, status: 'COMPLETED' },
          include: { paymentItems: true }
        });

        const updatedPaidQuantityMap = new Map<string, Decimal>();
        allCompletedTxs.forEach(ctx => {
          ctx.paymentItems.forEach(pi => {
            const currentPaid = updatedPaidQuantityMap.get(pi.orderItemId) || new Decimal(0);
            updatedPaidQuantityMap.set(pi.orderItemId, currentPaid.add(new Decimal(pi.quantityPaid.toString())));
          });
        });

        let isFullyPaid = true;
        session.orders.forEach(order => {
          if (order.status === 'PENDING') return;
          order.items.forEach(item => {
            const qtyPaid = updatedPaidQuantityMap.get(item.id) || new Decimal(0);
            const qtyOrdered = new Decimal(item.quantity.toString());
            if (qtyPaid.lt(qtyOrdered)) {
              isFullyPaid = false;
            }
          });
        });

        if (isFullyPaid && session.table.restaurant.paymentMode === 'POST_PAY') {
          await tx.session.update({
            where: { id: session.id },
            data: { status: 'CLOSED', closedAt: new Date() }
          });
          await tx.table.update({
            where: { id: session.tableId },
            data: { status: 'VACANT' }
          });

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
                name: i.menuItem.name,
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
        const io = getIO();
        io.to(\`session:\${session.id}\`).emit('sessionUpdated', updatedSession);
      }); // end of $transaction

      return reply.code(200).send({ success: true });
    } catch (error) {
      request.server.log.error(error);
      return reply.code(500).send({ error: 'Failed to verify payment' });
    }
  });

`;

let code = fs.readFileSync('backend/src/routes/billing.ts', 'utf8');

// Also inject the VerifyPaymentBody interface at the top
const interfaceCode = `
interface VerifyPaymentBody {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
`;
code = code.replace(/export const billingRoutes = async \(fastify: FastifyInstance\) => {/, interfaceCode + '\nexport const billingRoutes = async (fastify: FastifyInstance) => {');

// Inject the route right before the webhook
code = code.replace("  // Razorpay Webhook Endpoint", routeCode + "\n  // Razorpay Webhook Endpoint");

fs.writeFileSync('backend/src/routes/billing.ts', code);
console.log('Fixed verify-payment route successfully!');

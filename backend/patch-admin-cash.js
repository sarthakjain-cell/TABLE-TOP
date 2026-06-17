const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const code = `
  // Admin forced Cash Collection and Session Close
  fastify.post<{ Params: { sessionId: string } }>('/api/sessions/:sessionId/admin-collect-cash', { preHandler: requireRole(['ADMIN']) }, async (request, reply) => {
    const { sessionId } = request.params;
    
    try {
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { 
          table: { include: { restaurant: true } },
          orders: { include: { items: { include: { menuItem: true } } } }
        }
      });

      if (!session || session.status === 'CLOSED') {
        return reply.code(400).send({ error: 'Invalid or closed session' });
      }

      const isHotel = session.table.restaurant.establishmentType === 'HOTEL';
      const roomServiceFee = isHotel ? new Decimal(session.table.restaurant.roomServiceFee.toString()) : new Decimal(0);
      const taxRate = new Decimal(session.table.restaurant.taxRate.toString());

      await prisma.$transaction(async (tx) => {
        // 1. Calculate Unpaid Items
        const allCompletedTxs = await tx.transaction.findMany({
          where: { sessionId, status: 'COMPLETED' },
          include: { paymentItems: true }
        });

        const paidQuantityMap = new Map<string, any>();
        allCompletedTxs.forEach((ctx: any) => {
          ctx.paymentItems.forEach((pi: any) => {
            const currentPaid = paidQuantityMap.get(pi.orderItemId) || new Decimal(0);
            paidQuantityMap.set(pi.orderItemId, currentPaid.add(new Decimal(pi.quantityPaid.toString())));
          });
        });

        let transactionSubtotal = new Decimal(0);
        let transactionTax = new Decimal(0);
        const transactionItemsPayload: any[] = [];

        session.orders.forEach((order: any) => {
          if (order.status === 'CANCELLED' || order.status === 'PENDING') return;
          
          order.items.forEach((item: any) => {
            const qtyOrdered = new Decimal(item.quantity.toString());
            const qtyPaid = paidQuantityMap.get(item.id) || new Decimal(0);
            const qtyUnpaid = qtyOrdered.sub(qtyPaid);

            if (qtyUnpaid.gt(0)) {
              const price = new Decimal(item.price.toString());
              const subtotal = price.mul(qtyUnpaid);
              const taxFraction = subtotal.mul(taxRate).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

              transactionSubtotal = transactionSubtotal.add(subtotal);
              transactionTax = transactionTax.add(taxFraction);

              transactionItemsPayload.push({
                orderItemId: item.id,
                quantityPaid: qtyUnpaid,
                amount: subtotal,
                taxFraction
              });
            }
          });
        });

        // 2. Create COMPLETED transaction for all unpaid items
        if (transactionItemsPayload.length > 0) {
          const totalGrand = transactionSubtotal.add(transactionTax).add(roomServiceFee).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
          
          await tx.transaction.create({
            data: {
              sessionId,
              amount: totalGrand,
              taxPaid: transactionTax.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
              status: 'COMPLETED',
              paymentMethod: 'CASH',
              customerName: 'Admin Collected',
              customerPhone: 'Admin',
              deliveryFeeApplied: roomServiceFee,
              paymentItems: {
                create: transactionItemsPayload
              }
            }
          });
        }

        // 3. Update orders to COMPLETED
        await tx.order.updateMany({
          where: { sessionId, status: { in: ['NEW', 'PREPARING', 'READY_TO_SERVE', 'PAYMENT_PENDING'] } },
          data: { status: 'COMPLETED' }
        });

        // 4. Close session and vacate table
        await tx.session.update({
          where: { id: sessionId },
          data: { status: 'CLOSED', closedAt: new Date() }
        });
        
        await tx.table.update({
          where: { id: session.tableId },
          data: { status: 'VACANT', waiterRequested: false }
        });
      });

      const io = getIO();
      io.emit('adminStateSynced');
      io.emit('helpRequested', {
        tableNumber: session.table.number,
        requestType: 'CHECKOUT_COMPLETE'
      });
      io.to(\`session:\${sessionId}\`).emit('orderStatusUpdated', {
        orderId: 'SESSION_COMPLETE',
        status: 'COMPLETED'
      });

      return reply.code(200).send({ success: true });
    } catch (error: any) {
      request.log.error(error);
      return reply.code(500).send({ error: error.message || 'Failed to process admin cash collection' });
    }
  });
`;

  const fs = require('fs');
  let content = fs.readFileSync('backend/src/routes/billing.ts', 'utf8');
  content = content.replace('export default async function billingRoutes(fastify: FastifyInstance) {', 'export default async function billingRoutes(fastify: FastifyInstance) {' + '\\n' + code);
  fs.writeFileSync('backend/src/routes/billing.ts', content);
  console.log('Added /api/sessions/:sessionId/admin-collect-cash');
}

run();

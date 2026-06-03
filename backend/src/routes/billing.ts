import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../prisma';
import { Decimal } from 'decimal.js';
import { getIO } from '../socket';

interface SplitPaymentItem {
  orderItemId: string;
  quantityToPay: number; // Parsed into Decimal
}

interface PaySplitBody {
  customerName?: string;
  customerPhone?: string;
  items: SplitPaymentItem[];
}

export const billingRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Get billing status for a session (subtotals, taxes, paid items, outstanding items)
  fastify.get<{ Params: { sessionId: string } }>('/api/sessions/:sessionId/billing-status', async (request, reply) => {
    const { sessionId } = request.params;

    try {
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: {
          table: {
            include: {
              restaurant: true
            }
          },
          orders: {
            include: {
              items: {
                include: {
                  menuItem: true
                }
              }
            }
          },
          transactions: {
            where: { status: 'COMPLETED' },
            include: {
              paymentItems: true
            }
          }
        }
      });

      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      const taxRate = new Decimal(session.table.restaurant.taxRate.toString());

      // Track paid item quantities using Decimal to support fractional portions
      const paidQuantityMap = new Map<string, Decimal>();
      session.transactions.forEach(tx => {
        tx.paymentItems.forEach(pi => {
          const currentPaid = paidQuantityMap.get(pi.orderItemId) || new Decimal(0);
          paidQuantityMap.set(pi.orderItemId, currentPaid.add(new Decimal(pi.quantityPaid.toString())));
        });
      });

      let totalSessionSubtotal = new Decimal(0);
      let totalSessionTax = new Decimal(0);
      const itemsBillingInfo: any[] = [];

      session.orders.forEach(order => {
        // Exclude pending carts from billing breakdown until they are submitted (non-PENDING)
        if (order.status === 'PENDING') return;

        order.items.forEach(item => {
          const itemPrice = new Decimal(item.price.toString());
          const totalQty = new Decimal(item.quantity.toString());
          const paidQty = paidQuantityMap.get(item.id) || new Decimal(0);
          const unpaidQty = Decimal.max(0, totalQty.sub(paidQty));

          const itemSubtotal = itemPrice.mul(totalQty);
          const itemTax = itemSubtotal.mul(taxRate);

          totalSessionSubtotal = totalSessionSubtotal.add(itemSubtotal);
          totalSessionTax = totalSessionTax.add(itemTax);

          itemsBillingInfo.push({
            orderItemId: item.id,
            menuItemId: item.menuItemId,
            name: item.menuItem.name,
            price: item.price,
            orderedQuantity: totalQty.toNumber(),
            paidQuantity: paidQty.toNumber(),
            unpaidQuantity: unpaidQty.toNumber(),
            modifications: item.modifications
          });
        });
      });

      const totalSessionGrand = totalSessionSubtotal.add(totalSessionTax);

      // Sum completed transaction values
      let totalPaidSubtotal = new Decimal(0);
      let totalPaidTax = new Decimal(0);

      session.transactions.forEach(tx => {
        tx.paymentItems.forEach(pi => {
          totalPaidSubtotal = totalPaidSubtotal.add(new Decimal(pi.amount.toString()));
          totalPaidTax = totalPaidTax.add(new Decimal(pi.taxFraction.toString()));
        });
      });

      const remainingSubtotal = Decimal.max(0, totalSessionSubtotal.sub(totalPaidSubtotal));
      const remainingTax = Decimal.max(0, totalSessionTax.sub(totalPaidTax));
      const remainingGrand = remainingSubtotal.add(remainingTax);

      return {
        sessionId: session.id,
        restaurantName: session.table.restaurant.name,
        tableNumber: session.table.number,
        taxRate: taxRate.toNumber(),
        totals: {
          subtotal: totalSessionSubtotal.toFixed(2),
          tax: totalSessionTax.toFixed(2),
          grandTotal: totalSessionGrand.toFixed(2),
        },
        paid: {
          subtotal: totalPaidSubtotal.toFixed(2),
          tax: totalPaidTax.toFixed(2),
          grandTotal: totalPaidSubtotal.add(totalPaidTax).toFixed(2),
        },
        remaining: {
          subtotal: remainingSubtotal.toFixed(2),
          tax: remainingTax.toFixed(2),
          grandTotal: remainingGrand.toFixed(2),
        },
        items: itemsBillingInfo,
        status: session.status
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch billing status' });
    }
  });

  // Pay for a custom split selection of items from the shared cart
  fastify.post<{ Params: { sessionId: string }; Body: PaySplitBody }>('/api/sessions/:sessionId/pay-split', async (request, reply) => {
    const { sessionId } = request.params;
    const { items, customerName, customerPhone } = request.body;

    if (!items || !items.length) {
      return reply.code(400).send({ error: 'Selected items list cannot be empty' });
    }

    try {
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: {
          table: { include: { restaurant: true } },
          orders: { include: { items: { include: { menuItem: true } } } },
          transactions: { where: { status: 'COMPLETED' }, include: { paymentItems: true } }
        }
      });

      if (!session || session.status === 'CLOSED') {
        return reply.code(400).send({ error: 'Invalid or closed session' });
      }

      const taxRate = new Decimal(session.table.restaurant.taxRate.toString());

      // Track paid item quantities using Decimal
      const paidQuantityMap = new Map<string, Decimal>();
      session.transactions.forEach(tx => {
        tx.paymentItems.forEach(pi => {
          const currentPaid = paidQuantityMap.get(pi.orderItemId) || new Decimal(0);
          paidQuantityMap.set(pi.orderItemId, currentPaid.add(new Decimal(pi.quantityPaid.toString())));
        });
      });

      // Map of all items ordered in this session for quick lookup
      const orderedItemsMap = new Map<string, any>();
      session.orders.forEach(order => {
        if (order.status === 'PENDING') return; // Ignore pending carts
        order.items.forEach(item => {
          orderedItemsMap.set(item.id, item);
        });
      });

      let transactionSubtotal = new Decimal(0);
      let transactionTax = new Decimal(0);

      // Calculations and availability verification
      const transactionItemsPayload: any[] = [];

      for (const reqItem of items) {
        const orderItem = orderedItemsMap.get(reqItem.orderItemId);
        if (!orderItem) {
          return reply.code(400).send({ error: `OrderItem ${reqItem.orderItemId} does not belong to this session or is not submitted` });
        }

        const paidQty = paidQuantityMap.get(reqItem.orderItemId) || new Decimal(0);
        const orderedQty = new Decimal(orderItem.quantity.toString());
        const availableQty = orderedQty.sub(paidQty);
        const reqQtyToPay = new Decimal(reqItem.quantityToPay.toString());

        if (reqQtyToPay.gt(availableQty)) {
          return reply.code(400).send({
            error: `Cannot pay for ${reqItem.quantityToPay} units of ${orderItem.menuItem.name}. Only ${availableQty.toString()} units remain unpaid.`
          });
        }

        const price = new Decimal(orderItem.price.toString());
        const subtotal = price.mul(reqQtyToPay);
        
        // Exact fractional tax logic to 4 decimal places
        const taxFraction = subtotal.mul(taxRate).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

        transactionSubtotal = transactionSubtotal.add(subtotal);
        transactionTax = transactionTax.add(taxFraction);

        transactionItemsPayload.push({
          orderItemId: reqItem.orderItemId,
          quantityPaid: reqQtyToPay,
          amount: subtotal,
          taxFraction
        });
      }

      const totalGrand = transactionSubtotal.add(transactionTax).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      // Create the Transaction and OrderItemPayment links atomically
      const transaction = await prisma.$transaction(async (tx) => {
        const createdTx = await tx.transaction.create({
          data: {
            sessionId,
            amount: totalGrand,
            taxPaid: transactionTax.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
            status: 'COMPLETED',
            customerName,
            customerPhone,
            paymentItems: {
              create: transactionItemsPayload.map(item => ({
                orderItemId: item.orderItemId,
                quantityPaid: item.quantityPaid,
                amount: item.amount,
                taxFraction: item.taxFraction
              }))
            }
          },
          include: {
            paymentItems: true
          }
        });

        // Re-evaluate if the session has now been fully paid out
        const allCompletedTxs = await tx.transaction.findMany({
          where: { sessionId, status: 'COMPLETED' },
          include: { paymentItems: true }
        });

        const updatedPaidQuantityMap = new Map<string, Decimal>();
        allCompletedTxs.forEach(ctx => {
          ctx.paymentItems.forEach(pi => {
            const currentPaid = updatedPaidQuantityMap.get(pi.orderItemId) || new Decimal(0);
            updatedPaidQuantityMap.set(pi.orderItemId, currentPaid.add(new Decimal(pi.quantityPaid.toString())));
          });
        });

        // Check if every ordered item has been completely paid
        let isFullyPaid = true;
        session.orders.forEach(order => {
          if (order.status === 'PENDING') return; // Ignore carts
          order.items.forEach(item => {
            const qtyPaid = updatedPaidQuantityMap.get(item.id) || new Decimal(0);
            const qtyOrdered = new Decimal(item.quantity.toString());
            if (qtyPaid.lt(qtyOrdered)) {
              isFullyPaid = false;
            }
          });
        });

        // If completely settled, automatically close the session and vacate the table
        if (isFullyPaid) {
          await tx.session.update({
            where: { id: sessionId },
            data: {
              status: 'CLOSED',
              closedAt: new Date()
            }
          });

          await tx.table.update({
            where: { id: session.tableId },
            data: { status: 'VACANT' }
          });
        }

        return {
          createdTx,
          isFullyPaid
        };
      });

      // Emit Table Vacant broadcast on full checkout
      if (transaction.isFullyPaid) {
        const io = getIO();
        io.emit('helpRequested', {
          tableNumber: session.table.number,
          requestType: 'CHECKOUT_COMPLETE'
        });
        io.to(`session:${sessionId}`).emit('orderStatusUpdated', {
          orderId: 'SESSION_COMPLETE',
          status: 'COMPLETED'
        });
      }

      return {
        transaction: transaction.createdTx,
        sessionFullyPaid: transaction.isFullyPaid,
        paidSubtotal: transactionSubtotal.toFixed(2),
        paidTax: transactionTax.toFixed(2),
        paidGrandTotal: totalGrand.toFixed(2)
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to process split payment' });
    }
  });
};

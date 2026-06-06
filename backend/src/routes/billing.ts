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
  paymentMethod?: string;
  items: SplitPaymentItem[];
}

interface CheckoutCartBody {
  customerName?: string;
  customerPhone?: string;
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
    const { items, customerName, customerPhone, paymentMethod } = request.body;

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

        if (paymentMethod) {
          const affectedOrderIds = new Set<string>();
          for (const item of transactionItemsPayload) {
            const orderItem = orderedItemsMap.get(item.orderItemId);
            if (orderItem) affectedOrderIds.add(orderItem.orderId);
          }
          await tx.order.updateMany({
            where: { id: { in: Array.from(affectedOrderIds) } },
            data: { paymentMethod }
          });
        }

        return {
          createdTx,
          isFullyPaid,
          affectedOrderIds: paymentMethod ? Array.from(
            new Set(transactionItemsPayload.map(i => orderedItemsMap.get(i.orderItemId)?.orderId).filter(Boolean))
          ) : []
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

      // Re-fetch affected orders to broadcast the updated paymentMethod to the Kitchen
      if (paymentMethod && transaction.affectedOrderIds.length > 0) {
        const io = getIO();
        for (const orderId of transaction.affectedOrderIds) {
          const updatedOrder = await prisma.order.findUnique({
            where: { id: orderId },
            include: { items: { include: { menuItem: true } } }
          });
          if (updatedOrder) {
             io.emit('orderStatusUpdated', {
                orderId: updatedOrder.id,
                status: updatedOrder.status,
                paymentMethod: updatedOrder.paymentMethod || undefined
             });
          }
        }
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

  // Hotel Mode Cart Checkout (processes payment, applies delivery fee, and transitions PENDING cart to NEW order)
  fastify.post<{ Params: { sessionId: string }; Body: CheckoutCartBody }>('/api/sessions/:sessionId/checkout-cart', async (request, reply) => {
    const { sessionId } = request.params;
    const { customerName, customerPhone } = request.body;

    try {
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: {
          table: { include: { restaurant: true } }
        }
      });

      if (!session || session.status === 'CLOSED') {
        return reply.code(400).send({ error: 'Invalid or closed session' });
      }

      const isHotel = session.table.restaurant.establishmentType === 'HOTEL';
      const roomServiceFee = isHotel ? new Decimal(session.table.restaurant.roomServiceFee.toString()) : new Decimal(0);
      const taxRate = new Decimal(session.table.restaurant.taxRate.toString());

      const result = await prisma.$transaction(async (tx) => {
        const pendingOrder = await tx.order.findFirst({
          where: { sessionId, status: 'PENDING' },
          include: {
            items: { include: { menuItem: true } }
          }
        });

        if (!pendingOrder || pendingOrder.items.length === 0) {
          throw new Error('Your cart is empty');
        }

        let transactionSubtotal = new Decimal(0);
        let transactionTax = new Decimal(0);
        const transactionItemsPayload: any[] = [];

        // Verify availability and calculate costs
        for (const item of pendingOrder.items) {
          if (!item.menuItem.isAvailable) {
            throw new Error(`"${item.menuItem.name}" is no longer available`);
          }
          const price = new Decimal(item.price.toString());
          const qty = new Decimal(item.quantity.toString());
          const subtotal = price.mul(qty);
          const taxFraction = subtotal.mul(taxRate).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

          transactionSubtotal = transactionSubtotal.add(subtotal);
          transactionTax = transactionTax.add(taxFraction);

          transactionItemsPayload.push({
            orderItemId: item.id,
            quantityPaid: qty,
            amount: subtotal,
            taxFraction
          });
        }

        const totalGrand = transactionSubtotal.add(transactionTax).add(roomServiceFee).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

        // Transition order state from PENDING to NEW using an atomic update to prevent TOCTOU Race Conditions
        const updateResult = await tx.order.updateMany({
          where: { id: pendingOrder.id, status: 'PENDING' },
          data: { status: 'NEW' }
        });

        // If count is 0, another concurrent request already checked out this cart!
        if (updateResult.count === 0) {
          throw new Error('CONCURRENCY_ERROR: Cart was already checked out.');
        }

        // Fetch the updated order so we can return the items in the response
        const updatedOrder = await tx.order.findUniqueOrThrow({
          where: { id: pendingOrder.id },
          include: {
            items: { include: { menuItem: true } }
          }
        });

        // Create transaction with delivery fee applied
        const createdTx = await tx.transaction.create({
          data: {
            sessionId,
            amount: totalGrand,
            taxPaid: transactionTax.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
            status: 'COMPLETED',
            customerName,
            customerPhone,
            deliveryFeeApplied: roomServiceFee,
            paymentItems: {
              create: transactionItemsPayload
            }
          }
        });

        return { updatedOrder, createdTx };
      });

      const io = getIO();
      const sessionRoom = `session:${sessionId}`;

      // Broadcast empty cart and order state
      io.to(sessionRoom).emit('cartUpdated', { sessionId, cart: { items: [], subtotal: '0.00' } });
      io.to(sessionRoom).emit('orderStatusUpdated', { orderId: result.updatedOrder.id, status: 'NEW' });

      // Notify Kitchen line about the new incoming ticket WITH guest claim since it was paid upfront
      io.emit('newOrderSubmitted', {
        order: {
          id: result.updatedOrder.id,
          status: 'NEW',
        tableNumber: session.table.number,
        restaurantId: session.restaurantId,
        items: result.updatedOrder.items.map(i => ({
          name: i.menuItem.name,
          quantity: new Decimal(i.quantity.toString()).toNumber(),
          modifications: i.modifications
        })),
        createdAt: result.updatedOrder.createdAt,
        guestClaim: customerName || customerPhone ? {
          name: customerName || '',
          room: customerPhone || session.table.number
        } : undefined
});

      return reply.code(200).send({ success: true, transaction: result.createdTx });
    } catch (error: any) {
      if (error.message && error.message.includes('CONCURRENCY_ERROR')) {
        return reply.code(409).send({ error: 'Checkout already in progress or completed.' });
      }
      fastify.log.error(error);
      return reply.code(500).send({ error: error.message || 'Internal Server Error' });
    }
  });

  interface CheckoutDirectBody {
    paymentMethod: 'UPI' | 'CASH';
    customerName?: string;
    customerPhone?: string;
  }

  // Direct checkout (Zero-Fee UPI or Cash to Waiter)
  fastify.post<{ Params: { sessionId: string }; Body: CheckoutDirectBody }>('/api/sessions/:sessionId/checkout-direct', async (request, reply) => {
    const { sessionId } = request.params;
    const { paymentMethod, customerName, customerPhone } = request.body;

    if (paymentMethod !== 'UPI' && paymentMethod !== 'CASH') {
      return reply.code(400).send({ error: 'Invalid payment method' });
    }

    try {
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { table: { include: { restaurant: true } } }
      });

      if (!session) throw new Error('Session not found');

      const taxRate = new Decimal(session.table.restaurant.taxRate.toString());
      const isHotel = session.table.restaurant.establishmentType === 'HOTEL';
      const roomServiceFee = isHotel ? new Decimal(session.table.restaurant.roomServiceFee.toString()) : new Decimal(0);

      const result = await prisma.$transaction(async (tx) => {
        const pendingOrder = await tx.order.findFirst({
          where: { sessionId, status: 'PENDING' },
          include: { items: { include: { menuItem: true } } }
        });

        if (!pendingOrder || pendingOrder.items.length === 0) {
          throw new Error('Your cart is empty');
        }

        let transactionSubtotal = new Decimal(0);
        let transactionTax = new Decimal(0);
        const transactionItemsPayload: any[] = [];

        for (const item of pendingOrder.items) {
          if (!item.menuItem.isAvailable) {
            throw new Error(`"${item.menuItem.name}" is no longer available`);
          }
          const price = new Decimal(item.price.toString());
          const qty = new Decimal(item.quantity.toString());
          const subtotal = price.mul(qty);
          const taxFraction = subtotal.mul(taxRate).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

          transactionSubtotal = transactionSubtotal.add(subtotal);
          transactionTax = transactionTax.add(taxFraction);

          transactionItemsPayload.push({
            orderItemId: item.id,
            quantityPaid: qty,
            amount: subtotal,
            taxFraction
          });
        }

        const totalGrand = transactionSubtotal.add(transactionTax).add(roomServiceFee).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

        // Transition order state to PAYMENT_PENDING
        const updatedOrder = await tx.order.update({
          where: { id: pendingOrder.id },
          data: { 
            status: 'PAYMENT_PENDING',
            paymentMethod: paymentMethod 
          },
          include: { items: { include: { menuItem: true } } }
        });

        // Create transaction as PENDING. It will be COMPLETED when kitchen verifies.
        const createdTx = await tx.transaction.create({
          data: {
            sessionId,
            amount: totalGrand,
            taxPaid: transactionTax.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
            status: 'PENDING',
            customerName,
            customerPhone,
            deliveryFeeApplied: roomServiceFee,
            paymentItems: {
              create: transactionItemsPayload
            }
          }
        });

        return { updatedOrder, createdTx };
      });

      const io = getIO();
      const sessionRoom = `session:${sessionId}`;

      io.to(sessionRoom).emit('cartUpdated', { sessionId, cart: { items: [], subtotal: '0.00' } });
      io.to(sessionRoom).emit('orderStatusUpdated', { orderId: result.updatedOrder.id, status: 'PAYMENT_PENDING', paymentMethod: paymentMethod });

      io.emit('newOrderReceived', {
        order: {
          id: result.updatedOrder.id,
          status: 'PAYMENT_PENDING',
          tableNumber: session.table.number,
          restaurantId: session.restaurantId,
          paymentMethod: paymentMethod,
          items: result.updatedOrder.items.map(i => ({
            name: i.menuItem.name,
            quantity: new Decimal(i.quantity.toString()).toNumber(),
            modifications: i.modifications
          })),
          createdAt: result.updatedOrder.createdAt,
          totalAmount: result.createdTx.amount.toString() // We pass the totalAmount here for KDS display
        }
      });

      return reply.code(200).send({ success: true, transaction: result.createdTx });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(400).send({ error: error.message || 'Failed to checkout directly' });
    }
  });
};

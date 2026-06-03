import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../prisma';
import { getIO } from '../socket';
import { Decimal } from 'decimal.js';
import crypto from 'crypto';

interface WebhookPayload {
  event: string;
  data: {
    transactionId: string;
    amount: number;
    currency: string;
  };
}

export const webhookRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Payment Webhook Handler (Simulates Stripe/Razorpay checkout callback validation)
  fastify.post<{ Body: WebhookPayload }>('/api/payments/webhook', async (request, reply) => {
    const signature = request.headers['x-webhook-signature'] as string;
    const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET || 'webhook-secret-key-change-in-prod';

    if (!signature) {
      return reply.code(400).send({ error: 'Missing x-webhook-signature header' });
    }

    // Verify webhook signature authenticity using crypto HMAC sha256
    const payloadString = JSON.stringify(request.body);
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payloadString)
      .digest('hex');

    if (signature !== expectedSignature) {
      fastify.log.error('Invalid signature match on webhook payload');
      return reply.code(400).send({ error: 'Signature verification failed' });
    }

    const { event, data } = request.body;

    if (event !== 'payment.succeeded') {
      return reply.code(200).send({ received: true, ignored: true });
    }

    try {
      const transactionId = data.transactionId;

      // Wrap state modifications in an atomic Prisma transaction to prevent corruption
      const result = await prisma.$transaction(async (tx) => {
        const transaction = await tx.transaction.findUnique({
          where: { id: transactionId },
          include: {
            session: {
              include: {
                table: true,
                orders: {
                  where: { status: { not: 'PENDING' } },
                  include: {
                    items: true
                  }
                }
              }
            }
          }
        });

        if (!transaction) {
          throw new Error(`Transaction ${transactionId} not found`);
        }

        if (transaction.status === 'COMPLETED') {
          return { alreadyProcessed: true };
        }

        // 1. Update Transaction status to COMPLETED
        const updatedTx = await tx.transaction.update({
          where: { id: transactionId },
          data: { status: 'COMPLETED' },
          include: { paymentItems: true }
        });

        const sessionId = transaction.sessionId;

        // 2. Load total amount paid across all COMPLETED transactions in this session
        const allCompletedTxs = await tx.transaction.findMany({
          where: { sessionId, status: 'COMPLETED' },
          include: { paymentItems: true }
        });

        const paidQuantityMap = new Map<string, Decimal>();
        allCompletedTxs.forEach(ctx => {
          ctx.paymentItems.forEach(pi => {
            const currentPaid = paidQuantityMap.get(pi.orderItemId) || new Decimal(0);
            paidQuantityMap.set(pi.orderItemId, currentPaid.add(new Decimal(pi.quantityPaid.toString())));
          });
        });

        // 3. Verify if every ordered item in the session is fully settled
        let isFullyPaid = true;
        transaction.session.orders.forEach(order => {
          order.items.forEach(item => {
            const qtyPaid = paidQuantityMap.get(item.id) || new Decimal(0);
            const qtyOrdered = new Decimal(item.quantity.toString());
            if (qtyPaid.lt(qtyOrdered)) {
              isFullyPaid = false;
            }
          });
        });

        // 4. If completely settled, automatically close the session and vacate the table
        if (isFullyPaid) {
          await tx.session.update({
            where: { id: sessionId },
            data: {
              status: 'CLOSED',
              closedAt: new Date()
            }
          });

          await tx.table.update({
            where: { id: transaction.session.tableId },
            data: { status: 'VACANT' }
          });
        }

        return {
          alreadyProcessed: false,
          isFullyPaid,
          sessionId,
          tableId: transaction.session.tableId,
          tableNumber: transaction.session.table.number
        };
      });

      if (!result.alreadyProcessed && result.isFullyPaid) {
        // 5. Broadcast Table Vacant alerts to Kitchen and Admin interfaces
        const io = getIO();
        io.emit('helpRequested', {
          tableNumber: result.tableNumber || '',
          requestType: 'CHECKOUT_COMPLETE'
        });
        io.to(`session:${result.sessionId}`).emit('orderStatusUpdated', {
          orderId: 'SESSION_COMPLETE',
          status: 'COMPLETED'
        });
      }

      return reply.code(200).send({ received: true, processed: true, finalized: result.isFullyPaid });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: error.message || 'Webhook processing failed' });
    }
  });
};

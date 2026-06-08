import { FastifyInstance } from 'fastify';
import { prisma } from '../index';

interface ReceiptBody {
  phone: string;
  transactionId: string;
}

export const receiptRoutes = async (fastify: FastifyInstance) => {
  // Trigger WhatsApp receipt logic (Mocked for now)
  fastify.post<{ Body: ReceiptBody }>('/api/receipt', async (request, reply) => {
    const { phone, transactionId } = request.body;

    if (!phone || !transactionId) {
      return reply.code(400).send({ error: 'Phone number and Transaction ID are required' });
    }

    try {
      // 1. Verify transaction exists
      const transaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
        include: {
          session: {
            include: {
              table: {
                include: { restaurant: true }
              }
            }
          }
        }
      });

      if (!transaction) {
        return reply.code(404).send({ error: 'Transaction not found' });
      }

      // 2. Update the phone number on the transaction to persist the choice
      await prisma.transaction.update({
        where: { id: transactionId },
        data: { customerPhone: phone }
      });

      // 3. Mock WhatsApp Cloud API Delivery
      const receiptUrl = `http://localhost:3000/receipt/${transactionId}`;
      const restaurantName = transaction.session.table.restaurant.name;
      
      fastify.log.info(`
==================================================
WHATSAPP CLOUD API (MOCK)
To: ${phone}
Template: digital_receipt
Parameters:
 - RestaurantName: ${restaurantName}
 - Amount: $${transaction.amount.toString()}
 - Link: ${receiptUrl}

[SIMULATED MESSAGE]
Hello! Thanks for dining at ${restaurantName}.
Your payment of $${transaction.amount.toString()} was successful.
View your digital receipt and future discounts here:
${receiptUrl}
==================================================
      `);

      return { success: true, message: 'Receipt sent successfully via WhatsApp' };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to send receipt' });
    }
  });
}

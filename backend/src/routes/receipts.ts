import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma';
import { sendWhatsAppReceipt } from '../utils/whatsapp';

export const receiptRoutes = async (fastify: FastifyInstance) => {
  fastify.post<{ Body: { phone: string; transactionId: string } }>('/api/receipt', async (request, reply) => {
    const { phone, transactionId } = request.body;
    if (!phone || !transactionId) return reply.code(400).send({ error: 'Phone number and Transaction ID are required' });

    try {
      await prisma.transaction.update({ where: { id: transactionId }, data: { customerPhone: phone } });
      
      const transaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
        include: { session: { include: { table: { include: { restaurant: true } } } } }
      });
      
      if (!transaction) throw new Error('Transaction not found');

      const result = await sendWhatsAppReceipt(
        phone, 
        transaction.amount.toString(), 
        transaction.session.table.restaurant.name, 
        transaction.id
      );
      
      return result;
    } catch (error: any) {
      return reply.code(500).send({ error: error.message || 'Failed to send receipt' });
    }
  });
};


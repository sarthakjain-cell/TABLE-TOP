import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma';

export const sendWhatsAppReceipt = async (transactionId: string, phone: string, log: any) => {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { session: { include: { table: { include: { restaurant: true } } } } }
    });

    if (!transaction) throw new Error('Transaction not found');

    const receiptUrl = `https://table-top-frontend-pi.vercel.app/receipt/${transactionId}`;
    const restaurantName = transaction.session.table.restaurant.name;
    const amount = transaction.amount.toString();

    const formattedPhone = phone.replace(/\D/g, '');
    const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
    const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      log.warn('WhatsApp credentials missing in .env! Simulating receipt instead.');
      log.info(`[SIMULATED WHATSAPP TO ${formattedPhone}] Receipt: ${receiptUrl}`);
      return { success: true, message: 'Simulated WhatsApp (credentials missing)' };
    }

    const response = await fetch(`https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'template',
        template: {
          name: 'ontable_receipt',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: restaurantName },
                { type: 'text', text: amount },
                { type: 'text', text: receiptUrl }
              ]
            }
          ]
        }
      })
    });

    const responseData = await response.json();
    if (!response.ok) {
      log.error('WhatsApp API Error:', responseData as any);
      if ((responseData as any).error) {
        throw new Error('WhatsApp API: ' + (responseData as any).error.message);
      }
      throw new Error('WhatsApp API failed with status ' + response.status);
    }

    log.info(`WhatsApp Receipt Sent! Message ID: ${(responseData as any).messages?.[0]?.id}`);
    return { success: true, message: 'Receipt sent successfully via WhatsApp' };
  } catch (error) {
    log.error('Failed to send receipt:', error);
    throw error;
  }
};

export const receiptRoutes = async (fastify: FastifyInstance) => {
  fastify.post<{ Body: { phone: string; transactionId: string } }>('/api/receipt', async (request, reply) => {
    const { phone, transactionId } = request.body;
    if (!phone || !transactionId) return reply.code(400).send({ error: 'Phone number and Transaction ID are required' });

    try {
      await prisma.transaction.update({ where: { id: transactionId }, data: { customerPhone: phone } });
      const result = await sendWhatsAppReceipt(transactionId, phone, fastify.log);
      return result;
    } catch (error: any) {
      return reply.code(500).send({ error: error.message || 'Failed to send receipt' });
    }
  });
};

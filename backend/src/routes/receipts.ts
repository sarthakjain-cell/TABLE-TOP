import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma';

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

      // 3. Send via Meta WhatsApp Cloud API
      const receiptUrl = `https://table-top-frontend-pi.vercel.app/receipt/${transactionId}`;
      const restaurantName = transaction.session.table.restaurant.name;
      const amount = transaction.amount.toString();

      // Ensure phone is strictly numerical and starts with country code (e.g., 919876543210)
      const formattedPhone = phone.replace(/\D/g, '');

      const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
      const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

      if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
        fastify.log.warn('WhatsApp credentials missing in .env! Simulating receipt instead.');
        fastify.log.info(`[SIMULATED WHATSAPP TO ${formattedPhone}] Receipt: ${receiptUrl}`);
        return { success: true, message: 'Simulated WhatsApp (credentials missing)' };
      }

      // Meta Graph API Request
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
            // NOTE: You MUST create an approved template named 'digital_receipt' in your Meta Dashboard
            name: 'digital_receipt',
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
        fastify.log.error('WhatsApp API Error:', responseData as any);
        if ((responseData as any).error) {
          throw new Error('WhatsApp API: ' + (responseData as any).error.message);
        }
        throw new Error('WhatsApp API failed with status ' + response.status + ' - ' + JSON.stringify(responseData));
      }

      fastify.log.info(`WhatsApp Receipt Sent! Message ID: ${(responseData as any).messages?.[0]?.id}`);

      return { success: true, message: 'Receipt sent successfully via WhatsApp' };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to send receipt' });
    }
  });
}

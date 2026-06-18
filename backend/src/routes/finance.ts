import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../prisma';
import { requireRole } from '../middleware/auth';
import { Decimal } from 'decimal.js';

export const financeRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get<{ Querystring: { startDate?: string; endDate?: string } }>('/api/finance/metrics', { preHandler: requireRole(['ADMIN']) }, async (request, reply) => {
    const { startDate, endDate } = request.query;
    
    try {
      const dateFilter: any = {};
      if (startDate) {
        dateFilter.gte = new Date(startDate);
      }
      if (endDate) {
        dateFilter.lte = new Date(endDate);
      }

      const transactions = await prisma.transaction.findMany({
        where: {
          session: {
            restaurantId: request.user!.restaurantId
          },
          status: 'COMPLETED',
          ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter })
        },
        include: {
          session: {
            include: {
              table: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      // Calculate aggregate metrics
      let totalRevenue = new Decimal(0);
      let totalDeliveryFees = new Decimal(0);
      let totalCash = new Decimal(0);
      let totalOnline = new Decimal(0);

      const flatTransactions = transactions.map(tx => {
        totalRevenue = totalRevenue.add(new Decimal(tx.amount.toString()));
        totalDeliveryFees = totalDeliveryFees.add(new Decimal(tx.deliveryFeeApplied.toString()));

        if (tx.paymentMethod === 'CASH') {
          totalCash = totalCash.add(new Decimal(tx.amount.toString()));
        } else if (tx.paymentMethod === 'ONLINE' || tx.paymentMethod === 'UPI') {
          totalOnline = totalOnline.add(new Decimal(tx.amount.toString()));
        }

        return {
          id: tx.id,
          amount: tx.amount,
          taxPaid: tx.taxPaid,
          deliveryFeeApplied: tx.deliveryFeeApplied,
          customerName: tx.customerName,
          customerPhone: tx.customerPhone,
          paymentMethod: tx.paymentMethod || 'UNKNOWN',
          roomOrTable: tx.session?.table?.number || 'Takeaway / Unknown',
          createdAt: tx.createdAt,
          status: tx.status
        };
      });

      // Count total completed orders in date range
      const totalOrders = await prisma.order.count({
        where: {
          status: 'COMPLETED',
          ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter })
        }
      });

      return reply.code(200).send({
        metrics: {
          totalRevenue: totalRevenue.toFixed(2),
          totalDeliveryFees: totalDeliveryFees.toFixed(2),
          totalCash: totalCash.toFixed(2),
          totalOnline: totalOnline.toFixed(2),
          totalOrders
        },
        transactions: flatTransactions
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch financial metrics' });
    }
  });
};

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../prisma';

export const recommendationRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // GET /api/restaurants/:restaurantId/recommendations
  fastify.get('/api/restaurants/:restaurantId/recommendations', async (request, reply) => {
    const { restaurantId } = request.params as { restaurantId: string };
    
    try {
      // Find all rules for this restaurant
      const rules = await prisma.recommendationRule.findMany({
        where: { restaurantId },
        orderBy: [
          { lift: 'desc' },
          { confidence: 'desc' }
        ],
        include: {
          consequent: true // Include the recommended menu item details
        }
      });

      return reply.send(rules);
    } catch (err: any) {
      console.error("Error fetching recommendations:", err);
      return reply.code(500).send({ error: err.message });
    }
  });

};

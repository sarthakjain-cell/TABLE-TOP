import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../prisma';

export const recommendationRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // GET /api/menu/:menuItemId/recommendations
  fastify.get('/api/menu/:menuItemId/recommendations', async (request, reply) => {
    const { menuItemId } = request.params as { menuItemId: string };
    
    try {
      // Find rules where this item is the antecedent
      const rules = await prisma.recommendationRule.findMany({
        where: { antecedentId: menuItemId },
        orderBy: [
          { lift: 'desc' },
          { confidence: 'desc' }
        ],
        take: 3, // Top 3 recommendations
        include: {
          consequent: true // Include the recommended menu item details
        }
      });

      // Extract the recommended menu items
      const recommendations = rules.map(rule => rule.consequent);

      return reply.send(recommendations);
    } catch (err: any) {
      console.error("Error fetching recommendations:", err);
      return reply.code(500).send({ error: err.message });
    }
  });

};

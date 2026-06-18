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

  // POST /api/admin/restaurants/:restaurantId/train-ml
  fastify.post('/api/admin/restaurants/:restaurantId/train-ml', async (request, reply) => {
    const { restaurantId } = request.params as { restaurantId: string };
    
    try {
      // Trigger the Python ML worker over Railway's internal network bridge
      // Fallback to localhost for local testing
      const mlServiceUrl =
      process.env.NODE_ENV === 'production'
        ? `http://table-top.railway.internal:8000/train` // Fixed: Railway assigned this specific internal domain
        : `http://localhost:8000/train`;
        
      const response = await fetch(`${mlServiceUrl}?restaurant_id=${restaurantId}`, {
        method: 'POST'
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("ML Worker Error:", errorText);
        return reply.code(response.status).send({ error: 'Failed to trigger ML Worker', details: errorText });
      }

      const data = await response.json();
      return reply.send({ success: true, message: 'AI Recommendation rules successfully recalculated.', data });
    } catch (err: any) {
      console.error("Error triggering ML training:", err);
      return reply.code(500).send({ error: 'Could not connect to the ML Worker service. Make sure it is deployed and running.', details: err.message });
    }
  });

};

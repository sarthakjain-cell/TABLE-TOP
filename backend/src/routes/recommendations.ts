import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../prisma';

export const recommendationRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // GET /api/restaurants/:restaurantId/recommendations
  fastify.get('/api/restaurants/:restaurantId/recommendations', async (request, reply) => {
    const { restaurantId } = request.params as { restaurantId: string };
    
    try {
      // Determine current time context bucket based on server time
      const hour = new Date().getHours();
      let currentContext = 'ALL';
      if (hour >= 5 && hour < 12) currentContext = 'MORNING';
      else if (hour >= 12 && hour < 17) currentContext = 'AFTERNOON';
      else if (hour >= 17 && hour < 22) currentContext = 'EVENING';
      else currentContext = 'NIGHT';

      // 1. Try fetching rules for the specific time context
      let rules = await prisma.recommendationRule.findMany({
        where: { restaurantId, timeContext: currentContext },
        orderBy: [
          { lift: 'desc' },
          { confidence: 'desc' }
        ],
        include: { consequent: true }
      });

      // 2. Anti-Sparsity Fallback: If no rules in this specific time bucket, fallback to 'ALL'
      if (rules.length === 0 && currentContext !== 'ALL') {
        rules = await prisma.recommendationRule.findMany({
          where: { restaurantId, timeContext: 'ALL' },
          orderBy: [
            { lift: 'desc' },
            { confidence: 'desc' }
          ],
          include: { consequent: true }
        });
      }

      // --- COLD START FALLBACK ---
      if (rules.length === 0) {
        // Fetch all menu items for this restaurant
        const allMenuItems = await prisma.menuItem.findMany({ 
          where: { restaurantId, isAvailable: true } 
        });
        
        // Find top 3 cheap sides/beverages/desserts for impulse buys
        const fallbackItems = allMenuItems
          .filter(item => 
            item.category.toLowerCase().includes('side') || 
            item.category.toLowerCase().includes('beverage') || 
            item.category.toLowerCase().includes('drink') ||
            item.category.toLowerCase().includes('add') ||
            item.category.toLowerCase().includes('dessert') ||
            parseFloat(item.price) <= 6.0
          )
          .sort((a, b) => parseFloat(a.price) - parseFloat(b.price))
          .slice(0, 3);
          
        if (fallbackItems.length > 0) {
          // Generate fake rules mapping every menu item to these fallback items
          rules = allMenuItems.flatMap(item => 
            fallbackItems
              .filter(fb => fb.id !== item.id) // Don't recommend the item itself
              .map(fb => ({
                id: `fallback-${item.id}-${fb.id}`,
                antecedentId: item.id,
                consequentId: fb.id,
                confidence: 0.99,
                lift: 2.0,
                restaurantId,
                createdAt: new Date(),
                consequent: fb
              }))
          ) as any;
        }
      }

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

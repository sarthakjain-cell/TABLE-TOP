import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../prisma';

export const recommendationRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // GET /api/restaurants/:restaurantId/recommendations/:itemId
  fastify.get('/api/restaurants/:restaurantId/recommendations/:itemId', async (request, reply) => {
    const { restaurantId, itemId } = request.params as { restaurantId: string, itemId: string };
    
    try {
      // 1. Fetch the ordered item to check its category
      const orderedItem = await prisma.menuItem.findUnique({
        where: { id: itemId }
      });
      
      if (!orderedItem) return reply.code(404).send({ error: "Item not found" });

      const isBeverage = orderedItem.category.toLowerCase().includes('beverage') || orderedItem.category.toLowerCase().includes('drink');
      const isSide = orderedItem.category.toLowerCase().includes('side') || orderedItem.category.toLowerCase().includes('dip');

      const hour = new Date().getHours();
      let currentContext = 'ALL';
      if (hour >= 5 && hour < 12) currentContext = 'MORNING';
      else if (hour >= 12 && hour < 17) currentContext = 'AFTERNOON';
      else if (hour >= 17 && hour < 22) currentContext = 'EVENING';
      else currentContext = 'NIGHT';

      // 2. Fetch everything concurrently using Promise.all to prevent Database Bottleneck
      const [mlRulesContext, mlRulesFallback, beverages, dips, newItems, lowVelocity] = await Promise.all([
        prisma.recommendationRule.findMany({
          where: { restaurantId, antecedentId: itemId, timeContext: currentContext },
          orderBy: [{ lift: 'desc' }, { confidence: 'desc' }],
          include: { consequent: true },
          take: 3
        }),
        prisma.recommendationRule.findMany({
          where: { restaurantId, antecedentId: itemId, timeContext: 'ALL' },
          orderBy: [{ lift: 'desc' }, { confidence: 'desc' }],
          include: { consequent: true },
          take: 3
        }),
        isBeverage ? Promise.resolve([]) : prisma.menuItem.findMany({
          where: { restaurantId, isAvailable: true, OR: [{ category: { contains: 'Beverage', mode: 'insensitive' } }, { category: { contains: 'Drink', mode: 'insensitive' } }] },
          take: 2
        }),
        isSide ? Promise.resolve([]) : prisma.menuItem.findMany({
          where: { restaurantId, isAvailable: true, OR: [{ category: { contains: 'Side', mode: 'insensitive' } }, { category: { contains: 'Dip', mode: 'insensitive' } }] },
          take: 2
        }),
        prisma.menuItem.findMany({
          where: { restaurantId, isAvailable: true },
          orderBy: { createdAt: 'desc' },
          take: 2
        }),
        prisma.menuItem.findMany({
          where: { restaurantId, isAvailable: true },
          orderBy: { price: 'asc' },
          take: 2
        })
      ]);

      let synthesizedItems = [];

      // Add ML Rules (try specific time context first, then ALL fallback)
      let mlRules = mlRulesContext.length > 0 ? mlRulesContext : mlRulesFallback;
      synthesizedItems.push(...mlRules.map(r => r.consequent));

      // Add category heuristics
      synthesizedItems.push(...beverages);
      synthesizedItems.push(...dips);
      synthesizedItems.push(...newItems);
      synthesizedItems.push(...lowVelocity);

      // Deduplicate and filter out the ordered item itself
      const uniqueItemsMap = new Map();
      for (const item of synthesizedItems) {
        if (item.id !== itemId && !uniqueItemsMap.has(item.id)) {
          uniqueItemsMap.set(item.id, item);
        }
      }
      
      const uniqueItems = Array.from(uniqueItemsMap.values());

      // Slice to prevent Cognitive Overload (max 8 items)
      const finalPayload = uniqueItems.slice(0, 8);

      return reply.send({ items: finalPayload });
    } catch (err: any) {
      console.error("Error fetching hybrid recommendations:", err);
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

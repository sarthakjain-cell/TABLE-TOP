import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../prisma';
import { getIO } from '../socket';
import { requireRole } from '../middleware/auth';

interface RestaurantBody {
  name: string;
  taxRate: number; // e.g. 0.0825
}

interface UpdateModeBody {
  mode: 'FULL_SERVICE' | 'SELF_SERVICE';
}

export const restaurantRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Create a new restaurant
  fastify.post<{ Body: RestaurantBody }>('/api/restaurants', async (request, reply) => {
    const { name, taxRate } = request.body;
    
    try {
      const restaurant = await prisma.restaurant.create({
        data: {
          name,
          taxRate: taxRate || 0.0825,
        },
      });
      return reply.code(201).send(restaurant);
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to create restaurant' });
    }
  });

  // Get all restaurants (for auto-linking in dev/prototype)
  fastify.get('/api/restaurants', async (request, reply) => {
    try {
      const restaurants = await prisma.restaurant.findMany();
      return restaurants;
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch restaurants' });
    }
  });

  // Get restaurant by ID
  fastify.get<{ Params: { id: string } }>('/api/restaurants/:id', async (request, reply) => {
    const { id } = request.params;
    
    try {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id },
        include: {
          tables: true,
        },
      });
      
      if (!restaurant) {
        return reply.code(404).send({ error: 'Restaurant not found' });
      }
      
      return restaurant;
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch restaurant' });
    }
  });

  // Fetch recent completed transactions for ledger
  fastify.get<{ Params: { id: string } }>('/api/restaurants/:id/transactions', { preHandler: requireRole(['ADMIN']) }, async (request, reply) => {
    const { id } = request.params;
    try {
      const transactions = await prisma.transaction.findMany({
        where: {
          session: {
            restaurantId: id
          },
          status: 'COMPLETED'
        },
        orderBy: { createdAt: 'desc' },
        take: 50
      });
      return transactions;
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch transactions' });
    }
  });

  // Toggle/Update Operational Mode (Admin protected)
  fastify.patch<{ Params: { id: string }; Body: UpdateModeBody }>('/api/restaurants/:id/mode', { preHandler: requireRole(['ADMIN']) }, async (request, reply) => {
    const { id } = request.params;
    const { mode } = request.body;

    if (mode !== 'FULL_SERVICE' && mode !== 'SELF_SERVICE') {
      return reply.code(400).send({ error: 'Invalid operational mode' });
    }

    try {
      const updatedRestaurant = await prisma.restaurant.update({
        where: { id },
        data: { operationalMode: mode },
      });

      // Broadcast mode change to all connected WebSocket clients instantly
      const io = getIO();
      io.emit('operationalModeChanged', { restaurantId: id, mode });
      io.emit('modeToggled', { restaurantId: id, mode });

      return updatedRestaurant;
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to update operational mode' });
    }
  });
};

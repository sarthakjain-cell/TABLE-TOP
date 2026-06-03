import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../prisma';
import { getIO } from '../socket';
import { requireRole } from '../middleware/auth';

interface CreateMenuItemBody {
  restaurantId: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
}

interface UpdateMenuItemBody {
  name?: string;
  description?: string;
  price?: number;
  imageUrl?: string;
}

interface ToggleAvailabilityBody {
  isAvailable: boolean;
}

export const menuRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Create Menu Item (Admin protected)
  fastify.post<{ Body: CreateMenuItemBody }>('/api/menu', { preHandler: requireRole(['ADMIN']) }, async (request, reply) => {
    const { restaurantId, name, description, price, imageUrl } = request.body;

    if (!restaurantId || !name || price === undefined) {
      return reply.code(400).send({ error: 'restaurantId, name, and price are required' });
    }

    try {
      const menuItem = await prisma.menuItem.create({
        data: {
          restaurantId,
          name,
          description,
          price: String(price), // Prisma decimal parses string representation
          imageUrl,
        },
      });
      return reply.code(201).send(menuItem);
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to create menu item' });
    }
  });

  // Get all Menu Items for a restaurant (Public)
  fastify.get<{ Querystring: { restaurantId: string } }>('/api/menu', async (request, reply) => {
    const { restaurantId } = request.query;

    if (!restaurantId) {
      return reply.code(400).send({ error: 'restaurantId query parameter is required' });
    }

    try {
      const items = await prisma.menuItem.findMany({
        where: { restaurantId },
        orderBy: { name: 'asc' },
      });
      return items;
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch menu items' });
    }
  });

  // Update Menu Item (Admin protected)
  fastify.patch<{ Params: { id: string }; Body: UpdateMenuItemBody }>('/api/menu/:id', { preHandler: requireRole(['ADMIN']) }, async (request, reply) => {
    const { id } = request.params;
    const { name, description, price, imageUrl } = request.body;

    try {
      const updatedItem = await prisma.menuItem.update({
        where: { id },
        data: {
          name,
          description,
          price: price !== undefined ? String(price) : undefined,
          imageUrl,
        },
      });
      return updatedItem;
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to update menu item' });
    }
  });

  // Toggle Availability ("86" item) (Kitchen & Admin protected)
  fastify.patch<{ Params: { id: string }; Body: ToggleAvailabilityBody }>('/api/menu/:id/availability', { preHandler: requireRole(['ADMIN', 'KITCHEN']) }, async (request, reply) => {
    const { id } = request.params;
    const { isAvailable } = request.body;

    if (isAvailable === undefined) {
      return reply.code(400).send({ error: 'isAvailable is required' });
    }

    try {
      const updatedItem = await prisma.menuItem.update({
        where: { id },
        data: { isAvailable },
      });

      // Broadcast changes to active customers and kitchen line displays
      const io = getIO();
      io.emit('menuItemAvailabilityChanged', { menuItemId: id, isAvailable });

      return updatedItem;
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to toggle availability' });
    }
  });

  // Delete Menu Item (Admin protected)
  fastify.delete<{ Params: { id: string } }>('/api/menu/:id', { preHandler: requireRole(['ADMIN']) }, async (request, reply) => {
    const { id } = request.params;

    try {
      await prisma.menuItem.delete({
        where: { id },
      });
      return reply.code(204).send();
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to delete menu item' });
    }
  });
};

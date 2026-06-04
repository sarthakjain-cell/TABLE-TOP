import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../prisma';
import { getIO } from '../socket';
import { requireRole } from '../middleware/auth';

interface CreateMenuItemBody {
  restaurantId: string;
  name: string;
  description?: string;
  price: number;
  category?: string;
  imageUrl?: string;
}

interface UpdateMenuItemBody {
  name?: string;
  description?: string;
  price?: number;
  category?: string;
  imageUrl?: string;
}

interface ToggleAvailabilityBody {
  isAvailable: boolean;
}

// Reusable schema for imageUrl
const imageUrlSchema = {
  type: 'string',
  format: 'uri',
  maxLength: 2048,
  nullable: true,
};

export const menuRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Create Menu Item (Admin protected)
  fastify.post<{ Body: CreateMenuItemBody }>('/api/menu', { 
    preHandler: requireRole(['ADMIN']),
    schema: {
      body: {
        type: 'object',
        required: ['restaurantId', 'name', 'price'],
        properties: {
          restaurantId: { type: 'string' },
          name: { type: 'string', maxLength: 255 },
          description: { type: 'string', nullable: true },
          price: { type: 'number', minimum: 0 },
          category: { type: 'string', maxLength: 100, nullable: true },
          imageUrl: imageUrlSchema,
        },
      },
    },
  }, async (request, reply) => {
    const { restaurantId, name, description, price, category, imageUrl } = request.body;

    try {
      const menuItem = await prisma.menuItem.create({
        data: {
          restaurantId,
          name,
          description,
          price: String(price), // Prisma decimal parses string representation
          category: category || "Main Course",
          imageUrl,
        },
      });
      const io = getIO();
      if (io) {
        io.emit('menuUpdated', { restaurantId });
      }
      return reply.code(201).send(menuItem);
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to create menu item' });
    }
  });

  // Get all Menu Items for a restaurant (Public / Table Customers)
  fastify.get<{ Querystring: { restaurantId: string } }>('/api/menu', {
    schema: {
      querystring: {
        type: 'object',
        required: ['restaurantId'],
        properties: {
          restaurantId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { restaurantId } = request.query;

    try {
      // findMany inherently selects all schema fields including imageUrl
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
  fastify.patch<{ Params: { id: string }; Body: UpdateMenuItemBody }>('/api/menu/:id', { 
    preHandler: requireRole(['ADMIN']),
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: 255 },
          description: { type: 'string', nullable: true },
          price: { type: 'number', minimum: 0 },
          category: { type: 'string', maxLength: 100, nullable: true },
          imageUrl: imageUrlSchema,
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { name, description, price, category, imageUrl } = request.body;

    try {
      const updatedItem = await prisma.menuItem.update({
        where: { id },
        data: {
          name,
          description,
          price: price !== undefined ? String(price) : undefined,
          category,
          imageUrl,
        },
      });
      const io = getIO();
      if (io) {
        io.emit('menuUpdated', { restaurantId: updatedItem.restaurantId });
      }
      return updatedItem;
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to update menu item' });
    }
  });

  // Toggle Availability ("86" item) (Kitchen & Admin protected)
  fastify.patch<{ Params: { id: string }; Body: ToggleAvailabilityBody }>('/api/menu/:id/availability', { 
    preHandler: requireRole(['ADMIN', 'KITCHEN']),
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        required: ['isAvailable'],
        properties: {
          isAvailable: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { isAvailable } = request.body;

    try {
      const updatedItem = await prisma.menuItem.update({
        where: { id },
        data: { isAvailable },
      });

      // Broadcast changes to active customers and kitchen line displays
      const io = getIO();
      io.emit('menuItemAvailabilityChanged', { menuItemId: id, isAvailable });
      io.emit('menuUpdated', { restaurantId: updatedItem.restaurantId });

      return updatedItem;
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to toggle availability' });
    }
  });

  // Delete Menu Item (Admin protected)
  fastify.delete<{ Params: { id: string } }>('/api/menu/:id', { 
    preHandler: requireRole(['ADMIN']),
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    try {
      const item = await prisma.menuItem.findUnique({ where: { id } });
      if (!item) return reply.code(404).send({ error: 'Menu item not found' });
      
      await prisma.menuItem.delete({
        where: { id },
      });
      
      const io = getIO();
      if (io) {
        io.emit('menuUpdated', { restaurantId: item.restaurantId });
      }
      return reply.code(204).send();
    } catch (error: any) {
      fastify.log.error(error);
      if (error.code === 'P2003') {
        return reply.code(400).send({ error: 'Cannot delete a dish that has existing orders. Mark it as out-of-stock instead.' });
      }
      return reply.code(500).send({ error: 'Failed to delete menu item' });
    }
  });

  // Table Token specific menu route (Requested by user requirements)
  fastify.get<{ Params: { tableToken: string } }>('/api/table/:tableToken/menu', {
    schema: {
      params: {
        type: 'object',
        required: ['tableToken'],
        properties: {
          tableToken: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { tableToken } = request.params;

    try {
      // 1. Verify table exists via token
      const table = await prisma.table.findUnique({
        where: { token: tableToken },
        select: { restaurantId: true }
      });

      if (!table) {
        return reply.code(404).send({ error: 'Invalid or inactive table token' });
      }

      // 2. Fetch the menu items for that specific restaurant
      const items = await prisma.menuItem.findMany({
        where: { restaurantId: table.restaurantId, isAvailable: true },
        orderBy: { name: 'asc' },
      });
      
      return items;
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch table menu items' });
    }
  });
};

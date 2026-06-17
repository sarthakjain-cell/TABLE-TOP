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

interface UpdateSettingsBody {
  establishmentType: 'RESTAURANT' | 'HOTEL';
  paymentMode?: 'PRE_PAY' | 'POST_PAY';
  roomServiceFee?: number;
  upiId?: string;
  merchantName?: string;
  logoUrl?: string;
}

export const restaurantRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Temporary route to create HOTEL01 in production DB
  fastify.get('/api/fix-sarthakjain', async (request, reply) => {
    try {
      await prisma.restaurant.update({
        where: { id: 'SARTHAKJAIN01' },
        data: { establishmentType: 'RESTAURANT', operationalMode: 'FULL_SERVICE' }
      });
      return reply.send({ success: true, message: 'Fixed SARTHAKJAIN01 back to RESTAURANT' });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.get('/api/create-hotel-account', async (request, reply) => {
    try {
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('HOTEL01', 10);
      const restaurant = await prisma.restaurant.upsert({
        where: { id: 'HOTEL01' },
        update: { passcodeHash: hash },
        create: { id: 'HOTEL01', name: 'TableTop Hotel', passcodeHash: hash, taxRate: 0.12, operationalMode: 'FULL_SERVICE', establishmentType: 'HOTEL', paymentMode: 'POST_PAY' }
      });
      return reply.send({ success: true, message: 'Hotel account created successfully!', id: restaurant.id });
    } catch(err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });

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
          tables: {
            include: {
              sessions: {
                where: { status: 'ACTIVE' },
                include: {
                  orders: {
                    include: {
                      items: {
                        include: { menuItem: true }
                      }
                    }
                  }
                }
              }
            }
          }
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
    
    if (request.user!.restaurantId !== id) {
      return reply.code(403).send({ error: 'Forbidden: Cannot access transactions for a different restaurant' });
    }

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

    if (request.user!.restaurantId !== id) {
      return reply.code(403).send({ error: 'Forbidden: Cannot update mode for a different restaurant' });
    }

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

  // Update Settings (Establishment Type & Delivery Fee)
  fastify.patch<{ Params: { id: string }; Body: UpdateSettingsBody }>('/api/restaurants/:id/settings', { preHandler: requireRole(['ADMIN']) }, async (request, reply) => {
    const { id } = request.params;
    const { establishmentType, paymentMode, roomServiceFee, upiId, merchantName, logoUrl } = request.body;

    if (request.user!.restaurantId !== id) {
      return reply.code(403).send({ error: 'Forbidden: Cannot update settings for a different restaurant' });
    }

    if (establishmentType !== 'RESTAURANT' && establishmentType !== 'HOTEL') {
      return reply.code(400).send({ error: 'Invalid establishment type' });
    }

    try {
      const data: any = { establishmentType };
      if (paymentMode !== undefined) {
        data.paymentMode = paymentMode;
      }
      if (roomServiceFee !== undefined) {
        data.roomServiceFee = roomServiceFee;
      }
      if (upiId !== undefined) {
        data.upiId = upiId;
      }
      if (merchantName !== undefined) {
        data.merchantName = merchantName;
      }
      if (logoUrl !== undefined) {
        data.logoUrl = logoUrl;
      }

      const updatedRestaurant = await prisma.restaurant.update({
        where: { id },
        data,
      });

      const io = getIO();
      io.emit('establishmentSettingsChanged', { 
        restaurantId: id, 
        establishmentType,
        paymentMode: updatedRestaurant.paymentMode,
        roomServiceFee: updatedRestaurant.roomServiceFee,
        upiId: updatedRestaurant.upiId,
        merchantName: updatedRestaurant.merchantName,
        logoUrl: updatedRestaurant.logoUrl
      });

      return updatedRestaurant;
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to update settings' });
    }
  });
};

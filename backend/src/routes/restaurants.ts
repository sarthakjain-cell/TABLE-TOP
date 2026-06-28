import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { Decimal } from 'decimal.js';
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
  fastify.post<{ Body: RestaurantBody }>('/api/restaurants', { preHandler: requireRole(['SUPER_ADMIN']) }, async (request, reply) => {
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

  // Get all restaurants (Super Admin only)
  fastify.get('/api/restaurants', { preHandler: requireRole(['SUPER_ADMIN']) }, async (request, reply) => {
    try {
      const restaurants = await prisma.restaurant.findMany();
      return restaurants;
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch restaurants' });
    }
  });

  // Update Passcodes (Super Admin only)
  fastify.patch<{ Params: { id: string }; Body: { type: 'MANAGER' | 'WAITER' | 'KITCHEN'; passcode: string } }>('/api/restaurants/:id/passcode', { preHandler: requireRole(['SUPER_ADMIN']) }, async (request, reply) => {
    const { id } = request.params;
    const { type, passcode } = request.body;
    
    try {
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash(passcode, 10);
      let data: any = {};
      if (type === 'MANAGER') data.passcodeHash = hash;
      else if (type === 'WAITER') data.waiterPasscodeHash = hash;
      else if (type === 'KITCHEN') data.kitchenPasscodeHash = hash;

      const restaurant = await prisma.restaurant.update({
        where: { id },
        data
      });
      return reply.send({ success: true });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to update passcode' });
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
                  transactions: { include: { paymentItems: true } },
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
  fastify.get<{ Params: { id: string } }>('/api/restaurants/:id/transactions', { preHandler: requireRole(['MANAGER', 'SUPER_ADMIN']) }, async (request, reply) => {
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

      return transactions.map(tx => {
        const amt = new Decimal(tx.amount?.toString() || '0');
        const tip = new Decimal(tx.tipAmount?.toString() || '0');
        return {
          ...tx,
          amount: amt.sub(tip).toNumber()
        };
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch transactions' });
    }
  });

  // Toggle/Update Operational Mode (Admin protected)
  fastify.patch<{ Params: { id: string }; Body: UpdateModeBody }>('/api/restaurants/:id/mode', { preHandler: requireRole(['MANAGER', 'SUPER_ADMIN']) }, async (request, reply) => {
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
  fastify.patch<{ Params: { id: string }; Body: UpdateSettingsBody }>('/api/restaurants/:id/settings', { preHandler: requireRole(['MANAGER', 'SUPER_ADMIN']) }, async (request, reply) => {
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
  // Calculate AI ROI
  fastify.get<{ Params: { id: string } }>('/api/restaurants/:id/ai-roi', { preHandler: requireRole(['MANAGER', 'SUPER_ADMIN']) }, async (request, reply) => {
    const { id } = request.params;
    
    try {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const ordersWithMLItems = await prisma.orderItem.findMany({
        where: {
          addedVia: 'ML_WIDGET',
          createdAt: {
            gte: firstDayOfMonth
          },
          order: {
            status: { not: 'PENDING' },
            session: {
              restaurantId: id
            }
          }
        }
      });
      
      let totalROI = 0;
      for (const item of ordersWithMLItems) {
        totalROI += (Number(item.price) * Number(item.quantity));
      }
      
      return { totalRevenue: totalROI };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to calculate AI ROI' });
    }
  });
};

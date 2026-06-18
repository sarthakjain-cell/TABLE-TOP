import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../prisma';
import { getIO } from '../socket';
import { Decimal } from 'decimal.js';
import { requireRole, verifyTableSession } from '../middleware/auth';

interface OrderItemInput {
  menuItemId: string;
  quantity: number;
  modifications?: string[];
}

interface CreateOrderBody {
  sessionId: string;
  items: OrderItemInput[];
}

interface UpdateStatusBody {
  status: 'PAYMENT_PENDING' | 'NEW' | 'PREPARING' | 'READY_TO_SERVE' | 'COMPLETED';
}

export const orderRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Place a new order for a table session (QR Token validation protected)
  fastify.post<{ Body: CreateOrderBody }>('/api/orders', { preHandler: verifyTableSession }, async (request, reply) => {
    const { sessionId, items } = request.body;

    if (!sessionId || !items || !items.length) {
      return reply.code(400).send({ error: 'sessionId and items array are required' });
    }

    try {
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { table: { include: { restaurant: true } } }
      });

      if (!session || session.status === 'CLOSED') {
        return reply.code(400).send({ error: 'Invalid or closed session' });
      }

      // Capture active prices from the menu database to avoid pricing anomalies on subsequent updates
      const menuItemIds = items.map(i => i.menuItemId);
      const menuItems = await prisma.menuItem.findMany({
        where: { id: { in: menuItemIds } }
      });

      const menuMap = new Map(menuItems.map(item => [item.id, item]));

      // Create Order and OrderItems atomically
      const order = await prisma.order.create({
        data: {
          sessionId,
          status: session.table.restaurant.paymentMode === 'PRE_PAY' ? 'PAYMENT_PENDING' : 'NEW',
          items: {
            create: items.map(item => {
              const dbItem = menuMap.get(item.menuItemId);
              if (!dbItem) {
                throw new Error(`MenuItem ${item.menuItemId} not found`);
              }
              if (!dbItem.isAvailable) {
                throw new Error(`MenuItem ${dbItem.name} is currently out of stock ("86ed")`);
              }
              return {
                menuItemId: item.menuItemId,
                quantity: new Decimal(item.quantity.toString()),
                price: dbItem.price,
                modifications: item.modifications || []
              };
            })
          }
        },
        include: {
          items: {
            include: {
              menuItem: true
            }
          }
        }
      });

      const io = getIO();
      // Notify customer session room that order status is set to NEW
      const newStatus = session.table.restaurant.paymentMode === 'PRE_PAY' ? 'PAYMENT_PENDING' : 'NEW';
      io.to(`session:${sessionId}`).emit('orderStatusUpdated', { orderId: order.id, status: newStatus });

      // Notify Kitchen line displays about the new incoming ticket with full details (excluding sensitive customer PII)
      // Contains table number, items, quantities, modifications, and order timestamp
      io.emit('orderStatusUpdated', {
        orderId: order.id,
        status: newStatus,
        tableNumber: session.table.number,
        restaurantId: session.restaurantId,
        items: order.items.map(i => ({
          name: i.menuItem.name,
          quantity: new Decimal(i.quantity.toString()).toNumber(),
          modifications: i.modifications
        })),
        createdAt: order.createdAt
      });

      return reply.code(201).send(order);
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: error.message || 'Failed to place order' });
    }
  });

  // Get active orders for a restaurant (primarily for kitchen displaying tickets)
  fastify.get<{ Querystring: { restaurantId: string } }>('/api/orders/active', { preHandler: requireRole(['ADMIN', 'KITCHEN']) }, async (request, reply) => {
    const { restaurantId } = request.query;

    if (!restaurantId) {
      return reply.code(400).send({ error: 'restaurantId is required' });
    }

    try {
      const orders = await prisma.order.findMany({
        where: {
          session: {
            restaurantId,
            status: 'ACTIVE'
          },
          status: {
            in: ['PAYMENT_PENDING', 'NEW', 'PREPARING', 'READY_TO_SERVE']
          }
        },
        include: {
          session: {
            include: {
              table: true,
              transactions: {
                orderBy: {
                  createdAt: 'desc'
                },
                take: 1
              }
            }
          },
          items: {
            include: {
              menuItem: true
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      });

      // Privacy-first mapping: strip diner names, transaction sums, etc. for kitchen staff displays
      const kitchenTickets = orders.map(order => ({
        id: order.id,
        tableNumber: order.session.table.number,
        status: order.status,
        paymentMethod: order.paymentMethod,
        totalAmount: order.session.transactions.length > 0 ? order.session.transactions[0].amount.toString() : undefined,
        createdAt: order.createdAt,
        items: order.items.map(item => ({
          id: item.id,
          name: item.menuItem.name,
          quantity: new Decimal(item.quantity.toString()).toNumber(),
          modifications: item.modifications,
          isServed: item.isServed
        })),
        guestClaim: order.session.transactions.length > 0 && (order.session.transactions[0].customerName || order.session.transactions[0].customerPhone) ? {
          name: order.session.transactions[0].customerName || '',
          room: order.session.transactions[0].customerPhone || order.session.table.number
        } : undefined
      }));

      return kitchenTickets;
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch active kitchen tickets' });
    }
  });

  interface UpdateStatusBody {
    status: 'PAYMENT_PENDING' | 'NEW' | 'PREPARING' | 'READY_TO_SERVE' | 'COMPLETED';
  }

  // Update order status (Kitchen Line interactions)
  fastify.patch<{ Params: { id: string }; Body: UpdateStatusBody }>('/api/orders/:id/status', { preHandler: requireRole(['ADMIN', 'KITCHEN']) }, async (request, reply) => {
    const { id } = request.params;
    const { status } = request.body;

    if (!status) {
      return reply.code(400).send({ error: 'status is required' });
    }

    try {
      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          session: {
            include: {
              table: {
                include: {
                  restaurant: true
                }
              }
            }
          }
        }
      });

      if (!order) {
        return reply.code(404).send({ error: 'Order not found' });
      }

      const updatedOrder = await prisma.order.update({
        where: { id },
        data: { status },
        include: {
          items: {
            include: {
              menuItem: true
            }
          }
        }
      });

      // If the order was PAYMENT_PENDING and is now transitioning forward, finalize its PENDING transaction
      if (order.status === 'PAYMENT_PENDING' && status !== 'PAYMENT_PENDING') {
        const pendingTx = await prisma.transaction.findFirst({
          where: { sessionId: order.sessionId, status: 'PENDING' }
        });
        if (pendingTx) {
          await prisma.transaction.update({
            where: { id: pendingTx.id },
            data: { status: 'COMPLETED' }
          });
          

        }
      }

      const io = getIO();
      const sessionRoom = `session:${order.sessionId}`;
      const restaurantMode = order.session.table.restaurant.operationalMode;

      // Broadcast state update
      io.to(sessionRoom).emit('orderStatusUpdated', { orderId: id, status });
      io.emit('orderStatusUpdated', { orderId: id, status });

      if (status === 'NEW') {
        io.emit('newOrderReceived', {
          order: {
            id: updatedOrder.id,
            status: 'NEW',
            tableNumber: order.session.table.number,
            restaurantId: order.session.table.restaurant.id,
            items: updatedOrder.items.map(i => ({
              id: i.id,
              name: i.menuItem.name,
              quantity: new Decimal(i.quantity.toString()).toNumber(),
              modifications: i.modifications
            })),
            createdAt: updatedOrder.createdAt
          }
        });
      }

      // Special alert broadcast for self-service pickup triggers
      if (status === 'READY_TO_SERVE' && restaurantMode === 'SELF_SERVICE') {
        io.to(sessionRoom).emit('pickupReady', {
          orderId: id,
          tableNumber: order.session.table.number
        });
      }

      return updatedOrder;
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to update order status' });
    }
  });

  // Toggle individual dish delivery status
  fastify.patch<{ Params: { id: string }; Body: { isServed: boolean } }>('/api/order-items/:id/served', { preHandler: requireRole(['ADMIN', 'KITCHEN']) }, async (request, reply) => {
    const { id } = request.params;
    const { isServed } = request.body;

    if (typeof isServed !== 'boolean') {
      return reply.code(400).send({ error: 'isServed boolean is required' });
    }

    try {
      const updatedItem = await prisma.orderItem.update({
        where: { id },
        data: { isServed }
      });
      return updatedItem;
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to update item served status' });
    }
  });
};

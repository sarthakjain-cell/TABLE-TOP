import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../prisma';
import { getIO } from '../socket';

export const sessionRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Get details of a specific session (includes orders, order items, and transactions)
  fastify.get<{ Params: { id: string } }>('/api/sessions/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const session = await prisma.session.findUnique({
        where: { id },
        include: {
          table: true,
          orders: {
            include: {
              items: {
                include: {
                  menuItem: true,
                },
              },
            },
          },
          transactions: {
            include: {
              paymentItems: true,
            },
          },
        },
      });

      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      return session;
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch session' });
    }
  });

  // Close session manually (also vacates table)
  fastify.patch<{ Params: { id: string } }>('/api/sessions/:id/close', async (request, reply) => {
    const { id } = request.params;

    try {
      const session = await prisma.session.findUnique({
        where: { id },
      });

      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      if (session.status === 'CLOSED') {
        return reply.code(400).send({ error: 'Session is already closed' });
      }

      const updatedSession = await prisma.session.update({
        where: { id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
        },
      });

      // Vacate the associated table
      const updatedTable = await prisma.table.update({
        where: { id: session.tableId },
        data: { status: 'VACANT' },
      });

      const io = getIO();
      io.emit('helpRequested', {
        tableNumber: updatedTable.number,
        requestType: 'CHECKOUT_COMPLETE'
      });
      io.to(`session:${id}`).emit('orderStatusUpdated', {
        orderId: 'SESSION_COMPLETE',
        status: 'COMPLETED'
      });

      return updatedSession;
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to close session' });
    }
  });
};

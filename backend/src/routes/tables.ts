import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../prisma';
import { signTableToken, verifyTableToken } from '../utils/token';
import { requireRole } from '../middleware/auth';

interface CreateTableBody {
  number: string;
}

interface UpdateStatusBody {
  status: 'VACANT' | 'OCCUPIED';
}

export const tableRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Create a new table and generate its secure QR token (Admin protected)
  fastify.post<{ Body: CreateTableBody }>('/api/tables', { preHandler: requireRole(['MANAGER', 'SUPER_ADMIN']) }, async (request, reply) => {
    const { number } = request.body;
    const restaurantId = request.user!.restaurantId;

    if (!number) {
      return reply.code(400).send({ error: 'Table number is required' });
    }

    try {
      // Temporary UUID to generate the signature safely, or create first then update token
      const table = await prisma.table.create({
        data: {
          number,
          restaurantId,
          token: `TEMP_TOKEN_${Date.now()}_${Math.random()}`
        }
      });

      // Generate the signed table token with the actual DB table.id
      const secureToken = signTableToken(restaurantId, table.id, number);

      // Save the signed token
      const updatedTable = await prisma.table.update({
        where: { id: table.id },
        data: { token: secureToken }
      });

      // Construct a URL for the QR Code engine
      const hostUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const qrCodeUrl = `${hostUrl}/table/${secureToken}`;

      return reply.code(201).send({
        table: updatedTable,
        qrCodeUrl,
        secureToken
      });
    } catch (error: any) {
      fastify.log.error(error);
      if (error.code === 'P2002') {
        return reply.code(409).send({ error: 'A table with this number already exists in this restaurant' });
      }
      return reply.code(500).send({ error: 'Failed to create table' });
    }
  });

  // Verify signed QR token and retrieve table info + active session
  const verifyTokenHandler = async (request: any, reply: any) => {
    const token = 
      request.query?.token || 
      request.body?.token || 
      request.headers['x-table-token'];

    if (!token) {
      return reply.code(400).send({ error: 'Token is required (query parameter, body, or x-table-token header)' });
    }

    const decoded = verifyTableToken(token);
    if (!decoded) {
      return reply.code(401).send({ error: 'Invalid or tampered table token' });
    }

    try {
      const table = await prisma.table.findUnique({
        where: { id: decoded.tableId },
        include: {
          restaurant: true,
          sessions: {
            where: { status: 'ACTIVE' },
            include: {
              orders: {
                include: {
                  items: {
                    include: {
                      menuItem: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!table) {
        return reply.code(404).send({ error: 'Table referenced in token no longer exists' });
      }

      // If no active session exists for this table, we automatically initialize one
      let activeSession = table.sessions[0];
      if (!activeSession) {
        activeSession = await prisma.session.create({
          data: {
            tableId: table.id,
            restaurantId: table.restaurantId,
            status: 'ACTIVE'
          },
          include: {
            orders: {
              include: {
                items: {
                  include: {
                    menuItem: true
                  }
                }
              }
            }
          }
        });
        
        // Update table status to occupied since we initiated an active session
        await prisma.table.update({
          where: { id: table.id },
          data: { status: 'OCCUPIED' }
        });
      }

      return {
        tableId: table.id,
        tableNumber: table.number,
        restaurant: table.restaurant,
        session: activeSession
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to verify table' });
    }
  };

  fastify.get('/api/tables/verify', verifyTokenHandler);
  fastify.post('/api/tables/verify', verifyTokenHandler);

  // Explicitly update table status (Vacant / Occupied)
  fastify.patch<{ Params: { id: string }; Body: UpdateStatusBody }>('/api/tables/:id/status', { preHandler: requireRole(['MANAGER', 'SUPER_ADMIN', 'WAITER', 'KITCHEN']) }, async (request, reply) => {
    const { id } = request.params;
    const { status } = request.body;
    const restaurantId = request.user!.restaurantId;

    if (status !== 'VACANT' && status !== 'OCCUPIED') {
      return reply.code(400).send({ error: 'Invalid table status' });
    }

    try {
      const existingTable = await prisma.table.findUnique({ where: { id } });
      if (!existingTable || existingTable.restaurantId !== restaurantId) {
        return reply.code(403).send({ error: 'Forbidden: Table does not belong to this restaurant' });
      }

      const updatedTable = await prisma.table.update({
        where: { id },
        data: { status }
      });
      return updatedTable;
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to update table status' });
    }
  });

  // Delete a table
  fastify.delete<{ Params: { id: string } }>('/api/tables/:id', { preHandler: requireRole(['MANAGER', 'SUPER_ADMIN']) }, async (request, reply) => {
    const { id } = request.params;

    try {
      const table = await prisma.table.findUnique({
        where: { id },
        include: {
          sessions: {
            where: { status: 'ACTIVE' }
          }
        }
      });

      if (!table) {
        return reply.code(404).send({ error: 'Table not found' });
      }

      if (table.restaurantId !== request.user!.restaurantId) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      if (table.sessions.length > 0) {
        return reply.code(400).send({ error: 'Cannot delete table with an active session. Close the session first.' });
      }

      await prisma.table.delete({ where: { id } });
      return reply.code(204).send();
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to delete table' });
    }
  });
};

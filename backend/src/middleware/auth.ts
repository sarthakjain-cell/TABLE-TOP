import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyTableToken, verifyUserToken } from '../utils/token';
import { prisma } from '../prisma';

declare module 'fastify' {
  interface FastifyRequest {
    tableContext?: {
      restaurantId: string;
      tableId: string;
      tableNumber: string;
      sessionId: string;
    };
    user?: {
      userId: string;
      role: 'ADMIN' | 'KITCHEN';
      restaurantId: string;
    };
  }
}

/**
 * Fastify preHandler hook to verify table tokens and ensure an active dining session exists.
 * Attaches the verified session context directly to request.tableContext.
 */
export async function verifyTableSession(request: FastifyRequest, reply: FastifyReply) {
  const token = 
    (request.headers['x-table-token'] as string) || 
    (request.query as any).token || 
    (request.body as any)?.token;

  if (!token) {
    return reply.code(401).send({ error: 'Missing secure table token' });
  }

  const decoded = verifyTableToken(token);
  if (!decoded) {
    return reply.code(401).send({ error: 'Invalid or expired table token' });
  }

  try {
    // Find the active session for the table
    const session = await prisma.session.findFirst({
      where: {
        tableId: decoded.tableId,
        status: 'ACTIVE'
      }
    });

    if (!session) {
      return reply.code(403).send({ 
        error: 'No active session found for this table. Please scan the QR code to re-initialize your session.' 
      });
    }

    request.tableContext = {
      restaurantId: decoded.restaurantId,
      tableId: decoded.tableId,
      tableNumber: decoded.tableNumber,
      sessionId: session.id
    };
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: 'Internal server verification error' });
  }
}

/**
 * Fastify preHandler hook to require specific user roles (ADMIN, KITCHEN).
 * Parses "Bearer <token>" from Authorization header.
 */
export function requireRole(allowedRoles: ('ADMIN' | 'KITCHEN')[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers['authorization'];
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing or malformed Authorization header' });
    }

    const token = authHeader.substring(7).trim();
    const decoded = verifyUserToken(token);
    
    if (!decoded) {
      return reply.code(401).send({ error: 'Invalid or expired authentication token' });
    }

    if (!allowedRoles.includes(decoded.role)) {
      return reply.code(403).send({ error: 'Forbidden: Insufficient privileges' });
    }

    request.user = decoded;
  };
}

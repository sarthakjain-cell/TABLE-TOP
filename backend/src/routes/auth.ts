import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../prisma';
import { signUserToken } from '../utils/token';
import bcrypt from 'bcrypt';

interface LoginBody {
  restaurantId: string;
  passcode: string;
}

export const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.post<{ Body: LoginBody }>('/api/auth/login', async (request, reply) => {
    const { restaurantId, passcode } = request.body;
    
    if (!restaurantId || !passcode) {
      return reply.code(400).send({ error: 'Restaurant ID and Passcode are required.' });
    }

    try {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId }
      });

      if (!restaurant) {
        return reply.code(404).send({ error: 'Restaurant not found.' });
      }

      if (!restaurant.passcodeHash) {
        // For development/migration fallback if no passcode is set
        if (passcode !== '0000') {
           return reply.code(401).send({ error: 'Invalid passcode.' });
        }
      } else {
        const isValid = await bcrypt.compare(passcode, restaurant.passcodeHash);
        if (!isValid) {
          return reply.code(401).send({ error: 'Invalid passcode.' });
        }
      }

      // We consider anyone logging into the restaurant dashboard an ADMIN for now
      const token = signUserToken('admin-user', 'ADMIN', restaurant.id);

      return reply.send({
        token,
        restaurant: {
          id: restaurant.id,
          name: restaurant.name
        }
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal server error during login.' });
    }
  });
};

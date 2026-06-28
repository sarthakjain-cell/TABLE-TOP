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
      // Accept either the Railway environment variable OR a hardcoded fallback to bypass deployment issues
      if (restaurantId === 'SUPER' && (passcode === process.env.SUPER_ADMIN_PASSCODE || passcode === 'SARTHAKJAIN01')) {
        const token = signUserToken('super-admin', 'SUPER_ADMIN', 'ALL');
        return reply.send({ token, role: 'SUPER_ADMIN', restaurant: { id: 'ALL', name: 'Super Admin' } });
      }

      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId }
      });

      if (!restaurant) {
        return reply.code(404).send({ error: 'Restaurant not found.' });
      }

      let assignedRole: 'MANAGER' | 'WAITER' | 'KITCHEN' | null = null;

      // Fallback for development if no passcode is set
      if (!restaurant.passcodeHash && passcode === '0000') {
          assignedRole = 'MANAGER';
      } else {
        // Check Manager Passcode
        if (restaurant.passcodeHash && await bcrypt.compare(passcode, restaurant.passcodeHash)) {
          assignedRole = 'MANAGER';
        }
        // Check Waiter Passcode
        else if (restaurant.waiterPasscodeHash && await bcrypt.compare(passcode, restaurant.waiterPasscodeHash)) {
          assignedRole = 'WAITER';
        }
        // Check Kitchen Passcode
        else if (restaurant.kitchenPasscodeHash && await bcrypt.compare(passcode, restaurant.kitchenPasscodeHash)) {
          assignedRole = 'KITCHEN';
        }
      }

      if (!assignedRole) {
        return reply.code(401).send({ error: 'Invalid passcode.' });
      }

      const token = signUserToken(`${assignedRole.toLowerCase()}-user`, assignedRole, restaurant.id);

      return reply.send({
        token,
        role: assignedRole,
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

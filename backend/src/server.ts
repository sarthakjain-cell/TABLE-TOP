import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createServer } from 'http';
import { initSocketIO } from './socket';

import { restaurantRoutes } from './routes/restaurants';
import { tableRoutes } from './routes/tables';
import { menuRoutes } from './routes/menu';
import { sessionRoutes } from './routes/sessions';
import { orderRoutes } from './routes/orders';
import { billingRoutes } from './routes/billing';
import { webhookRoutes } from './routes/webhook';
import { authRoutes } from './routes/auth';
import { financeRoutes } from './routes/finance';
import { receiptRoutes } from './routes/receipts';
import { seedRoutes } from './routes/seed';
import uploadRoutes from './routes/upload';
import fastifyMultipart from '@fastify/multipart';

const fastify = Fastify({
  maxParamLength: 1000,
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty'
    }
  }
});

// Register Multipart for File Uploads
fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// CORS Configuration
fastify.register(cors, {
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
});

// Initialize Socket.io with the underlying Fastify HTTP server
initSocketIO(fastify.server, fastify);

// Register API Route Plugins
fastify.register(restaurantRoutes);
fastify.register(tableRoutes);
fastify.register(menuRoutes);
fastify.register(sessionRoutes);
fastify.register(orderRoutes);
fastify.register(billingRoutes);
fastify.register(webhookRoutes);
fastify.register(authRoutes);
fastify.register(financeRoutes);
fastify.register(seedRoutes);
fastify.register(receiptRoutes);
fastify.register(uploadRoutes);

// Health Check Endpoint
fastify.get('/health', async () => {
  return { status: 'ok', uptime: process.uptime() };
});

const PORT = Number(process.env.PORT) || 5000;

const start = async () => {
  try {
    await fastify.ready();
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

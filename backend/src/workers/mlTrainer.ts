import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

// Schedule: 0 3 * * 1 means "At 03:00 on Monday."
// Adjust timezone if necessary via cron options if running on UTC servers.
export const startMlTrainerCron = () => {
  cron.schedule('0 3 * * 1', async () => {
    console.log('[CRON] Starting weekly ML Apriori Training Pipeline...');
    try {
      // Get all active restaurants
      const restaurants = await prisma.restaurant.findMany({
        select: { id: true, name: true }
      });

      const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

      for (const restaurant of restaurants) {
        console.log(`[CRON] Triggering training for ${restaurant.name} (${restaurant.id})...`);
        try {
          const res = await axios.post(`${ML_SERVICE_URL}/train?restaurant_id=${restaurant.id}`);
          console.log(`[CRON] Success for ${restaurant.name}:`, res.data);
        } catch (err: any) {
          console.error(`[CRON] Failed for ${restaurant.name}:`, err?.response?.data || err.message);
        }
      }
      
      console.log('[CRON] Weekly ML Pipeline Execution completed.');
    } catch (err) {
      console.error('[CRON] Critical failure in ML Trainer:', err);
    }
  });

  console.log('Registered Cron Job: ML Apriori Trainer (Every Monday at 3:00 AM)');
};

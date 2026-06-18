import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../prisma';

export const seedRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.post('/api/seed/orders', async (request, reply) => {
    try {
      const { restaurantId } = request.body as { restaurantId: string };
      if (!restaurantId) return reply.code(400).send({ error: 'Missing restaurantId' });

      // Check if restaurant exists
      const rest = await prisma.restaurant.findUnique({ where: { id: restaurantId }, include: { menuItems: true, tables: true } });
      if (!rest) return reply.code(404).send({ error: 'Restaurant not found' });

      if (rest.menuItems.length === 0) {
        return reply.code(400).send({ error: 'Restaurant has no menu items. Seed menu items first.' });
      }

      if (rest.tables.length === 0) {
        // create two dummy tables
        await prisma.table.createMany({
          data: [
            { restaurantId, number: '1', token: 'dummy_token_1_' + Date.now() },
            { restaurantId, number: '2', token: 'dummy_token_2_' + Date.now() }
          ]
        });
      }

      const tables = await prisma.table.findMany({ where: { restaurantId } });
      const dishes = rest.menuItems;

      // Seed 50 orders (scaled down for API timeout reasons)
      let count = 0;
      const numSessions = 50;

      for (let i = 0; i < numSessions; i++) {
        const table = tables[Math.floor(Math.random() * tables.length)];
        const session = await prisma.session.create({
          data: {
            restaurantId,
            tableId: table.id,
            status: 'CLOSED',
            createdAt: new Date(Date.now() - Math.random() * 10000000000)
          }
        });

        // generate orders
        const numOrders = Math.floor(Math.random() * 3) + 1;
        let totalAmount = 0;
        
        for (let o = 0; o < numOrders; o++) {
          const numItems = Math.floor(Math.random() * 4) + 1;
          const orderItemsData = [];
          let orderTotal = 0;
          for (let k = 0; k < numItems; k++) {
            const dish = dishes[Math.floor(Math.random() * dishes.length)];
            orderItemsData.push({
              menuItemId: dish.id,
              quantity: 1,
              price: dish.price
            });
            orderTotal += Number(dish.price);
          }
          totalAmount += orderTotal;

          await prisma.order.create({
            data: {
              sessionId: session.id,
              status: 'COMPLETED',
              items: { create: orderItemsData },
              createdAt: session.createdAt
            }
          });
        }

        // generate transaction
        await prisma.transaction.create({
          data: {
            sessionId: session.id,
            amount: totalAmount.toFixed(2),
            taxPaid: (totalAmount * 0.05).toFixed(2),
            status: 'COMPLETED',
            paymentMethod: 'ONLINE',
            deliveryFeeApplied: 0,
            createdAt: session.createdAt
          }
        });
        count++;
      }

      return reply.send({ success: true, message: `Seeded ${count} fake sessions with orders for ${restaurantId}` });
    } catch (err: any) {
      console.error(err);
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.post('/api/seed/menu', async (request, reply) => {
    try {
      const { restaurantId } = request.body as { restaurantId: string };
      if (!restaurantId) return reply.code(400).send({ error: 'Missing restaurantId' });

      const fakeDishes = [
        { name: "Classic Beef Burger", price: 12.99, category: "Burgers", isVeg: false, restaurantId },
        { name: "Chicken Tikka Masala", price: 15.50, category: "Main Course", isVeg: false, restaurantId },
        { name: "Margherita Pizza", price: 11.00, category: "Pizza", isVeg: true, restaurantId },
        { name: "Caesar Salad", price: 8.50, category: "Salads", isVeg: true, restaurantId },
        { name: "French Fries", price: 4.99, category: "Sides", isVeg: true, restaurantId },
        { name: "Chocolate Lava Cake", price: 7.50, category: "Desserts", isVeg: true, restaurantId },
        { name: "Garlic Bread", price: 5.00, category: "Sides", isVeg: true, restaurantId },
        { name: "Cola", price: 2.50, category: "Beverages", isVeg: true, restaurantId },
        { name: "Mango Lassi", price: 4.00, category: "Beverages", isVeg: true, restaurantId },
        { name: "Paneer Butter Masala", price: 14.00, category: "Main Course", isVeg: true, restaurantId }
      ];

      await prisma.menuItem.createMany({ data: fakeDishes });

      return reply.send({ success: true, message: `Seeded 10 fake dishes for ${restaurantId}` });
    } catch (err: any) {
      console.error(err);
      return reply.code(500).send({ error: err.message });
    }
  });
};

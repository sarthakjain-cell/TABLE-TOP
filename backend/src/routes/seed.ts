import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../prisma';

export const seedRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get('/api/seed/orders', async (request, reply) => {
    try {
      const { restaurantId } = request.query as { restaurantId: string };
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

  fastify.get('/api/seed/menu', async (request, reply) => {
    try {
      const { restaurantId } = request.query as { restaurantId: string };
      if (!restaurantId) return reply.code(400).send({ error: 'Missing restaurantId' });

      const adjectives = ['Spicy', 'Crispy', 'Smoky', 'Sweet', 'Tangy', 'Savory', 'Zesty', 'Classic', 'Royal', 'Ultimate', 'Fresh', 'Roasted', 'Grilled', 'Vegan', 'Chef Special', 'Homestyle', 'Premium', 'Signature', 'Spiced', 'Buttery'];
      const nouns = ['Burger', 'Pizza', 'Pasta', 'Salad', 'Wrap', 'Taco', 'Curry', 'Noodles', 'Sandwich', 'Bowl'];
      const categories = ['Main Course', 'Appetizers', 'Desserts', 'Beverages'];

      const fakeDishes = [];
      for (let i = 0; i < adjectives.length; i++) {
        for (let j = 0; j < nouns.length; j++) {
          fakeDishes.push({
            name: `${adjectives[i]} ${nouns[j]}`,
            price: Number((Math.random() * 20 + 5).toFixed(2)),
            category: categories[Math.floor(Math.random() * categories.length)],
            isVeg: Math.random() > 0.5,
            restaurantId
          });
        }
      }

      // First, clean up all the exact names of the fake dishes we generated so we don't have redundancy
      const namesToDelete = [
        "Classic Beef Burger", "Chicken Tikka Masala", "Margherita Pizza", "Caesar Salad", 
        "French Fries", "Chocolate Lava Cake", "Garlic Bread", "Cola", "Mango Lassi", "Paneer Butter Masala",
        ...fakeDishes.map(d => d.name)
      ];

      // Find the IDs of the menu items to delete
      const itemsToDelete = await prisma.menuItem.findMany({
        where: { restaurantId, name: { in: namesToDelete } }
      });
      const itemIdsToDelete = itemsToDelete.map(item => item.id);

      if (itemIdsToDelete.length > 0) {
        // First delete OrderItemPayments because the database might not have the ON DELETE CASCADE constraint correctly applied
        const orderItems = await prisma.orderItem.findMany({
          where: { menuItemId: { in: itemIdsToDelete } },
          select: { id: true }
        });
        const orderItemIds = orderItems.map(oi => oi.id);

        if (orderItemIds.length > 0) {
          await prisma.orderItemPayment.deleteMany({
            where: { orderItemId: { in: orderItemIds } }
          });
          
          await prisma.orderItem.deleteMany({
            where: { id: { in: orderItemIds } }
          });
        }

        // Now safely delete the redundant menu items
        await prisma.menuItem.deleteMany({
          where: { id: { in: itemIdsToDelete } }
        });
      }

      // Insert the 200 clean dynamic dishes
      await prisma.menuItem.createMany({ data: fakeDishes });

      return reply.send({ success: true, message: `Cleaned up redundant data and successfully seeded ${fakeDishes.length} unique fake dishes for ${restaurantId}` });
    } catch (err: any) {
      console.error(err);
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.get('/api/seed-indian', async (request, reply) => {
    try {
      const { restaurantId } = request.query as { restaurantId: string };
      if (!restaurantId) return reply.code(400).send({ error: 'Missing restaurantId' });

      const menuData = [
        { name: 'Onion Bhaji', price: 6.95, category: 'Appetizers', isVeg: true },
        { name: 'Samosa Chat', price: 7.95, category: 'Appetizers', isVeg: true },
        { name: 'Paneer Pakora', price: 8.95, category: 'Appetizers', isVeg: true },
        { name: 'Gobi Pakora', price: 7.95, category: 'Appetizers', isVeg: true },
        { name: 'Lamb Samosa', price: 8.95, category: 'Appetizers', isVeg: false },
        { name: 'Alu Mater Samosa', price: 6.95, category: 'Appetizers', isVeg: true },
        { name: 'Dal Makhni', price: 13.95, category: 'Main Course', isVeg: true },
        { name: 'Paneer Butter Masala', price: 14.95, category: 'Main Course', isVeg: true },
        { name: 'Palak Paneer', price: 14.95, category: 'Main Course', isVeg: true },
        { name: 'Kadai Paneer', price: 14.95, category: 'Main Course', isVeg: true },
        { name: 'Malai Kofta', price: 14.95, category: 'Main Course', isVeg: true },
        { name: 'Butter Chicken', price: 16.95, category: 'Main Course', isVeg: false },
        { name: 'Chicken Tikka Masala', price: 16.95, category: 'Main Course', isVeg: false },
        { name: 'Lamb Rogan Josh', price: 18.95, category: 'Main Course', isVeg: false },
        { name: 'Goat Curry', price: 19.95, category: 'Main Course', isVeg: false },
        { name: 'Fish Curry', price: 17.95, category: 'Main Course', isVeg: false },
        { name: 'Garlic Naan', price: 3.95, category: 'Breads', isVeg: true },
        { name: 'Butter Naan', price: 3.50, category: 'Breads', isVeg: true },
        { name: 'Plain Naan', price: 2.95, category: 'Breads', isVeg: true },
        { name: 'Tandoori Roti', price: 2.95, category: 'Breads', isVeg: true },
        { name: 'Lacha Paratha', price: 4.95, category: 'Breads', isVeg: true },
        { name: 'Cheese Naan', price: 4.95, category: 'Breads', isVeg: true },
        { name: 'Mango Lassi', price: 4.95, category: 'Beverages', isVeg: true },
        { name: 'Sweet Lassi', price: 3.95, category: 'Beverages', isVeg: true },
        { name: 'Salted Lassi', price: 3.95, category: 'Beverages', isVeg: true },
        { name: 'Masala Chai', price: 2.95, category: 'Beverages', isVeg: true },
        { name: 'Diet Coke', price: 2.50, category: 'Beverages', isVeg: true },
        { name: 'Sprite', price: 2.50, category: 'Beverages', isVeg: true }
      ];

      // Delete existing menu items and their associated records
      const existingItems = await prisma.menuItem.findMany({ where: { restaurantId } });
      const itemIds = existingItems.map(item => item.id);
      
      if (itemIds.length > 0) {
        const orderItems = await prisma.orderItem.findMany({ where: { menuItemId: { in: itemIds } } });
        const orderItemIds = orderItems.map(oi => oi.id);
        
        if (orderItemIds.length > 0) {
          await prisma.orderItemPayment.deleteMany({ where: { orderItemId: { in: orderItemIds } } });
          await prisma.orderItem.deleteMany({ where: { id: { in: orderItemIds } } });
        }
        await prisma.menuItem.deleteMany({ where: { id: { in: itemIds } } });
      }

      // Create new Indian menu items
      await prisma.menuItem.createMany({
        data: menuData.map(item => ({ ...item, restaurantId }))
      });

      return reply.send({ success: true, message: `Successfully seeded Indian Menu for restaurant ${restaurantId}` });
    } catch (err: any) {
      console.error(err);
      return reply.code(500).send({ error: err.message });
    }
  });
};

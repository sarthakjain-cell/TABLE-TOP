const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const RESTAURANT_ID = 'HOTEL01'; // Assuming this is the test restaurant

const menuData = [
  // APPETIZERS
  { name: 'Alu Mater Samosa', price: 4.95, category: 'Appetizers', isVeg: true },
  { name: 'Lamb Samosa', price: 7.95, category: 'Appetizers', isVeg: false },
  { name: 'Gobi Pakora', price: 4.95, category: 'Appetizers', isVeg: true },
  { name: 'Paneer Pakora', price: 6.95, category: 'Appetizers', isVeg: true },
  { name: 'Samosa Chat', price: 9.95, category: 'Appetizers', isVeg: true },
  { name: 'Shrimp Manchoorian', price: 13.95, category: 'Appetizers', isVeg: false },
  { name: 'Paneer Tikka', price: 12.95, category: 'Appetizers', isVeg: true },
  { name: 'Chicken Kabob', price: 12.95, category: 'Appetizers', isVeg: false },

  // BREADS
  { name: 'Garlic Naan', price: 4.50, category: 'Breads', isVeg: true },
  { name: 'Naan', price: 3.95, category: 'Breads', isVeg: true },
  { name: 'Tandoori Roti', price: 2.95, category: 'Breads', isVeg: true },
  { name: 'Keema Naan', price: 5.95, category: 'Breads', isVeg: false },
  { name: 'Alu Paratha', price: 4.95, category: 'Breads', isVeg: true },

  // TANDOOR
  { name: 'Chicken Tandoori', price: 15.95, category: 'Straight Outta Tandoor', isVeg: false },
  { name: 'Chicken Tikka', price: 15.95, category: 'Straight Outta Tandoor', isVeg: false },
  { name: 'Soya Tandoori Chaap', price: 16.95, category: 'Straight Outta Tandoor', isVeg: true },
  { name: 'Shrimp Tandoori', price: 20.95, category: 'Straight Outta Tandoor', isVeg: false },

  // MAIN COURSE
  { name: 'Dal Makhni', price: 12.95, category: 'Main Course', isVeg: true },
  { name: 'Butter Chicken', price: 16.95, category: 'Main Course', isVeg: false },
  { name: 'Paneer Butter Masala', price: 14.95, category: 'Main Course', isVeg: true },
  { name: 'Mutton Curry', price: 18.95, category: 'Main Course', isVeg: false },
  { name: 'Chana Masala', price: 11.95, category: 'Main Course', isVeg: true },

  // BEVERAGES
  { name: 'Mango Shake', price: 5.95, category: 'Beverages', isVeg: true },
  { name: 'Sweet Lassi', price: 4.95, category: 'Beverages', isVeg: true },
  { name: 'Salted Lassi', price: 4.95, category: 'Beverages', isVeg: true },
  { name: 'Masala Chai', price: 3.95, category: 'Beverages', isVeg: true },

  // DESSERTS
  { name: 'Gulab Jamun', price: 4.95, category: 'Desserts', isVeg: true },
  { name: 'Rasmalai', price: 5.95, category: 'Desserts', isVeg: true },
];

const firstNames = ['Amit', 'Rahul', 'Neha', 'Priya', 'John', 'Sarah', 'Rohan', 'Vikram'];
const lastNames = ['Sharma', 'Singh', 'Patel', 'Kumar', 'Joshi', 'Smith', 'Gupta', 'Reddy'];

function getRandomDate(monthsBack = 6) {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - monthsBack);
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function run() {
  console.log('Clearing existing mock data for ' + RESTAURANT_ID + '...');

  // Delete all existing items, sessions, orders, and transactions for this restaurant
  const sessions = await prisma.session.findMany({ where: { restaurantId: RESTAURANT_ID } });
  const sessionIds = sessions.map(s => s.id);

  if (sessionIds.length > 0) {
      await prisma.orderItem.deleteMany({ where: { order: { sessionId: { in: sessionIds } } } });
      await prisma.order.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await prisma.transaction.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await prisma.session.deleteMany({ where: { restaurantId: RESTAURANT_ID } });
  }
  
  await prisma.menuItem.deleteMany({ where: { restaurantId: RESTAURANT_ID } });

  console.log('Mock data wiped. Creating new Indian Menu...');

  // Create new Indian Menu
  for (const item of menuData) {
    await prisma.menuItem.create({
      data: {
        restaurantId: RESTAURANT_ID,
        name: item.name,
        price: item.price,
        category: item.category,
        isVeg: item.isVeg,
      }
    });
  }

  const dishes = await prisma.menuItem.findMany({ where: { restaurantId: RESTAURANT_ID } });
  const tables = await prisma.table.findMany({ where: { restaurantId: RESTAURANT_ID } });

  if (tables.length === 0) {
    console.error('No tables found! Creating a default table.');
    await prisma.table.create({
        data: { restaurantId: RESTAURANT_ID, tableNumber: 'Table 1', tableToken: 'test-token-indian' }
    });
  }

  const appetizers = dishes.filter(d => d.category === 'Appetizers');
  const breads = dishes.filter(d => d.category === 'Breads');
  const tandoor = dishes.filter(d => d.category === 'Straight Outta Tandoor');
  const mains = dishes.filter(d => d.category === 'Main Course');
  const bevs = dishes.filter(d => d.category === 'Beverages');
  const desserts = dishes.filter(d => d.category === 'Desserts');

  console.log('Generating 1,500 highly correlated sessions...');

  let createdCount = 0;
  for (let i = 0; i < 1500; i++) {
    const createdAt = getRandomDate(6);
    const tableId = tables.length > 0 ? getRandomElement(tables).id : (await prisma.table.findFirst()).id;
    
    const session = await prisma.session.create({
      data: {
        restaurantId: RESTAURANT_ID,
        tableId: tableId,
        status: 'CLOSED',
        createdAt: createdAt,
        closedAt: new Date(createdAt.getTime() + 45 * 60000),
      }
    });

    // --- ARTIFICIAL INTELLIGENCE TRAINING DATA GENERATION ---
    // Here we define the strong relationships to train the model.
    let orderItemsData = [];
    
    const orderStyle = Math.random();

    if (orderStyle < 0.6) {
        // 60% of people order a Main Course
        const main = getRandomElement(mains);
        orderItemsData.push({ menuItemId: main.id, quantity: 1 });

        // Strong Correlation: If Dal Makhni, 90% chance they get Garlic Naan
        if (main.name === 'Dal Makhni' && Math.random() < 0.9) {
            orderItemsData.push({ menuItemId: breads.find(b => b.name === 'Garlic Naan').id, quantity: 2 });
            // And 60% chance they get Sweet Lassi
            if (Math.random() < 0.6) orderItemsData.push({ menuItemId: bevs.find(b => b.name === 'Sweet Lassi').id, quantity: 1 });
        } 
        // Strong Correlation: If Butter Chicken, 80% chance they get regular Naan or Garlic Naan
        else if (main.name === 'Butter Chicken' && Math.random() < 0.8) {
            const chosenBread = Math.random() > 0.5 ? 'Naan' : 'Garlic Naan';
            orderItemsData.push({ menuItemId: breads.find(b => b.name === chosenBread).id, quantity: 2 });
            // And 50% chance of Mango Shake
            if (Math.random() < 0.5) orderItemsData.push({ menuItemId: bevs.find(b => b.name === 'Mango Shake').id, quantity: 1 });
        }
        else {
            // Generic Main Course -> Any Bread
            if (Math.random() < 0.7) orderItemsData.push({ menuItemId: getRandomElement(breads).id, quantity: 2 });
        }
    } else if (orderStyle < 0.85) {
        // 25% of people just order Tandoor (Dry Snacks)
        const tand = getRandomElement(tandoor);
        orderItemsData.push({ menuItemId: tand.id, quantity: 1 });

        // Strong Correlation: Tandoor is usually paired with a Beverage
        if (Math.random() < 0.7) {
            orderItemsData.push({ menuItemId: getRandomElement(bevs).id, quantity: 1 });
        }
        // Strong Correlation: Chicken Tandoori + Mango Shake
        if (tand.name === 'Chicken Tandoori' && Math.random() < 0.8) {
             orderItemsData.push({ menuItemId: bevs.find(b => b.name === 'Mango Shake').id, quantity: 1 });
        }
    } else {
        // 15% of people just order Appetizers & Chai
        orderItemsData.push({ menuItemId: getRandomElement(appetizers).id, quantity: 1 });
        if (Math.random() < 0.8) {
            orderItemsData.push({ menuItemId: bevs.find(b => b.name === 'Masala Chai').id, quantity: 2 });
        }
    }

    // 20% of ALL tables order a Samosa just because it's popular
    if (Math.random() < 0.2) {
        // Ensure we don't duplicate
        if (!orderItemsData.find(o => o.menuItemId === appetizers.find(a => a.name === 'Alu Mater Samosa').id)) {
             orderItemsData.push({ menuItemId: appetizers.find(a => a.name === 'Alu Mater Samosa').id, quantity: 1 });
        }
    }

    // 15% of ALL tables order Dessert at the end
    if (Math.random() < 0.15) {
         orderItemsData.push({ menuItemId: getRandomElement(desserts).id, quantity: 1 });
    }

    // Calculate totals
    let totalAmount = 0;
    for (const item of orderItemsData) {
        const dish = dishes.find(d => d.id === item.menuItemId);
        if (dish) {
            item.price = dish.price;
            totalAmount += Number(dish.price) * item.quantity;
        }
    }

    // Insert Order
    await prisma.order.create({
      data: {
        sessionId: session.id,
        status: 'COMPLETED',
        items: { create: orderItemsData },
        createdAt: new Date(createdAt.getTime() + 10 * 60000),
      }
    });

    // Insert Transaction
    await prisma.transaction.create({
      data: {
        sessionId: session.id,
        amount: totalAmount.toFixed(2),
        taxPaid: (totalAmount * 0.05).toFixed(2),
        status: 'COMPLETED',
        paymentMethod: Math.random() > 0.5 ? 'ONLINE' : 'UPI',
        customerName: Math.random() > 0.3 ? firstNames[Math.floor(Math.random()*firstNames.length)] : null,
        createdAt: new Date(createdAt.getTime() + 40 * 60000),
      }
    });

    createdCount++;
    if (createdCount % 250 === 0) console.log(`Generated ${createdCount} smart transactions...`);
  }

  console.log('Successfully completed Indian Menu Seeding & Training Generation!');
  await prisma.$disconnect();
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});

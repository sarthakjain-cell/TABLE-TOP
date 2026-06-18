const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const RESTAURANT_ID = '432f3304-7c0e-42d0-9132-e8c2f3ea8756';

const firstNames = ['John', 'Emma', 'Aarav', 'Priya', 'Michael', 'Sarah', 'Rohan', 'Neha', 'David', 'Lisa', 'Amit', 'Kavita', 'James', 'Emily', 'Vikram', 'Anjali'];
const lastNames = ['Smith', 'Johnson', 'Sharma', 'Patel', 'Williams', 'Brown', 'Singh', 'Gupta', 'Jones', 'Garcia', 'Kumar', 'Joshi', 'Miller', 'Davis', 'Reddy', 'Das'];

function getRandomName() {
  return firstNames[Math.floor(Math.random() * firstNames.length)] + ' ' + 
         lastNames[Math.floor(Math.random() * lastNames.length)];
}

function getRandomPhone() {
  return '+91' + Math.floor(9000000000 + Math.random() * 999999999).toString();
}

function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomDate(monthsBack = 6) {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - monthsBack);
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function run() {
  console.log('Fetching available dishes and tables...');
  const dishes = await prisma.menuItem.findMany({ where: { restaurantId: RESTAURANT_ID } });
  const tables = await prisma.table.findMany({ where: { restaurantId: RESTAURANT_ID } });
  
  if (dishes.length === 0 || tables.length === 0) {
    console.error('No dishes or tables found! Ensure you have tables created in the Admin dashboard.');
    process.exit(1);
  }

  const burgers = dishes.filter(d => d.category.includes('Burger'));
  const pizzas = dishes.filter(d => d.category.includes('Pizza'));
  const drinks = dishes.filter(d => d.category.includes('Beverage'));
  const sides = dishes.filter(d => d.category.includes('Side'));
  const desserts = dishes.filter(d => d.category.includes('Dessert'));
  const mains = dishes.filter(d => d.category.includes('Main Course') || d.category.includes('Pasta'));

  console.log('Generating 500 fake past sessions and transactions...');

  try {
    let createdCount = 0;
    
    for (let i = 0; i < 500; i++) {
      const isOnline = Math.random() > 0.4;
      const createdAt = getRandomDate(6);
      const tableId = getRandomElement(tables).id;
      const cName = Math.random() > 0.3 ? getRandomName() : null;
      const cPhone = Math.random() > 0.3 ? getRandomPhone() : null;
      
      const session = await prisma.session.create({
        data: {
          restaurantId: RESTAURANT_ID,
          tableId: tableId,
          status: 'CLOSED',
          createdAt: createdAt,
          closedAt: new Date(createdAt.getTime() + 45 * 60000),
        }
      });

      const numOrders = Math.floor(Math.random() * 3) + 1;
      let totalAmount = 0;

      for (let o = 0; o < numOrders; o++) {
        const orderItemsData = [];
        
        if (Math.random() > 0.5 && burgers.length > 0) {
          orderItemsData.push({ menuItemId: getRandomElement(burgers).id, quantity: 1 });
          if (sides.length > 0 && Math.random() > 0.2) orderItemsData.push({ menuItemId: getRandomElement(sides).id, quantity: 1 });
          if (drinks.length > 0 && Math.random() > 0.2) orderItemsData.push({ menuItemId: getRandomElement(drinks).id, quantity: 1 });
        } else if (Math.random() > 0.5 && pizzas.length > 0) {
          orderItemsData.push({ menuItemId: getRandomElement(pizzas).id, quantity: 1 });
          if (drinks.length > 0 && Math.random() > 0.3) orderItemsData.push({ menuItemId: getRandomElement(drinks).id, quantity: 2 });
        } else if (mains.length > 0) {
          orderItemsData.push({ menuItemId: getRandomElement(mains).id, quantity: Math.floor(Math.random() * 2) + 1 });
        }

        if (desserts.length > 0 && Math.random() > 0.8) {
          orderItemsData.push({ menuItemId: getRandomElement(desserts).id, quantity: 1 });
        }

        if (orderItemsData.length === 0) {
            orderItemsData.push({ menuItemId: getRandomElement(dishes).id, quantity: 1 });
        }

        let orderTotal = 0;
        for (const item of orderItemsData) {
            const dish = dishes.find(d => d.id === item.menuItemId);
            if (dish) {
              item.price = dish.price;
              orderTotal += Number(dish.price) * item.quantity;
            }
        }
        totalAmount += orderTotal;

        await prisma.order.create({
          data: {
            sessionId: session.id,
            status: 'COMPLETED',
            items: { create: orderItemsData },
            createdAt: new Date(createdAt.getTime() + o * 10 * 60000),
          }
        });
      }

      await prisma.transaction.create({
        data: {
          sessionId: session.id,
          amount: totalAmount.toFixed(2),
          taxPaid: (totalAmount * 0.05).toFixed(2),
          status: 'COMPLETED',
          paymentMethod: isOnline ? (Math.random() > 0.5 ? 'ONLINE' : 'UPI') : 'CASH',
          customerName: cName,
          customerPhone: cPhone,
          createdAt: new Date(createdAt.getTime() + 50 * 60000),
        }
      });

      createdCount++;
      if (createdCount % 50 === 0) console.log('Generated ' + createdCount + ' historical sessions...');
    }

    console.log('Successfully generated fake historical data!');
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

run();

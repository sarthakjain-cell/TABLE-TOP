const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

const SECRET_KEY = process.env.JWT_SECRET || 'tabletop-super-secret-key';

function signToken(restaurantId, tableId, tableNumber) {
  const payloadStr = JSON.stringify({
    restaurantId,
    tableId,
    tableNumber,
    timestamp: Date.now()
  });
  
  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(payloadStr)
    .digest('hex');
    
  return Buffer.from(
    JSON.stringify({
      payload: payloadStr,
      signature
    })
  ).toString('base64url');
}

async function main() {
  console.log("Wiping database...");
  await prisma.orderItemPayment.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.session.deleteMany();
  await prisma.table.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.restaurant.deleteMany();
  
  console.log("Creating valid UUID Restaurant...");
  const restaurant = await prisma.restaurant.create({
    data: {
      name: "Demo Diner",
      taxRate: 0.0825,
      operationalMode: "FULL_SERVICE"
    }
  });

  console.log("Creating menu items...");
  await prisma.menuItem.createMany({
    data: [
      { name: "Wagyu Burger", price: 24.99, category: "Mains", restaurantId: restaurant.id, isAvailable: true },
      { name: "Truffle Fries", price: 9.99, category: "Sides", restaurantId: restaurant.id, isAvailable: true },
      { name: "Diet Coke", price: 3.50, category: "Drinks", restaurantId: restaurant.id, isAvailable: true }
    ]
  });

  console.log("Creating table...");
  // Create table token first
  const dummyTableId = crypto.randomUUID();
  const token = signToken(restaurant.id, dummyTableId, "1");

  const table = await prisma.table.create({
    data: {
      id: dummyTableId,
      number: "1",
      token: token,
      restaurantId: restaurant.id
    }
  });

  console.log("-----------------------------------------");
  console.log("FRESH TOKEN READY FOR TESTING:");
  console.log(`http://localhost:3000/table/${token}`);
  console.log("-----------------------------------------");
}

main().catch(console.error).finally(() => prisma.$disconnect());

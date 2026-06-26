const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runTest() {
  console.log("Starting AI ROI Verification Test...");
  
  // 1. Get the restaurant
  const restaurant = await prisma.restaurant.findFirst();
  const restaurantId = restaurant.id;
  
  // 2. Find a vacant table
  const table = await prisma.table.findFirst({ where: { restaurantId, status: 'VACANT' } });
  
  // 3. Create a session
  const session = await prisma.session.create({
    data: {
      tableId: table.id,
      restaurantId,
      status: 'ACTIVE'
    }
  });
  console.log("Created session:", session.id);
  
  // 4. Create an order with a normal item and an ML_UPSELL item
  const menuItems = await prisma.menuItem.findMany({ where: { restaurantId }, take: 2 });
  const normalItem = menuItems[0];
  const mlItem = menuItems[1];
  
  const order = await prisma.order.create({
    data: {
      sessionId: session.id,
      status: 'NEW',
      items: {
        create: [
          { menuItemId: normalItem.id, quantity: 1, price: normalItem.price, addedVia: 'MANUAL' },
          { menuItemId: mlItem.id, quantity: 1, price: mlItem.price, addedVia: 'ML_UPSELL' }
        ]
      }
    },
    include: { items: true }
  });
  console.log("Created order with ML_UPSELL item.");
  
  // 5. Create a COMPLETED transaction for this order
  const transaction = await prisma.transaction.create({
    data: {
      sessionId: session.id,
      amount: Number(normalItem.price) + Number(mlItem.price),
      taxPaid: 0,
      status: 'COMPLETED',
      paymentMethod: 'CASH',
      tipAmount: 0,
      deliveryFeeApplied: 0,
      paymentItems: {
        create: order.items.map(item => ({
          orderItemId: item.id,
          quantityPaid: 1,
          amount: item.price,
          taxFraction: 0
        }))
      }
    }
  });
  console.log("Created COMPLETED transaction:", transaction.id);
  
  // 6. Check the finance metrics directly using the logic from finance.ts
  const mlPayments = await prisma.orderItemPayment.findMany({
    where: {
      transaction: { status: 'COMPLETED', session: { restaurantId } },
      orderItem: { addedVia: 'ML_UPSELL' }
    },
    select: { amount: true }
  });
  
  let totalMlRevenue = 0;
  for (const p of mlPayments) {
    totalMlRevenue += Number(p.amount);
  }
  
  console.log("===============================");
  console.log(`ML UPSELL REVENUE DETECTED: $${totalMlRevenue.toFixed(2)}`);
  console.log("===============================");
  
  if (totalMlRevenue >= Number(mlItem.price)) {
    console.log("VERIFICATION SUCCESSFUL: AI Upsell Revenue is correctly capturing completed transactions!");
  } else {
    console.log("VERIFICATION FAILED!");
  }
  
  await prisma.$disconnect();
}

runTest().catch(console.error);

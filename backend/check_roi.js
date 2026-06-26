const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkROI() {
  const items = await prisma.orderItem.findMany({
    select: { id: true, addedVia: true, price: true, quantity: true, createdAt: true, order: { select: { status: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20
  });
  
  console.log("Recent 20 OrderItems:");
  console.log(items);

  const mlCount = await prisma.orderItem.count({
    where: { addedVia: 'ML_WIDGET' }
  });
  console.log("Total ML_WIDGET items in DB:", mlCount);

  const pendingMlCount = await prisma.orderItem.count({
    where: { addedVia: 'ML_WIDGET', order: { status: 'PENDING' } }
  });
  console.log("Pending ML_WIDGET items in DB:", pendingMlCount);

  const validMlCount = await prisma.orderItem.count({
    where: { addedVia: 'ML_WIDGET', order: { status: { not: 'PENDING' } } }
  });
  console.log("Valid (Submitted) ML_WIDGET items in DB:", validMlCount);

}

checkROI().catch(console.error).finally(() => prisma.$disconnect());

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDB() {
  const payments = await prisma.orderItemPayment.findMany({
    where: {
      transaction: { status: 'COMPLETED' },
      orderItem: { addedVia: 'ML_UPSELL' }
    },
    include: {
      orderItem: true,
      transaction: true
    }
  });

  const allItems = await prisma.orderItem.findMany({
    where: { addedVia: 'ML_UPSELL' }
  });

  console.log("Total ML_UPSELL items in DB:", allItems.length);
  console.log("Total ML_UPSELL payments in COMPLETED transactions:", payments.length);
  if (payments.length > 0) {
    console.log("Amounts:");
    payments.forEach(p => console.log(p.amount));
  }
}

checkDB().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

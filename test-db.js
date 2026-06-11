const { PrismaClient } = require('./backend/node_modules/@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const txs = await prisma.transaction.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { session: { include: { orders: true } } }
  });
  console.log(JSON.stringify(txs, null, 2));
}
run();

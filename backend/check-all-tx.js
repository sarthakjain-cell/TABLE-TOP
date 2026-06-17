const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const txs = await prisma.transaction.findMany({
    where: { status: 'PENDING' },
    include: { session: { include: { table: true } } }
  });
  console.log(`Found ${txs.length} PENDING transactions in the database.`);
  if (txs.length > 0) {
    txs.forEach(t => {
      console.log(`- TX ID: ${t.id} | Session ID: ${t.sessionId} | Table: ${t.session?.table?.number} | Method: ${t.paymentMethod}`);
    });
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());

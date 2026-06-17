const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log("Checking DB state...");
  
  const tables = await prisma.table.findMany({
    include: {
      sessions: {
        where: { status: 'ACTIVE' },
        include: {
          transactions: {
            include: { paymentItems: true }
          }
        }
      }
    }
  });

  for (const t of tables) {
    if (t.sessions.length > 0) {
      console.log(`Table ${t.number} has active session ${t.sessions[0].id}`);
      if (t.sessions[0].transactions.length > 0) {
        t.sessions[0].transactions.forEach(tx => {
           console.log(`  - Transaction ${tx.id} | Status: ${tx.status} | Method: ${tx.paymentMethod}`);
        });
      } else {
        console.log(`  - No transactions in this session.`);
      }
    }
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());

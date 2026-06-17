const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const rest = await prisma.restaurant.findFirst();
  const table = await prisma.table.create({
    data: {
      number: '999',
      qrCodeUrl: 'test',
      restaurantId: rest.id
    }
  });

  const session = await prisma.session.create({
    data: {
      tableId: table.id,
      restaurantId: rest.id,
      status: 'ACTIVE'
    }
  });

  const tx = await prisma.transaction.create({
    data: {
      sessionId: session.id,
      amount: 100.0,
      taxPaid: 0,
      status: 'PENDING',
      paymentMethod: 'CASH',
      razorpayOrderId: 'order_xxx',
      customerName: 'Test',
      customerPhone: '123'
    }
  });

  console.log("Mock session and TX created.");

  // Now simulate the frontend's fetch
  const fetchedRest = await prisma.restaurant.findUnique({
    where: { id: rest.id },
    include: {
      tables: {
        include: {
          sessions: {
            where: { status: 'ACTIVE' },
            include: {
              transactions: { include: { paymentItems: true } },
              orders: true
            }
          }
        }
      }
    }
  });

  const fetchedTable = fetchedRest.tables.find(t => t.id === table.id);
  console.log("Fetched Table active sessions length:", fetchedTable.sessions.length);
  const activeSession = fetchedTable.sessions[0];
  console.log("Transactions length:", activeSession.transactions.length);
  const pendingTx = activeSession.transactions.find(t => t.status === 'PENDING');
  console.log("Pending TX Found:", !!pendingTx);
  
  // Cleanup
  await prisma.transaction.delete({ where: { id: tx.id } });
  await prisma.session.delete({ where: { id: session.id } });
  await prisma.table.delete({ where: { id: table.id } });
}

run().catch(console.error).finally(() => prisma.$disconnect());

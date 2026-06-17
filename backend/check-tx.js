const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const session = await prisma.session.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    include: {
      transactions: true
    }
  });
  console.log(JSON.stringify(session.transactions, null, 2));
}
check();

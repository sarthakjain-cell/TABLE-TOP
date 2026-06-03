const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.order.findMany({
    include: {
      items: true,
      session: {
        include: { table: true }
      }
    }
  });
  console.dir(orders, { depth: null });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

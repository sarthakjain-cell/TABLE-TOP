const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const r = await prisma.restaurant.findFirst();
  console.log(r);
}

main().catch(console.error).finally(() => prisma.$disconnect());

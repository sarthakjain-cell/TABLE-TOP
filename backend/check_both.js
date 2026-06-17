const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const r1 = await prisma.restaurant.findUnique({ where: { id: 'SARTHAKJAIN01' } });
  const r2 = await prisma.restaurant.findUnique({ where: { id: 'HOTEL01' } });
  
  console.log("SARTHAKJAIN01 exists:", !!r1);
  console.log("HOTEL01 exists:", !!r2);
}

check().finally(() => prisma.$disconnect());

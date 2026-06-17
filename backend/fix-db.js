const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.restaurant.updateMany({
    where: { username: 'SARTHAKJAIN01' },
    data: { establishmentType: 'RESTAURANT', operationalMode: 'FULL_SERVICE' }
  });
  console.log('Fixed DB: SARTHAKJAIN01 is now a RESTAURANT again.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

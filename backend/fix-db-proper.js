const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.restaurant.updateMany({
    where: { NOT: { id: 'HOTEL01' } }, // Update everything that isn't the dedicated HOTEL01 account
    data: { establishmentType: 'RESTAURANT', operationalMode: 'FULL_SERVICE' }
  });
  console.log('Fixed DB: All other accounts are now RESTAURANT again.');
}

main().catch(console.error).finally(() => prisma.$disconnect());

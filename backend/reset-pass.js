const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function reset() {
  const hash = await bcrypt.hash('0000', 10);
  await prisma.restaurant.updateMany({
    data: { passcodeHash: hash }
  });
  console.log('Passcode reset to 0000 for all restaurants.');
}

reset().finally(() => prisma.$disconnect());

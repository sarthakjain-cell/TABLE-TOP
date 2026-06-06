const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function createAdmin() {
  const adminId = 'SARTHAKJAIN01';
  const password = 'SARTHAKJAIN01';
  const hash = await bcrypt.hash(password, 10);

  // Upsert the restaurant to avoid duplicates if run multiple times
  const restaurant = await prisma.restaurant.upsert({
    where: { id: adminId },
    update: {
      passcodeHash: hash,
    },
    create: {
      id: adminId,
      name: 'SARTHAKJAIN01 Restaurant',
      passcodeHash: hash,
      taxRate: 0.05,
      operationalMode: 'FULL_SERVICE',
      establishmentType: 'RESTAURANT'
    }
  });

  console.log('✅ Successfully created/updated Admin user:');
  console.log(`Restaurant ID: ${restaurant.id}`);
  console.log(`Password: ${password}`);
}

createAdmin()
  .catch(e => {
    console.error('Error creating admin:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

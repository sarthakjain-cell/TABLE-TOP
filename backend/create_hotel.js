const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function createHotelAdmin() {
  const adminId = 'HOTEL01';
  const password = 'HOTEL01';
  const hash = await bcrypt.hash(password, 10);

  // Upsert the hotel to avoid duplicates if run multiple times
  const restaurant = await prisma.restaurant.upsert({
    where: { id: adminId },
    update: {
      passcodeHash: hash,
    },
    create: {
      id: adminId,
      name: 'TableTop Hotel',
      passcodeHash: hash,
      taxRate: 0.12, // example hotel tax
      operationalMode: 'FULL_SERVICE',
      establishmentType: 'HOTEL',
      paymentMode: 'POST_PAY'
    }
  });

  console.log('Successfully created Admin user for Hotel:');
  console.log(`Restaurant ID: ${restaurant.id}`);
  console.log(`Password: ${password}`);
}

createHotelAdmin()
  .catch(e => {
    console.error('Error creating admin:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

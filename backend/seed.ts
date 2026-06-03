import { PrismaClient } from '@prisma/client';
import { signTableToken } from './src/utils/token';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database for manual testing...');

  // 1. Create Restaurant
  const restaurant = await prisma.restaurant.upsert({
    where: { id: 'manual-test-rest' },
    update: {},
    create: {
      id: 'manual-test-rest',
      name: 'Demo Diner',
      operationalMode: 'FULL_SERVICE',
      taxRate: '0.0825',
    },
  });
  console.log('✅ Created Restaurant:', restaurant.name);

  // 2. Generate Table Token
  const tableToken = signTableToken(restaurant.id, 'table-1-id', '1');

  // 3. Create Table
  const table = await prisma.table.upsert({
    where: {
      restaurantId_number: {
        restaurantId: restaurant.id,
        number: '1',
      },
    },
    update: {
      token: tableToken,
      status: 'VACANT',
    },
    create: {
      id: 'table-1-id',
      number: '1',
      token: tableToken,
      status: 'VACANT',
      restaurantId: restaurant.id,
    },
  });
  console.log('✅ Created Table 1');

  // 4. Create a Menu Item
  const menuItem = await prisma.menuItem.upsert({
    where: { id: 'demo-burger' },
    update: {},
    create: {
      id: 'demo-burger',
      restaurantId: restaurant.id,
      name: 'Signature Burger',
      description: 'Juicy beef patty with cheese and secret sauce.',
      price: '12.50',
      isAvailable: true,
    },
  });
  console.log('✅ Created Menu Item:', menuItem.name);

  console.log('\n=============================================');
  console.log('🎉 SEEDING COMPLETE! 🎉');
  console.log('Here are your manual testing details:');
  console.log('---------------------------------------------');
  console.log(`Restaurant ID: ${restaurant.id}`);
  console.log(`Table 1 Token: ${tableToken}`);
  console.log('=============================================\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

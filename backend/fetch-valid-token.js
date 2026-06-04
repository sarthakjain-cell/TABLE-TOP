const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const restaurants = await prisma.restaurant.findMany();
  const validRest = restaurants.find(r => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.id));
  if (validRest) {
    const table = await prisma.table.findFirst({ where: { restaurantId: validRest.id } });
    if (table) {
      console.log('http://localhost:3000/table/' + table.token);
    } else {
      console.log('No tables found for valid restaurant');
    }
  } else {
    console.log('No valid UUID restaurants found');
  }
}
main().finally(() => prisma.$disconnect());

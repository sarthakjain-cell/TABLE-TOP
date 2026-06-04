const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const table = await prisma.table.findFirst();
  if (table) {
    console.log("--- TABLE FOUND ---");
    console.log("tableToken: " + table.token);
    console.log("restaurantId: " + table.restaurantId);
  } else {
    console.log("No tables found in DB.");
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());

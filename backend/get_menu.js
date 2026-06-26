const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getMenuItems() {
  const items = await prisma.menuItem.findMany({
    select: { id: true, name: true, category: true, imageUrl: true }
  });
  console.log(JSON.stringify(items, null, 2));
}

getMenuItems().then(() => process.exit(0)).catch(console.error);

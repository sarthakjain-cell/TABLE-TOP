const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function check() {
  const item = await prisma.menuItem.findFirst();
  console.log(item);
}
check().then(() => process.exit(0));

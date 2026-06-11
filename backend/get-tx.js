const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const tx = await prisma.transaction.findFirst({
    include: { session: { include: { table: { include: { restaurant: true } } } } }
  });
  console.log(tx.id);
  process.exit(0);
}
main();

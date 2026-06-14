const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const tx = await prisma.transaction.findUnique({
    where: { id: "a5ba4238-dbcb-4aab-8e69-0a377a8dc0d4" },
    include: { session: { include: { table: { include: { restaurant: true } } } } }
  });
  console.log(JSON.stringify(tx, null, 2));
  process.exit(0);
}
main();

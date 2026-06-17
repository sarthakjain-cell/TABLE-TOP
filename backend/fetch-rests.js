const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const rests = await prisma.restaurant.findMany();
  console.log(rests.map(r => ({id: r.id, name: r.name, username: r.username, type: r.establishmentType})));
}

main().catch(console.error).finally(() => prisma.$disconnect());

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

prisma.restaurant.findUnique({
  where: { id: 'HOTEL01' }
}).then(r => {
  console.log("Database response:", r);
}).finally(() => {
  prisma.$disconnect();
});

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.restaurant.findFirst().then(r => console.log('Restaurant ID:', r ? r.id : 'None')).finally(() => prisma.$disconnect());

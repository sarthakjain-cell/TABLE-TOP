import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function run() {
  const hash = await bcrypt.hash('admin123', 10);
  const result = await prisma.restaurant.updateMany({
    data: { passcodeHash: hash }
  });
  console.log(`Passcodes set to admin123 for ${result.count} restaurants.`);
}

run().catch(console.error).finally(() => prisma.$disconnect());

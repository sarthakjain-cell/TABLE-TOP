const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const items = await prisma.menuItem.findMany({ select: { name: true, imageUrl: true } });
  console.log('Sample images:');
  items.slice(0, 5).forEach(i => console.log(i.name, '=>', i.imageUrl));
  
  // Also check if any of the items I updated still have the old placeholder
  const placeholders = items.filter(i => i.imageUrl && (i.imageUrl.includes('main_course') || i.imageUrl.includes('appetizer')));
  console.log('Number of placeholder images left:', placeholders.length);
}

check().finally(() => prisma.$disconnect());

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedImages() {
  const items = await prisma.menuItem.findMany();
  let updated = 0;
  
  for (const item of items) {
    let categoryImage = null;
    
    if (item.category === 'Appetizers') categoryImage = '/assets/menu/appetizers.png';
    else if (item.category === 'Main Course') categoryImage = '/assets/menu/main_course.png';
    else if (item.category === 'Breads') categoryImage = '/assets/menu/breads.png';
    else if (item.category === 'Beverages') categoryImage = '/assets/menu/beverages.png';
    else if (item.category === 'Desserts') categoryImage = '/assets/menu/desserts.png';
    else if (item.category === 'Straight Outta Tandoor') categoryImage = '/assets/menu/main_course.png'; // Fallback
    else categoryImage = '/assets/menu/main_course.png'; // Universal fallback
    
    if (categoryImage) {
      await prisma.menuItem.update({
        where: { id: item.id },
        data: { imageUrl: categoryImage }
      });
      updated++;
      console.log(`Updated image for ${item.name} to ${categoryImage}`);
    }
  }
  
  console.log(`Successfully assigned category images to ${updated} menu items.`);
}

seedImages().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

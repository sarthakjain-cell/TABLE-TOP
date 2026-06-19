const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fix() {
  const restaurantId = '432f3304-7c0e-42d0-9132-e8c2f3ea8756';
  
  // Wipe AI Recommendation Rules for safety
  await prisma.recommendationRule.deleteMany({ where: { restaurantId } });

  // Get all current menu items for this restaurant
  const items = await prisma.menuItem.findMany({ where: { restaurantId } });
  const itemIds = items.map(i => i.id);

  if (itemIds.length > 0) {
    console.log(`Found ${itemIds.length} items to delete...`);
    
    // Find linked order items
    const orderItems = await prisma.orderItem.findMany({ where: { menuItemId: { in: itemIds } } });
    const orderItemIds = orderItems.map(oi => oi.id);
    
    if (orderItemIds.length > 0) {
      console.log(`Deleting ${orderItemIds.length} linked order items and payments...`);
      await prisma.orderItemPayment.deleteMany({ where: { orderItemId: { in: orderItemIds } } });
      await prisma.orderItem.deleteMany({ where: { id: { in: orderItemIds } } });
    }
    
    console.log("Deleting menu items...");
    await prisma.menuItem.deleteMany({ where: { id: { in: itemIds } } });
  }

  // Insert fresh batch
  console.log("Inserting fresh Indian Menu...");
  const menuData = [
    { name: 'Onion Bhaji', price: 6.95, category: 'Appetizers', isVeg: true },
    { name: 'Samosa Chat', price: 7.95, category: 'Appetizers', isVeg: true },
    { name: 'Paneer Pakora', price: 8.95, category: 'Appetizers', isVeg: true },
    { name: 'Gobi Pakora', price: 7.95, category: 'Appetizers', isVeg: true },
    { name: 'Lamb Samosa', price: 8.95, category: 'Appetizers', isVeg: false },
    { name: 'Alu Mater Samosa', price: 6.95, category: 'Appetizers', isVeg: true },
    { name: 'Dal Makhni', price: 13.95, category: 'Main Course', isVeg: true },
    { name: 'Paneer Butter Masala', price: 14.95, category: 'Main Course', isVeg: true },
    { name: 'Palak Paneer', price: 14.95, category: 'Main Course', isVeg: true },
    { name: 'Kadai Paneer', price: 14.95, category: 'Main Course', isVeg: true },
    { name: 'Malai Kofta', price: 14.95, category: 'Main Course', isVeg: true },
    { name: 'Butter Chicken', price: 16.95, category: 'Main Course', isVeg: false },
    { name: 'Chicken Tikka Masala', price: 16.95, category: 'Main Course', isVeg: false },
    { name: 'Lamb Rogan Josh', price: 18.95, category: 'Main Course', isVeg: false },
    { name: 'Goat Curry', price: 19.95, category: 'Main Course', isVeg: false },
    { name: 'Fish Curry', price: 17.95, category: 'Main Course', isVeg: false },
    { name: 'Garlic Naan', price: 3.95, category: 'Breads', isVeg: true },
    { name: 'Butter Naan', price: 3.50, category: 'Breads', isVeg: true },
    { name: 'Plain Naan', price: 2.95, category: 'Breads', isVeg: true },
    { name: 'Tandoori Roti', price: 2.95, category: 'Breads', isVeg: true },
    { name: 'Lacha Paratha', price: 4.95, category: 'Breads', isVeg: true },
    { name: 'Cheese Naan', price: 4.95, category: 'Breads', isVeg: true },
    { name: 'Mango Lassi', price: 4.95, category: 'Beverages', isVeg: true },
    { name: 'Sweet Lassi', price: 3.95, category: 'Beverages', isVeg: true },
    { name: 'Salted Lassi', price: 3.95, category: 'Beverages', isVeg: true },
    { name: 'Masala Chai', price: 2.95, category: 'Beverages', isVeg: true },
    { name: 'Diet Coke', price: 2.50, category: 'Beverages', isVeg: true },
    { name: 'Sprite', price: 2.50, category: 'Beverages', isVeg: true }
  ];

  await prisma.menuItem.createMany({
    data: menuData.map(item => ({ ...item, restaurantId }))
  });
  
  console.log("Done!");
}

fix().catch(console.error).finally(() => prisma.$disconnect());

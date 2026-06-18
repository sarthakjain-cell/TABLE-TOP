const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const restaurantId = "HOTEL01";
  
  console.log("Fetching restaurant tables and menu items...");
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    include: { tables: true, menuItems: true }
  });
  
  if (!restaurant || restaurant.menuItems.length === 0 || restaurant.tables.length === 0) {
    console.error("Restaurant, tables, or menu items missing.");
    return;
  }
  
  const tables = restaurant.tables;
  const menu = restaurant.menuItems;
  
  // Define some patterns to make the ML pick up rules!
  // Pattern 1: People who buy Burger often buy Fries and Coke
  // Pattern 2: People who buy Pizza often buy Garlic Bread and Pepsi
  // Pattern 3: People who buy Pasta often buy Tiramisu
  
  const burgers = menu.filter(m => m.name.toLowerCase().includes('burger'));
  const fries = menu.filter(m => m.name.toLowerCase().includes('fries'));
  const cokes = menu.filter(m => m.name.toLowerCase().includes('coke') || m.name.toLowerCase().includes('cola'));
  
  const pizzas = menu.filter(m => m.name.toLowerCase().includes('pizza'));
  const garlicBreads = menu.filter(m => m.name.toLowerCase().includes('garlic'));
  
  const pastas = menu.filter(m => m.name.toLowerCase().includes('pasta'));
  const tiramisus = menu.filter(m => m.name.toLowerCase().includes('tiramisu') || m.name.toLowerCase().includes('cake'));
  
  console.log("Generating 50 fake historical sessions...");
  
  for (let i = 0; i < 50; i++) {
    const table = tables[Math.floor(Math.random() * tables.length)];
    
    // Create a completed session
    const session = await prisma.session.create({
      data: {
        id: `fake-session-${Date.now()}-${i}`,
        restaurantId,
        tableId: table.id,
        status: 'CLOSED'
      }
    });
    
    // Determine what they bought
    const orderItemsData = [];
    const rand = Math.random();
    
    if (rand < 0.4 && burgers.length > 0 && fries.length > 0) {
        // Burger combo
        orderItemsData.push({ menuItemId: burgers[0].id, quantity: 1, price: burgers[0].price, total: burgers[0].price });
        orderItemsData.push({ menuItemId: fries[0].id, quantity: 1, price: fries[0].price, total: fries[0].price });
        if (cokes.length > 0) orderItemsData.push({ menuItemId: cokes[0].id, quantity: 1, price: cokes[0].price, total: cokes[0].price });
    } else if (rand < 0.7 && pizzas.length > 0 && garlicBreads.length > 0) {
        // Pizza combo
        orderItemsData.push({ menuItemId: pizzas[0].id, quantity: 1, price: pizzas[0].price, total: pizzas[0].price });
        orderItemsData.push({ menuItemId: garlicBreads[0].id, quantity: 1, price: garlicBreads[0].price, total: garlicBreads[0].price });
    } else if (rand < 0.9 && pastas.length > 0 && tiramisus.length > 0) {
        // Pasta combo
        orderItemsData.push({ menuItemId: pastas[0].id, quantity: 1, price: pastas[0].price, total: pastas[0].price });
        orderItemsData.push({ menuItemId: tiramisus[0].id, quantity: 1, price: tiramisus[0].price, total: tiramisus[0].price });
    } else {
        // Random stuff
        const randomItem1 = menu[Math.floor(Math.random() * menu.length)];
        const randomItem2 = menu[Math.floor(Math.random() * menu.length)];
        orderItemsData.push({ menuItemId: randomItem1.id, quantity: 1, price: randomItem1.price, total: randomItem1.price });
        orderItemsData.push({ menuItemId: randomItem2.id, quantity: 1, price: randomItem2.price, total: randomItem2.price });
    }
    
    const subtotal = orderItemsData.reduce((sum, item) => sum + Number(item.total), 0);
    
    await prisma.order.create({
      data: {
        id: `fake-order-${Date.now()}-${i}`,
        sessionId: session.id,
        status: 'COMPLETED',
        items: {
            create: orderItemsData.map(item => ({
                id: `fake-order-item-${Date.now()}-${Math.random()}`,
                menuItemId: item.menuItemId,
                quantity: item.quantity,
                price: item.price
            }))
        }
      }
    });
  }
  
  console.log("Fake historical orders generated successfully!");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

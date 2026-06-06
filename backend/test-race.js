const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runTest() {
  console.log('--- STARTING RACE CONDITION EXPLOIT TEST ---');
  
  // 1. Setup Mock Data
  console.log('1. Setting up mock restaurant, table, and session...');
  const restaurant = await prisma.restaurant.create({
    data: { name: 'Race Test Rest', operationalMode: 'FULL_SERVICE', establishmentType: 'HOTEL', roomServiceFee: 0, taxRate: 0.05 }
  });
  
  const table = await prisma.table.create({
    data: { number: 'RACE-99', restaurantId: restaurant.id, token: 'race-test-token-123' }
  });
  
  const session = await prisma.session.create({
    data: { tableId: table.id, status: 'ACTIVE', restaurantId: restaurant.id }
  });
  
  const menuItem = await prisma.menuItem.create({
    data: { name: 'Exploit Burger', price: 15, isAvailable: true, restaurantId: restaurant.id }
  });
  
  // Create a PENDING cart with the item
  const order = await prisma.order.create({
    data: {
      sessionId: session.id,
      status: 'PENDING',
      items: {
        create: [{ menuItemId: menuItem.id, price: 15, quantity: 1 }]
      }
    }
  });

  console.log(`2. Cart created (Session ID: ${session.id}). Firing 5 concurrent checkout requests...`);

  // 2. Fire Concurrent Requests to the live Railway server
  const url = `https://backend-production-9a38.up.railway.app/api/sessions/${session.id}/checkout-cart`;
  
  const requests = Array.from({ length: 5 }).map((_, i) => 
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerName: `Hacker ${i+1}`, customerPhone: '9999999999' })
    }).then(async res => {
      const text = await res.text();
      try {
         return { status: res.status, data: JSON.parse(text) };
      } catch(e) {
         return { status: res.status, data: text };
      }
    }).catch(e => ({ status: 'error', data: e.message }))
  );

  const results = await Promise.all(requests);
  
  console.log('\n--- EXPLOIT RESULTS ---');
  results.forEach((r, i) => {
    const isSuccess = r.status === 200;
    console.log(`Request ${i+1}: HTTP ${r.status} ${isSuccess ? '✅ (Checked out!)' : '❌ (Failed as expected)'}`);
  });

  // 3. Verify Database State
  const txs = await prisma.transaction.findMany({ where: { sessionId: session.id } });
  console.log(`\nDATABASE AUDIT: Found ${txs.length} transactions for the single cart!`);
  if (txs.length > 1) {
    console.log('🚨 VULNERABILITY CONFIRMED: The user was successfully double-charged!');
  } else {
    console.log('🛡️ SYSTEM SECURE: Only 1 transaction was recorded.');
  }

  // 4. Cleanup
  console.log('\nCleaning up mock data...');
  try { await prisma.transactionItem.deleteMany({ where: { transaction: { sessionId: session.id } } }); } catch(e){}
  try { await prisma.transaction.deleteMany({ where: { sessionId: session.id } }); } catch(e){}
  try { await prisma.orderItem.deleteMany({ where: { orderId: order.id } }); } catch(e){}
  try { await prisma.order.deleteMany({ where: { id: order.id } }); } catch(e){}
  try { await prisma.session.delete({ where: { id: session.id } }); } catch(e){}
  try { await prisma.table.delete({ where: { id: table.id } }); } catch(e){}
  try { await prisma.menuItem.delete({ where: { id: menuItem.id } }); } catch(e){}
  try { await prisma.restaurant.delete({ where: { id: restaurant.id } }); } catch(e){}
  console.log('Cleanup complete.');
}

runTest()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());

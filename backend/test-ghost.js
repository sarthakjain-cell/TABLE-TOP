const { PrismaClient } = require('@prisma/client');
const { io } = require('socket.io-client');
const prisma = new PrismaClient();

async function runGhostTest() {
  console.log('--- STARTING GHOST TICKET (WEBSOCKET SEVER) TEST ---');
  
  // 1. Setup Mock Data
  console.log('1. Setting up mock database records...');
  const restaurant = await prisma.restaurant.create({
    data: { name: 'Ghost Test Rest', operationalMode: 'FULL_SERVICE', establishmentType: 'HOTEL', roomServiceFee: 0, taxRate: 0.05 }
  });
  
  const table = await prisma.table.create({
    data: { number: 'GHOST-404', restaurantId: restaurant.id, token: 'ghost-token-123' }
  });
  
  const session = await prisma.session.create({
    data: { tableId: table.id, status: 'ACTIVE', restaurantId: restaurant.id }
  });
  
  const menuItem = await prisma.menuItem.create({
    data: { name: 'Ghost Burger', price: 15, isAvailable: true, restaurantId: restaurant.id }
  });
  
  const order = await prisma.order.create({
    data: {
      sessionId: session.id,
      status: 'PENDING',
      items: {
        create: [{ menuItemId: menuItem.id, price: 15, quantity: 1 }]
      }
    }
  });

  const apiUrl = 'https://backend-production-9a38.up.railway.app';
  
  // 2. Connect KDS Socket
  console.log('2. Connecting Kitchen Display System (KDS) via WebSocket...');
  const kdsSocket = io(apiUrl);
  
  // Wait for KDS to connect
  await new Promise(resolve => kdsSocket.on('connect', resolve));
  console.log('   ✅ KDS Connected to live server.');

  // 3. Connect Guest Socket (to fully simulate the user state)
  const guestSocket = io(apiUrl);
  await new Promise(resolve => guestSocket.on('connect', resolve));
  guestSocket.emit('joinTable', { tableId: table.id, sessionId: session.id });
  console.log('   ✅ Guest Connected to live server.');

  // Create a promise to wait for the KDS to receive the order
  const kdsPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('KDS Socket timed out! The ghost ticket was lost!'));
    }, 5000);

    kdsSocket.on('newOrderSubmitted', (data) => {
      clearTimeout(timeout);
      resolve(data);
    });
    kdsSocket.on('newOrderReceived', (data) => {
      clearTimeout(timeout);
      resolve(data);
    });
  });

  console.log('3. Guest is clicking "Pay"...');
  
  // Fire the HTTP Checkout API WITHOUT waiting for the response
  fetch(`${apiUrl}/api/sessions/${session.id}/checkout-cart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerName: 'Ghost Client', customerPhone: '4044044040' })
  }).catch(() => { /* ignore */ });

  console.log('4. ⚡ GUEST PHONE BATTERY DIES (Hard Socket Disconnect mid-flight)...');
  guestSocket.disconnect(); 

  // Now, we see if the KDS survives and still receives the socket event!
  console.log('5. Waiting to see if the KDS receives the ticket...');
  
  try {
    const ticketData = await kdsPromise;
    console.log('\n--- EXPLOIT RESULTS ---');
    console.log('✅ TEST PASSED: The KDS successfully received the ticket even though the guest died!');
    console.log(`Ticket Data Received: Table ${ticketData.order.tableNumber}, Items: ${ticketData.order.items.length}`);
  } catch (error) {
    console.log('\n--- EXPLOIT RESULTS ---');
    console.log(`❌ TEST FAILED: ${error.message}`);
  }

  // Cleanup
  console.log('\nCleaning up mock data...');
  kdsSocket.disconnect();
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

runGhostTest()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());

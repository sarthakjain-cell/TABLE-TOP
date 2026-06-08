const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

async function main() {
  const table = await prisma.table.findFirst({
    include: { restaurant: true }
  });
  
  if (!table) {
    console.log("No table found!");
    return;
  }

  const payload = {
    restaurantId: table.restaurantId,
    tableId: table.id,
    tableNumber: table.number,
    timestamp: Date.now()
  };

  const JWT_SECRET = process.env.JWT_SECRET || 'tabletop-super-secret-key'; // NOTE: Correct default key!
  
  const payloadString = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(payloadString).digest('hex');

  const tokenObj = { payload: payloadString, signature };
  // Use base64url!
  const base64urlToken = Buffer.from(JSON.stringify(tokenObj)).toString('base64url');
  
  console.log('http://localhost:3000/table/' + base64urlToken);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });

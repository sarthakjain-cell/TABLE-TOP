const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const LIVE_API_URL = 'https://table-top-frontend-pi.vercel.app/api';

async function run() {
  console.log("Fetching restaurants from Live Server...");
  const restsRes = await fetch(`${LIVE_API_URL}/restaurants`);
  if (!restsRes.ok) {
    console.error("Failed to fetch restaurants:", await restsRes.text());
    process.exit(1);
  }
  const restaurants = await restsRes.json();
  if (!restaurants || restaurants.length === 0) {
    console.error("No restaurants found on live server.");
    process.exit(1);
  }
  
  // Try logging in to the first one, or specifically looking for one
  const targetRestaurant = restaurants[0];
  console.log(`Attempting login for Restaurant: ${targetRestaurant.name} (ID: ${targetRestaurant.id})`);

  console.log("Logging into Live Server...");
  const loginRes = await fetch(`${LIVE_API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurantId: targetRestaurant.id, passcode: 'SARTHAKJAIN01' })
  });

  if (!loginRes.ok) {
    console.error("Login Failed:", await loginRes.text());
    process.exit(1);
  }

  const loginData = await loginRes.json();
  const token = loginData.token;
  const restaurantId = loginData.restaurant.id;
  console.log(`Login Success!`);

  console.log("Fetching local menu items...");
  const localItems = await prisma.menuItem.findMany();
  console.log(`Found ${localItems.length} local items.`);

  console.log("Fetching Live Menu Items...");
  const menuRes = await fetch(`${LIVE_API_URL}/menu?restaurantId=${restaurantId}`);
  const liveItems = await menuRes.json();
  
  if (!Array.isArray(liveItems) || liveItems.length === 0) {
    console.error("No menu items found on live server!");
    process.exit(1);
  }

  console.log(`Found ${liveItems.length} live items. Cross-referencing and updating...`);
  
  let updatedCount = 0;
  for (const liveItem of liveItems) {
    const matchingLocalItem = localItems.find(local => local.name.toLowerCase() === liveItem.name.toLowerCase());
    
    if (matchingLocalItem && matchingLocalItem.imageUrl) {
        
      if (liveItem.imageUrl === matchingLocalItem.imageUrl) {
          continue;
      }
      
      const patchRes = await fetch(`${LIVE_API_URL}/menu/${liveItem.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ imageUrl: matchingLocalItem.imageUrl })
      });
      
      if (patchRes.ok) {
        updatedCount++;
        console.log(`[OK] Synced image for ${liveItem.name}`);
      } else {
        console.error(`[ERR] Failed to sync ${liveItem.name}:`, await patchRes.text());
      }
    }
  }
  
  console.log(`Successfully synced ${updatedCount} items to the live server!`);
}

run()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });

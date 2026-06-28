const fs = require('fs');
const path = require('path');

const LIVE_API_URL = 'https://table-top-frontend-pi.vercel.app/api';
const LOCAL_IMAGE_DIR = path.join(__dirname, '../frontend/public/assets/menu');

const filesToUpload = [
  { name: 'main_course', path: path.join(LOCAL_IMAGE_DIR, 'main_course.png') },
  { name: 'appetizers', path: path.join(LOCAL_IMAGE_DIR, 'appetizers.png') },
  { name: 'breads', path: path.join(LOCAL_IMAGE_DIR, 'breads.png') },
  { name: 'beverages', path: path.join(LOCAL_IMAGE_DIR, 'beverages.png') },
  { name: 'desserts', path: path.join(LOCAL_IMAGE_DIR, 'desserts.png') }
];

async function run() {
  console.log("Logging into Live Server...");
  const loginRes = await fetch(`${LIVE_API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode: 'SARTHAKJAIN01' })
  });

  if (!loginRes.ok) {
    console.error("Login Failed:", await loginRes.text());
    process.exit(1);
  }

  const loginData = await loginRes.json();
  const token = loginData.token;
  const restaurantId = loginData.restaurantId;
  console.log(`Login Success! Restaurant ID: ${restaurantId}`);

  console.log("Uploading images to Live Cloudinary...");
  const cloudinaryUrls = {};

  for (const file of filesToUpload) {
    if (!fs.existsSync(file.path)) {
      console.error(`File not found: ${file.path}`);
      continue;
    }

    const buffer = fs.readFileSync(file.path);
    const blob = new Blob([buffer], { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', blob, `${file.name}.png`);

    const uploadRes = await fetch(`${LIVE_API_URL}/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (uploadRes.ok) {
      const data = await uploadRes.json();
      cloudinaryUrls[file.name] = data.url;
      console.log(`Uploaded ${file.name} -> ${data.url}`);
    } else {
      console.error(`Failed to upload ${file.name}:`, await uploadRes.text());
    }
  }

  console.log("Fetching Live Menu Items...");
  const menuRes = await fetch(`${LIVE_API_URL}/menu?restaurantId=${restaurantId}`);
  const menuItems = await menuRes.json();
  
  if (!Array.isArray(menuItems) || menuItems.length === 0) {
    console.error("No menu items found on live server!");
    process.exit(1);
  }

  console.log(`Found ${menuItems.length} menu items. Updating...`);
  
  let updatedCount = 0;
  for (const item of menuItems) {
    let categoryKey = 'main_course';
    if (item.category === 'Appetizers') categoryKey = 'appetizers';
    else if (item.category === 'Breads') categoryKey = 'breads';
    else if (item.category === 'Beverages') categoryKey = 'beverages';
    else if (item.category === 'Desserts') categoryKey = 'desserts';
    
    const imageUrl = cloudinaryUrls[categoryKey] || cloudinaryUrls['main_course'];
    
    if (imageUrl) {
      const patchRes = await fetch(`${LIVE_API_URL}/menu/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ imageUrl })
      });
      
      if (patchRes.ok) {
        updatedCount++;
        console.log(`[OK] Updated ${item.name} with ${categoryKey} image`);
      } else {
        console.error(`[ERR] Failed to update ${item.name}:`, await patchRes.text());
      }
    }
  }
  
  console.log(`Successfully updated ${updatedCount} / ${menuItems.length} items on the Live server!`);
}

run().catch(console.error);

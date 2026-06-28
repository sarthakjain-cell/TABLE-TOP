const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const google = require('googlethis');

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  const items = await prisma.menuItem.findMany();
  console.log(`Found ${items.length} items. Starting web search for images...`);

  let updatedCount = 0;

  for (const item of items) {
    if (item.imageUrl && !item.imageUrl.includes('main_course') && !item.imageUrl.includes('beverages') && !item.imageUrl.includes('desserts') && !item.imageUrl.includes('appetizers') && !item.imageUrl.includes('breads')) {
        // Skip items that already have a non-fallback image
        console.log(`Skipping ${item.name}, already has a custom image.`);
        continue;
    }

    try {
      const options = {
        page: 0,
        safe: false,
        additional_params: {
          // params
          hl: 'en'
        }
      };

      const query = `${item.name} Indian restaurant food dish high quality`;
      const response = await google.image(query, options);
      
      if (response && response.length > 0) {
        // Try to find a good image URL
        // Avoid vectors or icons if possible
        const bestImage = response.find(img => !img.url.includes('vector') && !img.url.includes('icon')) || response[0];
        const imageUrl = bestImage.url;

        await prisma.menuItem.update({
          where: { id: item.id },
          data: { imageUrl }
        });

        updatedCount++;
        console.log(`[OK] Updated ${item.name} with image: ${imageUrl}`);
      } else {
        console.log(`[WARN] No images found for ${item.name}`);
      }
    } catch (err) {
      console.error(`[ERR] Failed to fetch image for ${item.name}: ${err.message}`);
    }

    // Add a small delay to avoid rate limiting
    await delay(1000);
  }

  console.log(`Successfully updated ${updatedCount} items with web images!`);
}

run()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });

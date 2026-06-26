const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const imageMap = {
  "Butter Chicken": "https://upload.wikimedia.org/wikipedia/commons/3/3c/Chicken_makhni.jpg",
  "Dal Makhni": "https://upload.wikimedia.org/wikipedia/commons/a/ae/Dal_Makhani.jpg",
  "Garlic Naan": "https://upload.wikimedia.org/wikipedia/commons/5/54/Naan_with_Garlic_and_Butter.jpg",
  "Gulab Jamun": "https://upload.wikimedia.org/wikipedia/commons/c/c4/Gulab_jamun_%28Dessert%29.jpg",
  "Samosa Chat": "https://upload.wikimedia.org/wikipedia/commons/c/c8/Samosa_chaat.jpg",
  "Alu Mater Samosa": "https://upload.wikimedia.org/wikipedia/commons/c/c8/Samosa_chaat.jpg",
  "Palak Paneer": "https://upload.wikimedia.org/wikipedia/commons/2/22/Palak_paneer.jpg",
  "Chicken Tikka Masala": "https://upload.wikimedia.org/wikipedia/commons/c/c0/Chicken_tikka_masala.jpg",
  "Cheeseburger": "https://upload.wikimedia.org/wikipedia/commons/4/4d/Cheeseburger.jpg",
  "Paneer Butter Masala": "https://upload.wikimedia.org/wikipedia/commons/a/a4/Paneer_Butter_Masala_or_Paneer_Makhani.jpg",
  "Mutton Curry": "https://upload.wikimedia.org/wikipedia/commons/c/cb/Mutton_Curry_-_Kolkata_2013-12-14_4513.JPG",
  "Chicken Tandoori": "https://upload.wikimedia.org/wikipedia/commons/5/53/Tandoori_chicken_in_a_restaurant.jpg",
  "Chicken Tikka": "https://upload.wikimedia.org/wikipedia/commons/f/fe/Chicken_Tikka_1.jpg",
  "Paneer Tikka": "https://upload.wikimedia.org/wikipedia/commons/1/15/Paneer_Tikka.jpg",
  "Chana Masala": "https://upload.wikimedia.org/wikipedia/commons/3/32/Chole_bhature.jpg",
  "Plain Naan": "https://upload.wikimedia.org/wikipedia/commons/d/dd/Naan_bread.jpg",
  "Butter Naan": "https://upload.wikimedia.org/wikipedia/commons/d/dd/Naan_bread.jpg",
  "Tandoori Roti": "https://upload.wikimedia.org/wikipedia/commons/4/4a/Tandoori_roti.jpg",
  "Lacha Paratha": "https://upload.wikimedia.org/wikipedia/commons/4/49/Lachha_Paratha.jpg",
  "Mango Lassi": "https://upload.wikimedia.org/wikipedia/commons/e/ee/Mango_lassi.jpg",
  "Sweet Lassi": "https://upload.wikimedia.org/wikipedia/commons/3/3a/Lassi_-_Varanasi.jpg",
  "Masala Chai": "https://upload.wikimedia.org/wikipedia/commons/0/07/Masala_Chai.JPG",
  "Diet Coke": "https://upload.wikimedia.org/wikipedia/commons/a/aa/Diet_Coke_2011.jpg",
  "Sprite": "https://upload.wikimedia.org/wikipedia/commons/c/c3/Sprite_Can.jpg",
  "Onion Bhaji": "https://upload.wikimedia.org/wikipedia/commons/1/13/Onion_Bhaji.jpg",
  "Paneer Pakora": "https://upload.wikimedia.org/wikipedia/commons/1/13/Onion_Bhaji.jpg",
  "Rasmalai": "https://upload.wikimedia.org/wikipedia/commons/9/93/Rasmalai_Indian_Sweet.jpg"
};

async function seedImages() {
  const items = await prisma.menuItem.findMany();
  let updated = 0;
  
  for (const item of items) {
    if (imageMap[item.name]) {
      await prisma.menuItem.update({
        where: { id: item.id },
        data: { imageUrl: imageMap[item.name] }
      });
      updated++;
      console.log(`Updated image for ${item.name}`);
    }
  }
  
  console.log(`Successfully assigned images to ${updated} menu items.`);
}

seedImages().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

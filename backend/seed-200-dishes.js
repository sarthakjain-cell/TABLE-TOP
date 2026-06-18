const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const RESTAURANT_ID = 'HOTEL01';

const categories = [
  'Appetizers', 'Main Course', 'Pizzas', 'Pastas', 
  'Burgers & Sandwiches', 'Sides', 'Beverages', 'Desserts', 
  'Salads', 'Soups'
];

const adjectives = ['Spicy', 'Crispy', 'Grilled', 'Roasted', 'Classic', 'Smoked', 'Creamy', 'Tangy', 'Zesty', 'Savory', 'Garlicky', 'Homestyle', 'Premium', 'Signature', 'Loaded', 'Fiery', 'Cheesy', 'Ultimate'];

const vegBases = ['Paneer', 'Mushroom', 'Tofu', 'Mixed Veggie', 'Potato', 'Cheese', 'Corn', 'Broccoli', 'Spinach'];
const nonVegBases = ['Chicken', 'Beef', 'Mutton', 'Fish', 'Prawn', 'Turkey', 'Bacon'];

const dishTypes = {
  'Appetizers': ['Bites', 'Fritters', 'Tikka', 'Kebab', 'Wings', 'Nachos', 'Spring Rolls', 'Poppers', 'Bruschetta', 'Tacos', 'Sliders', 'Platter'],
  'Main Course': ['Curry', 'Masala', 'Stir Fry', 'Steak', 'Bowl', 'Stew', 'Roast', 'Biryani', 'Risotto', 'Sizzler', 'Platter', 'Enchiladas'],
  'Pizzas': ['Pizza', 'Deep Dish Pizza', 'Thin Crust Pizza', 'Flatbread', 'Calzone', 'Stromboli'],
  'Pastas': ['Penne', 'Spaghetti', 'Fettuccine', 'Ravioli', 'Lasagna', 'Macaroni', 'Linguine', 'Tortellini', 'Fusilli', 'Rigatoni'],
  'Burgers & Sandwiches': ['Burger', 'Sandwich', 'Wrap', 'Sub', 'Panini', 'Melt', 'Club', 'Hoagie', 'Pita'],
  'Sides': ['Fries', 'Wedges', 'Mashed Potatoes', 'Onion Rings', 'Garlic Bread', 'Coleslaw', 'Rice', 'Quinoa', 'Veggies', 'Naan', 'Roti', 'Salad'],
  'Beverages': ['Mojito', 'Lemonade', 'Iced Tea', 'Shake', 'Smoothie', 'Frappe', 'Cola', 'Cold Coffee', 'Mocktail', 'Juice', 'Spritzer'],
  'Desserts': ['Cheesecake', 'Brownie', 'Ice Cream', 'Sundae', 'Pudding', 'Tart', 'Cake', 'Mousse', 'Tiramisu', 'Waffle', 'Crepe', 'Pancakes'],
  'Salads': ['Caesar Salad', 'Greek Salad', 'Garden Salad', 'Cobb Salad', 'Bowl', 'Slaw', 'Pasta Salad', 'Fruit Salad'],
  'Soups': ['Soup', 'Broth', 'Chowder', 'Bisque', 'Consomme', 'Stew', 'Ramen', 'Pho']
};

const descriptions = [
  "A perfect blend of flavors, cooked to perfection.",
  "Our signature dish, loved by everyone.",
  "Freshly prepared with authentic spices and herbs.",
  "A delightful treat for your taste buds.",
  "Served hot and fresh, just the way you like it.",
  "A mouth-watering delicacy that you can't resist.",
  "Chef's special recommendation for a hearty meal.",
  "Classic recipe with a modern twist.",
  "Savor the rich taste and premium ingredients.",
  "A comforting classic that hits the spot every time.",
  "Bursting with flavor in every single bite.",
  "An unforgettable culinary experience."
];

function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateDish(category, index) {
  let isVeg = true;
  let base = getRandomElement(vegBases);
  
  // 30% chance of non-veg for non-drink/dessert categories
  if (!['Beverages', 'Desserts', 'Sides'].includes(category) && Math.random() > 0.7) {
    isVeg = false;
    base = getRandomElement(nonVegBases);
  }

  const adj = getRandomElement(adjectives);
  const type = getRandomElement(dishTypes[category]);
  
  // Custom naming for specific categories
  let name = adj + ' ' + base + ' ' + type;
  
  if (category === 'Beverages') {
    const flavors = ['Mint', 'Strawberry', 'Mango', 'Peach', 'Berry', 'Lemon', 'Chocolate', 'Vanilla', 'Caramel'];
    name = adj + ' ' + getRandomElement(flavors) + ' ' + type;
    isVeg = true;
  } else if (category === 'Desserts') {
    const flavors = ['Chocolate', 'Vanilla', 'Strawberry', 'Mango', 'Blueberry', 'Caramel', 'Hazelnut'];
    name = adj + ' ' + getRandomElement(flavors) + ' ' + type;
    isVeg = true;
  } else if (category === 'Pizzas') {
    const pizzaStyles = ['Margherita', 'Pepperoni', 'Hawaiian', 'BBQ', 'Veggie Supreme', 'Meat Lovers', 'Mexican'];
    name = adj + ' ' + getRandomElement(pizzaStyles) + ' ' + type;
    if (name.includes('Pepperoni') || name.includes('Meat') || name.includes('BBQ')) isVeg = false;
  }

  const price = (Math.random() * (25 - 5) + 5).toFixed(2);
  const desc = getRandomElement(descriptions) + " " + (isVeg ? "100% Vegetarian." : "Contains premium meats.");

  return {
    restaurantId: RESTAURANT_ID,
    name: name,
    description: desc,
    price: parseFloat(price),
    category: category,
    isVeg: isVeg,
    isAvailable: true,
    imageUrl: null,
  };
}

async function run() {
  console.log('Generating 200 dishes...');
  const dishes = [];
  const nameSet = new Set();
  
  for (const category of categories) {
    let count = 0;
    let attempts = 0;
    while (count < 20 && attempts < 100) {
      const dish = generateDish(category, count);
      attempts++;
      
      if (!nameSet.has(dish.name)) {
        nameSet.add(dish.name);
        dishes.push(dish);
        count++;
      }
    }
  }

  console.log('Generated ' + dishes.length + ' unique dishes.');

  try {
    let createdCount = 0;
    for (const dish of dishes) {
      await prisma.menuItem.create({ data: dish });
      createdCount++;
    }
    console.log('Successfully inserted ' + createdCount + ' dishes into the database!');
  } catch (err) {
    console.error('Error inserting dishes:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();

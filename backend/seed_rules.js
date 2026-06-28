const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const items = await prisma.menuItem.findMany();
  if (items.length < 5) return console.log("Not enough items to generate rules.");

  // get restaurant id
  const rest = items[0].restaurantId;

  // Generate some fake rules
  const rules = [
    { a: items[0].id, c: items[1].id, conf: 0.85, lift: 2.1 },
    { a: items[0].id, c: items[2].id, conf: 0.65, lift: 1.5 },
    { a: items[1].id, c: items[3].id, conf: 0.90, lift: 3.2 },
    { a: items[2].id, c: items[4].id, conf: 0.45, lift: 1.2 },
    { a: items[4].id, c: items[1].id, conf: 0.75, lift: 2.8 },
    { a: items[3].id, c: items[1].id, conf: 0.88, lift: 3.0 },
    { a: items[5].id, c: items[6].id, conf: 0.60, lift: 1.8 }
  ];

  for (const r of rules) {
    await prisma.recommendationRule.create({
      data: {
        antecedentId: r.a,
        consequentId: r.c,
        confidence: r.conf,
        lift: r.lift,
        restaurantId: rest
      }
    });
  }

  console.log("Seeded fake rules.");
}

main().catch(console.error).finally(() => prisma.$disconnect());

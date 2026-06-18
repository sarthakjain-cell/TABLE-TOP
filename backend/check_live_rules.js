const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres:MAaZyAEQpVPisoGQyRDwBUXCCTZTQBLz@acela.proxy.rlwy.net:12476/railway"
    }
  }
});

async function main() {
  const rules = await prisma.recommendationRule.findMany({
    where: { restaurantId: 'SARTHAKJAIN01' },
    include: {
      antecedent: { select: { name: true } },
      consequent: { select: { name: true } }
    }
  });

  console.log("FOUND RULES:", rules.length);
  for (const r of rules) {
    console.log(`When people buy ${r.antecedent.name}, they also buy ${r.consequent.name} (Confidence: ${r.confidence})`);
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());

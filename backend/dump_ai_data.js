const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient(); // Use local DB

async function main() {
  const rules = await prisma.recommendationRule.findMany({
    include: {
      antecedent: { select: { name: true } },
      consequent: { select: { name: true } }
    }
  });

  const formattedRules = rules.map(r => ({
    antecedent: r.antecedent?.name || 'Unknown',
    consequent: r.consequent?.name || 'Unknown',
    confidence: r.confidence,
    lift: r.lift,
    timeContext: r.timeContext
  }));

  fs.writeFileSync('ai_rules.json', JSON.stringify(formattedRules, null, 2));
  console.log(`Dumped ${formattedRules.length} rules to ai_rules.json`);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());

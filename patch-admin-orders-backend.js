const fs = require('fs');

const file = 'backend/src/routes/restaurants.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  `              sessions: {
                where: { status: 'ACTIVE' },
                include: {
                  transactions: true,
                  orders: {`,
  `              sessions: {
                where: { status: 'ACTIVE' },
                include: {
                  transactions: { include: { paymentItems: true } },
                  orders: {`
);

fs.writeFileSync(file, content);
console.log('Backend restaurants.ts patched to include paymentItems in transactions.');

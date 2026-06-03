process.env.JWT_SECRET = "tabletop-super-secret-key-change-this-in-production";
require('ts-node').register();
const { signUserToken } = require('./src/utils/token.ts');

const adminToken = signUserToken('admin-user-1', 'ADMIN');
const kitchenToken = signUserToken('kitchen-user-1', 'KITCHEN');

console.log('--- ADMIN TOKEN ---');
console.log(adminToken);
console.log('\n--- KITCHEN TOKEN ---');
console.log(kitchenToken);

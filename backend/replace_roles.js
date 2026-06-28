const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, 'src', 'routes');
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.ts'));

for (const file of files) {
  const filePath = path.join(routesDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Replace ['ADMIN', 'KITCHEN'] -> ['MANAGER', 'SUPER_ADMIN', 'WAITER', 'KITCHEN']
  content = content.replace(/\['ADMIN', 'KITCHEN'\]/g, "['MANAGER', 'SUPER_ADMIN', 'WAITER', 'KITCHEN']");
  
  // Replace ['ADMIN'] -> ['MANAGER', 'SUPER_ADMIN']
  content = content.replace(/\['ADMIN'\]/g, "['MANAGER', 'SUPER_ADMIN']");

  fs.writeFileSync(filePath, content);
}

console.log('Roles replaced in all routes.');

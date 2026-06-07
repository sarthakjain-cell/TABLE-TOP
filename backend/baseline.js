const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'prisma', 'migrations', '0_init');
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const sql = cp.execSync('npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script').toString();
fs.writeFileSync(path.join(dir, 'migration.sql'), sql);
console.log('Baseline migration created successfully.');

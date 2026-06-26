const fs = require('fs');
const path = require('path');

const pagePath = path.join(__dirname, 'frontend', 'app', 'admin', 'page.tsx');
let content = fs.readFileSync(pagePath, 'utf8');

if (!content.includes('const [isMounted, setIsMounted] = useState(false);')) {
  content = content.replace(
    "const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';",
    "const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';\n\n  const [isMounted, setIsMounted] = useState(false);\n  useEffect(() => setIsMounted(true), []);\n"
  );
}

// Ensure chartData returns safe values even if transactions fail
content = content.replace(
  "transactions.forEach(tx => {",
  "(transactions || []).forEach(tx => {\n      if (!tx || !tx.createdAt) return;"
);

// Add isMounted check to ResponsiveContainer
content = content.replace(
  "{chartData.length > 0 ? (",
  "{isMounted && chartData.length > 0 ? ("
);

content = content.replace(
  "Not enough data yet.",
  "{isMounted ? 'Not enough data yet.' : 'Loading chart...'}"
);

fs.writeFileSync(pagePath, content);
console.log("Safely patched admin dashboard for hydration errors");

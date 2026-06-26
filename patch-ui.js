const fs = require('fs');
const path = require('path');

const pagePath = path.join(__dirname, 'frontend', 'app', 'table', '[tableToken]', 'page.tsx');
let content = fs.readFileSync(pagePath, 'utf8');

// 1. Add Imports
if (!content.includes('framer-motion')) {
  content = content.replace(
    "import { CheckCircle, Users, Menu, X, ChevronDown } from 'lucide-react';",
    "import { CheckCircle, Users, Menu, X, ChevronDown } from 'lucide-react';\nimport { motion, AnimatePresence } from 'framer-motion';\nimport toast from 'react-hot-toast';"
  );
}

// 2. Wrap renderItemCard in motion.div
content = content.replace(
  /const renderItemCard = \(item: MenuItem, isHorizontal: boolean = false\) => \(\n\s*<div\n\s*key=\{item\.id\}\n\s*className=\{`bg-white\/85 backdrop-blur-lg rounded-3xl p-4 shadow-soft border border-white flex justify-between items-start gap-3 h-full \$\{isHorizontal \? 'w-\[300px\] shrink-0 snap-start' : 'w-full'\}`\}/g,
  `const renderItemCard = (item: MenuItem, isHorizontal: boolean = false) => (\n    <motion.div\n      initial={{ opacity: 0, y: 15 }}\n      whileInView={{ opacity: 1, y: 0 }}\n      viewport={{ once: true, margin: "-50px" }}\n      transition={{ duration: 0.3, ease: "easeOut" }}\n      key={item.id}\n      className={\`bg-white/85 backdrop-blur-lg rounded-3xl p-4 shadow-soft border border-white flex justify-between items-start gap-3 h-full \${isHorizontal ? 'w-[300px] shrink-0 snap-start' : 'w-full'}\`}`
);

content = content.replace(
  /      \)\}\n    <\/div>\n  \);\n\n  const handleItemAddClick/g,
  `      )}\n    </motion.div>\n  );\n\n  const handleItemAddClick`
);

// 3. Replace alert() with toast()
content = content.replace(/alert\("Please enter your Name to proceed\."\);/g, 'toast.error("Please enter your Name to proceed.");');
content = content.replace(/alert\("Please enter a valid 10-digit Phone Number to proceed\."\);/g, 'toast.error("Please enter a valid 10-digit Phone Number to proceed.");');
content = content.replace(/alert\("Order is synchronizing with the kitchen\. Please wait 2 seconds and click Pay again\."\);/g, 'toast.error("Order is synchronizing. Please wait a moment and try again.");');
content = content.replace(/alert\('Payment successful but verification failed: ' \+ err\.message\);/g, 'toast.error("Payment successful but verification failed: " + err.message);');

// 4. Button tactile to motion.button for ADD buttons
content = content.replace(
  /<button onClick=\{\(e\) => \{ e\.stopPropagation\(\); handleItemAddClick\(item, false\); \}\} className="bg-brand-primary\/10 text-brand-primary border border-brand-primary\/20 font-bold text-xs px-4 py-2 rounded-xl uppercase btn-tactile">ADD FULL<\/button>/g,
  `<motion.button whileTap={{ scale: 0.9 }} onClick={(e) => { e.stopPropagation(); handleItemAddClick(item, false); }} className="bg-brand-primary/10 text-brand-primary border border-brand-primary/20 font-bold text-xs px-4 py-2 rounded-xl uppercase btn-tactile">ADD FULL</motion.button>`
);
content = content.replace(
  /<button onClick=\{\(e\) => \{ e\.stopPropagation\(\); handleItemAddClick\(item, true\); \}\} className="bg-white text-gray-700 border border-gray-200 font-bold text-xs px-4 py-2 rounded-xl uppercase btn-tactile">ADD HALF<\/button>/g,
  `<motion.button whileTap={{ scale: 0.9 }} onClick={(e) => { e.stopPropagation(); handleItemAddClick(item, true); }} className="bg-white text-gray-700 border border-gray-200 font-bold text-xs px-4 py-2 rounded-xl uppercase btn-tactile">ADD HALF</motion.button>`
);
content = content.replace(
  /<button onClick=\{\(e\) => \{ e\.stopPropagation\(\); handleItemAddClick\(item, false\); \}\} className="bg-brand-primary\/10 text-brand-primary border border-brand-primary\/20 font-bold text-sm px-8 py-2\.5 rounded-xl uppercase btn-tactile">ADD<\/button>/g,
  `<motion.button whileTap={{ scale: 0.9 }} onClick={(e) => { e.stopPropagation(); handleItemAddClick(item, false); }} className="bg-brand-primary/10 text-brand-primary border border-brand-primary/20 font-bold text-sm px-8 py-2.5 rounded-xl uppercase btn-tactile">ADD</motion.button>`
);

content = content.replace(
  /<button onClick=\{\(e\) => \{ e\.stopPropagation\(\); handleItemAddClick\(item, false\); \}\} className="bg-white text-brand-primary shadow-float font-extrabold text-\[10px\] px-2 py-2 rounded-xl uppercase btn-tactile border border-gray-100 flex-1 text-center">FULL<\/button>/g,
  `<motion.button whileTap={{ scale: 0.9 }} onClick={(e) => { e.stopPropagation(); handleItemAddClick(item, false); }} className="bg-white text-brand-primary shadow-float font-extrabold text-[10px] px-2 py-2 rounded-xl uppercase btn-tactile border border-gray-100 flex-1 text-center">FULL</motion.button>`
);
content = content.replace(
  /<button onClick=\{\(e\) => \{ e\.stopPropagation\(\); handleItemAddClick\(item, true\); \}\} className="bg-white text-gray-700 shadow-float font-extrabold text-\[10px\] px-2 py-2 rounded-xl uppercase btn-tactile border border-gray-100 flex-1 text-center">HALF<\/button>/g,
  `<motion.button whileTap={{ scale: 0.9 }} onClick={(e) => { e.stopPropagation(); handleItemAddClick(item, true); }} className="bg-white text-gray-700 shadow-float font-extrabold text-[10px] px-2 py-2 rounded-xl uppercase btn-tactile border border-gray-100 flex-1 text-center">HALF</motion.button>`
);
content = content.replace(
  /<button onClick=\{\(e\) => \{ e\.stopPropagation\(\); handleItemAddClick\(item, false\); \}\} className="w-\[85%\] bg-white text-brand-primary shadow-float font-extrabold text-sm px-4 py-2\.5 rounded-xl uppercase btn-tactile border border-gray-100">ADD<\/button>/g,
  `<motion.button whileTap={{ scale: 0.9 }} onClick={(e) => { e.stopPropagation(); handleItemAddClick(item, false); }} className="w-[85%] bg-white text-brand-primary shadow-float font-extrabold text-sm px-4 py-2.5 rounded-xl uppercase btn-tactile border border-gray-100">ADD</motion.button>`
);

// 5. Add Skeleton Loader
const skeletonUI = "if (!tableSession) {\n" +
"    return (\n" +
"      <div className='min-h-screen bg-gradient-to-br from-orange-100 via-rose-50 to-indigo-100 p-4 pt-8'>\n" +
"        <div className='w-full max-w-2xl mx-auto flex flex-col gap-4'>\n" +
"          <div className='flex items-center gap-4 mb-4'>\n" +
"            <div className='w-14 h-14 rounded-full bg-gray-200/60 animate-shimmer'></div>\n" +
"            <div className='flex flex-col gap-2'>\n" +
"              <div className='w-32 h-6 bg-gray-200/60 rounded-md animate-shimmer'></div>\n" +
"              <div className='w-16 h-4 bg-gray-200/60 rounded-md animate-shimmer'></div>\n" +
"            </div>\n" +
"          </div>\n" +
"          {[1, 2, 3, 4, 5].map(i => (\n" +
"            <div key={i} className='bg-white/60 backdrop-blur-sm rounded-3xl p-4 border border-white flex justify-between gap-4'>\n" +
"              <div className='flex flex-col gap-3 w-full'>\n" +
"                <div className='w-4 h-4 bg-gray-200/60 rounded-sm animate-shimmer'></div>\n" +
"                <div className='w-3/4 h-5 bg-gray-200/60 rounded-md animate-shimmer'></div>\n" +
"                <div className='w-1/4 h-4 bg-gray-200/60 rounded-md animate-shimmer'></div>\n" +
"                <div className='w-full h-3 bg-gray-200/60 rounded-md animate-shimmer mt-2'></div>\n" +
"                <div className='w-2/3 h-3 bg-gray-200/60 rounded-md animate-shimmer'></div>\n" +
"              </div>\n" +
"              <div className='w-[120px] h-[120px] shrink-0 bg-gray-200/60 rounded-2xl animate-shimmer'></div>\n" +
"            </div>\n" +
"          ))}\n" +
"        </div>\n" +
"      </div>\n" +
"    );\n" +
"  }";

content = content.replace(
  /if \(\!tableSession\) \{\n    return \([\s\S]*?Syncing table session state\.\.\.[\s\S]*?    \);\n  \}/,
  skeletonUI
);

fs.writeFileSync(pagePath, content);
console.log("Successfully patched page.tsx");

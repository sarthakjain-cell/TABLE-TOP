const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'admin-screenshot.png' });
  
  console.log('Screenshot saved to admin-screenshot.png');
  await browser.close();
})();

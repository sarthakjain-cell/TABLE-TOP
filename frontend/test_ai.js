const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));
  page.on('requestfailed', request => console.log('BROWSER REQUEST FAILED:', request.url(), request.failure().errorText));

  await page.goto('http://localhost:3000/table/HOTEL01-1', { waitUntil: 'networkidle0' });
  
  console.log("Page loaded. Searching for Daal Makhni...");
  
  // Find Daal Makhni add button
  const found = await page.evaluate(() => {
     const cards = Array.from(document.querySelectorAll('h3'));
     for (const card of cards) {
        if (card.innerText.includes('Daal Makhni') || card.innerText.includes('Daal')) {
           const btn = card.parentElement.parentElement.querySelector('button');
           if (btn) {
              btn.click();
              return true;
           }
        }
     }
     // Click any add button if Daal Makhni not found
     const anyBtn = document.querySelector('button');
     if(anyBtn) {
       anyBtn.click();
       return true;
     }
     return false;
  });

  console.log("Button clicked:", found);
  
  // Wait a bit to see what happens
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const hasUpsell = await page.evaluate(() => {
     return document.body.innerText.includes('Perfect pairings to go with this');
  });
  
  console.log("Upsell visible:", hasUpsell);

  await browser.close();
})();

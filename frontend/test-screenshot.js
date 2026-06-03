const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Set viewport to standard desktop
  await page.setViewport({ width: 1280, height: 800 });

  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));

  // Go to page
  await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle0' });
  
  // Inject local storage for admin token
  await page.evaluate(() => {
    localStorage.setItem('tabletop_restaurant_id', 'manual-test-rest');
    localStorage.setItem('tabletop_auth_token', 'eyJwYXlsb2FkIjoie1widXNlcklkXCI6XCJkZW1vLWFkbWluXCIsXCJyb2xlXCI6XCJBRE1JTlwiLFwiY3JlYXRlZEF0XCI6MTc4MDQ3NjE5NTgzNH0iLCJzaWduYXR1cmUiOiJhYWJjODY2MmQ4ZjNlOWIzNDM1OTMxZWEzMzViNjhkYWMxODEyNjU5YzJmN2Y5MGRhMjlhYjZhNDc3MTZiMzc4In0');
  });

  // Reload with the token active
  await page.reload({ waitUntil: 'networkidle0' });
  console.log('Page loaded with token!');
  
  // Wait a second for dynamic renders
  await new Promise(r => setTimeout(r, 2000));
  
  // Take screenshot
  await page.screenshot({ path: 'screenshot.png' });
  console.log('Screenshot saved to frontend/screenshot.png');

  await browser.close();
})();

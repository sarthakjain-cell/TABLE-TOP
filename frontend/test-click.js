const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1280, height: 800 });

  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText));
  page.on('response', response => {
    if (response.url().includes('/api/')) {
      console.log(`API RESPONSE: ${response.status()} ${response.url()}`);
    }
  });

  await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle0' });
  
  await page.evaluate(() => {
    localStorage.setItem('tabletop_restaurant_id', 'manual-test-rest');
    localStorage.setItem('tabletop_auth_token', 'eyJwYXlsb2FkIjoie1widXNlcklkXCI6XCJkZW1vLWFkbWluXCIsXCJyb2xlXCI6XCJBRE1JTlwiLFwiY3JlYXRlZEF0XCI6MTc4MDQ3NjE5NTgzNH0iLCJzaWduYXR1cmUiOiJhYWJjODY2MmQ4ZjNlOWIzNDM1OTMxZWEzMzViNjhkYWMxODEyNjU5YzJmN2Y5MGRhMjlhYjZhNDc3MTZiMzc4In0');
  });

  await page.reload({ waitUntil: 'networkidle0' });
  
  console.log('Page loaded with token. Waiting for dashboard to render...');
  await new Promise(r => setTimeout(r, 2000));

  // Find and click the toggle mode button
  const buttons = await page.$$('button');
  for (let btn of buttons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text.includes('Waitstaff') || text.includes('Self-Serve')) {
      console.log('Found toggle button, clicking it...');
      await btn.click();
      break;
    }
  }

  // Wait for the alert
  page.on('dialog', async dialog => {
    console.log('ALERT SHOWN:', dialog.message());
    await dialog.accept();
  });

  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
})();

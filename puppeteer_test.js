const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
   const page = await browser.newPage();
   page.on('requestfailed', req => {
     console.log('Request failed:', req.url(), req.failure()?.errorText, req.headers());
   });
   const consoleMessages = [];
   page.on('console', msg => {
    consoleMessages.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on('response', resp => {
    if (resp.status() >= 400) {
      console.log('Response error:', resp.url(), resp.status(), JSON.stringify(resp.request().headers()));
    }
  });

  // Go to login page
  await page.goto('http://10.1.0.37:8080', {waitUntil: 'networkidle0'});
  // Fill login form (input fields). The login component uses name="username" and name="password".
await page.type('#identifier', 'kshosting');
  await page.type('#password', 'kshosting@55');
  // Click the sign‑in button (button[type="submit"])
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({waitUntil: 'networkidle0'}),
  ]);

  // Debug: inspect localStorage after login
  const accountsLS = await page.evaluate(() => localStorage.getItem('ks.accounts.list'));
  const activeIdLS = await page.evaluate(() => localStorage.getItem('ks.accounts.activeId'));
  console.log('LocalStorage ks.accounts.list:', accountsLS);
  console.log('LocalStorage ks.accounts.activeId:', activeIdLS);
  const cookies = await page.cookies();
  console.log('Cookies after login:', JSON.stringify(cookies));

  // Navigate to the specific instance page.
  await page.goto('http://10.1.0.37:8080/instances/1', {waitUntil: 'networkidle0'});
  // Allow React a moment to render.
  await new Promise(r => setTimeout(r, 2000));

  console.log('=== Console messages from the page ===');
  consoleMessages.forEach(m => console.log(m));
  const html = await page.content();
  console.log('\n=== Page HTML snippet (first 2000 chars) ===');
  console.log(html.slice(0, 2000));

  await browser.close();
})();
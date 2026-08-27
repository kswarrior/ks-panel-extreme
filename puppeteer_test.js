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
    if (resp.url().includes('/api/auth/login')) {
      console.log('Login response headers:', JSON.stringify(resp.headers()));
    }
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
  const derivedToken = await page.evaluate(() => {
    const listStr = localStorage.getItem('ks.accounts.list');
    const activeIdStr = localStorage.getItem('ks.accounts.activeId');
    if (!listStr || !activeIdStr) return null;
    const list = JSON.parse(listStr);
    const idx = parseInt(activeIdStr);
    return list[idx]?.token || null;
  });
  console.log('Derived token from LS:', derivedToken);
  // Manual fetch of /api/me using the token
  await page.evaluate((token) => {
    fetch('/api/me', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
      credentials: 'include'
    }).then(r => r.text()).then(text => console.log('Manual /api/me fetch response:', text)).catch(err => console.error('Manual fetch error', err));
  }, derivedToken);
  const cookies = await page.cookies();
  console.log('Cookies after login:', JSON.stringify(cookies));

  // Navigate to the specific instance page.
  await page.goto('http://10.1.0.37:8080/instances/1', {waitUntil: 'networkidle0'});
  // Allow React a moment to render.
  await new Promise(r => setTimeout(r, 2000));
  const cardExists = await page.$('.glass-card');
  console.log('Glass-card exists?', !!cardExists);

  console.log('=== Console messages from the page ===');
  consoleMessages.forEach(m => console.log(m));
  const html = await page.content();
  console.log('\n=== Page HTML snippet (first 2000 chars) ===');
  console.log(html.slice(0, 2000));

  await browser.close();
})();
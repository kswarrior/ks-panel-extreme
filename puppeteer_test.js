const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  const consoleMessages = [];
  page.on('console', msg => {
    consoleMessages.push(`${msg.type()}: ${msg.text()}`);
  });

  // Go to login page
  await page.goto('http://10.1.0.37:8080', {waitUntil: 'networkidle0'});
  // Fill login form (input fields). The login component uses name="username" and name="password".
  await page.type('input[name="username"]', 'kshosting');
  await page.type('input[name="password"]', 'kshosting@55');
  // Click the sign‑in button (it’s a button element containing the text "Sign In").
  await Promise.all([
    page.click('button:has-text("Sign In")'),
    page.waitForNavigation({waitUntil: 'networkidle0'}),
  ]);

  // Navigate to the specific instance page.
  await page.goto('http://10.1.0.37:8080/instances/1', {waitUntil: 'networkidle0'});
  // Allow React a moment to render.
  await page.waitForTimeout(2000);

  console.log('=== Console messages from the page ===');
  consoleMessages.forEach(m => console.log(m));
  const html = await page.content();
  console.log('\n=== Page HTML snippet (first 2000 chars) ===');
  console.log(html.slice(0, 2000));

  await browser.close();
})();
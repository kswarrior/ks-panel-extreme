const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({headless: true, args:['--no-sandbox','--disable-setuid-sandbox']});
  const page = await browser.newPage();
  await page.goto('http://10.1.0.37:8080', {waitUntil: 'networkidle0'});
  // wait a bit for React to render login form
  await new Promise(r => setTimeout(r, 5000));
  const bodyHtml = await page.evaluate(() => document.body.innerHTML);
  console.log(bodyHtml);
  await browser.close();
})();
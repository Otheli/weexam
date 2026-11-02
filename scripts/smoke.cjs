const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const OUT = process.argv[2];
const BASE = 'http://localhost:5173/';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 860 }, locale: 'id-ID', timezoneId: 'Asia/Jakarta' });
  await ctx.clock.install({ time: new Date('2026-10-29T10:00:00+07:00') }); // Kamis: fase Persiapan
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push('CONSOLE ' + m.text()));
  await page.goto(BASE);
  await page.waitForSelector('.welcome');
  await page.screenshot({ path: OUT + '/01-welcome.png' });
  await page.click('[data-act=sample]');
  await page.waitForSelector('.tcard');
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/02-dashboard.png', fullPage: true });
  console.log('errors:', errs);
  await b.close();
})();

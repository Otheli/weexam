const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const OUT = process.argv[2];
const BASE = 'http://localhost:5173/';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'id-ID', timezoneId: 'Asia/Jakarta' });
  await ctx.clock.install({ time: new Date('2026-10-30T20:00:00+07:00') }); await ctx.clock.resume(); // Jumat malam
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto(BASE + '#/dashboard');
  await page.waitForSelector('.welcome');
  await page.screenshot({ path: OUT + '/m1-welcome.png' });
  await page.click('[data-act=sample]');
  await page.waitForSelector('.tcard');
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + '/m2-dashboard.png' });
  await page.screenshot({ path: OUT + '/m3-dashboard-full.png', fullPage: true });
  for (const [h, n] of [['#/persiapan', 'm4-persiapan'], ['#/ujian', 'm5-ujian'], ['#/evaluasi', 'm6-evaluasi'], ['#/pengaturan', 'm7-pengaturan']]) {
    await page.goto(BASE + h); await page.waitForTimeout(400);
    await page.screenshot({ path: OUT + '/' + n + '.png' });
  }
  await page.goto(BASE + '#/dashboard'); await page.waitForSelector('.tcard');
  await page.click('.tcard >> nth=0'); await page.waitForSelector('.t-hero'); await page.screenshot({ path: OUT + '/m8-topic.png', fullPage: true });
  await page.click('[data-act=topic-edit]'); await page.waitForSelector('.modal'); await page.waitForTimeout(500); await page.screenshot({ path: OUT + '/m9-topic-modal.png' });
  // overflow horizontal?
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  console.log('horizontal overflow:', wide, 'errors:', errs);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message.slice(0, 400)); process.exit(1); });

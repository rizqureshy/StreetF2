// node thumb.js "<query>" out.jpg [scale]
const { chromium } = require('playwright');
(async () => {
  const [query = '', out, scale = '1'] = process.argv.slice(2);
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: +scale });
  await page.goto('http://127.0.0.1:8400/film/thumb.html?' + query);
  await page.waitForFunction(() => window.__ready, null, { timeout: 30000 });
  await page.screenshot({ path: out, type: 'jpeg', quality: 92 });
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

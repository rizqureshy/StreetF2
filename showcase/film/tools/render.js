// Render film frames [f0, f1) to JPEGs.  node render.js <f0> <f1>
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [f0, f1] = process.argv.slice(2).map(Number);
  const out = `${__dirname}/../frames`; fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errs = new Set();
  page.on('pageerror', e => errs.add('PAGEERR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.add(m.text().slice(0, 140)); });
  await page.goto('http://127.0.0.1:8400/film/film.html');
  await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
  const t0 = Date.now();
  for (let f = f0; f < f1; f++) {
    await page.evaluate(t => window.renderAt(t), f / 30);
    await page.screenshot({ path: `${out}/${String(f).padStart(6, '0')}.jpg`, type: 'jpeg', quality: 93 });
    if ((f - f0) % 300 === 299) console.log(`[${f0}-${f1}] ${f - f0 + 1} frames, ${((Date.now() - t0) / (f - f0 + 1)).toFixed(0)} ms/frame`);
  }
  console.log(`[${f0}-${f1}] done in ${((Date.now() - t0) / 1000).toFixed(0)} s`, [...errs].slice(0, 6).join(' | '));
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

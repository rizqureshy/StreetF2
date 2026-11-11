const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const page = await b.newPage();
  await page.goto('http://127.0.0.1:8400/film/film.html'); await page.waitForFunction(() => window.__ready);
  const caps = await page.evaluate(() => window.CAPS);
  const ts = t => { const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = Math.floor(t) % 60, ms = Math.round((t % 1) * 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`; };
  fs.writeFileSync(process.argv[2], caps.map((c, i) => `${i + 1}\n${ts(c.a)} --> ${ts(c.b)}\n${c.text}\n`).join('\n'));
  console.log('captions', caps.length); await b.close();
})();

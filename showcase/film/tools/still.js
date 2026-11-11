// node still.js "t1,t2,..." out.jpg [cols]  -> contact sheet of film frames
const { chromium } = require('playwright');
(async () => {
  const [times, out, cols = '3'] = process.argv.slice(2);
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = new Set();
  page.on('pageerror', e => errs.add('PAGEERR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.add(m.text().slice(0, 120)); });
  await page.goto('http://127.0.0.1:8400/film/film.html');
  await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
  const shots = [];
  for (const t of times.split(',').map(Number)) {
    await page.evaluate(t => window.renderAt(t), t);
    shots.push([t, (await page.screenshot({ type: 'jpeg', quality: 88 })).toString('base64')]);
  }
  const c = +cols, w = Math.floor(1920 / c), h = Math.round(w * 9 / 16);
  const sheet = await b.newPage({ viewport: { width: w * c, height: h * Math.ceil(shots.length / c) } });
  await sheet.setContent('<body style="margin:0;background:#000;display:flex;flex-wrap:wrap">' + shots.map(([t, s]) => `<div style="position:relative"><img src="data:image/jpeg;base64,${s}" width=${w} height=${h}><span style="position:absolute;left:4px;top:2px;color:#0f0;font:13px monospace;background:#000">${t}</span></div>`).join('') + '</body>');
  await sheet.screenshot({ path: out, type: 'jpeg', quality: 90 });
  console.log([...errs].slice(0, 8).join('\n') || 'no errors');
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

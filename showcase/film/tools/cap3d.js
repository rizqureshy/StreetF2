// Frame-exact capture of the 3D game (uses ?capture=30).
//   node cap3d.js <name> "<query>" '<json opts>'
// opts: { windows: [[tick0, tick1], ...], pre: bool (record before the match exists), keys: [[frame, code], ...], max: frames, w, h }
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [name, query, optsJson = '{}'] = process.argv.slice(2);
  const o = Object.assign({ windows: [], pre: false, keys: [], max: 4000, w: 1920, h: 1080, fps: 30 }, JSON.parse(optsJson));
  const out = `${__dirname}/../clips/${name}`;
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const page = await b.newPage({ viewport: { width: o.w, height: o.h }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.log('PAGEERR ' + e.message));
  await page.goto(`http://127.0.0.1:8300/index.html?capture=${o.fps}&${query}`);
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 240000 });
  await page.evaluate(() => {
    window.__animStep = ms => { for (const a of document.getAnimations()) { if (a.__t === undefined) { a.pause(); a.__t = a.currentTime || 0; } a.__t += ms; try { a.currentTime = a.__t; } catch (e) { /* finished */ } } };
  });
  const lastEnd = o.windows.length ? Math.max(...o.windows.map(w => w[1])) : Infinity;
  const inWin = t => o.all || (t < 0 ? o.pre : o.windows.some(w => t >= w[0] - 2 && t <= w[1]));
  const meta = []; let shot = 0, tick = -1; const t0 = Date.now();
  for (let f = 0; f < o.max; f++) {
    for (const [kf, code] of o.keys) if (kf === f) await page.keyboard.press(code);
    const render = inWin(tick);
    const r = await page.evaluate(rn => { const t = window.__game.captureFrame(rn); window.__animStep(1000 / 30); const g = window.__game.G; return { t, time: g.time, scr: g.match ? g.match.screen : g.screen }; }, render);
    tick = r.t;
    if (render) {
      await page.screenshot({ path: `${out}/${String(shot).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 94 });
      meta.push({ i: shot, f, tick, time: +r.time.toFixed(4), scr: r.scr });
      shot++;
      if (shot % 60 === 0) console.log(name, 'captured', shot, 'tick', tick, ((Date.now() - t0) / 1000 / shot).toFixed(2) + ' s/frame');
    }
    if (tick > lastEnd) break;
    if (o.stopOnMatch && tick >= 0 && !o.windows.length) break;
  }
  const audio = await page.evaluate(() => window.__game.audioLog.events);
  fs.writeFileSync(`${out}/meta.json`, JSON.stringify({ frames: meta, audio }));
  console.log(name, 'done: frames', shot, 'in', ((Date.now() - t0) / 1000).toFixed(0), 's');
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

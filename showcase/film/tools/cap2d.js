// Deterministic capture of an old 2D build: virtual clock, scripted player, one JPEG per 1/30 s.
//   node cap2d.js <build> <frames> [seed] [preFightFrames]
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [build, framesArg = '600', seedArg = '7', webgl = '0'] = process.argv.slice(2);
  const out = `${__dirname}/../clips/b${build}`;
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const page = await b.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.log('PAGEERR ' + e.message));
  await page.addInitScript(() => {
    let vnow = 1000; const q = [];
    performance.now = () => vnow; Date.now = () => 1700000000000 + vnow;
    window.requestAnimationFrame = cb => { q.push(cb); return q.length; };
    window.__advance = ms => { vnow += ms; const run = q.splice(0, q.length); for (const cb of run) cb(vnow); };
  });
  await page.goto(`http://127.0.0.1:8400/builds/${build}/index.html`);
  await page.waitForTimeout(1500);
  // let assets finish loading under the virtual clock
  for (let i = 0; i < 20; i++) { await page.evaluate(() => window.__advance(33.3334)); await page.waitForTimeout(40); }
  const canvas = page.locator('canvas').first();
  let seed = +seedArg; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const down = new Set();
  const set = async (code, on) => { if (on === down.has(code)) return; on ? down.add(code) : down.delete(code); await page.evaluate(([c, o]) => window.dispatchEvent(new KeyboardEvent(o ? 'keydown' : 'keyup', { code: c, key: c })), [code, on]); };
  const tap = async code => { await set(code, true); taps.push(code); };
  let taps = [];
  let plan = { until: 0, keys: [] }, fightFrames = 0;
  const log = [];
  const total = +framesArg;
  for (let f = 0; f < total; f++) {
    for (const c of taps) await set(c, false); taps = [];
    const st = await page.evaluate(() => { try { const g = game; return { s: g.screen, x1: g.p1 ? g.p1.x : 0, x2: g.p2 ? g.p2.x : 0, m: g.p1 ? g.p1.meter : 0, g: g.p1 ? g.p1.y : 0 }; } catch (e) { return { s: '?' }; } });
    if (st.s === 'fight') {
      fightFrames++;
      if (f >= plan.until) {
        for (const k of plan.keys) await set(k, false);
        const dist = Math.abs(st.x2 - st.x1), fwd = st.x2 >= st.x1 ? 'KeyD' : 'KeyA', back = st.x2 >= st.x1 ? 'KeyA' : 'KeyD';
        const r = rnd(); plan = { until: f + 6 + Math.floor(rnd() * 10), keys: [] };
        if (dist > 260) { if (r < 0.6) plan.keys = [fwd]; else if (r < 0.8) { plan.keys = [fwd]; await tap('KeyW'); } else { await tap('KeyS'); plan.special = 2; } }
        else if (r < 0.34) await tap('KeyF');
        else if (r < 0.6) await tap('KeyG');
        else if (r < 0.7) { await set('KeyS', true); plan.keys = ['KeyS']; await tap('KeyG'); }
        else if (r < 0.8) { plan.keys = [back]; }
        else if (r < 0.9) { plan.keys = [fwd]; await tap('KeyW'); }
        else if (st.m >= 100) await tap('KeyH'); else { plan.keys = [fwd]; }
        for (const k of plan.keys) await set(k, true);
      } else if (plan.special === 2 && f === plan.until - 3) { await set(st.x2 >= st.x1 ? 'KeyD' : 'KeyA', true); await tap('KeyF'); plan.keys.push(st.x2 >= st.x1 ? 'KeyD' : 'KeyA'); plan.special = 0; }
    } else {
      for (const k of [...down]) await set(k, false);
      if (st.s !== 'intro' && st.s !== 'roundend' && st.s !== 'versus' && f % 14 === 5) await tap(st.s === 'select' || st.s === 'stagesel' ? 'KeyF' : 'Enter');
      if ((st.s === 'select' || st.s === 'stagesel') && f % 14 === 11) await tap('Enter');
    }
    await page.evaluate(() => window.__advance(33.3334));
    await canvas.screenshot({ path: `${out}/${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 95 });
    log.push(st.s);
  }
  // compact screen log: [screen, firstFrame]
  const runs = []; log.forEach((s, i) => { if (!runs.length || runs[runs.length - 1][0] !== s) runs.push([s, i]); });
  fs.writeFileSync(`${out}/screens.json`, JSON.stringify(runs));
  console.log(build, 'frames', total, 'fight', fightFrames, JSON.stringify(runs).slice(0, 300));
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

// Optional browser smoke test (needs Playwright and a server on :8080 —
// `npm start`).  Boots the game in step mode, walks title -> menu -> arcade
// select -> match, wins a round and checks that nothing threw.
//   node tests/e2e.mjs [baseUrl]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:8080';

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base + '/index.html?step=1&q=low');
await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 180000 });
const frames = async (n = 2) => { const f0 = await page.evaluate(() => window.__game.G.frames); await page.waitForFunction(([f, k]) => window.__game.G.frames >= f + k, [f0, n], { timeout: 60000 }); };
const key = async k => { await page.keyboard.press(k); await frames(); };
const adv = (n, p1) => page.evaluate(([k, src]) => window.__game.advance(k, src ? eval(src) : null), [n, p1 || '']);
const state = () => page.evaluate(() => { const g = window.__game.G, m = g.match; return { screen: g.screen, match: m && m.screen, wins: m && m.wins, shown: [...document.querySelectorAll('.screen.on')].map(e => e.id) }; });
const expect = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exitCode = 1; } else console.log('  ok  ' + msg); };

expect((await state()).shown.includes('title'), 'title screen is shown over the attract fight');
await key('Enter');
expect((await state()).shown.includes('menu'), 'main menu opens');
await key('Enter');
expect((await state()).screen === 'select', 'arcade opens character select');
await key('KeyF'); await adv(40);
expect((await state()).screen === 'versus', 'locking a fighter leads to the versus splash');
await adv(190);
expect((await state()).screen === 'match', 'match starts');
await key('Enter');
for (let i = 0; i < 20 && (await state()).match !== 'fight'; i++) await adv(30);
expect((await state()).match === 'fight', 'intro hands over control');
// make the opponent a passive dummy one hit from defeat, standing in range
await page.evaluate(() => { const m = window.__game.G.match; m.cpu = [false, false]; m.p1.x = -0.5; m.p2.x = 0.5; m.p2.hp = 1; });
await adv(30);
// (player one may still be recovering from an earlier exchange, so retry)
for (let i = 0; i < 8 && (await state()).match === 'fight'; i++) {
  await page.evaluate(() => { const m = window.__game.G.match; m.p1.x = -0.5; m.p2.x = 0.5; m.p2.hp = 1; });
  await adv(1, 'i => ({ light: true })'); await adv(45);
}
const s = await state();
expect(s.match === 'roundend' && s.wins[0] === 1, 'a slash KO ends the round for player one');
// HDR overflow guard: one absurdly bright pixel must not blank the frame
// (bloom used to smear it and tone mapping turned the result black).
await key('Escape');
const meanLuma = () => page.evaluate(async () => {
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const src = document.getElementById('view'), c = document.createElement('canvas'); c.width = 64; c.height = 36;
  const x = c.getContext('2d'); x.drawImage(src, 0, 0, 64, 36);
  const d = x.getImageData(0, 0, 64, 36).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
  return s / (d.length / 4) / 3;
});
await page.evaluate(async () => {
  const THREE = await import('three');
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1e30, 1e30, 1e30), fog: false }));
  m.position.set(0, 1.6, 0.5); window.__game.gfx.scene.add(m); window.__game.gfx.setQuality('medium');
});
await frames(3);
const luma = await meanLuma();
expect(luma > 6, 'an over-range HDR pixel does not blank the picture (mean luma ' + luma.toFixed(1) + ')');
expect(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();

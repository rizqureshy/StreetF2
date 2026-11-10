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
await adv(1, 'i => ({ light: true })'); await adv(30);
const s = await state();
expect(s.match === 'roundend' && s.wins[0] === 1, 'a slash KO ends the round for player one');
await key('Escape');
expect(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();

// Headless simulation tests: node tests/sim.test.mjs
import assert from 'node:assert/strict';
import { Match, emptyPad } from '../src/sim.js';
import { CHARACTERS, ATTACKS, MAX_HP, STAGE_HALF, moveset, charById } from '../src/config.js';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };
const mk = (o = {}) => new Match(Object.assign({ p1: charById('kaito'), p2: charById('akane'), cpu: [false, false], rng: rng(7), cinematic: false }, o));
const run = (m, n, p1 = emptyPad, p2 = emptyPad) => { for (let i = 0; i < n; i++) m.tick(typeof p1 === 'function' ? p1(i) : p1, typeof p2 === 'function' ? p2(i) : p2); };
const toFight = m => { while (m.screen === 'intro') m.tick(emptyPad(), emptyPad()); m.events.length = 0; };
const press = (btn, extra = {}) => i => Object.assign(emptyPad(), extra, i === 0 ? { [btn]: true } : {});

test('every character has a complete, well-formed moveset', () => {
  for (const c of CHARACTERS) {
    const ms = moveset(c);
    for (const [n, d] of Object.entries(ms)) {
      assert.ok(d.startup > 0 && d.active > 0 && d.recovery >= 0, `${c.id}.${n} frames`);
      assert.ok(d.anim || d.segs, `${c.id}.${n} animation`);
      if (d.segs) assert.equal(d.segs[d.segs.length - 1][1], d.startup + d.active + d.recovery, `${c.id}.${n} segs cover the move`);
      if (!d.projectile) assert.ok(d.box, `${c.id}.${n} box`);
    }
    assert.ok(ms[c.superMove], c.id + ' super');
  }
});

test('intro hands control over and the round timer runs', () => {
  const m = mk();
  assert.equal(m.screen, 'intro');
  toFight(m);
  assert.equal(m.screen, 'fight');
  assert.ok(m.p1.controllable && m.p2.controllable);
  run(m, 61);
  assert.equal(m.timeLeft, 98);
});

test('cinematic intro can be skipped', () => {
  const m = mk({ cinematic: true });
  run(m, 20);
  assert.ok(m.skipIntro());
  let n = 0; while (m.screen === 'intro' && n++ < 400) m.tick(emptyPad(), emptyPad());
  assert.equal(m.screen, 'fight');
  assert.ok(n < 200);
});

test('a slash hits at range, deals damage and causes hit-stun', () => {
  const m = mk(); toFight(m);
  m.p1.x = -0.6; m.p2.x = 0.6;
  run(m, 20, press('light'));
  assert.ok(m.p2.hp < MAX_HP, 'damage dealt');
  assert.equal(m.p2.state, 'hit');
  assert.ok(m.events.some(e => e.type === 'hit' && !e.blocked));
});

test('a slash whiffs when out of reach', () => {
  const m = mk(); toFight(m);
  m.p1.x = -2.5; m.p2.x = 2.5;
  run(m, 40, press('light'));
  assert.equal(m.p2.hp, MAX_HP);
});

test('holding back blocks (no damage from a light attack)', () => {
  const m = mk(); toFight(m);
  m.p1.x = -0.6; m.p2.x = 0.6;
  run(m, 20, press('light'), () => Object.assign(emptyPad(), { right: true }));
  assert.equal(m.p2.hp, MAX_HP);
  assert.ok(m.events.some(e => e.type === 'hit' && e.blocked));
});

test('light attacks chain three times on hit and the third knocks down', () => {
  const m = mk(); toFight(m);
  m.p1.x = -0.6; m.p2.x = 0.7;
  const names = [];
  for (let i = 0; i < 150; i++) {
    const pad = emptyPad(); if (i % 6 === 0) pad.light = true;
    m.tick(pad, emptyPad());
    if (m.p1.attack && names[names.length - 1] !== m.p1.attack.name) names.push(m.p1.attack.name);
    if (m.p2.state === 'down') break;
  }
  assert.deepEqual(names.slice(0, 3), ['slash1', 'slash2', 'slash3']);
  assert.equal(m.p2.state, 'down');
  assert.ok(m.events.some(e => e.type === 'combo' && e.count >= 3));
});

test('special moves: wave spawns a projectile that travels and hits', () => {
  const m = mk(); toFight(m);
  run(m, 120, press('wave'));
  assert.ok(m.events.some(e => e.type === 'projectile'));
  assert.ok(m.p2.hp < MAX_HP, 'projectile connected');
});

test('quarter-circle + light also throws the wave', () => {
  const m = mk(); toFight(m);
  const seq = i => { const p = emptyPad(); if (i < 4) p.down = true; else if (i < 8) p.right = true; if (i === 6) p.light = true; return p; };
  run(m, 30, seq);
  assert.ok(m.events.some(e => e.type === 'callout'));
});

test('rising slash leaves the ground and lands again', () => {
  const m = mk(); toFight(m);
  let maxY = 0;
  for (let i = 0; i < 120; i++) { m.tick(press('rising')(i), emptyPad()); maxY = Math.max(maxY, m.p1.y); }
  assert.ok(maxY > 0.8, 'airborne ' + maxY);
  assert.ok(m.p1.grounded);
  assert.equal(m.p1.state, 'idle');
});

test('throw beats a blocking opponent', () => {
  const m = mk(); toFight(m);
  m.p1.x = -0.4; m.p2.x = 0.4;
  run(m, 30, i => Object.assign(emptyPad(), { right: true }, i === 2 ? { light: true } : {}), () => Object.assign(emptyPad(), { right: true }));
  assert.ok(m.p2.hp < MAX_HP);
});

test('super needs a full meter and spends it', () => {
  const m = mk(); toFight(m);
  run(m, 5, press('super'));
  assert.equal(m.p1.attack, null);
  m.p1.meter = 100;
  run(m, 5, press('super'));
  assert.equal(m.p1.attack.name, 'superWave');
  assert.equal(m.p1.meter, 0);
});

test('KO ends the round, awards the win and starts the next round', () => {
  const m = mk(); toFight(m);
  m.p1.x = -0.6; m.p2.x = 0.6; m.p2.hp = 3;
  run(m, 20, press('light'));
  assert.equal(m.screen, 'roundend');
  assert.deepEqual(m.wins, [1, 0]);
  assert.equal(m.p2.state, 'ko');
  run(m, 400);
  assert.equal(m.round, 2);
});

test('fighters stay inside the stage', () => {
  const m = mk(); toFight(m);
  run(m, 400, () => Object.assign(emptyPad(), { left: true }), () => Object.assign(emptyPad(), { right: true }));
  assert.ok(m.p1.x >= -STAGE_HALF && m.p2.x <= STAGE_HALF);
});

test('time out with equal health goes to sudden death', () => {
  const m = mk(); toFight(m);
  m.timeLeft = 1; run(m, 61);
  assert.ok(m.suddenDeath);
  assert.equal(m.p1.hp, 1);
});

test('CPU vs CPU matches always finish, for every pairing', () => {
  let seed = 1;
  for (const a of CHARACTERS) for (const b of CHARACTERS) {
    const m = new Match({ p1: a, p2: b, cpu: [true, true], rng: rng(seed++), difficulty: 2, cinematic: seed % 2 === 0 });
    let n = 0;
    while (m.screen !== 'matchend' && n++ < 60 * 60 * 8) m.tick(null, null);
    assert.equal(m.screen, 'matchend', `${a.id} vs ${b.id} finished`);
    assert.ok(m.winner);
    for (const f of m.fighters) assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y));
  }
});

test('simulation is deterministic for a given seed', () => {
  const sig = () => { const m = new Match({ p1: CHARACTERS[0], p2: CHARACTERS[2], cpu: [true, true], rng: rng(99), cinematic: false }); for (let i = 0; i < 3000; i++) m.tick(null, null); return [m.p1.x, m.p2.x, m.p1.hp, m.p2.hp, m.round].join(','); };
  assert.equal(sig(), sig());
});

console.log(`\n${passed} simulation tests passed`);

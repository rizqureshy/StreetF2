// Headless search for seeds whose CPU-vs-CPU match has an exciting stretch.
//   node findseed.mjs <p1> <p2> <diff> [seeds] [windowTicks]
import { Match } from '../../../src/sim.js';
import { charById } from '../../../src/config.js';
const [p1, p2, diff = '2', nSeeds = '200', win = '540'] = process.argv.slice(2);
const rng = seed => { let x = seed >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); };
const best = [];
for (let seed = 1; seed <= +nSeeds; seed++) {
  const m = new Match({ p1: charById(p1), p2: charById(p2), cpu: [true, true], difficulty: +diff, cinematic: true, rng: rng(seed) });
  const ev = [];
  for (let t = 0; t < 60 * 150 && m.screen !== 'matchend'; t++) {
    m.tick(null, null);
    for (const e of m.events.splice(0)) {
      if (e.type === 'hit') ev.push({ t: m.frame, k: e.blocked ? 'blk' : e.ko ? 'KO' : e.isSuper ? 'SUPERHIT' : e.special ? 'sp' : e.heavy ? 'hv' : 'hit', a: e.attacker.side });
      else if (e.type === 'superStart') ev.push({ t: m.frame, k: 'SUPER', a: e.f.side });
      else if (e.type === 'combo' && e.count >= 3) ev.push({ t: m.frame, k: 'combo' + e.count, a: e.side });
      else if (e.type === 'roundEnd') ev.push({ t: m.frame, k: 'END', a: e.winner ? e.winner.side : -1 });
      else if (e.type === 'projectile') ev.push({ t: m.frame, k: 'proj', a: e.f.side });
    }
  }
  const W = +win, score = { hit: 1, hv: 2, sp: 3, blk: 0.6, proj: 1, SUPER: 5, SUPERHIT: 3, KO: 4, combo3: 3, combo4: 4, combo5: 5, END: 0 };
  for (const e0 of ev) {
    const inW = ev.filter(e => e.t >= e0.t && e.t < e0.t + W);
    const sides = new Set(inW.filter(e => e.k !== 'blk').map(e => e.a));
    let sc = inW.reduce((a, e) => a + (score[e.k] ?? 3), 0) + (sides.size > 1 ? 4 : 0);
    const hasKO = inW.some(e => e.k === 'KO'), hasSuper = inW.some(e => e.k === 'SUPER');
    best.push({ seed, t0: Math.max(0, e0.t - 50), t1: e0.t + W, sc: +sc.toFixed(1), ko: hasKO, sup: hasSuper, ev: inW.map(e => e.k + (e.a ? "'" : '')).join(' ') });
  }
}
best.sort((a, b) => b.sc - a.sc);
const pick = (f, n) => { const out = [], seen = new Set(); for (const b of best.filter(f)) { if (seen.has(b.seed)) continue; seen.add(b.seed); out.push(b); if (out.length >= n) break; } return out; };
console.log('TOP action:'); for (const b of pick(x => !x.ko, 3)) console.log(JSON.stringify(b));
console.log('TOP with super + KO:'); for (const b of pick(x => x.ko && x.sup, 3)) console.log(JSON.stringify(b));

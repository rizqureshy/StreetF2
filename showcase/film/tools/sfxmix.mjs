// Rebuild the game's sound for the 3D footage: the capture logged every sample
// request with the game clock; place those samples on the film timeline.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const V = new URL('..', import.meta.url).pathname, ASSETS = new URL('../../../assets/', import.meta.url).pathname;
const SR = 48000, DUR = 271;
const audioSrc = fs.readFileSync(new URL('../../../src/audio.js', import.meta.url), 'utf8');
const FILES = Object.fromEntries([...audioSrc.matchAll(/(\w+): '((?:sfx|vo)\/[\w.]+\.mp3)'/g)].map(m => [m[1], m[2]]));
const cache = {};
const pcm = name => {
  if (cache[name] !== undefined) return cache[name];
  if (!FILES[name]) return (cache[name] = null);
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', ASSETS + FILES[name], '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 28 });
  return (cache[name] = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
};
// [clip, filmStart, filmEnd, firstFrameExpr, speed, gain]
const meta = n => JSON.parse(fs.readFileSync(`${V}clips/${n}/meta.json`, 'utf8'));
const M = { c_storm: meta('c_storm'), c_siege: meta('c_siege'), c_moon: meta('c_moon') };
const idx = { c_storm: { i0: 0 }, c_siege: { i0: 0 }, c_moon: { intro: Math.max(0, M.c_moon.frames.findIndex(f => f.tick >= 0)), act: M.c_moon.frames.findIndex(f => f.tick >= 2000) } };
const USES = [
  ['c_storm', 0.2, 8.6, 0, 1, 1.0], ['c_siege', 8.2, 14.4, 20, 1, 1.0],
  ['c_moon', 201.0, 206.4, 2, 0.6, 0.8], ['c_storm', 206, 209, 120, 1, 0.8], ['c_storm', 219.0, 222, 40, 1, 0.8],
  ['c_siege', 221.6, 236.4, 0, 0.86, 0.45], ['c_moon', 236.2, 256.6, idx.c_moon.act, 0.8, 0.7],
];
const L = new Float32Array(SR * DUR), R = new Float32Array(SR * DUR);
let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
let placed = 0;
for (const [clip, a, b, off, speed, gain] of USES) {
  const fr = M[clip].frames; if (!fr[off]) continue;
  const g0 = fr[off].time, span = (b - a) * speed;
  const fadeIn = 0.25, fadeOut = 0.4;
  for (const e of M[clip].audio) {
    const rel = e.t - g0; if (rel < -0.05 || rel > span) continue;
    const cands = e.names.filter(n => pcm(n)); if (!cands.length) continue;
    const s = pcm(cands[Math.floor(rnd() * cands.length)]);
    const ft = a + rel / speed, rate = e.rate * (1 + (rnd() * 2 - 1) * 0.04);
    const isVo = e.names[0].startsWith('vo_');
    const env = Math.min(1, Math.max(0, (ft - a) / fadeIn), Math.max(0, (b - ft) / fadeOut));
    const vol = e.vol * gain * (isVo ? 0.55 : 1) * Math.max(0.15, env);
    const pan = Math.max(-1, Math.min(1, e.pan || 0)), gl = vol * Math.cos((pan + 1) * Math.PI / 4) * 1.2, gr = vol * Math.sin((pan + 1) * Math.PI / 4) * 1.2;
    const start = Math.floor(ft * SR), n = Math.floor(s.length / rate);
    for (let i = 0; i < n; i++) {
      const k = start + i; if (k < 0 || k >= L.length) continue;
      const p = i * rate, i0 = p | 0, v = s[i0] + (s[Math.min(s.length - 1, i0 + 1)] - s[i0]) * (p - i0);
      L[k] += v * gl; R[k] += v * gr;
    }
    placed++;
  }
}
// write 16-bit stereo WAV with a soft clip
const out = Buffer.alloc(44 + L.length * 4);
out.write('RIFF', 0); out.writeUInt32LE(36 + L.length * 4, 4); out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(L.length * 4, 40);
const sc = x => Math.tanh(x * 0.9);
for (let i = 0; i < L.length; i++) { out.writeInt16LE(Math.round(sc(L[i]) * 32000), 44 + i * 4); out.writeInt16LE(Math.round(sc(R[i]) * 32000), 46 + i * 4); }
fs.writeFileSync(`${V}audio/sfx.wav`, out);
console.log('sfx events placed:', placed);

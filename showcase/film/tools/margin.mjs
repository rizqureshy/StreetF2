// Speech-gated narration vs. music-bed level per section (0.5 s windows).
import fs from 'node:fs';
const V = new URL('..', import.meta.url).pathname + 'audio/';
const rd = n => { const b = fs.readFileSync(V + n); const a = new Int16Array(b.buffer, b.byteOffset + 44, (b.length - 44) >> 1); const m = new Float32Array(a.length >> 1); for (let i = 0; i < m.length; i++) m[i] = (a[2 * i] + a[2 * i + 1]) / 65536; return m; };
const vo = rd('voonly.wav'), bed = rd('bedonly.wav'), win = 24000, n = Math.floor(Math.min(vo.length, bed.length) / win);
const rms = (a, i) => { let s = 0; for (let k = i * win; k < (i + 1) * win; k++) s += a[k] * a[k]; return 10 * Math.log10(s / win + 1e-12); };
for (const [a, b] of [[0, 21], [21, 63], [63, 112], [112, 154], [154, 171], [171, 206], [206, 222], [222, 257], [257, 271]]) {
  let sv = 0, sb = 0, c = 0, mn = 99, gb = 0, gc = 0;
  for (let i = a * 2; i < Math.min(n, b * 2); i++) { const v = rms(vo, i), d = rms(bed, i); if (v > -30) { sv += v; sb += d; c++; mn = Math.min(mn, v - d); } else { gb += d; gc++; } }
  console.log(`${a}-${b}s  speech: vo ${(sv / c).toFixed(1)} bed ${(sb / c).toFixed(1)} margin ${((sv - sb) / c).toFixed(1)} (min ${mn.toFixed(1)})  gaps: bed ${(gb / (gc || 1)).toFixed(1)}`);
}

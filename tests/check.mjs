// Static checks: every game module parses, and every asset path referenced by
// the data tables exists on disk.  node tests/check.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { STAGES, CHARACTERS } from '../src/config.js';

let n = 0;
for (const f of readdirSync(new URL('../src/', import.meta.url))) {
  if (!f.endsWith('.js')) continue;
  execFileSync(process.execPath, ['--check', new URL('../src/' + f, import.meta.url).pathname]);
  n++;
}
execFileSync(process.execPath, ['--check', new URL('../sw.js', import.meta.url).pathname]);
const need = [];
for (const s of STAGES) need.push(`assets/stages/${s.bg}.webp`, `assets/stages/${s.bg}_thumb.webp`, `assets/stages/${s.ground}.webp`, `assets/music/${s.music}.mp3`);
for (const c of CHARACTERS) need.push(`assets/models/${c.model}.glb`);
need.push('assets/music/title.mp3', 'assets/sfx/silence.mp3', 'vendor/three/three.module.min.js');
const audio = readFileSync(new URL('../src/audio.js', import.meta.url), 'utf8');
for (const m of audio.matchAll(/'((?:sfx|vo|music)\/[\w.]+\.mp3)'/g)) need.push('assets/' + m[1]);
const missing = [...new Set(need)].filter(p => !existsSync(new URL('../' + p, import.meta.url)));
if (missing.length) { console.error('missing assets:\n  ' + missing.join('\n  ')); process.exit(1); }
console.log(`${n} modules parse, ${new Set(need).size} referenced assets present`);

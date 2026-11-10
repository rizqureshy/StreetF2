// Build a game-ready character GLB:
//   node tools/build_character.mjs <rigged.glb> <out.glb> [--base=2048] [--aux=1024]   (run from the repo root, with `npm start` serving it)
// 1. bakes the retargeted animation set in headless Chromium (tools/bake.html)
// 2. embeds the clips + sword mount into the GLB
// 3. resizes textures, converts them to WebP and meshopt-compresses the file
import { createRequire } from 'node:module';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress, meshopt, resample, prune, dedup } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { CLIPS } from './clips.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

const [inPath, outPath, ...flags] = process.argv.slice(2);
const flag = (n, d) => +((flags.find(f => f.startsWith('--' + n + '=')) || '').split('=')[1] || d);
const BASE = flag('base', 2048), AUX = flag('aux', 1024);
const SERVER = process.env.BAKE_SERVER || 'http://127.0.0.1:8080';

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERR', e.message));
await page.goto(`${SERVER}/tools/bake.html?model=${encodeURIComponent("/" + path.relative(process.cwd(), inPath))}`);
await page.waitForFunction(() => window.__ready === true, { timeout: 120000 });
const baked = await page.evaluate(m => window.bakeAll(m), CLIPS);
await browser.close();
const missing = Object.entries(baked.clips).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) throw new Error('missing source clips: ' + missing);

await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(inPath);
const root = doc.getRoot();
for (const a of root.listAnimations()) a.dispose();
const buffer = root.listBuffers()[0];
const nodeByName = Object.fromEntries(root.listNodes().map(n => [n.getName(), n]));
let frames = 0;
for (const [name, rec] of Object.entries(baked.clips)) {
  const anim = doc.createAnimation(name);
  const times = new Float32Array(rec.frames);
  for (let i = 0; i < rec.frames; i++) times[i] = rec.duration * i / (rec.frames - 1);
  const input = doc.createAccessor().setType('SCALAR').setArray(times).setBuffer(buffer);
  for (const [bone, vals] of Object.entries(rec.q)) {
    const node = nodeByName[bone]; if (!node) throw new Error('no node ' + bone);
    const s = doc.createAnimationSampler().setInput(input).setOutput(doc.createAccessor().setType('VEC4').setArray(new Float32Array(vals)).setBuffer(buffer)).setInterpolation('LINEAR');
    anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath('rotation').setSampler(s));
  }
  if (rec.hips) {
    const s = doc.createAnimationSampler().setInput(input).setOutput(doc.createAccessor().setType('VEC3').setArray(new Float32Array(rec.hips)).setBuffer(buffer)).setInterpolation('LINEAR');
    anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(nodeByName[baked.hips]).setTargetPath('translation').setSampler(s));
  }
  frames += rec.frames;
}
root.listScenes()[0].setExtras({ mount: baked.mount, height: +baked.height.toFixed(4) });

// textures: base colour keeps more resolution than the data maps
for (const tex of root.listTextures()) {
  const isBase = tex.listParents().some(p => p.propertyType === 'Material' && p.getBaseColorTexture() === tex);
  tex.setName(isBase ? 'base' : (tex.getName() || 'aux'));
}
await doc.transform(
  dedup(), prune(), resample(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 86, slots: /baseColor/, resize: [BASE, BASE] }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 82, slots: /^(?!baseColor)/, resize: [AUX, AUX] }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
await io.write(outPath, doc);
const { statSync } = await import('node:fs');
console.log(path.basename(outPath), (statSync(outPath).size / 1048576).toFixed(2) + ' MB', '| clips', Object.keys(baked.clips).length, '| frames', frames, '| mount', JSON.stringify(baked.mount));

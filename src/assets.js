// Swift Sword — asset loading (models, textures) with progress reporting.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { STAGES } from './config.js';

export const ASSETS = { models: {}, tex: {}, ready: false };

const MODEL_IDS = ['kaito', 'akane', 'kurogane'];

export function loadAssets(renderer, onProgress) {
  const manager = new THREE.LoadingManager();
  const gltf = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
  const tl = new THREE.TextureLoader(manager);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const jobs = [];
  let done = 0;
  const track = p => { jobs.push(p); return p.then(v => { done++; if (onProgress) onProgress(done / jobs.length); return v; }); };

  for (const id of MODEL_IDS) {
    track(new Promise((res, rej) => gltf.load(`assets/models/${id}.glb`, g => {
      g.scene.traverse(o => {
        if (o.isMesh) {
          o.frustumCulled = false;
          const m = o.material;
          if (m.map) { m.map.anisotropy = Math.min(8, maxAniso); }
        }
      });
      ASSETS.models[id] = g;
      res(g);
    }, undefined, rej)));
  }
  const loadTex = (key, url, opts = {}) => track(new Promise((res, rej) => tl.load(url, t => {
    t.colorSpace = THREE.SRGBColorSpace;
    if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, maxAniso); }
    ASSETS.tex[key] = t;
    res(t);
  }, undefined, rej)));
  for (const s of STAGES) {
    loadTex(s.bg, `assets/stages/${s.bg}.webp`);
    loadTex(s.ground, `assets/stages/${s.ground}.webp`, { repeat: true });
  }
  return Promise.all(jobs).then(() => { ASSETS.ready = true; return ASSETS; });
}

// --- small procedural textures shared by several modules --------------------
const cache = {};
export function softDot() {
  if (cache.dot) return cache.dot;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return (cache.dot = new THREE.CanvasTexture(c));
}

/** Tileable soft noise (for mist sheets and smoke). */
export function noiseTexture(size = 256, seed = 1) {
  const key = 'noise' + size + '_' + seed;
  if (cache[key]) return cache[key];
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  const img = x.createImageData(size, size);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const grids = [4, 8, 16, 32].map(n => ({ n, v: Array.from({ length: n * n }, rnd) }));
  const smooth = t => t * t * (3 - 2 * t);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    let v = 0, amp = 0.5;
    for (const g of grids) {
      const fx = i / size * g.n, fy = j / size * g.n;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = smooth(fx - x0), ty = smooth(fy - y0);
      const at = (a, b) => g.v[(b % g.n) * g.n + (a % g.n)];
      v += amp * ((at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty);
      amp *= 0.5;
    }
    const k = (j * size + i) * 4, a = Math.max(0, Math.min(1, (v - 0.32) * 2.2));
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = a * 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return (cache[key] = t);
}

/** Derive a tangent-space normal map from an albedo texture's luminance. */
export function normalFromAlbedo(tex, strength = 2.2, size = 512) {
  const key = 'nrm_' + tex.uuid;
  if (cache[key]) return cache[key];
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(tex.image, 0, 0, size, size);
  const src = x.getImageData(0, 0, size, size).data;
  const h = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) h[i] = (src[i * 4] * 0.3 + src[i * 4 + 1] * 0.59 + src[i * 4 + 2] * 0.11) / 255;
  const out = x.createImageData(size, size);
  const at = (i, j) => h[((j + size) % size) * size + ((i + size) % size)];
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const dx = (at(i + 1, j) - at(i - 1, j)) * strength, dy = (at(i, j + 1) - at(i, j - 1)) * strength;
    const l = 1 / Math.hypot(dx, dy, 1), k = (j * size + i) * 4;
    out.data[k] = (-dx * l * 0.5 + 0.5) * 255; out.data[k + 1] = (dy * l * 0.5 + 0.5) * 255; out.data[k + 2] = (l * 0.5 + 0.5) * 255; out.data[k + 3] = 255;
  }
  x.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.copy(tex.repeat);
  t.anisotropy = tex.anisotropy;
  return (cache[key] = t);
}

/** Average colour of a horizontal band of an image (v0..v1 measured from the top). */
export function bandColor(tex, v0, v1) {
  const c = document.createElement('canvas'); c.width = 32; c.height = 32;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(tex.image, 0, 0, 32, 32);
  const y0 = Math.floor(v0 * 32), y1 = Math.max(y0 + 1, Math.ceil(v1 * 32));
  const d = x.getImageData(0, y0, 32, y1 - y0).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4;
  return new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
}

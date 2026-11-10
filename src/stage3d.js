// Swift Sword — stages: painted backdrop, lit 3D floor, procedural set
// pieces, mist and weather (petals, fireflies, embers, rain and lightning).
import * as THREE from 'three';
import { ASSETS, noiseTexture, normalFromAlbedo, bandColor, softDot } from './assets.js';
import { Particles, flameMaterial } from './fx.js';

const rand = (a, b) => a + Math.random() * (b - a);
const BG_Z = -46, BG_W = 62, BG_H = BG_W * 576 / 1344, BG_BOTTOM = -4.2;

// --- tiny material / texture helpers ---------------------------------------
const std = (color, roughness = 0.8, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness, metalness }, extra));
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
function speckle(x, w, h, base, n, alpha) {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = Math.random() * 255 | 0;
    x.fillStyle = `rgba(${v},${v},${v},${alpha * Math.random()})`;
    x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
}
const stoneTex = () => canvasTex(128, 128, (x, w, h) => {
  speckle(x, w, h, '#8d8f8c', 900, 0.35);
  x.strokeStyle = 'rgba(20,24,22,0.35)'; x.lineWidth = 1;
  for (let i = 0; i < 7; i++) { x.beginPath(); x.moveTo(Math.random() * w, Math.random() * h); x.lineTo(Math.random() * w, Math.random() * h); x.stroke(); }
}, true);
const woodTex = () => canvasTex(64, 256, (x, w, h) => {
  x.fillStyle = '#6b4a36'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(${20 + Math.random() * 40},${12 + Math.random() * 20},8,${0.12 + Math.random() * 0.2})`; x.fillRect(Math.random() * w, 0, 1 + Math.random() * 2, h); }
}, true);

function add(parent, geo, mat, x, y, z, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (opts.rx) m.rotation.x = opts.rx; if (opts.ry) m.rotation.y = opts.ry; if (opts.rz) m.rotation.z = opts.rz;
  m.castShadow = opts.cast !== false; m.receiveShadow = true;
  parent.add(m);
  return m;
}

// --- set pieces --------------------------------------------------------------
function torii(mats, w = 6.4, h = 6.2) {
  const g = new THREE.Group();
  const { red, black, stone } = mats;
  for (const s of [-1, 1]) {
    const col = add(g, new THREE.CylinderGeometry(0.26, 0.3, h, 16), red, s * w / 2, h / 2, 0);
    col.rotation.z = -s * 0.035;
    add(g, new THREE.CylinderGeometry(0.42, 0.48, 0.5, 16), stone, s * (w / 2 + 0.11), 0.25, 0);
    add(g, new THREE.CylinderGeometry(0.33, 0.33, 0.24, 16), black, s * (w / 2 + 0.085), 0.62, 0);
  }
  add(g, new THREE.BoxGeometry(w + 0.5, 0.3, 0.3), red, 0, h * 0.74, 0);                 // nuki (tie beam)
  add(g, new THREE.BoxGeometry(0.26, 0.62, 0.22), red, 0, h * 0.74 + 0.48, 0);            // gakuzuka
  // curved top lintel (kasagi) built from segments that lift toward the ends
  const N = 12;
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N * 2 - 1, len = (w + 2.2) / N;
    const lift = 0.34 * t * t;
    const seg = add(g, new THREE.BoxGeometry(len * 1.04, 0.3, 0.46), red, t * (w + 2.2) / 2, h + 0.02 + lift, 0);
    seg.rotation.z = 0.115 * t;
    const cap = add(g, new THREE.BoxGeometry(len * 1.06, 0.14, 0.6), black, t * (w + 2.2) / 2, h + 0.24 + lift, 0);
    cap.rotation.z = 0.115 * t;
  }
  // shimenawa rope with paper streamers
  const pts = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector3((t - 0.5) * (w - 0.6), h * 0.66 - Math.sin(t * Math.PI) * 0.5, 0.2)); }
  add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.07, 8), mats.rope, 0, 0, 0);
  for (const t of [0.25, 0.5, 0.75]) {
    const p = pts[Math.round(t * 16)];
    const sh = add(g, new THREE.PlaneGeometry(0.22, 0.6), mats.paper, p.x, p.y - 0.38, 0.22, { cast: false });
    sh.userData.sway = Math.random() * 6;
    g.userData.shide = (g.userData.shide || []).concat(sh);
  }
  return g;
}

function lantern(mats, lit = true, color = 0xffb060) {
  const g = new THREE.Group();
  const s = mats.stone;
  add(g, new THREE.CylinderGeometry(0.34, 0.4, 0.22, 6), s, 0, 0.11, 0);
  add(g, new THREE.CylinderGeometry(0.13, 0.16, 0.95, 8), s, 0, 0.68, 0);
  add(g, new THREE.CylinderGeometry(0.34, 0.2, 0.16, 6), s, 0, 1.22, 0);
  const box = add(g, new THREE.BoxGeometry(0.36, 0.36, 0.36), lit ? new THREE.MeshStandardMaterial({ color: 0x2a221c, emissive: color, emissiveIntensity: 2.6, roughness: 0.7 }) : s, 0, 1.48, 0);
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) add(g, new THREE.BoxGeometry(0.06, 0.4, 0.06), s, dx * 0.18, 1.48, dz * 0.18);
  const roof = add(g, new THREE.ConeGeometry(0.5, 0.34, 6), s, 0, 1.84, 0);
  roof.rotation.y = Math.PI / 6;
  add(g, new THREE.SphereGeometry(0.08, 8, 6), s, 0, 2.06, 0);
  if (lit) {
    const l = new THREE.PointLight(color, 9, 9, 2); l.position.set(0, 1.5, 0.3); g.add(l);
    g.userData.light = l; g.userData.box = box;
  }
  return g;
}

function fence(mats, len = 5) {
  const g = new THREE.Group();
  for (let i = 0; i <= len; i += 1.25) add(g, new THREE.BoxGeometry(0.14, 1.15, 0.14), mats.wood, i, 0.575, 0);
  add(g, new THREE.BoxGeometry(len + 0.3, 0.1, 0.1), mats.wood, len / 2, 0.95, 0);
  add(g, new THREE.BoxGeometry(len + 0.3, 0.1, 0.1), mats.wood, len / 2, 0.5, 0);
  return g;
}

function bannerTexture(color, crest) {
  return canvasTex(128, 512, (x, w, h) => {
    x.fillStyle = color; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.2})`; x.fillRect(Math.random() * w, Math.random() * h, 2, 6); }
    x.fillStyle = crest; x.beginPath(); x.arc(w / 2, 120, 38, 0, 7); x.fill();
    x.fillStyle = color; x.beginPath(); x.arc(w / 2, 120, 24, 0, 7); x.fill();
    x.fillStyle = crest; x.fillRect(w / 2 - 5, 84, 10, 72); x.fillRect(w / 2 - 36, 115, 72, 10);
    x.fillRect(18, 220, w - 36, 9); x.fillRect(18, 244, w - 36, 9);
    // torn lower edge
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(i * 15, h); x.lineTo(i * 15 + 8, h - 20 - Math.random() * 50); x.lineTo(i * 15 + 16, h); x.fill(); }
  });
}
function banner(mats, tex, h = 5.2) {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.045, 0.055, h, 8), mats.woodDark, 0, h / 2, 0);
  add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.95, 6), mats.woodDark, 0.44, h - 0.12, 0, { rz: Math.PI / 2 });
  const geo = new THREE.PlaneGeometry(0.85, 3.2, 4, 14);
  const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.95, transparent: true, alphaTest: 0.4 }));
  cloth.position.set(0.47, h - 1.75, 0); cloth.castShadow = true;
  cloth.userData.rest = geo.attributes.position.array.slice();
  cloth.userData.phase = Math.random() * 6;
  g.add(cloth);
  g.userData.cloth = cloth;
  return g;
}

function brazier(mats) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * 6.283;
    const leg = add(g, new THREE.CylinderGeometry(0.03, 0.035, 1.25, 6), mats.iron, Math.cos(a) * 0.22, 0.58, Math.sin(a) * 0.22);
    leg.rotation.z = Math.cos(a) * 0.28; leg.rotation.x = -Math.sin(a) * 0.28;
  }
  add(g, new THREE.CylinderGeometry(0.42, 0.24, 0.3, 12, 1, true), mats.iron, 0, 1.2, 0);
  add(g, new THREE.CylinderGeometry(0.4, 0.4, 0.05, 12), new THREE.MeshStandardMaterial({ color: 0x1a0a04, emissive: 0xff5a10, emissiveIntensity: 3 }), 0, 1.3, 0, { cast: false });
  const flames = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.95 - i * 0.14, 1.5 - i * 0.2), flameMaterial(0xff3a08, 0xffd070, Math.random() * 30));
    f.position.set((i - 1) * 0.1, 1.95 - i * 0.08, 0.02 * i); f.renderOrder = 3;
    g.add(f); flames.push(f.material);
  }
  const l = new THREE.PointLight(0xff7a30, 13, 12, 2); l.position.set(0, 1.9, 0.4); g.add(l);
  g.userData.flames = flames; g.userData.fire = l;
  return g;
}

function palisade(mats, n = 7) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const h = rand(2.2, 3.1), r = rand(0.13, 0.18);
    const log = add(g, new THREE.CylinderGeometry(r * 0.9, r, h, 7), mats.woodDark, i * 0.36, h / 2, rand(-0.05, 0.05));
    log.rotation.z = rand(-0.06, 0.06); log.rotation.x = rand(-0.05, 0.05);
    const tip = add(g, new THREE.ConeGeometry(r * 0.9, 0.42, 7), mats.woodDark, i * 0.36, h + 0.2, log.position.z);
    tip.rotation.z = log.rotation.z;
  }
  add(g, new THREE.BoxGeometry(n * 0.36 + 0.2, 0.14, 0.1), mats.woodDark, n * 0.18 - 0.18, 1.5, 0.17);
  return g;
}

function arrow(mats) {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.012, 0.012, 0.85, 5), mats.woodDark, 0, 0.42, 0);
  add(g, new THREE.BoxGeometry(0.004, 0.2, 0.07), mats.paper, 0, 0.74, 0, { cast: false });
  add(g, new THREE.BoxGeometry(0.07, 0.2, 0.004), mats.paper, 0, 0.74, 0, { cast: false });
  return g;
}

function rock(mats, r = 0.6) {
  const geo = new THREE.IcosahedronGeometry(r, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 1 + (Math.sin(p.getX(i) * 9.1) + Math.cos(p.getY(i) * 7.3) + Math.sin(p.getZ(i) * 8.7)) * 0.07; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.72, p.getZ(i) * k); }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mats.moss);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
export class Stage {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    this.root = null; this.def = null;
    this.flash = 0;            // lightning brightness 0..1 (also read by the post chain)
    this.onThunder = null;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.t = 0;
  }

  load(def, quality) {
    this.dispose();
    this.def = def; this.quality = quality;
    const scene = this.scene;
    const root = this.root = new THREE.Group();
    scene.add(root);
    const bgTex = ASSETS.tex[def.bg], gTex = ASSETS.tex[def.ground];

    // --- sky / fog matched to the painting's horizon band ---
    const fogCol = bandColor(bgTex, 0.8, 0.87);
    this.fogBase = fogCol.clone();
    scene.fog = new THREE.FogExp2(fogCol.clone(), def.fogDensity);
    scene.background = fogCol.clone();

    // the painting is tiled three wide with mirrored neighbours so angled cinematic shots never see its edge
    bgTex.wrapS = THREE.MirroredRepeatWrapping; bgTex.repeat.set(3, 1); bgTex.offset.set(-1, 0); bgTex.needsUpdate = true;
    const bg = this.bg = new THREE.Mesh(new THREE.PlaneGeometry(BG_W * 3, BG_H), new THREE.MeshBasicMaterial({ map: bgTex, fog: false, depthWrite: false }));
    bg.position.set(0, BG_BOTTOM + BG_H / 2, BG_Z); bg.renderOrder = -10;
    root.add(bg);
    // feather the painting's lower edge into the fog so the floor meets it seamlessly
    const fadeTex = canvasTex(4, 64, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,1)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
    const fade = this.bgFade = new THREE.Mesh(new THREE.PlaneGeometry(BG_W * 3, 5.5), new THREE.MeshBasicMaterial({ map: fadeTex, color: fogCol, transparent: true, fog: false, depthWrite: false }));
    fade.position.set(0, BG_BOTTOM + 4.2, BG_Z + 0.5); fade.renderOrder = -9;
    root.add(fade);

    // --- floor ---
    gTex.repeat.set(120 / 3.4, 70 / 3.4);
    const nrm = normalFromAlbedo(gTex, def.wet ? 1.6 : 2.4);
    nrm.repeat.copy(gTex.repeat);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 70), new THREE.MeshStandardMaterial({
      map: gTex, normalMap: nrm, normalScale: new THREE.Vector2(1.1, 1.1), color: def.groundTint,
      roughness: def.wet ? 0.3 : 0.86, metalness: def.wet ? 0.12 : 0, envMapIntensity: def.wet ? 1.5 : 0.5,
    }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -11); floor.receiveShadow = true;
    root.add(floor);

    // --- lights ---
    const hemi = this.hemi = new THREE.HemisphereLight(def.hemi.sky, def.hemi.ground, def.hemi.intensity);
    root.add(hemi);
    const key = this.key = new THREE.DirectionalLight(def.key.color, def.key.intensity);
    key.position.set(...def.key.pos);
    key.castShadow = quality.shadows > 0;
    if (key.castShadow) {
      key.shadow.mapSize.set(quality.shadows, quality.shadows);
      const c = key.shadow.camera; c.left = -9; c.right = 9; c.top = 7; c.bottom = -5; c.near = 0.5; c.far = 40;
      key.shadow.bias = -0.0005; key.shadow.normalBias = 0.035; key.shadow.radius = 3;
    }
    root.add(key, key.target);
    const fill = this.fill = new THREE.DirectionalLight(def.fill.color, def.fill.intensity);
    fill.position.set(...def.fill.pos);
    root.add(fill);
    this.keyBase = def.key.intensity; this.hemiBase = def.hemi.intensity;

    // --- environment reflections from a tiny gradient scene ---
    const envScene = new THREE.Scene();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(20, 24, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { uTop: { value: new THREE.Color(def.sky) }, uBot: { value: new THREE.Color(def.hemi.ground) }, uHor: { value: fogCol.clone().multiplyScalar(1.6) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uTop,uBot,uHor; varying vec3 vP; void main(){ float h = vP.y; vec3 c = mix(uHor, uTop, smoothstep(0.0, 0.7, h)); c = mix(c, uBot, 1.0 - smoothstep(-0.4, 0.0, h)); gl_FragColor = vec4(c, 1.0); }',
    }));
    envScene.add(dome);
    const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(def.key.color).multiplyScalar(7) }));
    sunDisc.position.set(...def.key.pos).normalize().multiplyScalar(16); envScene.add(sunDisc);
    const fillDisc = new THREE.Mesh(new THREE.SphereGeometry(4, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(def.fill.color).multiplyScalar(1.6) }));
    fillDisc.position.set(...def.fill.pos).normalize().multiplyScalar(16); envScene.add(fillDisc);
    this.envRT = this.pmrem.fromScene(envScene, 0.04);
    scene.environment = this.envRT.texture;
    scene.environmentIntensity = 0.75;
    dome.geometry.dispose(); dome.material.dispose(); sunDisc.geometry.dispose(); fillDisc.geometry.dispose();

    // --- mist sheets ---
    this.mist = [];
    const mistCol = fogCol.clone().lerp(new THREE.Color(def.key.color), 0.28).multiplyScalar(1.5);
    const layers = [[-2.8, 0.55, 0.07, 36], [-6, 0.9, 0.11, 46], [-11, 1.4, 0.15, 60], [-18, 2.1, 0.18, 80]];
    layers.forEach(([z, y, op, w], i) => {
      const tex = noiseTexture(256, 3 + i).clone(); tex.needsUpdate = true; tex.repeat.set(w / 14, 1);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 3.4 + i * 0.7), new THREE.MeshBasicMaterial({ map: tex, alphaMap: fadeBand(), color: mistCol, transparent: true, opacity: op, depthWrite: false, fog: false }));
      m.position.set(0, y, z); m.renderOrder = z > 0 ? 9 : 2;
      root.add(m);
      this.mist.push({ m, tex, speed: 0.012 + i * 0.006 });
    });

    // --- weather + props ---
    this.petals = null; this.rain = null; this.dots = null; this.animated = [];
    this.nextBolt = rand(3, 6); this.boltT = 99;
    const mats = {
      red: std(0x9c2418, 0.62), black: std(0x15120f, 0.5, 0.2), stone: std(0x8b8d88, 0.92, 0, { map: stoneTex() }),
      wood: std(0x6a4a36, 0.85, 0, { map: woodTex() }), woodDark: std(0x2c1e17, 0.9, 0, { map: woodTex() }),
      rope: std(0xb99a62, 0.95), paper: std(0xe8e4d8, 0.9, 0, { side: THREE.DoubleSide }),
      iron: std(0x1c1a1a, 0.55, 0.85), moss: std(0x5c6a58, 0.95, 0, { map: stoneTex() }),
    };
    this.mats = mats;
    this['build_' + def.props](root, mats, quality);
    return this;
  }

  // --- MOONLIT SHRINE ---------------------------------------------------------
  build_shrine(root, mats, q) {
    const gate = torii(mats, 7.6, 7.2); gate.position.set(0, 0, -15); root.add(gate);
    this.shide = gate.userData.shide || [];
    for (const s of [-1, 1]) {
      const l = lantern(mats); l.position.set(s * 4.6, 0, -3.4); root.add(l);
      this.animated.push({ kind: 'lamp', light: l.userData.light, base: 9, phase: Math.random() * 9 });
      const f = fence(mats, 6.5); f.position.set(s > 0 ? 6.2 : -12.7, 0, -5.6); root.add(f);
      const l2 = lantern(mats); l2.position.set(s * 8.6, 0, -9.5); l2.scale.setScalar(1.25); root.add(l2);
      this.animated.push({ kind: 'lamp', light: l2.userData.light, base: 9, phase: Math.random() * 9 });
    }
    // stone steps leading up to the gate
    for (let i = 0; i < 4; i++) add(root, new THREE.BoxGeometry(9.6 - i * 0.6, 0.18, 0.9), mats.stone, 0, 0.09 + i * 0.18, -11.6 - i * 0.9);
    // petals
    const n = q.particles ? 170 : 70;
    const geo = new THREE.PlaneGeometry(0.075, 0.055);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffc4d8, emissive: 0xff7aa8, emissiveIntensity: 0.25, side: THREE.DoubleSide, roughness: 0.8 }), n);
    mesh.frustumCulled = false;
    this.petals = { mesh, data: Array.from({ length: n }, () => ({ x: rand(-14, 14), y: rand(0, 9), z: rand(-12, 4), vy: rand(0.45, 0.95), vx: rand(0.4, 1.2), rot: new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6)), spin: rand(1, 4), ph: rand(0, 6) })) };
    root.add(mesh);
    // fireflies
    const d = this.dots = new Particles(60, true); root.add(d.points);
    this.fireflies = Array.from({ length: q.particles ? 46 : 20 }, () => ({ x: rand(-11, 11), y: rand(0.3, 2.8), z: rand(-10, 1.5), ph: rand(0, 6), sp: rand(0.3, 0.9) }));
  }

  // --- BURNING KEEP -----------------------------------------------------------
  build_siege(root, mats, q) {
    const texA = bannerTexture('#5c0d0d', '#d8c9a8'), texB = bannerTexture('#16130f', '#a8322a');
    [[-7.4, -6.2, texA], [-3.3, -8.5, texB], [3.9, -7.6, texA], [8.2, -5.8, texB], [-11.5, -10, texA], [12.5, -11, texB]].forEach(([x, z, tex], i) => {
      const b = banner(mats, tex, 5 + (i % 3) * 0.5); b.position.set(x, 0, z); b.rotation.z = rand(-0.05, 0.05); root.add(b);
      this.animated.push({ kind: 'cloth', cloth: b.userData.cloth });
    });
    for (const s of [-1, 1]) {
      const br = brazier(mats); br.position.set(s * 5.6, 0, -4.2); root.add(br);
      this.animated.push({ kind: 'fire', flames: br.userData.flames, light: br.userData.fire, base: 13, phase: Math.random() * 9 });
    }
    [[-11, -6.5, 8, 0.02], [-5.6, -9.2, 6, -0.05], [5.2, -9.4, 9, 0.04], [10, -6.4, 6, -0.03]].forEach(([x, z, n, tilt]) => {
      const p = palisade(mats, n); p.position.set(x, 0, z); p.rotation.x = tilt; root.add(p);
    });
    for (let i = 0; i < 16; i++) {
      const a = arrow(mats); a.position.set(rand(-9, 9), 0, rand(-6.5, -1.6)); a.rotation.set(rand(-0.5, 0.2), rand(0, 6), rand(-0.45, 0.45)); root.add(a);
    }
    // a great fire somewhere behind the wall
    const glow = new THREE.PointLight(0xff5a20, 60, 34, 2); glow.position.set(6, 3, -14); root.add(glow);
    this.animated.push({ kind: 'lamp', light: glow, base: 60, phase: 3 });
    const d = this.dots = new Particles(q.particles ? 300 : 120, true); root.add(d.points);
    this.emberRate = q.particles ? 46 : 18; this.emberAcc = 0;
  }

  // --- STORM GROVE -------------------------------------------------------------
  build_grove(root, mats, q) {
    const tex = canvasTex(32, 256, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#24401f'); g.addColorStop(0.45, '#5f8748'); g.addColorStop(1, '#1c3319');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 36) { x.fillStyle = 'rgba(8,18,8,0.85)'; x.fillRect(0, y, w, 3); x.fillStyle = 'rgba(190,215,150,0.35)'; x.fillRect(0, y + 3, w, 2); }
    }, true);
    const n = q.particles ? 62 : 34;
    const geo = new THREE.CylinderGeometry(0.075, 0.1, 1, 8, 1, true); geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0.02, envMapIntensity: 1.2 });
    const bamboo = new THREE.InstancedMesh(geo, mat, n);
    bamboo.castShadow = true; bamboo.receiveShadow = true; bamboo.frustumCulled = false;
    this.bamboo = { mesh: bamboo, data: [] };
    for (let i = 0; i < n; i++) {
      // clusters to the sides and a deeper curtain behind the fighters
      const deep = i % 3 === 0;
      let x = deep ? rand(-15, 15) : (Math.random() < 0.5 ? rand(-14, -5.6) : rand(5.6, 14));
      const z = deep ? rand(-16, -8.5) : rand(-8, -2.6);
      if (Math.abs(x) < 3.6 && z > -11) x += Math.sign(x || 1) * 3.4;
      this.bamboo.data.push({ x, z, h: rand(9, 15), r: rand(0.75, 1.6), lean: rand(-0.07, 0.07), ph: rand(0, 6), tex: rand(8, 12) });
    }
    tex.repeat.set(1, 10);
    root.add(bamboo);
    const l = lantern(mats, true, 0x7fe8d8); l.position.set(-4.7, 0, -3.6); l.rotation.z = 0.06; root.add(l);
    l.userData.light.intensity = 5;
    this.animated.push({ kind: 'lamp', light: l.userData.light, base: 5, phase: 2 });
    const l2 = lantern(mats, false); l2.position.set(5.1, -0.12, -4.4); l2.rotation.set(0.1, 0.5, -0.16); root.add(l2);
    [[-7.5, -4.6, 0.9], [6.8, -3.4, 0.6], [2.6, -7.5, 1.2], [-2.8, -8.8, 0.8], [9.5, -7, 1.4], [-10.8, -8, 1.1]].forEach(([x, z, r]) => { const k = rock(mats, r); k.position.set(x, r * 0.25, z); k.rotation.y = rand(0, 6); root.add(k); });
    // rain streaks
    const N = q.particles ? 1300 : 520;
    const rg = new THREE.BufferGeometry();
    this.rain = { n: N, pos: new Float32Array(N * 6), d: Array.from({ length: N }, () => ({ x: rand(-17, 17), y: rand(0, 12), z: rand(-17, 5.5), s: rand(0.8, 1.25) })) };
    rg.setAttribute('position', new THREE.BufferAttribute(this.rain.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const lines = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xb8d8e0, transparent: true, opacity: 0.34, depthWrite: false }));
    lines.frustumCulled = false; lines.renderOrder = 8;
    this.rain.mesh = lines; root.add(lines);
    const d = this.dots = new Particles(260, true); root.add(d.points);   // splashes
  }

  update(dt, camera) {
    if (!this.root) return;
    const t = (this.t += dt);
    const def = this.def;
    // painting follows the camera (it is "at infinity"), with a hint of parallax
    const aspectScale = Math.max(1, camera.aspect / 1.9);
    this.bg.scale.setScalar(aspectScale);
    this.bg.position.x = camera.position.x * 0.9;
    this.bg.position.y = BG_BOTTOM + BG_H * aspectScale / 2 + (camera.position.y - 1) * 0.5;
    this.bgFade.position.x = this.bg.position.x;
    this.key.target.position.set(camera.position.x * 0.5, 0, 0);
    this.key.position.set(def.key.pos[0] + camera.position.x * 0.5, def.key.pos[1], def.key.pos[2]);

    for (const m of this.mist) { m.tex.offset.x = t * m.speed; m.m.position.x = camera.position.x * 0.6; }

    for (const a of this.animated) {
      if (a.kind === 'lamp') a.light.intensity = a.base * (0.86 + 0.1 * Math.sin(t * 7 + a.phase) + 0.06 * Math.sin(t * 17.3 + a.phase * 2));
      else if (a.kind === 'fire') {
        for (const f of a.flames) f.uniforms.uTime.value = t;
        a.light.intensity = a.base * (0.8 + 0.14 * Math.sin(t * 11 + a.phase) + 0.1 * Math.sin(t * 23.7 + a.phase));
      } else if (a.kind === 'cloth') {
        const c = a.cloth, rest = c.userData.rest, p = c.geometry.attributes.position, ph = c.userData.phase;
        for (let i = 0; i < p.count; i++) {
          const x = rest[i * 3], y = rest[i * 3 + 1];
          const free = (x + 0.425) / 0.85;                    // 0 at the pole, 1 at the free edge
          p.setZ(i, Math.sin(y * 2.6 + t * 3.1 + ph) * 0.16 * free + Math.sin(y * 5.3 - t * 4.7 + ph) * 0.05 * free);
          p.setX(i, x - Math.abs(Math.sin(y * 1.9 + t * 2.2 + ph)) * 0.05 * free);
        }
        p.needsUpdate = true; c.geometry.computeVertexNormals();
      }
    }
    if (this.shide) for (const s of this.shide) s.rotation.z = Math.sin(t * 1.7 + s.userData.sway) * 0.16;

    if (this.petals) {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
      const cx = camera.position.x;
      this.petals.data.forEach((p, i) => {
        p.y -= p.vy * dt; p.x += (p.vx + Math.sin(t * 0.9 + p.ph) * 0.7) * dt; p.z += Math.sin(t * 0.6 + p.ph * 2) * 0.25 * dt;
        p.rot.x += p.spin * dt; p.rot.y += p.spin * 0.7 * dt;
        if (p.y < 0.02) { p.y = rand(7, 10); p.x = cx + rand(-15, 13); }
        if (p.x > cx + 15) p.x -= 30;
        m.compose(v.set(p.x, p.y, p.z), q.setFromEuler(p.rot), s);
        this.petals.mesh.setMatrixAt(i, m);
      });
      this.petals.mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.fireflies) {
      const d = this.dots; d.n = 0;
      for (const f of this.fireflies) {
        const glow = Math.max(0, Math.sin(t * f.sp * 2 + f.ph)) ** 2;
        const x = f.x + Math.sin(t * f.sp + f.ph) * 0.9, y = f.y + Math.sin(t * f.sp * 1.3 + f.ph * 3) * 0.4, z = f.z + Math.cos(t * f.sp * 0.8 + f.ph) * 0.7;
        const i = d.n++;
        d.p.set([x, y, z], i * 3); d.col.set([0.85, 1.25, 0.45, glow], i * 4); d.size[i] = 0.07;
      }
      const g = d.points.geometry; g.setDrawRange(0, d.n);
      g.attributes.position.needsUpdate = g.attributes.aColor.needsUpdate = g.attributes.aSize.needsUpdate = true;
    }
    if (this.emberRate) {
      this.emberAcc += dt * this.emberRate;
      const cx = camera.position.x;
      while (this.emberAcc > 1) {
        this.emberAcc--;
        const hot = Math.random();
        this.dots.spawn(cx + rand(-14, 14), rand(-0.2, 2.5), rand(-12, 3.5), rand(-0.9, -0.1), rand(0.5, 1.9), rand(-0.2, 0.2),
          1.6, 0.42 + hot * 0.6, 0.08 + hot * 0.2, 1, rand(0.018, 0.05), rand(2.5, 6), -0.12, 0.05, 0);
      }
      this.dots.update(dt);
      // embers wander
      const v = this.dots.v;
      for (let i = 0; i < this.dots.n; i++) v[i * 3] += Math.sin(t * 2 + i) * 0.5 * dt;
    }
    if (this.bamboo) {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
      const gust = 0.035 + 0.02 * Math.sin(t * 0.37);
      this.bamboo.data.forEach((b, i) => {
        e.set(Math.sin(t * 0.8 + b.ph) * 0.012, 0, b.lean + Math.sin(t * 1.1 + b.ph) * gust + 0.03);
        m.compose(v.set(b.x, 0, b.z), q.setFromEuler(e), s.set(b.r, b.h, b.r));
        this.bamboo.mesh.setMatrixAt(i, m);
      });
      this.bamboo.mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.rain) {
      const r = this.rain, cx = camera.position.x, pos = r.pos;
      const wx = -3.2, wy = -21, len = 0.035;
      for (let i = 0; i < r.n; i++) {
        const d = r.d[i];
        d.y += wy * d.s * dt; d.x += wx * d.s * dt;
        if (d.y < 0) {
          if (Math.random() < 0.28 && this.dots.n < this.dots.max - 2) this.dots.spawn(d.x, 0.03, d.z, rand(-0.5, 0.5), rand(0.7, 1.6), rand(-0.3, 0.3), 0.55, 0.7, 0.75, 0.55, 0.035, 0.16, 9, 0, 0);
          d.y += rand(11, 13); d.x = cx + rand(-17, 19); d.z = rand(-17, 5.5);
        }
        pos[i * 6] = d.x; pos[i * 6 + 1] = d.y; pos[i * 6 + 2] = d.z;
        pos[i * 6 + 3] = d.x + wx * len * d.s; pos[i * 6 + 4] = d.y + wy * len * d.s; pos[i * 6 + 5] = d.z;
      }
      r.mesh.geometry.attributes.position.needsUpdate = true;
      this.dots.update(dt);
      // lightning
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) { this.nextBolt = rand(5, 12); this.boltT = 0; this.thunderAt = rand(0.25, 0.9); }
    }
    // lightning envelope: a sharp double flash
    let fl = 0;
    if (this.boltT < 1.2) {
      const b = this.boltT;
      fl = Math.max(Math.exp(-b * 13), b > 0.13 ? 0.85 * Math.exp(-(b - 0.13) * 9) : 0, b > 0.34 ? 0.4 * Math.exp(-(b - 0.34) * 7) : 0);
      if (this.thunderAt !== null && b >= this.thunderAt) { this.thunderAt = null; if (this.onThunder) this.onThunder(); }
      this.boltT += dt;
    }
    this.flash = fl;
    this.key.intensity = this.keyBase * (1 + fl * 4.5);
    this.hemi.intensity = this.hemiBase * (1 + fl * 3.5);
    this.bg.material.color.setScalar(1 + fl * 1.6);
    this.scene.fog.color.copy(this.fogBase).multiplyScalar(1 + fl * 2.2);
    this.scene.background.copy(this.scene.fog.color);
    this.bgFade.material.color.copy(this.scene.fog.color);
  }

  /** Force a lightning strike (used for dramatic beats such as a KO in the storm). */
  strike() { if (this.rain) { this.boltT = 0; this.thunderAt = 0.2; } }

  dispose() {
    if (!this.root) return;
    this.scene.remove(this.root);
    this.root.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) m.dispose(); }
    });
    if (this.envRT) this.envRT.dispose();
    this.root = null; this.petals = null; this.rain = null; this.dots = null; this.fireflies = null; this.emberRate = 0; this.bamboo = null; this.shide = null;
    this.animated = []; this.mist = [];
  }
}

let fadeBandTex = null;
function fadeBand() {
  if (fadeBandTex) return fadeBandTex;
  const c = document.createElement('canvas'); c.width = 4; c.height = 64;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#000'); g.addColorStop(0.45, '#fff'); g.addColorStop(0.8, '#fff'); g.addColorStop(1, '#000');
  x.fillStyle = g; x.fillRect(0, 0, 4, 64);
  fadeBandTex = new THREE.CanvasTexture(c);
  return fadeBandTex;
}

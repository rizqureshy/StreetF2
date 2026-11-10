// Swift Sword — visual effects: GPU point-sprite particles, blood and ground
// stains, hit flashes, projectiles, shockwaves and the flame shader.
import * as THREE from 'three';
import { softDot } from './assets.js';
import { OPTIONS } from './options.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---------------------------------------------------------------------------
// Point-sprite particle pool
// ---------------------------------------------------------------------------
export class Particles {
  /** @param additive  true: glowing sparks/energy, false: alpha-blended blood/dust */
  constructor(max, additive) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.life = new Float32Array(max); this.age = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max);
    this.base = new Float32Array(max * 2);      // start alpha, start size
    this.flags = new Uint8Array(max);           // 1 = leaves a stain on the floor, 2 = bounce
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: softDot() }, uScale: { value: 600 } },
      vertexShader: `attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vC;
        void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uMap; varying vec4 vC;
        void main(){ float a = texture2D(uMap, gl_PointCoord).a * vC.a; if (a < 0.004) discard;
          gl_FragColor = vec4(vC.rgb * ${additive ? 'a' : '1.0'}, a); }`,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.CustomBlending : THREE.NormalBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 4;
    this.onFloor = null;
  }
  spawn(x, y, z, vx, vy, vz, r, g, b, a, size, life, grav = 0, drag = 0, flags = 0) {
    let i = this.n;
    if (i >= this.max) { i = Math.floor(Math.random() * this.max); } else this.n++;
    this.p.set([x, y, z], i * 3); this.v.set([vx, vy, vz], i * 3);
    this.col.set([r, g, b, a], i * 4); this.size[i] = size;
    this.life[i] = life; this.age[i] = 0; this.grav[i] = grav; this.drag[i] = drag;
    this.base[i * 2] = a; this.base[i * 2 + 1] = size; this.flags[i] = flags;
  }
  update(dt) {
    const { p, v, col, size, life, age, grav, drag, base, flags } = this;
    for (let i = 0; i < this.n; i++) {
      age[i] += dt;
      if (age[i] >= life[i]) { this.kill(i); i--; continue; }
      const k = i * 3;
      v[k + 1] -= grav[i] * dt;
      if (drag[i]) { const d = Math.max(0, 1 - drag[i] * dt); v[k] *= d; v[k + 1] *= d; v[k + 2] *= d; }
      p[k] += v[k] * dt; p[k + 1] += v[k + 1] * dt; p[k + 2] += v[k + 2] * dt;
      if (p[k + 1] < 0.01 && v[k + 1] < 0) {
        if (flags[i] & 1) { if (this.onFloor) this.onFloor(p[k], p[k + 2], base[i * 2 + 1]); this.kill(i); i--; continue; }
        if (flags[i] & 2) { p[k + 1] = 0.01; v[k + 1] *= -0.35; v[k] *= 0.6; v[k + 2] *= 0.6; }
      }
      const u = age[i] / life[i];
      col[i * 4 + 3] = base[i * 2] * (1 - u * u);
      size[i] = base[i * 2 + 1] * (flags[i] & 4 ? 1 + u * 2.5 : 1 - u * 0.4);
    }
    const g = this.points.geometry;
    g.setDrawRange(0, this.n);
    g.attributes.position.needsUpdate = true; g.attributes.aColor.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
  }
  kill(i) {
    const j = --this.n;
    if (i === j) return;
    for (const [arr, w] of [[this.p, 3], [this.v, 3], [this.col, 4], [this.base, 2]]) for (let c = 0; c < w; c++) arr[i * w + c] = arr[j * w + c];
    this.size[i] = this.size[j]; this.life[i] = this.life[j]; this.age[i] = this.age[j];
    this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j]; this.flags[i] = this.flags[j];
  }
  clear() { this.n = 0; this.points.geometry.setDrawRange(0, 0); }
}

// ---------------------------------------------------------------------------
// Flame shader (camera-facing planes): braziers, eruptions, burning props.
// ---------------------------------------------------------------------------
export function flameMaterial(colA = 0xff3a08, colB = 0xffd070, seed = 0) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColA: { value: new THREE.Color(colA) }, uColB: { value: new THREE.Color(colB) }, uSeed: { value: seed }, uPower: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime, uSeed, uPower; uniform vec3 uColA, uColB; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a*noise(p); p *= 2.03; a *= 0.5; } return v; }
      void main(){
        float x = (vUv.x - 0.5) * 2.0;
        float n = fbm(vec2(vUv.x*3.0 + uSeed, vUv.y*2.4 - uTime*1.7));
        float s = 1.0 - smoothstep(0.0, 1.0, abs(x)*(1.0 + vUv.y*1.5) + vUv.y*0.95 - n*0.95);
        s *= smoothstep(0.0, 0.07, vUv.y) * uPower;
        vec3 col = mix(uColA, uColB, smoothstep(0.25, 0.9, s));
        gl_FragColor = vec4(col * s * 1.25, s);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
  });
}

// ---------------------------------------------------------------------------
// FX manager
// ---------------------------------------------------------------------------
const STAIN_MAX = 110;
function splatTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * 7, d = Math.pow(Math.random(), 1.6) * 46, r = 4 + Math.random() * 16 * (1 - d / 60);
    x.globalAlpha = 0.55 + Math.random() * 0.45;
    x.beginPath(); x.ellipse(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, r * rand(0.6, 1), a, 0, 7); x.fill();
  }
  return new THREE.CanvasTexture(c);
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.glow = new Particles(1800, true);
    this.matter = new Particles(1400, false);
    scene.add(this.glow.points, this.matter.points);
    this.matter.onFloor = (x, z, size) => this.stain(x, z, size);

    // blood stains (instanced decals on the floor)
    const sg = new THREE.PlaneGeometry(1, 1); sg.rotateX(-Math.PI / 2);
    this.stains = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ map: splatTexture(), color: 0x4a0508, transparent: true, opacity: 0.82, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), STAIN_MAX);
    this.stains.count = 0; this.stains.frustumCulled = false; this.stains.renderOrder = 1;
    this.stainI = 0;
    scene.add(this.stains);

    // transient meshes: slash flashes, rings, light pulses
    this.transients = [];
    this.flashGeo = new THREE.PlaneGeometry(1, 1);
    this.ringGeo = new THREE.RingGeometry(0.82, 1, 48);
    this.lights = [];
    for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffffff, 0, 9, 2); scene.add(l); this.lights.push({ l, t: 0, dur: 1, peak: 0 }); }
    this.projViews = new Map();
    this.spikes = [];
    this.time = 0;
    this.flames = [];
  }

  setPixelScale(heightPx, fovDeg) { const s = heightPx / (2 * Math.tan(fovDeg * Math.PI / 360)); this.glow.mat.uniforms.uScale.value = s; this.matter.mat.uniforms.uScale.value = s; }

  light(x, y, z, color, peak, dur) {
    let s = this.lights[0];
    for (const c of this.lights) if (c.t >= c.dur) { s = c; break; }
    s.l.position.set(x, y, z); s.l.color.set(color); s.t = 0; s.dur = dur; s.peak = peak;
  }

  stain(x, z, size) {
    if (!OPTIONS.blood) return;
    const m = new THREE.Matrix4(), s = rand(0.18, 0.5) * (1 + size * 6);
    m.compose(new THREE.Vector3(x, 0.012 + this.stainI * 0.00004, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, 6.28)), new THREE.Vector3(s, 1, s * rand(0.6, 1)));
    this.stains.setMatrixAt(this.stainI % STAIN_MAX, m);
    this.stainI++;
    this.stains.count = Math.min(STAIN_MAX, this.stainI);
    this.stains.instanceMatrix.needsUpdate = true;
  }
  clearStains() { this.stainI = 0; this.stains.count = 0; }

  sparks(x, y, z, color, n, speed = 5, dir = 0) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.283), el = rand(-0.6, 1.1), sp = speed * rand(0.25, 1);
      this.glow.spawn(x, y, z, Math.cos(a) * Math.cos(el) * sp + dir * speed * 0.5, Math.sin(el) * sp + 1, Math.sin(a) * Math.cos(el) * sp * 0.6,
        c.r * 1.6, c.g * 1.6, c.b * 1.6, 1, rand(0.03, 0.075), rand(0.18, 0.5), 9, 2.2, 2);
    }
  }

  blood(x, y, z, dir, n) {
    if (!OPTIONS.blood) { this.sparks(x, y, z, 0xfff0c0, Math.ceil(n * 0.5), 4, dir); return; }
    for (let i = 0; i < n; i++) {
      const sp = rand(1.2, 6.5), a = rand(-0.5, 1.25), spread = rand(-1, 1);
      const dark = rand(0.55, 1);
      this.matter.spawn(x + rand(-0.06, 0.06), y + rand(-0.08, 0.08), z + rand(-0.05, 0.05),
        dir * Math.cos(a) * sp * rand(0.5, 1), Math.sin(a) * sp * 0.75 + 0.6, spread * 1.6,
        0.34 * dark, 0.008 * dark, 0.014 * dark, 0.95, rand(0.035, 0.085), rand(0.5, 1.3), 12, 0.6, i % 3 === 0 ? 1 : 0);
    }
    // fine mist
    for (let i = 0; i < n * 0.4; i++) {
      this.matter.spawn(x, y, z, dir * rand(0.3, 2.4), rand(-0.2, 1.4), rand(-0.6, 0.6), 0.3, 0.01, 0.015, 0.45, rand(0.09, 0.2), rand(0.25, 0.6), 1.5, 2.5, 4);
    }
  }

  dust(x, z, n, color = 0x8a8078, spread = 1) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      this.matter.spawn(x + rand(-0.3, 0.3) * spread, rand(0.02, 0.15), z + rand(-0.25, 0.25),
        rand(-1.3, 1.3) * spread, rand(0.15, 0.9), rand(-0.4, 0.4), c.r, c.g, c.b, rand(0.12, 0.3), rand(0.16, 0.36), rand(0.5, 1.1), -0.15, 1.8, 4);
    }
  }

  slashFlash(x, y, z, color, size, angle) {
    const mat = new THREE.MeshBasicMaterial({ map: softDot(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 1 });
    const m = new THREE.Mesh(this.flashGeo, mat);
    m.position.set(x, y, z); m.rotation.z = angle; m.renderOrder = 7;
    this.scene.add(m);
    this.transients.push({ m, t: 0, dur: 0.16, kind: 'flash', size });
    const core = new THREE.Mesh(this.flashGeo, mat.clone());
    core.material.color.set(0xffffff); core.position.set(x, y, z + 0.01); core.renderOrder = 8;
    this.scene.add(core);
    this.transients.push({ m: core, t: 0, dur: 0.11, kind: 'core', size: size * 0.5 });
  }

  ring(x, y, z, color, size, dur = 0.4, flat = false) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.position.set(x, y, z); if (flat) m.rotation.x = -Math.PI / 2;
    m.renderOrder = 6;
    this.scene.add(m);
    this.transients.push({ m, t: 0, dur, kind: 'ring', size });
  }

  // --- gameplay-level effects ---
  hitImpact(e, attackerColor) {
    const { x, y } = e;
    const z = 0.15;
    if (e.blocked) {
      this.sparks(x, y, z, 0xbfe0ff, 16, 5, -e.dir);
      this.sparks(x, y, z, 0xffe9b0, 8, 7, -e.dir);
      this.ring(x, y, z, 0xa8d4ff, 0.55, 0.22);
      this.light(x, y, 1, 0x9cc8ff, 9, 0.16);
      return;
    }
    const big = e.ko ? 3 : e.isSuper ? 2 : e.special || e.heavy || e.counter ? 1.5 : 1;
    this.slashFlash(x, y, z, attackerColor, 1.5 * big, rand(-0.9, 0.9));
    this.sparks(x, y, z, 0xfff0c8, Math.round(12 * big), 6, e.dir);
    if (e.special) this.sparks(x, y, z, attackerColor, Math.round(16 * big), 7.5, e.dir);
    this.blood(x, y, z, e.dir, Math.round((10 + e.dmg * 1.6) * (e.ko ? 3 : 1)));
    this.light(x, y, 1.2, e.special ? attackerColor : 0xffd8a0, 16 * big, 0.2);
    if (e.ko || e.isSuper) this.ring(x, y, z, 0xffffff, 2.6, 0.5);
    if (e.counter) this.ring(x, y, z, 0xff5040, 1.2, 0.3);
  }

  shock(x, y, color, size = 2.4) {
    this.ring(x, y, 0.1, color, size, 0.55);
    this.ring(x, 0.03, 0, color, size * 1.2, 0.6, true);
    this.light(x, y, 1, color, 26, 0.4);
    const c = new THREE.Color(color);
    for (let i = 0; i < 40; i++) {
      const a = rand(0, 6.283), sp = rand(1.5, 6);
      this.glow.spawn(x, y, 0, Math.cos(a) * sp, Math.sin(a) * sp, rand(-1, 1), c.r * 1.5, c.g * 1.5, c.b * 1.5, 1, rand(0.04, 0.09), rand(0.3, 0.7), 0, 3, 0);
    }
  }

  eruption(x, color) {
    const c = new THREE.Color(color);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 4.6), flameMaterial(0xff2a04, 0xffe08a, Math.random() * 20));
      f.position.set(x + (i - 1.5) * 0.75, 2.2, 0.05 + (i % 2) * 0.12 - 0.06); f.renderOrder = 7;
      this.scene.add(f);
      this.transients.push({ m: f, t: -i * 0.035, dur: 0.75, kind: 'pillar' });
    }
    this.light(x, 1.6, 1.5, color, 30, 0.7);
    this.ring(x, 0.04, 0, color, 4.2, 0.7, true);
    this.dust(x, 0, 30, 0x5a4a44, 3.4);
    for (let i = 0; i < 90; i++) {
      this.glow.spawn(x + rand(-1.6, 1.6), rand(0, 0.5), rand(-0.4, 0.4), rand(-2, 2), rand(3, 11), rand(-1, 1), c.r * 1.6, c.g * 1.2 + 0.3, c.b, 1, rand(0.04, 0.1), rand(0.4, 1.1), 7, 0.8, 0);
    }
    for (let i = 0; i < 14; i++) {
      this.matter.spawn(x + rand(-1.5, 1.5), 0.1, rand(-0.3, 0.3), rand(-3, 3), rand(3, 8), rand(-1, 1), 0.12, 0.1, 0.1, 1, rand(0.08, 0.2), rand(0.7, 1.3), 14, 0.2, 2);
    }
  }

  // --- projectiles ---
  addProjectile(pr) {
    const color = new THREE.Color(pr.owner.char.color);
    const g = new THREE.Group();
    const v = { pr, g, color, t: 0, kind: pr.kind, spikeAcc: 0 };
    if (pr.kind === 'crescent') {
      const geo = new THREE.RingGeometry(0.34, 0.66, 40, 1, -Math.PI * 0.42, Math.PI * 0.84);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: color }, uTime: { value: 0 } },
        vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec2 vP;
          void main(){ float r = length(vP); float ang = atan(vP.y, vP.x) / 1.32;
            float band = smoothstep(0.34, 0.6, r) * (1.0 - smoothstep(0.62, 0.66, r));
            float tips = 1.0 - smoothstep(0.55, 1.0, abs(ang));
            float fl = 0.85 + 0.15 * sin(uTime * 40.0 + r * 30.0);
            float a = band * tips * fl;
            vec3 col = mix(uColor, vec3(1.0), smoothstep(0.52, 0.64, r) * 0.9);
            gl_FragColor = vec4(col * a * 2.6, a); }`,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
      });
      const m = new THREE.Mesh(geo, mat); m.scale.set(pr.facing, 1.25, 1); g.add(m); v.mat = mat;
    } else if (pr.kind === 'fox') {
      const core = new THREE.Mesh(this.flashGeo, new THREE.MeshBasicMaterial({ map: softDot(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      core.scale.setScalar(0.5);
      const halo = new THREE.Mesh(this.flashGeo, new THREE.MeshBasicMaterial({ map: softDot(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.setScalar(1.25);
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.0), flameMaterial(0xff2060, 0xffd0e0, Math.random() * 9));
      fl.rotation.z = pr.facing > 0 ? Math.PI / 2 : -Math.PI / 2; fl.position.x = -pr.facing * 0.35;
      g.add(halo, fl, core); v.flame = fl.material;
    }
    g.renderOrder = 7;
    const light = new THREE.PointLight(color, 10, 6, 2); g.add(light);
    this.scene.add(g);
    this.projViews.set(pr.id, v);
  }
  removeProjectile(pr, fizzle) {
    const v = this.projViews.get(pr.id);
    if (!v) return;
    this.scene.remove(v.g);
    v.g.traverse(o => { if (o.isMesh) { o.material.dispose(); } });
    this.projViews.delete(pr.id);
    if (!fizzle) this.sparks(v.g.position.x, v.g.position.y, 0.1, v.color, 22, 6, 0);
  }
  clearProjectiles() { for (const v of [...this.projViews.values()]) this.removeProjectile(v.pr, true); }

  /** @param alpha sim interpolation, simDt simulated seconds this frame */
  update(dt, simDt, alpha) {
    this.time += dt;
    this.glow.update(simDt > 0 ? Math.max(simDt, dt * 0.25) : dt * 0.15);
    this.matter.update(simDt > 0 ? Math.max(simDt, dt * 0.25) : dt * 0.15);
    for (const s of this.lights) { if (s.t < s.dur) { s.t += dt; const u = clamp(s.t / s.dur, 0, 1); s.l.intensity = s.peak * (1 - u) * (1 - u); } else s.l.intensity = 0; }
    for (let i = this.transients.length - 1; i >= 0; i--) {
      const tr = this.transients[i];
      tr.t += dt;
      const u = clamp(tr.t / tr.dur, 0, 1), m = tr.m;
      if (tr.kind === 'flash') { m.scale.set(tr.size * (0.5 + u * 1.6), tr.size * 0.16 * (1 - u * 0.7), 1); m.material.opacity = 1 - u; }
      else if (tr.kind === 'core') { m.scale.setScalar(tr.size * (0.6 + u)); m.material.opacity = 1 - u; }
      else if (tr.kind === 'ring') { const s = tr.size * (0.15 + 0.85 * (1 - Math.pow(1 - u, 3))); m.scale.setScalar(s); m.material.opacity = (1 - u) * 0.9; }
      else if (tr.kind === 'pillar') { m.visible = tr.t >= 0; m.material.uniforms.uTime.value = this.time * 1.6; m.material.uniforms.uPower.value = Math.sin(Math.min(1, Math.max(0, u)) * Math.PI) * 0.85; m.scale.y = 0.5 + Math.min(1, Math.max(0, u) * 3) * 0.6; m.position.y = m.scale.y * 2.2; }
      else if (tr.kind === 'spike') { const k = Math.sin(u * Math.PI); m.scale.set(tr.size, Math.max(0.01, k * tr.size), tr.size); }
      if (tr.t >= tr.dur) {
        this.scene.remove(m);
        if (tr.kind !== 'spike' && m.material) m.material.dispose();
        if (tr.kind === 'pillar') m.geometry.dispose();
        this.transients.splice(i, 1);
      }
    }
    for (const v of this.projViews.values()) {
      const pr = v.pr;
      const px = pr.px ?? pr.x;
      const x = px + (pr.x - px) * alpha;
      v.g.position.set(x, pr.y, 0.05);
      v.t += dt;
      if (v.mat) v.mat.uniforms.uTime.value = this.time;
      if (v.flame) v.flame.uniforms.uTime.value = this.time * 2;
      if (simDt <= 0) continue;
      const c = v.color;
      if (v.kind === 'quake') {
        v.spikeAcc += simDt;
        while (v.spikeAcc > 0.045) {
          v.spikeAcc -= 0.045;
          this.spike(x + rand(-0.15, 0.15), rand(-0.25, 0.25), rand(0.7, 1.15), c);
        }
        this.dust(x, 0, 2, 0x4a3c38, 0.6);
        for (let i = 0; i < 3; i++) this.glow.spawn(x + rand(-0.3, 0.3), rand(0, 0.3), rand(-0.2, 0.2), rand(-1, 1), rand(1.5, 5), rand(-0.5, 0.5), c.r * 1.5, c.g, c.b * 0.6, 1, rand(0.04, 0.09), rand(0.3, 0.6), 6, 1, 0);
      } else {
        const n = v.kind === 'fox' ? 3 : 4;
        for (let i = 0; i < n; i++) {
          this.glow.spawn(x - pr.facing * rand(0, 0.4), pr.y + rand(-1, 1) * pr.spec.hh * 0.9, rand(-0.1, 0.1), -pr.facing * rand(0.5, 2.5), rand(-0.6, 0.6), rand(-0.3, 0.3),
            c.r * 1.4, c.g * 1.4, c.b * 1.4, 0.9, rand(0.03, 0.08), rand(0.2, 0.45), 0, 2, 0);
        }
      }
    }
  }

  spike(x, z, h, color) {
    if (!this.spikeGeo) {
      this.spikeGeo = new THREE.ConeGeometry(0.2, 1, 5); this.spikeGeo.translate(0, 0.5, 0);
      this.spikeMat = new THREE.MeshStandardMaterial({ color: 0x2a2422, roughness: 0.9, emissive: new THREE.Color(color).multiplyScalar(0.35) });
    }
    const m = new THREE.Mesh(this.spikeGeo, this.spikeMat);
    m.position.set(x, 0, z); m.rotation.set(rand(-0.3, 0.3), rand(0, 6), rand(-0.3, 0.3));
    m.scale.set(h, 0.01, h); m.castShadow = true;
    this.scene.add(m);
    this.transients.push({ m, t: 0, dur: 0.5, kind: 'spike', size: h });
  }

  reset() {
    this.glow.clear(); this.matter.clear(); this.clearProjectiles();
    for (const tr of this.transients) this.scene.remove(tr.m);
    this.transients.length = 0;
  }
}

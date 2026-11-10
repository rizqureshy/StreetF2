// Swift Sword — fighter presentation: skinned model, animation selection and
// blending driven by simulation state, procedural katana and blade trail.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { ASSETS } from './assets.js';
import { DOWN_LIE, DOWN_RISE } from './config.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Katana
// ---------------------------------------------------------------------------
let wrapTex = null;
function gripTexture() {
  if (wrapTex) return wrapTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#15100e'; x.fillRect(0, 0, 64, 128);
  x.strokeStyle = '#3a2c26'; x.lineWidth = 5;
  for (let i = -4; i < 12; i++) {
    x.beginPath(); x.moveTo(0, i * 16); x.lineTo(64, i * 16 + 32); x.stroke();
    x.beginPath(); x.moveTo(64, i * 16); x.lineTo(0, i * 16 + 32); x.stroke();
  }
  x.fillStyle = '#c9a24a';
  for (let i = 0; i < 8; i++) { x.beginPath(); x.arc(32, i * 16 + 8, 2.2, 0, 7); x.fill(); }
  wrapTex = new THREE.CanvasTexture(c);
  wrapTex.colorSpace = THREE.SRGBColorSpace;
  return wrapTex;
}

/** Builds a katana along +Y (edge towards +Z). Returns { group, base, tip } with base/tip heights. */
export function makeKatana(spec, accent) {
  const L = spec.length, W = spec.width, curve = spec.curve, T = W * 0.24;
  const N = 14, pos = [], idx = [];
  const guardY = 0.092;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = guardY + t * L;
    const bend = -curve * 4 * (t - 0.5) * (t - 0.5) + curve;         // sori: gentle arc, edge on the convex side
    const taper = t > 0.86 ? 1 - (t - 0.86) / 0.14 : 1;
    const w = W * (0.94 - 0.14 * t);
    const edge = bend + w * 0.5 * (t > 0.86 ? 0.25 + 0.75 * taper : 1);
    const back = bend - w * 0.5;
    const tipPull = t > 0.86 ? (1 - taper) * w * 0.0 : 0;
    pos.push(0, y, edge - tipPull, T * taper, y, bend + w * 0.12, 0, y, t > 0.86 ? back + (edge - back) * (1 - taper) * 0.85 : back, -T * taper, y, bend + w * 0.12);
    if (i < N) {
      const a = i * 4, b = a + 4;
      for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; idx.push(a + k, a + k2, b + k2, a + k, b + k2, b + k); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const flat = g.toNonIndexed(); flat.computeVertexNormals();
  const steel = new THREE.MeshStandardMaterial({ color: 0xe6edf7, metalness: 1, roughness: 0.22, envMapIntensity: 1.7 });
  if (spec.glow) { steel.emissive = new THREE.Color(spec.glow); steel.emissiveIntensity = 0.55; steel.color.set(0x55504c); }
  const blade = new THREE.Mesh(flat, steel);
  const group = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: 0xa8843a, metalness: 1, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0c0a0a, metalness: 0.7, roughness: 0.45 });
  const habaki = new THREE.Mesh(new THREE.BoxGeometry(T * 2.4, 0.026, W * 1.05), brass); habaki.position.set(0, guardY + 0.012, curve * 0.02);
  const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(W * 1.25, W * 1.25, 0.008, 20), dark); tsuba.position.y = guardY - 0.004;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(W * 1.25, 0.004, 6, 24), brass); rim.rotation.x = Math.PI / 2; rim.position.y = guardY - 0.004;
  const gripLen = 0.25;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.016, gripLen, 10), new THREE.MeshStandardMaterial({ map: gripTexture(), roughness: 0.85, metalness: 0.05 }));
  grip.scale.z = 1.35; grip.position.y = guardY - 0.008 - gripLen / 2;
  const kashira = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.015, 0.016, 10), brass); kashira.scale.z = 1.35; kashira.position.y = guardY - 0.012 - gripLen;
  const tassel = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.6 }));
  tassel.position.set(0, guardY - 0.03, W * 0.8);
  group.add(blade, habaki, tsuba, rim, grip, kashira, tassel);
  group.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  return { group, base: guardY + 0.02, tip: guardY + L, blade };
}

// ---------------------------------------------------------------------------
// Blade trail: a ribbon swept by the blade, built from recent base/tip samples.
// ---------------------------------------------------------------------------
const TRAIL_MAX = 28, TRAIL_SUB = 2, TRAIL_LIFE = 0.16;
class BladeTrail {
  constructor(color) {
    const n = (TRAIL_MAX - 1) * TRAIL_SUB + 1;
    this.n = n;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3);
    this.uv = new Float32Array(n * 2 * 2);
    this.al = new Float32Array(n * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.al, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uBoost: { value: 1 } },
      vertexShader: `attribute float aAlpha; varying vec2 vUv; varying float vA;
        void main(){ vUv = uv; vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uBoost; varying vec2 vUv; varying float vA;
        void main(){
          float age = vUv.x;                       // 0 = newest
          float across = vUv.y;                    // 0 = guard, 1 = tip
          float edge = pow(clamp(across, 0.0, 1.0), 2.4);
          float fade = pow(clamp(1.0 - age, 0.0, 1.0), 2.2);
          float core = smoothstep(0.86, 1.0, across) * fade;
          vec3 col = mix(uColor, vec3(1.0), core * 0.8) * (0.9 + core * 1.6) * uBoost;
          float a = vA * fade * edge * 0.62;
          gl_FragColor = vec4(col * a, a);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.samples = [];      // newest first: { base:Vector3, tip:Vector3, t, a }
    this.clock = 0;
  }
  reset() { this.samples.length = 0; this.mesh.visible = false; }
  /** Add a blade sample taken at trail-clock time `t` (seconds of simulated time). */
  sample(base, tip, t, strength) {
    this.samples.unshift({ base: base.clone(), tip: tip.clone(), t, a: strength });
    if (this.samples.length > TRAIL_MAX) this.samples.length = TRAIL_MAX;
  }
  /** Advance the clock, drop expired samples and rebuild the ribbon. */
  commit(dt) {
    this.clock += dt;
    while (this.samples.length && this.clock - this.samples[this.samples.length - 1].t > TRAIL_LIFE) this.samples.pop();
    this.rebuild();
  }
  rebuild() {
    const s = this.samples, m = s.length;
    if (m < 3) { this.mesh.visible = false; return; }
    let peak = 0;
    for (const q of s) peak = Math.max(peak, q.a);
    if (peak < 0.02) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    const cr = (p0, p1, p2, p3, t, out) => {
      const t2 = t * t, t3 = t2 * t;
      out.set(
        0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3));
    };
    let k = 0;
    const total = (m - 1) * TRAIL_SUB + 1;
    for (let i = 0; i < m - 1; i++) {
      const s0 = s[Math.max(0, i - 1)], s1 = s[i], s2 = s[i + 1], s3 = s[Math.min(m - 1, i + 2)];
      const steps = i === m - 2 ? TRAIL_SUB + 1 : TRAIL_SUB;
      for (let j = 0; j < steps; j++) {
        const t = j / TRAIL_SUB;
        cr(s0.base, s1.base, s2.base, s3.base, t, _a);
        cr(s0.tip, s1.tip, s2.tip, s3.tip, t, _b);
        const age = clamp((this.clock - (s1.t + (s2.t - s1.t) * t)) / TRAIL_LIFE, 0, 1);
        const al = s1.a + (s2.a - s1.a) * t;
        this.pos.set([_a.x, _a.y, _a.z, _b.x, _b.y, _b.z], k * 6);
        this.uv.set([age, 0, age, 1], k * 4);
        this.al[k * 2] = al; this.al[k * 2 + 1] = al;
        k++;
      }
    }
    const g = this.mesh.geometry;
    g.setDrawRange(0, Math.max(0, (Math.min(k, total) - 1) * 6));
    g.attributes.position.needsUpdate = true; g.attributes.uv.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Animation selection
// ---------------------------------------------------------------------------
function attackPose(a, tf, out) {
  const d = a.def;
  if (d.segs) {
    let si = d.segs.length - 1;
    for (let i = 0; i < d.segs.length; i++) if (tf < d.segs[i][1]) { si = i; break; }
    const s = d.segs[si];
    const u = clamp((tf - s[0]) / (s[1] - s[0]), 0, 1);
    out.clip = s[2]; out.time = s[3] + (s[4] - s[3]) * u; out.sub = si;
    return out;
  }
  const an = d.anim;
  if (tf <= a.st) {
    const u = clamp(tf / a.st, 0, 1);
    out.clip = an.clip; out.time = an.pre + (an.hit - an.pre) * Math.pow(u, 1.35); out.sub = 0;
    return out;
  }
  const post = an.end - an.hit, rec = an.rec ? an.rec[2] - an.rec[1] : 0;
  const u = clamp((tf - a.st) / Math.max(1, a.total - a.st), 0, 1);
  const tt = (1 - Math.pow(1 - u, 1.5)) * (post + rec);          // follow-through fast, settle slow
  if (!an.rec || tt <= post) { out.clip = an.clip; out.time = an.hit + Math.min(tt, post); out.sub = 0; }
  else { out.clip = an.rec[0]; out.time = an.rec[1] + (tt - post); out.sub = 1; }
  return out;
}

const _pose = { clip: 'idle', time: 0, sub: 0 };

export class FighterView {
  /**
   * @param {object} char  character definition (config.js)
   * @param {object} opts  { alt: bool (mirror-match palette), envMap }
   */
  constructor(char, opts = {}) {
    this.char = char;
    const gltf = ASSETS.models[char.model];
    const native = gltf.scene.userData.height || 1.78;
    this.mount = gltf.scene.userData.mount;
    this.model = cloneSkinned(gltf.scene);
    this.unit = char.height / native;

    this.group = new THREE.Group();          // sim position + facing mirror
    this.pivot = new THREE.Group();          // model faces +X here
    this.pivot.rotation.y = Math.PI / 2;
    this.pivot.scale.setScalar(this.unit);
    this.pivot.add(this.model);
    this.group.add(this.pivot);

    this.materials = [];
    this.bones = {};
    this.model.traverse(o => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
        o.material = o.material.clone();
        const m = o.material;
        m.envMapIntensity = 0.85;
        if (char.tint) m.color.setRGB(char.tint[0], char.tint[1], char.tint[2]);
        if (opts.alt) m.color.multiply(new THREE.Color(0.62, 0.7, 1.0));
        m.emissive = new THREE.Color(0, 0, 0);
        m.emissiveIntensity = 1;
        this.materials.push(m);
      }
    });
    this.baseGlow = new THREE.Color(...(char.glow || [0, 0, 0]));
    this.accent = new THREE.Color(char.color);

    // --- animation ---
    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = {};
    for (const c of gltf.animations) this.clips[c.name] = c;
    this.actions = {};           // name -> [actionA, actionB]
    this.cur = null; this.prev = null;
    this.fade = 1; this.fadeDur = 0.12;
    this.curKey = '';
    this.loopT = 0;              // free-running clock for looping clips (sim time)
    this.walkPhase = 0;

    // --- sword ---
    const k = makeKatana(char.blade, this.accent);
    this.katana = k;
    const hand = this.bones[this.mount.bone];
    const hs = this.mount.boneScale;
    const y = new THREE.Vector3().fromArray(this.mount.blade).normalize();
    const z = new THREE.Vector3().fromArray(this.mount.edge); z.addScaledVector(y, -z.dot(y)).normalize();
    const x = new THREE.Vector3().crossVectors(y, z);
    k.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    const p = new THREE.Vector3().fromArray(this.mount.grip).multiplyScalar(0.6).addScaledVector(new THREE.Vector3().fromArray(this.mount.palm), 0.03 * hs);
    k.group.position.copy(p).multiplyScalar(1 / hs);
    k.group.scale.setScalar(1 / hs);
    hand.add(k.group);

    this.trail = new BladeTrail(char.color);
    this.tipWorld = new THREE.Vector3(); this.baseWorld = new THREE.Vector3();
    this.prevTip = new THREE.Vector3(); this.hasPrevTip = false;
    this.tipSpeed = 0;

    this.flash = 0;              // white hit flash
    this.aura = 0;               // super glow
    this.x = 0; this.y = 0; this.facing = 1;
    this.lastAttackSeq = -1;
    this.setClip('idle', 0, 0);
    this.mixer.update(0);
  }

  action(name, avoid) {
    let pair = this.actions[name];
    if (!pair) {
      const clip = this.clips[name];
      if (!clip) return null;
      pair = this.actions[name] = [this.mixer.clipAction(clip), this.mixer.clipAction(clip.clone())];
      for (const a of pair) { a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; }
    }
    return pair[0] === avoid ? pair[1] : pair[0];
  }

  /** Select the clip/time to show; `key` changes trigger a cross-fade. */
  setClip(name, time, fadeDur, key = name, loop = false) {
    if (key !== this.curKey) {
      const next = this.action(name, this.cur);
      if (!next) return;
      if (this.prev && this.prev !== next) { this.prev.stop(); }
      this.prev = this.cur;
      this.cur = next;
      this.curKey = key;
      this.fade = this.prev && fadeDur > 0 ? 0 : 1;
      this.fadeDur = fadeDur;
      next.reset(); next.play(); next.paused = true;
    }
    const dur = this.cur.getClip().duration;
    this.cur.time = loop ? ((time % dur) + dur) % dur : clamp(time, 0, dur - 1e-4);
  }

  applyBlend(dt) {
    if (this.fade < 1) {
      this.fade = this.fadeDur > 0 ? Math.min(1, this.fade + dt / this.fadeDur) : 1;
      if (this.fade >= 1 && this.prev) { this.prev.stop(); this.prev = null; }
    }
    const w = this.fade * this.fade * (3 - 2 * this.fade);
    this.cur.setEffectiveWeight(this.prev ? w : 1);
    if (this.prev) this.prev.setEffectiveWeight(1 - w);
    this.mixer.update(0);
  }

  /**
   * @param f      simulation Fighter
   * @param alpha  interpolation between the previous and current sim tick (0..1)
   * @param dt     real seconds since last render
   * @param simDt  simulated seconds since last render (0 during hit-stop, small in slow motion)
   */
  update(f, alpha, dt, simDt) {
    const px = f.px ?? f.x, py = f.py ?? f.y;
    this.x = px + (f.x - px) * alpha;
    this.y = py + (f.y - py) * alpha;
    this.facing = f.facing;
    this.group.position.set(this.x, this.y, 0);
    this.group.scale.x = this.facing;
    this.loopT += simDt;
    const st = f.stateT + (simDt > 0 ? alpha : 0);      // fractional frames in state
    const T = st / 60;

    let fade = 0.14;
    const P = _pose; P.sub = 0;
    let key = null, loop = false;
    const grounded = f.grounded;

    if (f.state === 'ko' || (f.state === 'hit' && f.hitKind === 'launch') || f.state === 'down') {
      const sinceLand = (f.landT + (simDt > 0 ? alpha : 0)) / 60;
      if (!grounded) { P.clip = 'knockback'; P.time = Math.min(0.27, 0.03 + T * 0.62); key = 'kb' + f.hitSeq; fade = 0.06; }
      else if (f.state === 'down' && f.downTimer <= DOWN_RISE) {
        P.clip = 'getup'; P.time = 0.22 + (1 - f.downTimer / DOWN_RISE + (simDt > 0 ? alpha : 0) / DOWN_RISE) * 1.3; key = 'up' + f.hitSeq; fade = 0.12;
      } else { P.clip = 'knockback'; P.time = Math.min(0.83, 0.29 + sinceLand * 1.0); key = 'kb' + f.hitSeq; fade = 0.06; }
    } else if (f.state === 'hit') {
      P.clip = f.hitKind === 'head' ? 'hitHead' : 'hitChest';
      P.time = Math.max(0, T) * 0.95; key = 'hit' + f.hitSeq; fade = 0.035;
    } else if (f.state === 'block') {
      P.clip = 'block'; P.time = Math.min(0.5, 0.2 + T * 1.6); key = 'block'; fade = 0.05;
    } else if (f.attack) {
      attackPose(f.attack, f.attack.t + (simDt > 0 ? alpha : 0), P);
      key = 'atk' + f.attackSeq + '_' + P.sub;
      fade = P.sub ? 0.1 : 0.075;
    } else if (!grounded) {
      const flip = this.char.jump === 'flip';
      const at = (f.airT + (simDt > 0 ? alpha : 0)) / 60;
      if (flip) {
        if (at < 0.55) { P.clip = 'flipStart'; P.time = 0.14 + at * 1.5; key = 'jumpS'; }
        else { P.clip = 'flipLoop'; P.time = this.loopT; loop = true; key = 'jumpL'; }
      } else if (f.vy > -0.02 && at < 0.6) { P.clip = 'jumpStart'; P.time = 0.2 + at * 1.5; key = 'jumpS'; }
      else { P.clip = 'jumpLoop'; P.time = this.loopT; loop = true; key = 'jumpL'; }
      fade = 0.09;
    } else if (f.state === 'crouch') {
      P.clip = 'crouch'; P.time = this.loopT; loop = true; key = 'crouch'; fade = 0.1;
    } else if (f.state === 'walk') {
      const dashing = f.dashT > 0;
      if (f.walkDir >= 0) {
        P.clip = dashing ? 'sprint' : 'jog';
        this.walkPhase += simDt * (dashing ? 1.25 : 0.74 * f.char.speed);
      } else {
        P.clip = 'walk';
        this.walkPhase -= simDt * (dashing ? 2.6 : 1.3 * f.char.speed);
      }
      P.time = this.walkPhase; loop = true; key = P.clip; fade = 0.12;
    } else if (f.state === 'win') {
      P.clip = 'breathe'; P.time = this.loopT; loop = true; key = 'win'; fade = 0.35;
    } else if (f.landT < 13 && f.stateT < 14) {
      P.clip = this.char.jump === 'flip' ? 'flipLand' : 'jumpLand';
      P.time = 0.14 + (f.landT + alpha) / 60 * 2.1; key = 'land'; fade = 0.05;
    } else {
      P.clip = 'idle'; P.time = this.loopT; loop = true; key = 'idle'; fade = 0.16;
    }
    this.setClip(P.clip, P.time, fade, key, loop);
    this.applyBlend(dt);

    // --- material feedback ---
    this.flash = Math.max(0, this.flash - dt * 7);
    const superOn = !!(f.attack && f.attack.def.isSuper);
    this.aura += ((superOn ? 1 : 0) - this.aura) * Math.min(1, dt * 8);
    const fl = this.flash, au = this.aura * (0.1 + 0.05 * Math.sin(this.loopT * 40));
    for (const m of this.materials) {
      m.emissive.setRGB(this.baseGlow.r + fl * 1.0 + this.accent.r * au, this.baseGlow.g + fl * 0.85 + this.accent.g * au, this.baseGlow.b + fl * 0.75 + this.accent.b * au);
    }

    // --- blade trail ---
    // Fast swings cover a wide arc between two rendered frames, so the blade is
    // re-posed at intermediate clip times to keep the ribbon a smooth curve.
    const k = this.katana;
    const swinging = !!(f.attack && f.attack.t >= f.attack.st - 7 && f.attack.t <= f.attack.st + f.attack.act + 5);
    const sameClip = this.lastTrailKey === this.curKey && simDt > 0;
    const t1 = this.cur.time, t0 = sameClip ? this.lastTrailTime : t1;
    const subs = sameClip && f.attack ? Math.min(6, Math.max(1, Math.ceil(Math.abs(t1 - t0) / 0.011))) : 1;
    const x1 = this.group.position.x, y1 = this.group.position.y;
    const x0 = sameClip ? this.lastTrailX : x1, y0 = sameClip ? this.lastTrailY : y1;
    for (let i = 1; i <= subs; i++) {
      const u = i / subs;
      if (subs > 1) {
        this.cur.time = t0 + (t1 - t0) * u;
        this.group.position.set(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, 0);
        this.mixer.update(0);
      }
      this.group.updateMatrixWorld(true);
      this.baseWorld.set(0, k.base, 0); k.group.localToWorld(this.baseWorld);
      this.tipWorld.set(0, k.tip, 0); k.group.localToWorld(this.tipWorld);
      if (simDt > 0) {
        const step = simDt / subs;
        const sp = this.hasPrevTip ? this.tipWorld.distanceTo(this.prevTip) / step : 0;
        this.tipSpeed += (sp - this.tipSpeed) * (subs > 1 ? 0.7 : 0.5);
        this.prevTip.copy(this.tipWorld); this.hasPrevTip = true;
        const strength = clamp((this.tipSpeed - 7) / 12, 0, 1) * (swinging ? 1 : 0.3);
        this.trail.sample(this.baseWorld, this.tipWorld, this.trail.clock + step * i, strength);
      }
    }
    this.lastTrailKey = this.curKey; this.lastTrailTime = t1; this.lastTrailX = x1; this.lastTrailY = y1;
    this.trail.mat.uniforms.uBoost.value = superOn ? 1.8 : 1;
    this.trail.commit(simDt);
  }

  /** Menu / showcase use: loop one clip in place. */
  preview(clip, dt, rate = 1) {
    this.loopT += dt * rate;
    this.setClip(clip, this.loopT, 0.25, 'pv_' + clip, true);
    this.applyBlend(dt);
    for (const m of this.materials) m.emissive.copy(this.baseGlow);
    this.trail.mesh.visible = false;
  }

  /** World position of a named bone (e.g. 'Head', 'Spine'). */
  bonePos(name, out) { return this.bones[name].getWorldPosition(out); }

  hit(strength = 1) { this.flash = Math.max(this.flash, strength); }

  dispose() {
    this.mixer.stopAllAction();
    for (const m of this.materials) m.dispose();
    this.trail.mesh.geometry.dispose(); this.trail.mat.dispose();
    this.katana.group.traverse(o => { if (o.isMesh) { o.geometry.dispose(); } });
  }
}

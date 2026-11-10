// Swift Sword — renderer, quality presets, post-processing chain and the
// cinematic camera director.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { STAGE_HALF } from './config.js';
import { OPTIONS } from './options.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const QUALITY = {
  low:    { name: 'LOW', pr: 1, shadows: 0, bloom: false, msaa: 0, particles: false },
  medium: { name: 'MEDIUM', pr: 1.5, shadows: 1024, bloom: true, msaa: 0, particles: true },
  high:   { name: 'HIGH', pr: 2, shadows: 2048, bloom: true, msaa: 4, particles: true },
};
export function resolveQuality() {
  const q = new URLSearchParams(location.search).get('q') || OPTIONS.quality;
  if (QUALITY[q]) return QUALITY[q];
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse ? QUALITY.medium : QUALITY.high;
}

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: 0.9 }, uAberr: { value: 0.0 },
    uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color(1, 1, 1) }, uGrain: { value: 0.035 },
    uSat: { value: 1.08 }, uDark: { value: 0 }, uFocus: { value: new THREE.Vector2(0.5, 0.5) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uVignette, uAberr, uFlash, uGrain, uSat, uDark;
    uniform vec3 uFlashColor; uniform vec2 uFocus; varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5; float r2 = dot(c, c);
      vec2 off = c * (uAberr * (0.35 + r2 * 3.0));
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSat);
      // super-move spotlight: darken everything away from the focus point
      float fd = distance(vUv, uFocus);
      col *= 1.0 - uDark * smoothstep(0.08, 0.6, fd);
      // (edges must ascend: smoothstep with edge0 > edge1 is undefined and returns 0 on many GPUs)
      col *= mix(1.0, 1.0 - smoothstep(0.25, 0.92, sqrt(r2)), uVignette);
      col += uFlashColor * uFlash;
      float n = fract(sin(dot(vUv * vec2(1920.0, 1080.0) + uTime * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * uGrain * (0.4 + l);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export class Gfx {
  constructor(canvas) {
    this.quality = resolveQuality();
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1;
    r.shadowMap.enabled = this.quality.shadows > 0;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 200);
    this.buildComposer();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => this.resize());
  }

  buildComposer() {
    const r = this.renderer, q = this.quality;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x || 2, size.y || 2, { type: THREE.HalfFloatType, samples: q.msaa });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = null;
    if (q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.62, 0.86);
      this.composer.addPass(this.bloom);
    }
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    this.composer.addPass(new OutputPass());
  }

  setQuality(name) {
    OPTIONS.quality = name;
    this.quality = resolveQuality();
    this.renderer.shadowMap.enabled = this.quality.shadows > 0;
    this.composer.dispose();
    this.buildComposer();
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.quality.pr);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.width = w; this.height = h; this.pixelHeight = h * pr;
    if (this.onResize) this.onResize();
  }

  /** @param look  { exposure, bloom } from the stage; fx: transient post values */
  render(time, look, post) {
    const u = this.final.uniforms;
    u.uTime.value = time;
    u.uAberr.value = post.aberr;
    u.uFlash.value = post.flash;
    u.uFlashColor.value.copy(post.flashColor);
    u.uDark.value = post.dark;
    u.uFocus.value.copy(post.focus);
    u.uSat.value = post.sat;
    this.renderer.toneMappingExposure = look.exposure * (1 + post.exposureBoost);
    if (this.bloom) this.bloom.strength = look.bloom * (1 + post.bloomBoost);
    this.composer.render();
  }

  /** Render a head-and-shoulders portrait of a fighter view to a data URL. */
  portrait(view, size = 256) {
    const r = this.renderer;
    const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
    const scene = new THREE.Scene();
    scene.background = null;
    scene.add(new THREE.HemisphereLight(0xdde8ff, 0x30242a, 1.5));
    const k = new THREE.DirectionalLight(0xfff0dd, 3.2); k.position.set(2.5, 3, 4); scene.add(k);
    const rim = new THREE.DirectionalLight(view.accent, 4); rim.position.set(-3, 2, -3); scene.add(rim);
    const parent = view.group.parent;
    scene.add(view.group);
    view.group.position.set(0, 0, 0); view.group.scale.x = 1;
    view.loopT = 0.4;
    view.setClip('breathe', 0.4, 0, 'portrait', true); view.applyBlend(0);
    view.group.updateMatrixWorld(true);
    const head = view.bonePos('Head', new THREE.Vector3());
    const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 20);
    cam.position.set(head.x + 0.95, head.y + 0.12, 1.25);
    cam.lookAt(head.x + 0.06, head.y + 0.04, 0);
    const prevTM = r.toneMapping, prevTarget = r.getRenderTarget(), prevCS = r.outputColorSpace;
    const clear = new THREE.Color(); r.getClearColor(clear); const clearA = r.getClearAlpha();
    r.toneMapping = THREE.NoToneMapping;
    r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear();
    r.render(scene, cam);
    const buf = new Uint8Array(size * size * 4);
    r.readRenderTargetPixels(rt, 0, 0, size, size, buf);
    r.setRenderTarget(prevTarget); r.toneMapping = prevTM; r.outputColorSpace = prevCS; r.setClearColor(clear, clearA);
    rt.dispose();
    scene.remove(view.group);
    if (parent) parent.add(view.group);
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d'), img = x.createImageData(size, size);
    for (let row = 0; row < size; row++) {
      const src = (size - 1 - row) * size * 4;
      for (let i = 0; i < size * 4; i += 4) {
        // linear -> sRGB
        for (let ch = 0; ch < 3; ch++) { const v = buf[src + i + ch] / 255; img.data[row * size * 4 + i + ch] = Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); }
        img.data[row * size * 4 + i + 3] = buf[src + i + 3];
      }
    }
    x.putImageData(img, 0, 0);
    return c.toDataURL('image/webp', 0.9);
  }
}

// ---------------------------------------------------------------------------
// Camera director
// ---------------------------------------------------------------------------
const _p = new THREE.Vector3(), _l = new THREE.Vector3();
export class Director {
  constructor(camera) {
    this.cam = camera;
    this.pos = new THREE.Vector3(0, 1.4, 9);
    this.look = new THREE.Vector3(0, 1.3, 0);
    this.shot = 'fight'; this.shotT = 0; this.shotSide = 0;
    this.trauma = 0; this.time = 0;
    this.fov = 30; this.fovTarget = 30;
    this.snap = true;
    this.punch = 0;          // brief zoom-in on impact
  }
  setShot(name, side = 0, snap = false) { this.shot = name; this.shotT = 0; this.shotSide = side; if (snap) this.snap = true; }
  shake(amount) { this.trauma = Math.min(1, Math.max(this.trauma, amount)); }

  /**
   * @param views  [FighterView, FighterView] (uses their interpolated x / y)
   */
  update(dt, views) {
    this.time += dt; this.shotT += dt;
    const cam = this.cam, a = views[0], b = views[1];
    const aspectK = Math.pow(Math.max(1, 1.78 / cam.aspect), 0.95);
    let stiff = 5.5;
    this.fovTarget = 30;
    const t = this.shotT;
    const mid = a && b ? (a.x + b.x) / 2 : 0, sep = a && b ? Math.abs(a.x - b.x) : 3.8;
    const top = a && b ? Math.max(a.y, b.y) : 0;
    switch (this.shot) {
      case 'title': {
        const k = this.time * 0.07;
        _p.set(Math.sin(k) * 3.4, 1.25 + Math.sin(k * 1.7) * 0.25, 8.6 + Math.cos(k * 1.3) * 0.9);
        _l.set(Math.sin(k) * 0.8, 1.55, 0);
        stiff = 1.5;
        break;
      }
      case 'select': {
        _p.set(0, 1.0, 7.7 * aspectK); _l.set(0, 0.55, 0); stiff = 3;
        break;
      }
      case 'versus': {
        _p.set(Math.sin(t * 0.25) * 0.5, 0.8, 5.4 * aspectK - t * 0.12); _l.set(0, 1.28, 0); stiff = 3;
        break;
      }
      case 'establish': {
        const u = Math.min(1, t / 1.3);
        const e = u * u * (3 - 2 * u);
        _p.set(-5.5 + e * 3.5, 4.6 - e * 2.6, 15.5 - e * 4); _l.set(0, 1.6 - e * 0.2, -3 + e * 3);
        stiff = 2.4;
        break;
      }
      case 'p1': case 'p2': {
        const v = views[this.shotSide];
        const dir = v.facing, s = v.char.height / 1.78;
        const ang = 1.0 - Math.min(1, t / 1.8) * 0.5;              // sweeps from the flank toward the front
        const rad = (4.5 - Math.min(1, t / 1.8) * 0.5) * s * aspectK;
        _p.set(v.x + dir * Math.cos(ang) * rad, 0.9 * s + t * 0.06, Math.sin(ang) * rad);
        _l.set(v.x + dir * 0.3, 1.06 * s, 0);
        stiff = this.shotT < 0.05 ? 99 : 4;
        this.fovTarget = 27;
        break;
      }
      case 'ko': {
        const v = views[this.shotSide];
        const d = 5.4 * aspectK;
        _p.set(clamp(v.x * 0.85 + mid * 0.15, -STAGE_HALF, STAGE_HALF), 0.85, d); _l.set(v.x * 0.7 + mid * 0.3, 1.0 + v.y * 0.5, 0);
        stiff = 7; this.fovTarget = 27;
        if (t > 2.2) this.shot = 'fight';
        break;
      }
      case 'win': {
        const v = views[this.shotSide];
        const s = v.char.height / 1.78;
        const ang = Math.min(1.25, 0.9 + t * 0.07), rad = Math.max(3.6, 4.8 - t * 0.25) * s * aspectK;
        _p.set(v.x + v.facing * Math.cos(ang) * rad * 0.8, 0.62 * s, Math.sin(ang) * rad); _l.set(v.x, 1.18 * s, 0);
        stiff = 2.6; this.fovTarget = 28;
        break;
      }
      default: {  // 'fight'
        const d = clamp(4.9 + sep * 0.62, 6.4, 11.8) * aspectK;
        const lim = Math.max(0, STAGE_HALF + 1.2 - d * 0.46 * cam.aspect / 1.78);
        _p.set(clamp(mid, -lim, lim), 0.95 + top * 0.3, d);
        _l.set(_p.x, 1.42 + top * 0.42, 0);
        stiff = 5.5;
      }
    }
    if (this.snap) { this.pos.copy(_p); this.look.copy(_l); this.fov = this.fovTarget; this.snap = false; }
    else {
      const k = 1 - Math.exp(-stiff * dt);
      this.pos.lerp(_p, k); this.look.lerp(_l, k);
      this.fov += (this.fovTarget - this.fov) * (1 - Math.exp(-4 * dt));
    }
    this.punch = Math.max(0, this.punch - dt * 5);
    this.trauma = Math.max(0, this.trauma - dt * 1.9);
    const sh = this.trauma * this.trauma, tt = this.time * 37;
    cam.position.set(this.pos.x + Math.sin(tt * 1.3) * 0.16 * sh, this.pos.y + Math.sin(tt * 1.7 + 2) * 0.13 * sh, this.pos.z - this.punch * 0.55);
    cam.lookAt(this.look.x + Math.sin(tt * 1.1 + 4) * 0.07 * sh, this.look.y + Math.cos(tt * 1.9) * 0.05 * sh, this.look.z);
    cam.rotation.z += Math.sin(tt * 0.9) * 0.012 * sh;
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }
}

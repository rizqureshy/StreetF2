/* ============================================================
   STREET FIGHTER 2 — JS EDITION
   A fan-made homage built with HTML5 Canvas + vanilla JS.
   ============================================================ */
'use strict';

// ---------------- Constants ----------------
const W = 960, H = 540;
const GROUND = 450;
const GRAVITY = 0.78;
const JUMP_VY = -16;
const WALK_SPEED = 3.9;
const STAGE_MARGIN = 56;
const FSCALE = 1.6;   // fighter size multiplier (visuals + hitboxes)
const MAX_HP = 100;
const ROUND_TIME = 99;
const ROUNDS_TO_WIN = 2;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// ---------------- Audio (tiny WebAudio synth) ----------------
let audioCtx = null;
function initAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ }
    if (audioCtx) decodeAllSamples();
  }
}
function beep(freq, dur, type = 'square', vol = 0.12, slide = 0) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + dur);
}
let noiseBuffer = null;
function noiseBuf() {
  if (!noiseBuffer) {
    noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}
function noiseSfx(dur, f0, f1, vol, type = 'bandpass', q = 1.5) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const n = audioCtx.createBufferSource();
  n.buffer = noiseBuf();
  const flt = audioCtx.createBiquadFilter();
  flt.type = type;
  flt.Q.value = q;
  flt.frequency.setValueAtTime(f0, t);
  flt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  n.connect(flt).connect(g).connect(audioCtx.destination);
  n.start(t);
  n.stop(t + dur + 0.02);
}
// ---------------- Sampled SFX (Kenney audio packs, CC0) ----------------
const SAMPLES = {};
function loadSample(name, url) {
  SAMPLES[name] = { raw: null, buf: null };
  if (typeof fetch !== 'function') return;
  fetch(url)
    .then(r => (r.ok ? r.arrayBuffer() : null))
    .then(a => {
      if (!a) return;
      SAMPLES[name].raw = a;
      if (audioCtx) decodeSample(name);
    })
    .catch(() => {});
}
function decodeSample(name) {
  const s = SAMPLES[name];
  if (!s || !s.raw || s.buf) return;
  audioCtx.decodeAudioData(s.raw.slice(0), b => { s.buf = b; }, () => {});
}
function decodeAllSamples() {
  for (const n in SAMPLES) decodeSample(n);
}
function playSample(names, vol = 1, rateJitter = 0.05) {
  if (!audioCtx) return false;
  const list = Array.isArray(names) ? names : [names];
  const cands = list.filter(n => SAMPLES[n] && SAMPLES[n].buf);
  if (!cands.length) return false;
  const src = audioCtx.createBufferSource();
  src.buffer = SAMPLES[cands[Math.floor(Math.random() * cands.length)]].buf;
  src.playbackRate.value = 1 + (Math.random() * 2 - 1) * rateJitter;
  const g = audioCtx.createGain();
  g.gain.value = vol;
  src.connect(g).connect(audioCtx.destination);
  src.start();
  return true;
}
const SFX_FILES = {
  slice1: 'assets/sfx/knife_slice.ogg', slice2: 'assets/sfx/knife_slice_2.ogg',
  swing1: 'assets/sfx/draw_knife_1.ogg', swing2: 'assets/sfx/draw_knife_2.ogg', swing3: 'assets/sfx/draw_knife_3.ogg',
  punchH1: 'assets/sfx/impact_punch_heavy_000.ogg', punchH2: 'assets/sfx/impact_punch_heavy_001.ogg', punchH3: 'assets/sfx/impact_punch_heavy_002.ogg',
  punchM1: 'assets/sfx/impact_punch_medium_000.ogg', punchM2: 'assets/sfx/impact_punch_medium_001.ogg',
  chop: 'assets/sfx/chop.ogg',
  metal1: 'assets/sfx/impact_metal_light_000.ogg', metal2: 'assets/sfx/impact_metal_light_001.ogg', metal3: 'assets/sfx/impact_metal_medium_000.ogg',
  body1: 'assets/sfx/impact_soft_heavy_000.ogg', body2: 'assets/sfx/impact_soft_heavy_001.ogg',
  floor: 'assets/sfx/impact_wood_heavy_000.ogg',
  gong: 'assets/sfx/impact_bell_heavy_000.ogg',
  land1: 'assets/sfx/footstep_wood_000.ogg', land2: 'assets/sfx/footstep_wood_001.ogg',
  cloth1: 'assets/sfx/cloth_1.ogg', cloth2: 'assets/sfx/cloth_3.ogg',
  click1: 'assets/sfx/click1.wav', click2: 'assets/sfx/click3.wav',
  vo_ready: 'assets/vo/ready.ogg', vo_go: 'assets/vo/go.ogg',
  vo_round: 'assets/vo/round.ogg', vo_final_round: 'assets/vo/final_round.ogg',
  vo_you_win: 'assets/vo/you_win.ogg', vo_you_lose: 'assets/vo/you_lose.ogg',
  vo_time_over: 'assets/vo/time_over.ogg', vo_hurry: 'assets/vo/hurry_up.ogg',
  vo_tie: 'assets/vo/its_a_tie.ogg', vo_congrats: 'assets/vo/congratulations.ogg',
};
for (const [n, u] of Object.entries(SFX_FILES)) loadSample(n, u);
const VOICE = { say: (name, vol = 1) => playSample(name, vol, 0.015) };

const SFX = {
  // metallic sword impact: ring + body thump
  hit: () => {
    const ok = playSample(['slice1', 'slice2'], 0.85);
    playSample(['punchH1', 'punchH2', 'punchH3'], 0.8);
    if (!ok) { noiseSfx(0.09, 3200, 2200, 0.14, 'bandpass', 7); beep(74, 0.16, 'sine', 0.26, -28); }
  },
  block: () => {
    if (!playSample(['metal1', 'metal2', 'metal3'], 0.7)) {
      noiseSfx(0.06, 1800, 1400, 0.1, 'bandpass', 5); beep(330, 0.08, 'square', 0.07, -90);
    }
  },
  whoosh: () => {
    if (!playSample(['swing1', 'swing2', 'swing3'], 0.55, 0.1)) noiseSfx(0.17, 950, 240, 0.16, 'bandpass', 1.2);
  },
  fireball: () => { beep(220, 0.32, 'sawtooth', 0.1, 320); noiseSfx(0.3, 400, 1600, 0.08, 'bandpass', 2); },
  jump: () => {
    if (!playSample(['cloth1', 'cloth2'], 0.7, 0.1)) beep(260, 0.1, 'triangle', 0.06, 160);
  },
  land: () => playSample(['land1', 'land2'], 0.4, 0.1),
  fall: () => { playSample(['body1', 'body2'], 0.9); playSample('floor', 0.5); },
  ko: () => {
    beep(300, 0.8, 'sawtooth', 0.16, -262);
    if (!playSample(['body1', 'body2'], 1)) noiseSfx(0.5, 900, 90, 0.16, 'lowpass');
  },
  select: () => { if (!playSample('click1', 0.8, 0)) beep(700, 0.06, 'square', 0.08); },
  confirm: () => { if (!playSample('click2', 0.9, 0)) beep(520, 0.08, 'square', 0.1); },
  sweep: () => {
    const ok = playSample(['punchM1', 'punchM2'], 0.85);
    playSample('chop', 0.5);
    if (!ok) { beep(120, 0.18, 'sawtooth', 0.13, -62); }
  },
  gong: () => { if (!playSample('gong', 0.85, 0) && audioCtx && musicGain) templeBell(220, audioCtx.currentTime, 0.1); },
};

// ---------------- Music (procedural eerie Japanese score) ----------------
let musicGain = null;
function kotoNote(freq, when, vol = 0.05, decay = 1.4) {
  const o = audioCtx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(freq, when);
  o.frequency.exponentialRampToValueAtTime(freq * 0.994, when + decay);
  const flt = audioCtx.createBiquadFilter();
  flt.type = 'lowpass';
  flt.frequency.value = 2400;
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(vol, when);
  g.gain.exponentialRampToValueAtTime(0.0008, when + decay);
  o.connect(flt).connect(g).connect(musicGain);
  o.start(when);
  o.stop(when + decay);
  // pluck transient
  const n = audioCtx.createBufferSource();
  n.buffer = noiseBuf();
  const nf = audioCtx.createBiquadFilter();
  nf.type = 'bandpass';
  nf.frequency.value = Math.min(8000, freq * 2.5);
  nf.Q.value = 2;
  const ng = audioCtx.createGain();
  ng.gain.setValueAtTime(vol * 0.6, when);
  ng.gain.exponentialRampToValueAtTime(0.0008, when + 0.05);
  n.connect(nf).connect(ng).connect(musicGain);
  n.start(when);
  n.stop(when + 0.06);
}
function taiko(when, vol = 0.16) {
  const o = audioCtx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(95, when);
  o.frequency.exponentialRampToValueAtTime(42, when + 0.22);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(vol, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.28);
  o.connect(g).connect(musicGain);
  o.start(when);
  o.stop(when + 0.3);
}
function templeBell(freq, when, vol = 0.03) {
  for (const [m, v] of [[1, vol], [2.76, vol * 0.4], [5.4, vol * 0.14]]) {
    const o = audioCtx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * m;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(v, when);
    g.gain.exponentialRampToValueAtTime(0.0006, when + 2.6);
    o.connect(g).connect(musicGain);
    o.start(when);
    o.stop(when + 2.7);
  }
}
// hirajoshi pentatonic on A — the minor seconds give it the eerie shrine feel
const SCALE_LOW = [110, 116.54, 130.81, 164.81, 174.61];
const SCALE_MID = [220, 233.08, 261.63, 329.63, 349.23, 440, 466.16];
const MUSIC = {
  mode: null, step: 0, nextT: 0, timer: null, muted: false,
  ensure(mode) {
    if (!audioCtx) return;
    if (!musicGain) {
      musicGain = audioCtx.createGain();
      musicGain.gain.value = this.muted ? 0 : 0.9;
      musicGain.connect(audioCtx.destination);
    }
    this.mode = mode;
    if (!this.timer) {
      this.nextT = audioCtx.currentTime + 0.1;
      this.timer = setInterval(() => this.tick(), 90);
    }
  },
  toggleMute() {
    this.muted = !this.muted;
    if (musicGain) musicGain.gain.value = this.muted ? 0 : 0.9;
  },
  tick() {
    const stepDur = this.mode === 'battle' ? 0.165 : 0.24;
    while (this.nextT < audioCtx.currentTime + 0.35) {
      this.schedule(this.nextT);
      this.nextT += stepDur;
      this.step++;
    }
  },
  schedule(t) {
    const s = this.step % 32;
    const rnd = Math.abs(Math.sin(this.step * 12.9898) * 43758.5453) % 1;
    if (this.mode === 'battle') {
      if (s % 8 === 0) taiko(t, 0.17);
      if (s % 8 === 3) taiko(t, 0.07);
      if (s % 16 === 10) taiko(t, 0.12);
      if (rnd < 0.42) kotoNote(SCALE_MID[Math.floor(rnd * 100) % SCALE_MID.length], t, 0.042, 0.9);
      if (s === 24) templeBell(880, t, 0.018);
    } else {
      if (rnd < 0.22) kotoNote(SCALE_LOW[Math.floor(rnd * 100) % SCALE_LOW.length], t, 0.05, 2.2);
      if (rnd > 0.93) kotoNote(SCALE_MID[Math.floor(rnd * 100) % SCALE_MID.length], t + 0.05, 0.028, 1.6);
      if (s === 0 && rnd < 0.5) taiko(t, 0.055);
      if (s === 20 && rnd > 0.4) templeBell(440, t, 0.03);
    }
  },
};

// ---------------- Input ----------------
const keysDown = {};
const keysPressed = new Set();
window.addEventListener('keydown', e => {
  initAudio();
  if (!keysDown[e.code]) keysPressed.add(e.code);
  keysDown[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { keysDown[e.code] = false; });

const P1_KEYS = { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', punch: 'KeyF', kick: 'KeyG' };
const P2_KEYS = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', punch: 'KeyK', kick: 'KeyL' };

function readPad(map) {
  return {
    left: !!keysDown[map.left],
    right: !!keysDown[map.right],
    up: !!keysDown[map.up],
    down: !!keysDown[map.down],
    punch: keysPressed.has(map.punch),
    kick: keysPressed.has(map.kick),
    hadouken: false,
    dashSlash: false,
    rising: false,
  };
}
const EMPTY_PAD = { left: false, right: false, up: false, down: false, punch: false, kick: false, hadouken: false, dashSlash: false, rising: false };

// ---------------- Characters ----------------
// Sprite art: "Martial Hero" 1 & 2 by LuizMelo (https://luizmelo.itch.io) — free for any use.
// Frame sheets are 200px-tall strips; footY/cx locate the character inside a frame.
const CHARACTERS = [
  {
    id: 'kaito', name: 'KAITO', dir: 'assets/p1', baseFacing: 1,
    scale: 3.4, footY: 121, cx: 94,
    frames: { Idle: 8, Run: 8, Jump: 2, Fall: 2, Attack1: 6, Attack2: 6, TakeHit: 4, Death: 6 },
    // fraction of the attack during which the blade is visually extended
    swing: { Attack1: [0.62, 0.88], Attack2: [0.62, 0.88] },
    face: { x: 76, y: 64, s: 36 },
    moves: { hadouken: 'TEMPEST WAVE', dashSlash: 'GALE DASH', risingSlash: 'DRAGON ASCENT' },
    fireball: '#58b4ff',
    taunt: 'MY BLADE NEVER WAVERS!',
  },
  {
    id: 'kenji', name: 'KENJI', dir: 'assets/p2', baseFacing: -1,
    scale: 3.3, footY: 127, cx: 102,
    frames: { Idle: 4, Run: 8, Jump: 2, Fall: 2, Attack1: 4, Attack2: 4, TakeHit: 3, Death: 7 },
    swing: { Attack1: [0.26, 0.55], Attack2: [0.26, 0.55] },
    face: { x: 84, y: 68, s: 36 },
    moves: { hadouken: 'PHANTOM WAVE', dashSlash: 'SHADOW DASH', risingSlash: 'DEMON RISE' },
    fireball: '#c44dff',
    taunt: 'YOU WERE NEVER A MATCH!',
  },
];

// ---------------- Asset loading ----------------
const SHEETS = {};
let assetsTotal = 0, assetsLoaded = 0;
function loadImage(src) {
  const img = new Image();
  assetsTotal++;
  img.onload = () => assetsLoaded++;
  img.onerror = () => assetsLoaded++;
  img.src = src;
  return img;
}
for (const ch of CHARACTERS) {
  SHEETS[ch.id] = {};
  for (const k of Object.keys(ch.frames)) SHEETS[ch.id][k] = loadImage(ch.dir + '/' + k + '.png');
}
const BG_IMG = loadImage('assets/background.png');
const SHOP_IMG = loadImage('assets/shop.png');
const assetsReady = () => assetsLoaded >= assetsTotal;

// ---------------- Attack definitions ----------------
// Frame data: startup, active, recovery (in 60fps frames).
// Hitboxes are in screen pixels relative to fighter origin (feet center), facing +x.
// Ranges account for the sprite characters' sword reach.
// Boxes match the measured pixel extents of the sword swings.
// startup/active/recovery are re-windowed per character so the hit
// lands exactly when that fighter's blade is visually extended.
const ATTACKS = {
  punch:       { startup: 9,  active: 7,  recovery: 14, damage: 7,  kb: 5,   box: { x: 25, y: -215, w: 275, h: 190 }, anim: 'Attack1' },
  kick:        { startup: 11, active: 7,  recovery: 16, damage: 9,  kb: 6.5, box: { x: 25, y: -195, w: 285, h: 175 }, anim: 'Attack2' },
  crouchPunch: { startup: 7,  active: 6,  recovery: 11, damage: 5,  kb: 4,   box: { x: 20, y: -170, w: 250, h: 150 }, anim: 'Attack1', crouch: true },
  sweep:       { startup: 9,  active: 7,  recovery: 16, damage: 7,  kb: 4,   box: { x: 15, y: -65,  w: 235, h: 65 },  anim: 'Attack2', crouch: true, knockdown: true },
  jumpKick:    { startup: 6,  active: 12, recovery: 8,  damage: 9,  kb: 6,   box: { x: 0,  y: -150, w: 230, h: 130 }, anim: 'Attack2', air: true },
  hadouken:    { startup: 16, active: 1,  recovery: 22, damage: 0,  kb: 0,   box: null, anim: 'Attack1', projectile: true, special: true },
  dashSlash:   { startup: 10, active: 12, recovery: 14, damage: 10, kb: 7,   box: { x: 10, y: -195, w: 290, h: 175 }, anim: 'Attack2', knockdown: true, dash: 8, chip: 2, special: true },
  risingSlash: { startup: 8,  active: 14, recovery: 18, damage: 11, kb: 6,   box: { x: -25, y: -290, w: 230, h: 270 }, anim: 'Attack1', knockdown: true, rising: true, chip: 2, special: true },
};
const HITSTUN = 20;
const BLOCKSTUN = 14;

// ---------------- Helpers ----------------
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

function dot(c, x, y, r, color) {
  c.fillStyle = color;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
}

// ---------------- Projectile (Hadouken) ----------------
class Projectile {
  constructor(owner) {
    this.owner = owner;
    this.facing = owner.facing;
    this.x = owner.x + this.facing * 50 * FSCALE;
    this.y = owner.y - 70 * FSCALE;
    this.vx = this.facing * 8.5;
    this.alive = true;
    this.t = 0;
  }
  update() {
    this.x += this.vx;
    this.t++;
    if (this.x < -60 || this.x > W + 60) this.alive = false;
  }
  get box() { return { x: this.x - 22, y: this.y - 18, w: 44, h: 36 }; }
  draw(c) {
    const col = this.owner.char.fireball;
    c.save();
    // trail
    for (let i = 1; i <= 3; i++) {
      c.globalAlpha = 0.18 / i + 0.05;
      c.fillStyle = col;
      c.beginPath();
      c.arc(this.x - this.vx * i * 1.6, this.y, 20 - i * 3, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    const pulse = 3 * Math.sin(this.t * 0.5);
    c.fillStyle = col;
    c.beginPath();
    c.arc(this.x, this.y, 20 + pulse, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(this.x, this.y, 10 + pulse * 0.5, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
}

// ---------------- Fighter ----------------
class Fighter {
  constructor(char, x, facing, isP1) {
    this.char = char;
    this.isP1 = isP1;
    this.startX = x;
    this.startFacing = facing;
    this.ai = { timer: 0, move: 0, wantBlock: false, wantCrouch: false };
    this.resetRound();
  }

  resetRound() {
    this.x = this.startX;
    this.y = GROUND;
    this.vx = 0;
    this.vy = 0;
    this.facing = this.startFacing;
    this.hp = MAX_HP;
    this.state = 'idle';   // idle, walk, crouch, jump, attack, hit, block, down, ko, win
    this.stateT = 0;
    this.attack = null;    // { name, def, t, hasHit }
    this.walkPhase = 0;
    this.qcfStage = 0;     // quarter-circle-forward detector
    this.qcfTimer = 0;
    this.ddStage = 0;      // double-tap-down detector
    this.ddTimer = 0;
    this.prevDown = false;
    this.ghosts = [];      // afterimages for special moves
    this.callout = null;   // floating special-move name
    this.proj = null;
    this.downTimer = 0;
    this.controllable = false;
  }

  get grounded() { return this.y >= GROUND - 0.01; }
  get crouching() { return this.state === 'crouch' || (this.attack && this.attack.def.crouch); }

  get body() {
    const h = (this.grounded ? (this.crouching ? 72 : 110) : 96) * FSCALE;
    if (this.state === 'down' || this.state === 'ko') {
      return { x: this.x - 40 * FSCALE, y: this.y - 26 * FSCALE, w: 80 * FSCALE, h: 26 * FSCALE };
    }
    return { x: this.x - 19 * FSCALE, y: this.y - h, w: 38 * FSCALE, h: h };
  }

  attackBox() {
    if (!this.attack || this.attack.def.projectile) return null;
    const a = this.attack;
    if (a.t < a.st || a.t >= a.st + a.act) return null;
    const b = a.def.box;
    const bx = this.facing === 1 ? this.x + b.x : this.x - b.x - b.w;
    return { x: bx, y: this.y + b.y, w: b.w, h: b.h };
  }

  startAttack(name) {
    const def = ATTACKS[name];
    let st = def.startup, act = def.active, rec = def.recovery;
    // Re-window the active frames to when this character's blade is
    // visually extended in the mapped animation strip.
    const win = !def.projectile && !def.dash && !def.rising &&
      this.char.swing && this.char.swing[def.anim];
    if (win) {
      const T = st + act + rec;
      st = Math.round(T * win[0]);
      act = Math.max(2, Math.round(T * (win[1] - win[0])));
      rec = Math.max(0, T - st - act);
    }
    this.attack = { name, def, t: 0, hasHit: false, st, act, total: st + act + rec };
    this.state = 'attack';
    this.stateT = 0;
    if (def.special && this.char.moves) {
      this.callout = { text: this.char.moves[name] || name.toUpperCase(), t: 0 };
    }
    if (def.projectile) SFX.fireball();
    else SFX.whoosh();
  }

  update(pad, opp, game) {
    this.stateT++;
    const fwd = this.facing === 1 ? pad.right : pad.left;
    const back = this.facing === 1 ? pad.left : pad.right;

    // --- quarter-circle-forward detection (energy wave / dash slash) ---
    if (this.qcfTimer > 0) this.qcfTimer--; else this.qcfStage = 0;
    if (pad.down && !fwd) { this.qcfStage = 1; this.qcfTimer = 26; }
    else if (this.qcfStage >= 1 && fwd) { this.qcfStage = 2; this.qcfTimer = 14; }

    // --- double-tap-down detection (rising slash) ---
    const downEdge = pad.down && !this.prevDown;
    this.prevDown = pad.down;
    if (this.ddTimer > 0) this.ddTimer--; else this.ddStage = 0;
    if (downEdge) {
      if (this.ddStage === 1) { this.ddStage = 2; this.ddTimer = 14; }
      else { this.ddStage = 1; this.ddTimer = 20; }
    }

    // --- afterimage / callout housekeeping ---
    this.ghosts = this.ghosts.filter(g => ++g.t < 14);
    if (this.callout && ++this.callout.t > 55) this.callout = null;

    // --- physics ---
    if (!this.grounded || this.vy < 0) {
      this.vy += GRAVITY;
      this.y += this.vy;
      this.x += this.vx;
      this.clampX();
      if (this.y >= GROUND) {
        this.y = GROUND;
        this.vy = 0;
        if (this.state === 'jump') { this.state = 'idle'; this.attack = null; SFX.land(); }
        if (this.state === 'attack') SFX.land();
        if (this.state === 'hit') { this.state = 'down'; this.downTimer = 36; this.stateT = 0; SFX.fall(); }
        if (this.state === 'ko' && this.stateT > 2) SFX.fall();
        this.vx = 0;
      }
    }

    // --- knocked down / KO ---
    if (this.state === 'down') {
      if (this.grounded && --this.downTimer <= 0) { this.state = 'idle'; }
      return;
    }
    if (this.state === 'ko' || this.state === 'win') return;

    // --- hit / block stun ---
    if (this.state === 'hit') {
      if (this.grounded) {
        this.x += this.vx;
        this.vx *= 0.82;
        if (this.stateT > HITSTUN) { this.state = 'idle'; this.vx = 0; }
      }
      this.clampX();
      return;
    }
    if (this.state === 'block') {
      this.x += this.vx;
      this.vx *= 0.8;
      if (this.stateT > BLOCKSTUN) { this.state = 'idle'; this.vx = 0; }
      this.clampX();
      return;
    }

    // --- attacking ---
    if (this.attack) {
      const a = this.attack;
      a.t++;
      if (a.def.projectile && a.t === a.st && !this.projAlive(game)) {
        game.projectiles.push(new Projectile(this));
      }
      if (a.def.dash && a.t >= a.st - 4 && a.t < a.st + a.act) {
        this.x += this.facing * a.def.dash;
        this.clampX();
      }
      if (a.def.rising && a.t === Math.max(1, a.st - 2)) {
        this.vy = -15;
        this.vx = this.facing * 3;
        this.y -= 2;
      }
      if ((a.def.dash || a.def.rising) && a.t % 3 === 0) {
        const spr = this.currentSprite();
        this.ghosts.push({
          img: spr.img, frame: spr.frame, x: this.x, y: this.y,
          flip: this.facing * this.char.baseFacing, t: 0,
        });
      }
      if (a.def.air) {
        if (this.grounded) { this.attack = null; this.state = 'idle'; }
      } else if (a.t >= a.total) {
        this.attack = null;
        this.state = this.grounded ? 'idle' : 'jump';
      }
      if (!a || !this.attack || !a.def.air) return;
      // air attack falls through to keep aerial physics handled above
    }

    if (!this.controllable) { this.state = this.grounded ? 'idle' : 'jump'; return; }

    // --- face the opponent when grounded & free ---
    if (this.grounded && !this.attack) {
      this.facing = opp.x >= this.x ? 1 : -1;
    }

    // --- airborne: allow jump kick ---
    if (!this.grounded) {
      if (!this.attack && (pad.kick || pad.punch)) {
        this.startAttack('jumpKick');
      }
      return;
    }

    // --- grounded actions ---
    if (this.attack) return;

    // special moves (checked before normals)
    if ((pad.hadouken || (pad.punch && this.qcfStage === 2)) && !this.projAlive(game)) {
      this.startAttack('hadouken');
      this.qcfStage = 0;
      return;
    }
    if (pad.rising || (pad.punch && this.ddStage === 2)) {
      this.startAttack('risingSlash');
      this.ddStage = 0;
      return;
    }
    if (pad.dashSlash || (pad.kick && this.qcfStage === 2)) {
      this.startAttack('dashSlash');
      this.qcfStage = 0;
      return;
    }
    if (pad.punch) { this.startAttack(pad.down ? 'crouchPunch' : 'punch'); return; }
    if (pad.kick)  { this.startAttack(pad.down ? 'sweep' : 'kick'); return; }

    if (pad.up) {
      this.vy = JUMP_VY;
      this.vx = (pad.right ? 1 : 0) * 4.6 - (pad.left ? 1 : 0) * 4.6;
      this.y -= 1;
      this.state = 'jump';
      this.stateT = 0;
      SFX.jump();
      return;
    }
    if (pad.down) {
      this.state = 'crouch';
      return;
    }
    if (pad.left || pad.right) {
      this.state = 'walk';
      const dir = pad.right ? 1 : -1;
      const speed = dir === this.facing ? WALK_SPEED : WALK_SPEED * 0.78;
      this.x += dir * speed;
      this.walkPhase += 0.18 * dir * this.facing;
      this.clampX();
      return;
    }
    this.state = 'idle';
  }

  projAlive(game) {
    return game.projectiles.some(p => p.owner === this && p.alive);
  }

  clampX() { this.x = clamp(this.x, STAGE_MARGIN, W - STAGE_MARGIN); }

  isHoldingBack(pad) {
    return this.facing === 1 ? pad.left : pad.right;
  }

  canBlock(pad) {
    return this.grounded && !this.attack &&
      (this.state === 'idle' || this.state === 'walk' || this.state === 'crouch' || this.state === 'block') &&
      this.isHoldingBack(pad);
  }

  receiveHit(dmg, kb, knockdown, fromX, blocked) {
    const dir = this.x >= fromX ? 1 : -1;
    if (blocked) {
      this.state = 'block';
      this.stateT = 0;
      this.vx = dir * kb;
      SFX.block();
      return;
    }
    this.hp = Math.max(0, this.hp - dmg);
    this.attack = null;
    if (this.hp <= 0) {
      this.state = 'ko';
      this.stateT = 0;
      this.vy = -8;
      this.vx = dir * 5;
      this.y -= 1;
      SFX.ko();
      return;
    }
    if (knockdown || !this.grounded) {
      this.state = 'hit';
      this.stateT = 0;
      this.vy = -7;
      this.vx = dir * 4.5;
      this.y -= 1;
      SFX.sweep();
    } else {
      this.state = 'hit';
      this.stateT = 0;
      this.vx = dir * kb * 1.4;
      SFX.hit();
    }
  }

  // ---------------- Rendering ----------------
  currentSprite() {
    const ch = this.char;
    const n = k => ch.frames[k];
    let key = 'Idle', frame = 0;
    if (this.state === 'ko' || this.state === 'down') {
      key = 'Death';
      frame = Math.min(n(key) - 1, Math.floor(this.stateT / 6));
    } else if (this.state === 'hit') {
      key = 'TakeHit';
      frame = Math.min(n(key) - 1, Math.floor(this.stateT / 5));
    } else if (this.state === 'block') {
      key = 'TakeHit';
      frame = 0;
    } else if (this.attack) {
      key = this.attack.def.anim || 'Attack1';
      frame = Math.min(n(key) - 1, Math.floor(this.attack.t / this.attack.total * n(key)));
    } else if (!this.grounded) {
      key = this.vy < 0 ? 'Jump' : 'Fall';
      frame = Math.min(n(key) - 1, Math.floor(this.stateT / 9));
    } else if (this.state === 'walk') {
      key = 'Run';
      frame = Math.floor(Math.abs(this.walkPhase) * 1.1) % n(key);
    } else {
      key = 'Idle';
      frame = Math.floor(this.stateT / 8) % n(key);
    }
    return { img: SHEETS[ch.id][key], frame };
  }

  draw(c) {
    const ch = this.char;
    c.save();
    // shadow
    c.globalAlpha = 0.3;
    c.fillStyle = '#000';
    c.beginPath();
    c.ellipse(this.x, GROUND + 8, 44, 9, 0, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;

    const spr = this.currentSprite();
    if (spr.img && spr.img.complete) {
      const s = ch.scale;
      const squash = (this.state === 'crouch' || (this.attack && this.attack.def.crouch)) ? 0.8 : 1;
      const flip = this.facing * ch.baseFacing;
      c.translate(this.x, this.y);
      c.scale(flip, 1);
      c.drawImage(
        spr.img, spr.frame * 200, 0, 200, 200,
        -ch.cx * s, -ch.footY * s * squash, 200 * s, 200 * s * squash
      );
    }
    c.restore();
  }
}

// ---------------- CPU AI ----------------
function cpuThink(f, opp, game) {
  const ai = f.ai;
  const pad = { left: false, right: false, up: false, down: false, punch: false, kick: false, hadouken: false, dashSlash: false, rising: false };
  if (!f.controllable || f.state === 'down' || f.state === 'ko') return pad;

  const dist = Math.abs(opp.x - f.x);
  const fwdKey = opp.x > f.x ? 'right' : 'left';
  const backKey = opp.x > f.x ? 'left' : 'right';

  // react to incoming fireball
  const incoming = game.projectiles.find(p => p.alive && p.owner !== f &&
    Math.sign(p.vx) === Math.sign(f.x - p.x) && Math.abs(p.x - f.x) < 160);
  if (incoming && f.grounded) {
    if (Math.random() < 0.5) { pad.up = true; pad[fwdKey] = true; }
    else pad[backKey] = true;
    return pad;
  }

  // block reaction when opponent attacks at close range
  if (opp.attack && !opp.attack.def.projectile && dist < 200 && f.grounded && Math.random() < 0.45) {
    ai.wantBlock = true; ai.timer = 14;
  }
  if (ai.wantBlock) {
    pad[backKey] = true;
    if (--ai.timer <= 0) ai.wantBlock = false;
    return pad;
  }

  // anti-air: rising slash under a jump-in
  if (!opp.grounded && dist < 230 && f.grounded && !f.attack && Math.random() < 0.06) {
    pad.rising = true;
    return pad;
  }

  if (ai.timer > 0) {
    ai.timer--;
  } else {
    // pick a new plan
    const r = Math.random();
    if (dist > 320) {
      if (r < 0.35 && !f.projAlive(game)) { ai.move = 'fireball'; ai.timer = 8; }
      else if (r < 0.55) { ai.move = 'jumpin'; ai.timer = 30; }
      else { ai.move = 'approach'; ai.timer = 24; }
    } else if (dist > 210) {
      if (r < 0.4) { ai.move = 'approach'; ai.timer = 18; }
      else if (r < 0.55) { ai.move = 'dash'; ai.timer = 10; }
      else if (r < 0.7) { ai.move = 'jumpin'; ai.timer = 30; }
      else if (r < 0.85 && !f.projAlive(game)) { ai.move = 'fireball'; ai.timer = 8; }
      else { ai.move = 'wait'; ai.timer = 14; }
    } else {
      if (r < 0.3) { ai.move = 'punch'; ai.timer = 10; }
      else if (r < 0.55) { ai.move = 'kick'; ai.timer = 12; }
      else if (r < 0.7) { ai.move = 'sweep'; ai.timer = 12; }
      else if (r < 0.85) { ai.move = 'retreat'; ai.timer = 16; }
      else { ai.move = 'wait'; ai.timer = 8; }
    }
    ai.fresh = true;
  }

  switch (ai.move) {
    case 'approach': pad[fwdKey] = true; break;
    case 'retreat': pad[backKey] = true; break;
    case 'jumpin':
      if (ai.fresh && f.grounded) { pad.up = true; pad[fwdKey] = true; }
      else if (!f.grounded && dist < 200 && !f.attack) pad.kick = true;
      else pad[fwdKey] = true;
      break;
    case 'fireball': if (ai.fresh) pad.hadouken = true; break;
    case 'dash': if (ai.fresh) pad.dashSlash = true; break;
    case 'punch': if (ai.fresh) pad.punch = true; break;
    case 'kick': if (ai.fresh) pad.kick = true; break;
    case 'sweep': if (ai.fresh) { pad.down = true; pad.kick = true; } break;
  }
  ai.fresh = false;
  return pad;
}

// ---------------- Effects ----------------
class HitSpark {
  constructor(x, y, blocked) {
    this.x = x; this.y = y; this.t = 0; this.blocked = blocked;
  }
  get alive() { return this.t < 12; }
  draw(c) {
    const r = (6 + this.t * 2.2) * 1.5;
    c.save();
    c.translate(this.x, this.y);
    c.strokeStyle = this.blocked ? '#88bbff' : (this.t % 2 ? '#ffdd33' : '#ffffff');
    c.lineWidth = 4;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + this.t * 0.3;
      c.beginPath();
      c.moveTo(Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4);
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      c.stroke();
    }
    c.restore();
    this.t++;
  }
}

// ---------------- Game ----------------
class Game {
  constructor() {
    this.screen = 'title';   // title, mode, select, intro, fight, roundend, matchend
    this.frame = 0;
    this.vsCpu = true;
    this.modeIdx = 0;
    this.sel1 = 0; this.sel2 = 1;
    this.done1 = false; this.done2 = false;
    this.demoT = 0;
  }

  startMatch() {
    this.p1 = new Fighter(CHARACTERS[this.sel1], 250, 1, true);
    this.p2 = new Fighter(CHARACTERS[this.sel2], 710, -1, false);
    this.wins1 = 0; this.wins2 = 0;
    this.round = 1;
    this.projectiles = [];
    this.sparks = [];
    this.screen = 'versus';
    this.screenT = 0;
    SFX.gong();
  }

  startRound() {
    this.p1.resetRound();
    this.p2.resetRound();
    this.projectiles = [];
    this.sparks = [];
    this.hitstop = 0;
    this.shake = 0;
    this.timeLeft = ROUND_TIME;
    this.timerAcc = 0;
    this.screen = 'intro';
    this.screenT = 0;
    this.announce = null;
  }

  setAnnounce(text, dur, sub) {
    this.announce = { text, t: 0, dur, sub };
  }

  update() {
    if (!assetsReady()) { keysPressed.clear(); return; }
    this.frame++;
    if (keysPressed.has('KeyM')) MUSIC.toggleMute();
    if (audioCtx) {
      const battle = this.screen === 'fight' || this.screen === 'intro' || this.screen === 'roundend';
      MUSIC.ensure(battle ? 'battle' : 'calm');
    }
    this.screenT = (this.screenT || 0) + 1;

    switch (this.screen) {
      case 'title':
        this.demoT++;
        if (keysPressed.has('Enter')) { this.screen = 'mode'; this.screenT = 0; SFX.confirm(); }
        break;

      case 'mode':
        if (keysPressed.has('ArrowUp') || keysPressed.has('KeyW') ||
            keysPressed.has('ArrowDown') || keysPressed.has('KeyS')) {
          this.modeIdx = 1 - this.modeIdx; SFX.select();
        }
        if (keysPressed.has('Enter')) {
          this.vsCpu = this.modeIdx === 0;
          this.screen = 'select'; this.screenT = 0;
          this.done1 = false; this.done2 = false;
          SFX.confirm();
        }
        if (keysPressed.has('Escape')) { this.screen = 'title'; this.screenT = 0; }
        break;

      case 'select': {
        const n = CHARACTERS.length;
        if (!this.done1) {
          if (keysPressed.has('KeyA')) { this.sel1 = (this.sel1 + n - 1) % n; SFX.select(); }
          if (keysPressed.has('KeyD')) { this.sel1 = (this.sel1 + 1) % n; SFX.select(); }
          if (keysPressed.has('KeyF') || keysPressed.has('Enter')) { this.done1 = true; SFX.confirm(); }
        }
        if (this.vsCpu) {
          if (this.done1 && !this.done2) {
            do { this.sel2 = Math.floor(Math.random() * n); } while (this.sel2 === this.sel1);
            this.done2 = true;
          }
        } else if (!this.done2) {
          if (keysPressed.has('ArrowLeft')) { this.sel2 = (this.sel2 + n - 1) % n; SFX.select(); }
          if (keysPressed.has('ArrowRight')) { this.sel2 = (this.sel2 + 1) % n; SFX.select(); }
          if (keysPressed.has('KeyK')) { this.done2 = true; SFX.confirm(); }
        }
        if (this.done1 && this.done2 && this.screenT > 30) this.startMatch();
        if (keysPressed.has('Escape')) { this.screen = 'mode'; this.screenT = 0; }
        break;
      }

      case 'versus':
        if (this.screenT >= 175 || keysPressed.has('Enter') || keysPressed.has('KeyF')) {
          this.startRound();
        }
        break;

      case 'intro': {
        const k = this.screenT;
        const r1 = this.round === 1;
        const finalRound = this.wins1 === 1 && this.wins2 === 1;
        if (k === 1) {
          this.setAnnounce(finalRound ? 'FINAL ROUND' : 'ROUND ' + this.round, 70);
          SFX.gong();
          VOICE.say(finalRound ? 'vo_final_round' : 'vo_round');
        }
        if (r1) {
          // kata demonstration: each fighter shows their blade work
          if (k === 55) this.p1.startAttack('punch');
          if (k === 90) this.p2.startAttack('kick');
          if (k === 125) this.p1.startAttack('sweep');
          if (k === 160) this.p2.startAttack('punch');
          // countdown
          if (k === 200) { this.setAnnounce('READY?', 40); VOICE.say('vo_ready'); }
          if (k === 245) { this.setAnnounce('3', 26); SFX.select(); }
          if (k === 275) { this.setAnnounce('2', 26); SFX.select(); }
          if (k === 305) { this.setAnnounce('1', 26); SFX.select(); }
        } else {
          if (k === 60) { this.setAnnounce('READY?', 32); VOICE.say('vo_ready'); }
        }
        const startAt = r1 ? 335 : 100;
        if (k >= startAt) {
          this.screen = 'fight';
          this.screenT = 0;
          this.setAnnounce('FIGHT!', 45);
          VOICE.say('vo_go');
          this.p1.controllable = true;
          this.p2.controllable = true;
        }
        this.updateFight(true);
        break;
      }

      case 'fight':
        this.updateFight(false);
        // round timer
        if (++this.timerAcc >= 60) {
          this.timerAcc = 0;
          if (--this.timeLeft <= 0) this.endRound(true);
          else if (this.timeLeft === 10) VOICE.say('vo_hurry');
        }
        break;

      case 'roundend':
        this.updateFight(true);
        if (this.screenT > 170) {
          if (this.wins1 >= ROUNDS_TO_WIN || this.wins2 >= ROUNDS_TO_WIN) {
            this.screen = 'matchend';
            this.screenT = 0;
            const winner = this.wins1 >= ROUNDS_TO_WIN ? this.p1 : this.p2;
            this.setAnnounce(winner.char.name + ' WINS!', 9999, winner.char.taunt);
            if (this.vsCpu) VOICE.say(winner === this.p1 ? 'vo_you_win' : 'vo_you_lose');
            else VOICE.say('vo_congrats');
          } else {
            this.round++;
            this.startRound();
          }
        }
        break;

      case 'matchend':
        this.updateFight(true);
        if (keysPressed.has('Enter')) { this.screen = 'title'; this.screenT = 0; SFX.confirm(); }
        break;
    }

    if (this.announce) {
      this.announce.t++;
      if (this.announce.t > this.announce.dur) this.announce = null;
    }

    keysPressed.clear();
  }

  updateFight(frozen) {
    if (!this.p1) return;
    if (this.hitstop > 0) { this.hitstop--; return; }   // impact freeze
    const pad1 = frozen ? { ...EMPTY_PAD } : readPad(P1_KEYS);
    const pad2 = frozen ? { ...EMPTY_PAD }
      : this.vsCpu ? cpuThink(this.p2, this.p1, this) : readPad(P2_KEYS);

    this.p1.update(pad1, this.p2, this);
    this.p2.update(pad2, this.p1, this);

    // body push (keep fighters from overlapping)
    if (this.p1.grounded && this.p2.grounded &&
        this.p1.state !== 'down' && this.p2.state !== 'down' &&
        this.p1.state !== 'ko' && this.p2.state !== 'ko') {
      const overlap = 38 * FSCALE - Math.abs(this.p1.x - this.p2.x);
      if (overlap > 0) {
        const dir = this.p1.x <= this.p2.x ? 1 : -1;
        this.p1.x -= dir * overlap / 2;
        this.p2.x += dir * overlap / 2;
        this.p1.clampX();
        this.p2.clampX();
      }
    }

    // melee hit resolution
    if (!frozen || this.screen === 'roundend') {
      this.resolveHit(this.p1, this.p2, pad2);
      this.resolveHit(this.p2, this.p1, pad1);
    }

    // projectiles
    for (const pr of this.projectiles) {
      if (!pr.alive) continue;
      pr.update();
      const target = pr.owner === this.p1 ? this.p2 : this.p1;
      if (target.state !== 'down' && target.state !== 'ko' && rectsOverlap(pr.box, target.body)) {
        pr.alive = false;
        const pad = target === this.p1 ? readPad(P1_KEYS)
          : this.vsCpu ? { ...EMPTY_PAD, [target.facing === 1 ? 'left' : 'right']: true }
          : readPad(P2_KEYS);
        const blocked = target.canBlock(pad);
        this.sparks.push(new HitSpark(pr.x, pr.y, blocked));
        target.receiveHit(10, 7, false, pr.owner.x, blocked);
        if (blocked) target.hp = Math.max(1, target.hp - 2); // chip damage
        else { this.hitstop = 4; this.shake = target.hp <= 0 ? 14 : 7; }
        this.checkKO();
      }
      // projectiles cancel each other
      for (const other of this.projectiles) {
        if (other !== pr && other.alive && pr.alive && rectsOverlap(pr.box, other.box)) {
          pr.alive = false; other.alive = false;
          this.sparks.push(new HitSpark((pr.x + other.x) / 2, pr.y, false));
        }
      }
    }
    this.projectiles = this.projectiles.filter(p => p.alive);
    this.sparks = this.sparks.filter(s => s.alive);
  }

  resolveHit(attacker, defender, defenderPad) {
    if (!attacker.attack || attacker.attack.hasHit) return;
    const hb = attacker.attackBox();
    if (!hb) return;
    if (defender.state === 'down' || defender.state === 'ko') return;
    if (!rectsOverlap(hb, defender.body)) return;

    attacker.attack.hasHit = true;
    const def = attacker.attack.def;
    const blocked = defender.canBlock(defenderPad);
    const sparkX = (Math.max(hb.x, defender.body.x) + Math.min(hb.x + hb.w, defender.body.x + defender.body.w)) / 2;
    const sparkY = hb.y + hb.h / 2;
    this.sparks.push(new HitSpark(sparkX, sparkY, blocked));
    defender.receiveHit(def.damage, def.kb, !!def.knockdown, attacker.x, blocked);
    if (blocked && def.chip) defender.hp = Math.max(1, defender.hp - def.chip);
    if (!blocked) {
      this.hitstop = 6;
      this.shake = defender.hp <= 0 ? 14 : 8;
    }
    // attacker pushback on connect
    attacker.vx = 0;
    attacker.x -= attacker.facing * 5;
    attacker.clampX();
    this.checkKO();
  }

  checkKO() {
    if (this.screen !== 'fight' && this.screen !== 'intro') return;
    if (this.p1.hp <= 0 || this.p2.hp <= 0) this.endRound(false);
  }

  endRound(timeUp) {
    this.p1.controllable = false;
    this.p2.controllable = false;
    let winner = null;
    if (timeUp) {
      if (this.p1.hp > this.p2.hp) winner = this.p1;
      else if (this.p2.hp > this.p1.hp) winner = this.p2;
      this.setAnnounce('TIME UP!', 90);
      VOICE.say(winner ? 'vo_time_over' : 'vo_tie');
    } else {
      winner = this.p1.hp > 0 ? this.p1 : this.p2;
      this.setAnnounce('K.O.!', 90);
    }
    if (winner === this.p1) this.wins1++;
    else if (winner === this.p2) this.wins2++;
    if (winner && winner.state !== 'ko' && winner.state !== 'down') {
      winner.state = 'win';
      winner.stateT = 0;
      winner.attack = null;
    }
    this.screen = 'roundend';
    this.screenT = 0;
  }

  // ---------------- Drawing ----------------
  drawStage(c) {
    if (BG_IMG.complete && BG_IMG.naturalWidth) {
      c.imageSmoothingEnabled = false;
      c.drawImage(BG_IMG, 0, 0, W, H);
      if (SHOP_IMG.complete && SHOP_IMG.naturalWidth) {
        const sf = Math.floor(this.frame / 9) % 6;
        c.drawImage(SHOP_IMG, sf * 118, 0, 118, 128, 562, 118, 118 * 2.6, 128 * 2.6);
      }
      // gentle vignette for fighter contrast
      c.fillStyle = 'rgba(0,0,10,0.12)';
      c.fillRect(0, 0, W, H);
    } else {
      c.fillStyle = '#101018';
      c.fillRect(0, 0, W, H);
    }
  }

  drawHud(c) {
    const barW = 330, barH = 20, y = 30;
    const cx = W / 2;
    const x1 = cx - 64 - barW, x2 = cx + 64;
    const drawBar = (x, hp, anchorRight) => {
      c.fillStyle = '#101010';
      c.fillRect(x - 3, y - 3, barW + 6, barH + 6);
      c.fillStyle = '#b81616';
      c.fillRect(x, y, barW, barH);
      const w = barW * (hp / MAX_HP);
      c.fillStyle = '#ffd820';
      c.fillRect(anchorRight ? x + barW - w : x, y, w, barH);
      c.fillStyle = 'rgba(255,255,255,0.3)';
      c.fillRect(x, y + 2, barW, 3);
      c.strokeStyle = '#f8f8f8';
      c.lineWidth = 2;
      c.strokeRect(x - 2, y - 2, barW + 4, barH + 4);
    };
    drawBar(x1, this.p1.hp, true);
    drawBar(x2, this.p2.hp, false);

    // central KO badge
    dot(c, cx, y + barH / 2, 24, '#6e0a0a');
    dot(c, cx, y + barH / 2, 20, '#c81414');
    c.font = 'bold 20px Impact, "Arial Black", sans-serif';
    c.textAlign = 'center';
    c.fillStyle = '#ffd820';
    c.fillText('KO', cx, y + barH / 2 + 7);

    // timer below the badge
    const tstr = String(this.timeLeft).padStart(2, '0');
    c.font = 'bold 38px Impact, "Arial Black", sans-serif';
    c.lineWidth = 5;
    c.strokeStyle = '#201000';
    c.strokeText(tstr, cx, y + 76);
    c.fillStyle = this.timeLeft <= 10 ? '#ff5040' : '#ffd820';
    c.fillText(tstr, cx, y + 76);

    // 1P / 2P labels above bars
    c.font = 'bold 15px "Courier New", monospace';
    c.fillStyle = '#fff';
    c.textAlign = 'left';
    c.fillText('1P', x1, y - 9);
    c.textAlign = 'right';
    c.fillText('2P', x2 + barW, y - 9);

    // names under bars
    const nameY = y + barH + 23;
    c.font = 'bold 18px "Courier New", monospace';
    c.lineWidth = 3;
    c.strokeStyle = '#301800';
    c.fillStyle = '#ffd820';
    c.textAlign = 'left';
    const n1 = this.p1.char.name + (this.vsCpu ? '' : ' 1P');
    c.strokeText(n1, x1 + 2, nameY);
    c.fillText(n1, x1 + 2, nameY);
    c.textAlign = 'right';
    const n2 = this.p2.char.name + (this.vsCpu ? ' CPU' : ' 2P');
    c.strokeText(n2, x2 + barW - 2, nameY);
    c.fillText(n2, x2 + barW - 2, nameY);

    // round win pips
    const pip = (px, won) => {
      c.fillStyle = won ? '#ffd820' : 'rgba(0,0,0,0.45)';
      c.fillRect(px - 5, nameY - 10, 10, 10);
      c.strokeStyle = '#fff';
      c.lineWidth = 1.5;
      c.strokeRect(px - 5, nameY - 10, 10, 10);
    };
    pip(cx - 40, this.wins1 >= 1); pip(cx - 60, this.wins1 >= 2);
    pip(cx + 40, this.wins2 >= 1); pip(cx + 60, this.wins2 >= 2);
  }

  drawAnnounce(c) {
    if (!this.announce) return;
    const a = this.announce;
    const grow = Math.min(1, a.t / 8);
    const fade = a.dur - a.t < 10 ? (a.dur - a.t) / 10 : 1;
    c.save();
    c.globalAlpha = fade;
    c.translate(W / 2, H / 2 - 40);
    c.scale(grow, grow);
    c.font = 'bold 64px Impact, "Arial Black", sans-serif';
    c.textAlign = 'center';
    c.lineWidth = 8;
    c.strokeStyle = '#202040';
    c.strokeText(a.text, 0, 0);
    const grad = c.createLinearGradient(0, -50, 0, 10);
    grad.addColorStop(0, '#ffe080');
    grad.addColorStop(1, '#ff8020');
    c.fillStyle = grad;
    c.fillText(a.text, 0, 0);
    if (a.sub) {
      c.font = 'bold 18px "Courier New", monospace';
      c.fillStyle = '#fff';
      c.fillText(a.sub, 0, 44);
      c.fillText('PRESS ENTER', 0, 80);
    }
    c.restore();
  }

  drawTitle(c) {
    this.drawStage(c);
    // demo fighters
    if (!this.demoF) {
      this.demoF = [new Fighter(CHARACTERS[0], 260, 1, true), new Fighter(CHARACTERS[1], 700, -1, false)];
    }
    for (const f of this.demoF) { f.stateT++; f.draw(c); }

    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(0, 0, W, H);

    c.textAlign = 'center';
    c.font = 'bold 92px Impact, "Arial Black", sans-serif';
    c.lineWidth = 10;
    c.strokeStyle = '#3a1500';
    c.strokeText('STREET FIGHTER', W / 2, 190);
    const grad = c.createLinearGradient(0, 110, 0, 200);
    grad.addColorStop(0, '#fff0a0');
    grad.addColorStop(0.55, '#ffb020');
    grad.addColorStop(1, '#d03010');
    c.fillStyle = grad;
    c.fillText('STREET FIGHTER', W / 2, 190);

    c.font = 'bold 120px Impact, "Arial Black", sans-serif';
    c.strokeStyle = '#001a3a';
    c.strokeText('II', W / 2, 305);
    c.fillStyle = '#60c0ff';
    c.fillText('II', W / 2, 305);

    c.font = 'bold 20px "Courier New", monospace';
    c.fillStyle = '#ffd060';
    c.fillText('— JS FAN EDITION —', W / 2, 345);

    if (Math.floor(this.demoT / 30) % 2 === 0) {
      c.font = 'bold 26px "Courier New", monospace';
      c.fillStyle = '#fff';
      c.fillText('PRESS ENTER', W / 2, 430);
    }
    c.font = 'bold 17px "Courier New", monospace';
    c.fillStyle = 'rgba(255,255,255,0.65)';
    c.fillText('A fan-made homage. Not affiliated with Capcom.', W / 2, 500);
  }

  drawMode(c) {
    this.drawStage(c);
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.fillRect(0, 0, W, H);
    c.textAlign = 'center';
    c.font = 'bold 48px Impact, "Arial Black", sans-serif';
    c.fillStyle = '#ffd060';
    c.fillText('SELECT MODE', W / 2, 160);

    const opts = ['1 PLAYER  VS  CPU', '2 PLAYERS'];
    c.font = 'bold 30px "Courier New", monospace';
    opts.forEach((o, i) => {
      const sel = this.modeIdx === i;
      c.fillStyle = sel ? '#fff' : 'rgba(255,255,255,0.45)';
      c.fillText((sel ? '▶ ' : '  ') + o + (sel ? ' ◀' : '  '), W / 2, 260 + i * 60);
    });
    c.font = 'bold 18px "Courier New", monospace';
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.fillText('W/S or ↑/↓ to choose — ENTER to confirm', W / 2, 430);
  }

  drawSelect(c) {
    this.drawStage(c);
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.fillRect(0, 0, W, H);
    c.textAlign = 'center';
    c.font = 'bold 44px Impact, "Arial Black", sans-serif';
    c.fillStyle = '#ffd060';
    c.fillText('CHOOSE YOUR FIGHTER', W / 2, 110);

    CHARACTERS.forEach((ch, i) => {
      const cx = W / 2 + (i - (CHARACTERS.length - 1) / 2) * 230;
      const cy = 270;
      c.fillStyle = '#16213a';
      c.fillRect(cx - 90, cy - 110, 180, 230);
      const img = SHEETS[ch.id].Idle;
      if (img && img.complete) {
        c.save();
        c.beginPath();
        c.rect(cx - 90, cy - 110, 180, 196);
        c.clip();
        c.imageSmoothingEnabled = false;
        c.translate(cx, cy + 86);
        c.scale(ch.baseFacing * 2.4, 2.4);
        c.drawImage(img, 0, 0, 200, 200, -ch.cx, -ch.footY, 200, 200);
        c.restore();
      }
      // name strip
      c.fillStyle = 'rgba(8,12,26,0.85)';
      c.fillRect(cx - 90, cy + 86, 180, 34);
      c.font = 'bold 26px "Courier New", monospace';
      c.fillStyle = '#fff';
      c.fillText(ch.name, cx, cy + 111);

      // selection borders
      const border = (sel, done, col, off) => {
        if (!sel) return;
        c.strokeStyle = col;
        c.lineWidth = done ? 7 : 4;
        if (!done && Math.floor(this.screenT / 8) % 2 === 0) c.lineWidth = 6;
        c.strokeRect(cx - 90 - off, cy - 110 - off, 180 + off * 2, 230 + off * 2);
      };
      border(this.sel1 === i, this.done1, '#4090ff', 0);
      border(this.sel2 === i, this.done2, '#ff5040', 6);
    });

    c.font = 'bold 18px "Courier New", monospace';
    c.fillStyle = '#7ab0ff';
    c.fillText('P1: A/D move — F confirm', W / 2 - 240, 470);
    c.fillStyle = '#ff8a7a';
    c.fillText(this.vsCpu ? 'P2: CPU' : 'P2: ←/→ move — K confirm', W / 2 + 240, 470);
  }

  drawVersus(c) {
    this.drawStage(c);
    c.fillStyle = 'rgba(8,4,18,0.84)';
    c.fillRect(0, 0, W, H);
    const t = this.screenT;
    const slide = Math.min(1, t / 22);
    const ease = 1 - (1 - slide) * (1 - slide);
    const drawFace = (ch, side) => {
      const img = SHEETS[ch.id].Idle;
      const fx = ch.face;
      if (!img || !img.complete || !fx) return;
      const size = fx.s * 7;
      const cx = side === 'left' ? lerp(-220, 200, ease) : lerp(W + 220, W - 200, ease);
      const cy = 225;
      c.fillStyle = side === 'left' ? 'rgba(40,80,200,0.3)' : 'rgba(200,40,40,0.3)';
      c.fillRect(cx - size / 2 - 12, cy - size / 2 - 12, size + 24, size + 24);
      c.strokeStyle = side === 'left' ? '#4090ff' : '#ff5040';
      c.lineWidth = 5;
      c.strokeRect(cx - size / 2 - 12, cy - size / 2 - 12, size + 24, size + 24);
      c.save();
      c.beginPath();
      c.rect(cx - size / 2, cy - size / 2, size, size);
      c.clip();
      c.imageSmoothingEnabled = false;
      c.translate(cx, cy);
      const flip = (side === 'right') === (ch.baseFacing === 1) ? -1 : 1;
      c.scale(7 * flip, 7);
      c.drawImage(img, fx.x, fx.y, fx.s, fx.s, -fx.s / 2, -fx.s / 2, fx.s, fx.s);
      c.restore();
      c.font = 'bold 32px "Courier New", monospace';
      c.textAlign = 'center';
      c.lineWidth = 5;
      c.strokeStyle = '#140826';
      c.strokeText(ch.name, cx, cy + size / 2 + 52);
      c.fillStyle = '#ffd820';
      c.fillText(ch.name, cx, cy + size / 2 + 52);
    };
    drawFace(this.p1.char, 'left');
    drawFace(this.p2.char, 'right');
    if (t > 18) {
      const pulse = 1 + 0.07 * Math.sin(t * 0.16);
      c.save();
      c.translate(W / 2, 215);
      c.scale(pulse, pulse);
      c.font = 'bold 115px Impact, "Arial Black", sans-serif';
      c.textAlign = 'center';
      c.lineWidth = 11;
      c.strokeStyle = '#3a1500';
      c.strokeText('VS', 0, 42);
      const grad = c.createLinearGradient(0, -60, 0, 42);
      grad.addColorStop(0, '#fff0a0');
      grad.addColorStop(1, '#ff8020');
      c.fillStyle = grad;
      c.fillText('VS', 0, 42);
      c.restore();
    }
    if (t > 45) {
      c.font = 'bold 17px "Courier New", monospace';
      c.textAlign = 'center';
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.fillText('"' + this.p1.char.taunt + '"', W / 4 + 14, 490);
      c.fillText('"' + this.p2.char.taunt + '"', (W * 3) / 4 - 14, 490);
    }
  }

  drawGhosts(c, f) {
    const ch = f.char;
    for (const g of f.ghosts) {
      if (!g.img || !g.img.complete) continue;
      c.save();
      c.globalAlpha = 0.3 * (1 - g.t / 14);
      c.translate(g.x, g.y);
      c.scale(g.flip, 1);
      c.drawImage(g.img, g.frame * 200, 0, 200, 200,
        -ch.cx * ch.scale, -ch.footY * ch.scale, 200 * ch.scale, 200 * ch.scale);
      c.restore();
    }
  }

  // white streak sweeping with the blade during active frames
  drawSlashTrail(c, f) {
    const a = f.attack;
    if (!a || !a.def.box || a.def.projectile) return;
    const p = (a.t - a.st) / a.act;
    if (p < 0 || p > 1) return;
    const reach = (a.def.box.x + a.def.box.w) * 0.42;
    c.save();
    c.translate(f.x, f.y - 100);
    c.scale(f.facing, 1);
    c.lineCap = 'round';
    c.strokeStyle = '#ffffff';
    for (let i = 0; i < 2; i++) {
      const pp = Math.max(0, p - i * 0.15);
      if (pp <= 0.05) continue;
      c.globalAlpha = Math.max(0, (0.22 - i * 0.09) * (1 - p * 0.7));
      c.lineWidth = 7 - i * 3;
      c.beginPath();
      c.arc(0, 0, reach, -1.4 + 1.9 * Math.max(0, pp - 0.35), -1.4 + 1.9 * pp);
      c.stroke();
    }
    c.restore();
  }

  drawCallout(c, f) {
    if (!f.callout) return;
    c.save();
    c.globalAlpha = Math.max(0, 1 - f.callout.t / 55);
    c.font = 'bold 20px "Courier New", monospace';
    c.textAlign = 'center';
    c.lineWidth = 4;
    c.strokeStyle = '#140826';
    const y = f.y - 215 - f.callout.t * 0.6;
    c.strokeText(f.callout.text, f.x, y);
    c.fillStyle = f.char.fireball;
    c.fillText(f.callout.text, f.x, y);
    c.restore();
  }

  drawFightScreen(c) {
    c.save();
    if (this.shake > 0) {   // screen shake on heavy hits
      c.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake * 0.6);
      this.shake *= 0.85;
      if (this.shake < 0.5) this.shake = 0;
    }
    this.drawStage(c);
    // draw the fighter farther from camera first (the one who is knocked down draws under)
    const order = [this.p1, this.p2];
    if (this.p1.state === 'down' || this.p1.state === 'ko') { /* p1 first by default */ }
    else if (this.p2.state === 'down' || this.p2.state === 'ko') order.reverse();
    this.drawGhosts(c, order[0]);
    this.drawGhosts(c, order[1]);
    order[0].draw(c);
    order[1].draw(c);
    this.drawSlashTrail(c, order[0]);
    this.drawSlashTrail(c, order[1]);
    for (const pr of this.projectiles) pr.draw(c);
    for (const s of this.sparks) s.draw(c);
    this.drawCallout(c, order[0]);
    this.drawCallout(c, order[1]);
    c.restore();
    this.drawHud(c);
    this.drawAnnounce(c);

    if (this.screen === 'fight' && this.screenT < 240 && this.round === 1) {
      c.font = 'bold 18px "Courier New", monospace';
      c.textAlign = 'center';
      c.fillStyle = 'rgba(255,255,255,0.75)';
      c.fillText('F/G attack · ↓→+F wave · ↓→+G dash slash · ↓↓+F rising slash · back=block · M=music', W / 2, H - 14);
    }
  }

  draw(c) {
    c.clearRect(0, 0, W, H);
    if (!assetsReady()) {
      c.fillStyle = '#000';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffd060';
      c.font = 'bold 28px "Courier New", monospace';
      c.textAlign = 'center';
      c.fillText('LOADING... ' + assetsLoaded + '/' + assetsTotal, W / 2, H / 2);
      return;
    }
    switch (this.screen) {
      case 'title': this.drawTitle(c); break;
      case 'mode': this.drawMode(c); break;
      case 'select': this.drawSelect(c); break;
      case 'versus': this.drawVersus(c); break;
      default: this.drawFightScreen(c); break;
    }
  }
}

// ---------------- Main loop ----------------
const game = new Game();

let last = 0, acc = 0;
const STEP = 1000 / 60;

function loop(ts) {
  if (!last) last = ts;
  acc += Math.min(100, ts - last);
  last = ts;
  while (acc >= STEP) {
    game.update();
    acc -= STEP;
  }
  ctx.imageSmoothingEnabled = false;   // keep pixel art crisp
  game.draw(ctx);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

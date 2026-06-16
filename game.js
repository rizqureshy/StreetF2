/* ============================================================
   SWIFT SWORD
   A 2D samurai dueling game built with HTML5 Canvas + vanilla JS.
   Inspired by classic arcade fighters.
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

// ---------------- Options (persisted) ----------------
const OPTIONS = (() => {
  const def = { musicVol: 9, sfxVol: 10, blood: true, difficulty: 1, fx: 2 };
  try {
    if (typeof localStorage !== 'undefined') {
      return Object.assign(def, JSON.parse(localStorage.getItem('swiftsword') || '{}'));
    }
  } catch (e) { /* private mode */ }
  return def;
})();
function saveOptions() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem('swiftsword', JSON.stringify(OPTIONS));
  } catch (e) { /* ignore */ }
}

const canvas = document.getElementById('game');
// The game renders to an offscreen 960x540 buffer (ctx). The visible canvas is
// reserved for the PixiJS WebGL post-processing layer; when Pixi is unavailable
// (no WebGL / headless tests) we blit the buffer straight to it (viewCtx).
const gameCanvas = document.createElement('canvas');
gameCanvas.width = W;
gameCanvas.height = H;
const ctx = gameCanvas.getContext('2d');
let viewCtx = null;

// double-click toggles fullscreen
if (canvas.addEventListener) canvas.addEventListener('dblclick', () => {
  const wrap = document.getElementById('wrap') || canvas;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else if (wrap.requestFullscreen) wrap.requestFullscreen().catch(() => {});
});

// ---------------- Audio (tiny WebAudio synth) ----------------
let audioCtx = null;
function initAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ }
    if (audioCtx) decodeAllSamples();
  }
  // mobile browsers create the context suspended until a user gesture
  if (audioCtx && audioCtx.state === 'suspended') {
    try { audioCtx.resume(); } catch (e) { /* not ready yet */ }
  }
}

// Full iOS unlock ritual. WebKit only counts some gesture types (notably
// touchend) for audio activation, and the hardware silent switch mutes
// WebAudio unless an HTML <audio> element switches the session to
// 'playback'. Safe no-op everywhere else.
let audioUnlocked = false;
let silentEl = null;
function unlockAudio() {
  initAudio();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') {
    try { audioCtx.resume(); } catch (e) { /* retry on next gesture */ }
  }
  if (audioUnlocked) return;
  try {
    // prime the context with a silent buffer (older iOS requirement)
    const buf = audioCtx.createBuffer(1, 1, 22050);
    const s = audioCtx.createBufferSource();
    s.buffer = buf;
    s.connect(audioCtx.destination);
    s.start(0);
  } catch (e) { /* ignore */ }
  try {
    // silent looping <audio> flips the iOS session to 'playback' so the
    // ringer/silent switch no longer mutes WebAudio
    silentEl = document.createElement('audio');
    silentEl.src = 'assets/sfx/silence.mp3';
    silentEl.loop = true;
    silentEl.volume = 0.01;
    const p = silentEl.play();
    if (p && p.catch) p.catch(() => { audioUnlocked = false; });
    audioUnlocked = true;
  } catch (e) { /* ignore */ }
}
if (window.addEventListener) {
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('touchend', unlockAudio);
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
function playSample(names, vol = 1, rateJitter = 0.05, baseRate = 1) {
  if (!audioCtx) return false;
  const list = Array.isArray(names) ? names : [names];
  const cands = list.filter(n => SAMPLES[n] && SAMPLES[n].buf);
  if (!cands.length) return false;
  const src = audioCtx.createBufferSource();
  src.buffer = SAMPLES[cands[Math.floor(Math.random() * cands.length)]].buf;
  src.playbackRate.value = baseRate * (1 + (Math.random() * 2 - 1) * rateJitter);
  const g = audioCtx.createGain();
  g.gain.value = vol * (OPTIONS.sfxVol / 10);
  src.connect(g).connect(audioCtx.destination);
  src.start();
  return true;
}
const SFX_FILES = {
  slice1: 'assets/sfx/knife_slice.mp3', slice2: 'assets/sfx/knife_slice_2.mp3',
  swing1: 'assets/sfx/draw_knife_1.mp3', swing2: 'assets/sfx/draw_knife_2.mp3', swing3: 'assets/sfx/draw_knife_3.mp3',
  punchH1: 'assets/sfx/impact_punch_heavy_000.mp3', punchH2: 'assets/sfx/impact_punch_heavy_001.mp3', punchH3: 'assets/sfx/impact_punch_heavy_002.mp3',
  punchM1: 'assets/sfx/impact_punch_medium_000.mp3', punchM2: 'assets/sfx/impact_punch_medium_001.mp3',
  chop: 'assets/sfx/chop.mp3',
  metal1: 'assets/sfx/impact_metal_light_000.mp3', metal2: 'assets/sfx/impact_metal_light_001.mp3', metal3: 'assets/sfx/impact_metal_medium_000.mp3',
  body1: 'assets/sfx/impact_soft_heavy_000.mp3', body2: 'assets/sfx/impact_soft_heavy_001.mp3',
  floor: 'assets/sfx/impact_wood_heavy_000.mp3',
  gong: 'assets/sfx/impact_bell_heavy_000.mp3',
  land1: 'assets/sfx/footstep_wood_000.mp3', land2: 'assets/sfx/footstep_wood_001.mp3',
  cloth1: 'assets/sfx/cloth_1.mp3', cloth2: 'assets/sfx/cloth_3.mp3',
  click1: 'assets/sfx/click1.mp3', click2: 'assets/sfx/click3.mp3',
  vo_ready: 'assets/vo/ready.mp3', vo_go: 'assets/vo/go.mp3',
  vo_round: 'assets/vo/round.mp3', vo_final_round: 'assets/vo/final_round.mp3',
  vo_you_win: 'assets/vo/you_win.mp3', vo_you_lose: 'assets/vo/you_lose.mp3',
  vo_time_over: 'assets/vo/time_over.mp3', vo_hurry: 'assets/vo/hurry_up.mp3',
  vo_tie: 'assets/vo/its_a_tie.mp3', vo_congrats: 'assets/vo/congratulations.mp3',
  vo_1: 'assets/vo/1.mp3', vo_2: 'assets/vo/2.mp3', vo_3: 'assets/vo/3.mp3',
  vo_fight: 'assets/vo/fight.mp3',
  vo_round_1: 'assets/vo/round_1.mp3', vo_round_2: 'assets/vo/round_2.mp3', vo_round_3: 'assets/vo/round_3.mp3',
  vo_choose: 'assets/vo/choose_your_character.mp3',
  vo_p1: 'assets/vo/player_1.mp3', vo_p2: 'assets/vo/player_2.mp3',
  vo_prepare: 'assets/vo/prepare_yourself.mp3',
  vo_combo: 'assets/vo/combo.mp3',
  vo_flawless: 'assets/vo/flawless_victory.mp3',
  vo_sudden: 'assets/vo/sudden_death.mp3',
  vo_winner: 'assets/vo/winner.mp3',
  vo_game_over: 'assets/vo/game_over.mp3',
  laser1: 'assets/sfx/laser_large_000.mp3', laser2: 'assets/sfx/laser_large_001.mp3',
  force1: 'assets/sfx/force_field_000.mp3', force2: 'assets/sfx/force_field_001.mp3', force3: 'assets/sfx/force_field_002.mp3',
  expl1: 'assets/sfx/explosion_crunch_000.mp3', expl2: 'assets/sfx/explosion_crunch_001.mp3', expl3: 'assets/sfx/explosion_crunch_002.mp3',
  music_calm: 'assets/music/menu.mp3', music_battle: 'assets/music/battle.mp3',
  music_night: 'assets/music/night.mp3', music_doom: 'assets/music/doom.mp3',
};
for (const [n, u] of Object.entries(SFX_FILES)) loadSample(n, u);
const VOICE = { say: (name, vol = 1) => playSample(name, vol, 0.015) };

const SFX = {
  hit: () => { playSample(['slice1', 'slice2'], 0.85); playSample(['punchH1', 'punchH2', 'punchH3'], 0.8); },
  block: () => playSample(['metal1', 'metal2', 'metal3'], 0.7),
  whoosh: () => playSample(['swing1', 'swing2', 'swing3'], 0.55, 0.1),
  jump: () => playSample(['cloth1', 'cloth2'], 0.7, 0.1),
  land: () => playSample(['land1', 'land2'], 0.4, 0.1),
  fall: () => { playSample(['body1', 'body2'], 0.9); playSample('floor', 0.5); },
  ko: () => { playSample(['body1', 'body2'], 1); playSample(['expl1', 'expl2', 'expl3'], 0.4); },
  select: () => playSample('click1', 0.8, 0),
  confirm: () => playSample('click2', 0.9, 0),
  sweep: () => { playSample(['punchM1', 'punchM2'], 0.85); playSample('chop', 0.5); },
  gong: () => playSample('gong', 0.85, 0),
  wave: () => { playSample(['laser1', 'laser2'], 0.45); playSample('force1', 0.25, 0.1); },
  dashSfx: () => { playSample(['slice1', 'slice2'], 0.75, 0.12); playSample('force3', 0.4, 0.15); },
  risingSfx: () => { playSample('force2', 0.55, 0.08); playSample(['slice1', 'slice2'], 0.65, 0.1); },
  specialHit: () => playSample(['expl1', 'expl2', 'expl3'], 0.45),
};

// ---------------- Music (FreePD.com tracks, CC0) ----------------
let musicGain = null;
const MUSIC = {
  mode: null, muted: false, src: null, playingTrack: null,
  ensure(want) {
    if (!audioCtx) return;
    if (!musicGain) {
      musicGain = audioCtx.createGain();
      musicGain.connect(audioCtx.destination);
    }
    musicGain.gain.value = this.muted ? 0 : 0.9 * (OPTIONS.musicVol / 10);
    if (this.playingTrack !== want && SAMPLES[want] && SAMPLES[want].buf) {
      this.stopTrack();
      const s = audioCtx.createBufferSource();
      s.buffer = SAMPLES[want].buf;
      s.loop = true;
      const g = audioCtx.createGain();
      g.gain.value = 0.42;
      s.connect(g).connect(musicGain);
      s.start();
      this.src = s;
      this.playingTrack = want;
    }
  },
  stopTrack() {
    if (this.src) { try { this.src.stop(); } catch (e) { /* already stopped */ } }
    this.src = null;
    this.playingTrack = null;
  },
  toggleMute() {
    this.muted = !this.muted;
    if (musicGain) musicGain.gain.value = this.muted ? 0 : 0.9 * (OPTIONS.musicVol / 10);
  },
};

// ---------------- Input ----------------
const keysDown = {};
const keysPressed = new Set();
window.addEventListener('keydown', e => {
  unlockAudio();
  if (!keysDown[e.code]) keysPressed.add(e.code);
  keysDown[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { keysDown[e.code] = false; });

// ---------------- Touch controls (mobile) ----------------
const TOUCH = {
  enabled: typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
  dir: { left: false, right: false, up: false, down: false },
  queue: new Set(),       // edge-triggered button presses for the next tick
  held: {},               // touchId -> button id
  stickId: null,
  stickOrigin: null,      // floating stick: where the finger landed
  stickPos: null,
};
const TOUCH_BUTTONS = [
  { id: 'super',     label: 'SUPER', x: W - 340, y: H - 132, r: 37, color: '#e8c020', needsMeter: true },
  { id: 'punch',     label: 'SLASH', x: W - 90,  y: H - 78,  r: 46, color: '#c83030' },
  { id: 'kick',      label: 'KICK',  x: W - 196, y: H - 110, r: 46, color: '#3060c8' },
  { id: 'hadouken',  label: 'WAVE',  x: W - 78,  y: H - 188, r: 33, color: '#9040c0' },
  { id: 'dashSlash', label: 'DASH',  x: W - 162, y: H - 218, r: 33, color: '#c07818' },
  { id: 'rising',    label: 'RISE',  x: W - 252, y: H - 222, r: 33, color: '#1f9e60' },
];
function touchCanvasPos(t) {
  const r = canvas.getBoundingClientRect();
  return { x: (t.clientX - r.left) * (W / r.width), y: (t.clientY - r.top) * (H / r.height) };
}
function touchUpdateStick(p) {
  const o = TOUCH.stickOrigin;
  if (!o) return;
  TOUCH.stickPos = p;
  const dx = p.x - o.x, dy = p.y - o.y;
  TOUCH.dir.left = dx < -16;
  TOUCH.dir.right = dx > 16;
  TOUCH.dir.up = dy < -30;
  TOUCH.dir.down = dy > 26;
}
function touchMenuTap(p) {
  const g = window.game;
  if (!g) return;
  if (g.paused) { g.pauseTap(p); return; }
  if (g.screen === 'options') { g.optionsTap(p); return; }
  switch (g.screen) {
    case 'title': keysPressed.add('Enter'); break;
    case 'mode':
      g.modeIdx = clamp(Math.round((p.y - 215) / 52), 0, 4);
      keysPressed.add('Enter');
      break;
    case 'select':
      for (let i = 0; i < CHARACTERS.length; i++) {
        const cx = W / 2 + (i - (CHARACTERS.length - 1) / 2) * 215;
        if (Math.abs(p.x - cx) < 100 && p.y > 140 && p.y < 410) {
          if (!g.done1) {
            g.sel1 = i;
            keysPressed.add('KeyF');
          } else if (!g.vsCpu && !g.done2) {
            g.sel2 = i;
            keysPressed.add('KeyK');
          }
        }
      }
      break;
    case 'stagesel': {
      for (let i = 0; i < STAGES.length; i++) {
        const cx = W / 2 + (i - (STAGES.length - 1) / 2) * 280;
        if (Math.abs(p.x - cx) < 130 && p.y > 180 && p.y < 380) {
          if (g.stageIdx === i) keysPressed.add('Enter');
          else { g.stageIdx = i; SFX.select(); }
          return;
        }
      }
      keysPressed.add('Enter');
      break;
    }
    case 'versus':
    case 'matchend':
      keysPressed.add('Enter');
      break;
  }
}
function onTouchStart(e) {
  e.preventDefault();
  unlockAudio();
  TOUCH.enabled = true;
  const g = window.game;
  const fighting = g && (g.screen === 'fight' || g.screen === 'intro' || g.screen === 'roundend');
  for (const t of e.changedTouches) {
    const p = touchCanvasPos(t);
    if (!fighting || g.paused) { touchMenuTap(p); continue; }
    // pause button (top center, under the timer)
    if (Math.abs(p.x - W / 2) < 30 && p.y > 108 && p.y < 150) {
      g.paused = true; g.pauseIdx = 0; g.optionsOpen = false;
      continue;
    }
    let hit = null;
    for (const b of TOUCH_BUTTONS) {
      if (b.needsMeter && (!g.p1 || g.p1.meter < 100)) continue;
      if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 < (b.r + 12) ** 2) { hit = b; break; }
    }
    if (hit) {
      TOUCH.queue.add(hit.id);
      TOUCH.held[t.identifier] = hit.id;
    } else if (p.x < W * 0.45 && TOUCH.stickId === null) {
      TOUCH.stickId = t.identifier;
      TOUCH.stickOrigin = p;
      touchUpdateStick(p);
    }
  }
}
function onTouchMove(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === TOUCH.stickId) touchUpdateStick(touchCanvasPos(t));
  }
}
function onTouchEnd(e) {
  e.preventDefault();
  unlockAudio();
  for (const t of e.changedTouches) {
    if (t.identifier === TOUCH.stickId) {
      TOUCH.stickId = null;
      TOUCH.stickOrigin = null;
      TOUCH.stickPos = null;
      TOUCH.dir.left = TOUCH.dir.right = TOUCH.dir.up = TOUCH.dir.down = false;
    }
    delete TOUCH.held[t.identifier];
  }
}
if (canvas.addEventListener) {
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });
}
// ---------------- Gamepad support ----------------
const GAMEPAD = { prev: [{}, {}], pads: [null, null], connected: false };
function pollGamepad(idx) {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  let gp = null;
  try { gp = navigator.getGamepads()[idx]; } catch (e) { return null; }
  if (!gp) return null;
  GAMEPAD.connected = true;
  const prev = GAMEPAD.prev[idx];
  const held = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
  const edge = i => { const h = held(i); const e = h && !prev[i]; prev[i] = h; return e; };
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  const pad = {
    left: held(14) || ax < -0.4,
    right: held(15) || ax > 0.4,
    up: false, down: held(13) || ay > 0.5,
    punch: edge(2),      // X / Square
    kick: edge(0),       // A / Cross
    dashSlash: edge(1),  // B / Circle
    rising: edge(3),     // Y / Triangle
    hadouken: edge(5),   // RB
    super: edge(7),      // RT
  };
  const upEdge = (held(12) || ay < -0.5) && !prev.up;
  prev.up = held(12) || ay < -0.5;
  pad.up = held(12) || ay < -0.5;
  // menu navigation (P1 pad drives menus)
  if (idx === 0) {
    if (edge(9) || pad.punch || pad.kick) keysPressed.add('Enter');
    if (upEdge) keysPressed.add('ArrowUp');
    const dnEdge = pad.down && !prev.dn; prev.dn = pad.down;
    if (dnEdge) keysPressed.add('ArrowDown');
    const lEdge = pad.left && !prev.l; prev.l = pad.left;
    if (lEdge) { keysPressed.add('KeyA'); keysPressed.add('ArrowLeft'); }
    const rEdge = pad.right && !prev.r; prev.r = pad.right;
    if (rEdge) { keysPressed.add('KeyD'); keysPressed.add('ArrowRight'); }
    if (edge(9)) keysPressed.add('Escape');
  }
  return pad;
}
function mergePads(base, extra) {
  if (!extra) return base;
  for (const k of Object.keys(extra)) base[k] = base[k] || extra[k];
  return base;
}

function mergeTouchPad(pad) {
  if (!TOUCH.enabled) return pad;
  pad.left = pad.left || TOUCH.dir.left;
  pad.right = pad.right || TOUCH.dir.right;
  pad.up = pad.up || TOUCH.dir.up;
  pad.down = pad.down || TOUCH.dir.down;
  for (const id of TOUCH.queue) pad[id] = true;
  return pad;
}

const P1_KEYS = { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', punch: 'KeyF', kick: 'KeyG', superKey: 'KeyH' };
const P2_KEYS = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', punch: 'KeyK', kick: 'KeyL', superKey: 'Semicolon' };

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
    super: keysPressed.has(map.superKey || '') ,
  };
}
const EMPTY_PAD = { left: false, right: false, up: false, down: false, punch: false, kick: false, hadouken: false, dashSlash: false, rising: false, super: false };

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
    moves: { hadouken: 'TEMPEST WAVE', dashSlash: 'GALE DASH', risingSlash: 'DRAGON ASCENT', superWave: 'TEMPEST BARRAGE', superCuts: 'TEMPEST BARRAGE' },
    superMove: 'superWave',
    fireball: '#58b4ff',
    taunt: 'MY BLADE NEVER WAVERS!',
  },
  {
    id: 'kenji', name: 'KENJI', dir: 'assets/p2', baseFacing: -1,
    scale: 3.3, footY: 127, cx: 102,
    frames: { Idle: 4, Run: 8, Jump: 2, Fall: 2, Attack1: 4, Attack2: 4, TakeHit: 3, Death: 7 },
    swing: { Attack1: [0.26, 0.55], Attack2: [0.26, 0.55] },
    face: { x: 84, y: 68, s: 36 },
    moves: { hadouken: 'PHANTOM WAVE', dashSlash: 'SHADOW DASH', risingSlash: 'DEMON RISE', superCuts: 'THOUSAND CUTS', superWave: 'THOUSAND CUTS' },
    superMove: 'superCuts',
    fireball: '#c44dff',
    taunt: 'YOU WERE NEVER A MATCH!',
  },
  {
    id: 'ronin', name: 'RONIN', dir: null, base: 'kaito', tint: 'rgba(40,40,95,0.52)', baseFacing: 1,
    scale: 3.4, footY: 121, cx: 94,
    frames: { Idle: 8, Run: 8, Jump: 2, Fall: 2, Attack1: 6, Attack2: 6, TakeHit: 4, Death: 6 },
    swing: { Attack1: [0.62, 0.88], Attack2: [0.62, 0.88] },
    face: { x: 76, y: 64, s: 36 },
    moves: { hadouken: 'VOID WAVE', dashSlash: 'GHOST DASH', risingSlash: 'RAVEN ASCENT', superCuts: 'HUNDRED GHOSTS', superWave: 'HUNDRED GHOSTS' },
    superMove: 'superCuts',
    speed: 1.18, power: 0.85,
    fireball: '#8a7aff',
    taunt: 'I DIED LONG AGO.',
  },
  {
    id: 'oni', name: 'ONI', dir: null, base: 'kenji', tint: 'rgba(200,22,22,0.5)', baseFacing: -1,
    scale: 3.45, footY: 127, cx: 102,
    frames: { Idle: 4, Run: 8, Jump: 2, Fall: 2, Attack1: 4, Attack2: 4, TakeHit: 3, Death: 7 },
    swing: { Attack1: [0.26, 0.55], Attack2: [0.26, 0.55] },
    face: { x: 84, y: 68, s: 36 },
    moves: { hadouken: 'HELLFIRE WAVE', dashSlash: 'DEMON CHARGE', risingSlash: 'ONI RISING', superCuts: 'MASSACRE', superWave: 'MASSACRE' },
    superMove: 'superWave',
    speed: 0.88, power: 1.3, boss: true,
    fireball: '#ff3020',
    taunt: 'YOUR SOUL IS MINE.',
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
function tintedSheet(img, tint) {
  const cv = document.createElement('canvas');
  cv.complete = false;
  const apply = () => {
    cv.width = img.width;
    cv.height = img.height;
    const x = cv.getContext('2d');
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = tint;
    x.fillRect(0, 0, cv.width, cv.height);
    cv.complete = true;
  };
  if (img.complete && img.naturalWidth) apply();
  else if (img.addEventListener) img.addEventListener('load', apply);
  else apply();
  return cv;
}
for (const ch of CHARACTERS) {
  if (ch.base) continue;
  SHEETS[ch.id] = {};
  for (const k of Object.keys(ch.frames)) SHEETS[ch.id][k] = loadImage(ch.dir + '/' + k + '.png');
}
for (const ch of CHARACTERS) {
  if (!ch.base) continue;
  SHEETS[ch.id] = {};
  for (const k of Object.keys(ch.frames)) SHEETS[ch.id][k] = tintedSheet(SHEETS[ch.base][k], ch.tint);
}
const BG_IMG = loadImage('assets/background.png');
const SHOP_IMG = loadImage('assets/shop.png');
const assetsReady = () => assetsLoaded >= assetsTotal;

// ---------------- Stages ----------------
const STAGES = [
  { id: 'dusk', name: 'OAK WOODS', tint: null, music: 'music_battle', weather: null },
  { id: 'night', name: 'MOONLIT WOODS', tint: 'rgba(18,28,80,0.45)', music: 'music_night', weather: 'leaves', fireflies: true, moon: '#dfe8ff' },
  { id: 'bloodmoon', name: 'BLOOD MOON', tint: 'rgba(110,8,8,0.36)', music: 'music_doom', weather: 'storm', moon: '#ff4030' },
];

// ---------------- Attack definitions ----------------
// Frame data: startup, active, recovery (in 60fps frames).
// Hitboxes are in screen pixels relative to fighter origin (feet center), facing +x.
// Ranges account for the sprite characters' sword reach.
// Boxes match the measured pixel extents of the sword swings.
// startup/active/recovery are re-windowed per character so the hit
// lands exactly when that fighter's blade is visually extended.
const ATTACKS = {
  punch:       { startup: 12, active: 9,  recovery: 19, damage: 7,  kb: 5,   box: { x: 25, y: -215, w: 275, h: 190 }, anim: 'Attack1' },
  kick:        { startup: 14, active: 9,  recovery: 22, damage: 9,  kb: 6.5, box: { x: 25, y: -195, w: 285, h: 175 }, anim: 'Attack2' },
  crouchPunch: { startup: 9,  active: 8,  recovery: 15, damage: 5,  kb: 4,   box: { x: 20, y: -170, w: 250, h: 150 }, anim: 'Attack1', crouch: true },
  sweep:       { startup: 12, active: 9,  recovery: 21, damage: 7,  kb: 4,   box: { x: 15, y: -65,  w: 235, h: 65 },  anim: 'Attack2', crouch: true, knockdown: true },
  jumpKick:    { startup: 8,  active: 14, recovery: 10, damage: 9,  kb: 6,   box: { x: 0,  y: -150, w: 230, h: 130 }, anim: 'Attack2', air: true },
  hadouken:    { startup: 20, active: 1,  recovery: 28, damage: 0,  kb: 0,   box: null, anim: 'Attack1', projectile: true, special: true },
  superWave:   { startup: 24, active: 1,  recovery: 34, damage: 0,  kb: 0,   box: null, anim: 'Attack1', projectile: true, special: true, superN: 3, isSuper: true },
  superCuts:   { startup: 12, active: 30, recovery: 22, damage: 4,  kb: 3,   box: { x: 0, y: -200, w: 280, h: 185 }, anim: 'Attack2', knockdown: true, dash: 9, chip: 4, special: true, rehit: 7, isSuper: true },
  throw:       { startup: 7,  active: 4,  recovery: 18, damage: 0,  kb: 0,   box: { x: 10, y: -170, w: 95, h: 160 }, anim: 'Attack1', isThrow: true },
  dashSlash:   { startup: 13, active: 15, recovery: 18, damage: 10, kb: 7,   box: { x: 10, y: -195, w: 290, h: 175 }, anim: 'Attack2', knockdown: true, dash: 7, chip: 2, special: true },
  risingSlash: { startup: 10, active: 17, recovery: 23, damage: 11, kb: 6,   box: { x: -25, y: -290, w: 230, h: 270 }, anim: 'Attack1', knockdown: true, rising: true, chip: 2, special: true },
};
const HITSTUN = 26;
const BLOCKSTUN = 18;

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
    this.prevL = false;
    this.prevR = false;
    this.tapDir = 0;       // double-tap dash detector
    this.tapTimer = 0;
    this.dashT = 0;
    this.dashDir = 0;
    this.invulnT = 0;
    this.hpGhost = MAX_HP;
    this.meter = 0;
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
    if (def.projectile) SFX.wave();
    else if (def.dash) SFX.dashSfx();
    else if (def.rising) SFX.risingSfx();
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

    // --- double-tap dash detection ---
    const lEdge = pad.left && !this.prevL;
    const rEdge = pad.right && !this.prevR;
    this.prevL = pad.left;
    this.prevR = pad.right;
    if (this.tapTimer > 0) this.tapTimer--; else this.tapDir = 0;
    for (const [edge, dir] of [[lEdge, -1], [rEdge, 1]]) {
      if (!edge) continue;
      if (this.tapDir === dir) {
        this.dashT = 13;
        this.dashDir = dir;
        if (dir !== this.facing) this.invulnT = 9;   // backdash evades
        this.tapDir = 0;
        SFX.whoosh();
      } else {
        this.tapDir = dir;
        this.tapTimer = 15;
      }
    }
    if (this.invulnT > 0) this.invulnT--;

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
      if (a.def.projectile && a.t === a.st && (a.def.superN || !this.projAlive(game))) {
        game.projectiles.push(new Projectile(this));
      }
      if (a.def.superN) {
        for (let i = 1; i < a.def.superN; i++) {
          if (a.t === a.st + i * 12) {
            const pr = new Projectile(this);
            pr.y -= i * 26;
            pr.vx *= 1 + i * 0.12;
            game.projectiles.push(pr);
          }
        }
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

    // SUPER (full meter): dedicated button or punch+kick together
    if ((pad.super || (pad.punch && pad.kick)) && this.meter >= 100) {
      this.meter = 0;
      this.startAttack(this.char.superMove);
      game.superFlash = 26;
      game.slowmo = Math.max(game.slowmo, 18);
      game.shake = Math.max(game.shake, 6);
      SFX.specialHit();
      return;
    }
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
    if (pad.punch && fwd && !pad.down && Math.abs(opp.x - this.x) < 115 && opp.grounded &&
        opp.state !== 'hit' && opp.state !== 'down' && opp.state !== 'ko' && opp.state !== 'block') {
      this.startAttack('throw');
      return;
    }
    if (pad.punch) { this.startAttack(pad.down ? 'crouchPunch' : 'punch'); return; }
    if (pad.kick)  { this.startAttack(pad.down ? 'sweep' : 'kick'); return; }

    // dash motion takes priority over other grounded actions
    if (this.dashT > 0) {
      this.dashT--;
      this.x += this.dashDir * 11;
      this.clampX();
      this.state = 'walk';
      this.walkPhase += 0.3 * this.dashDir * this.facing;
      if (this.dashT % 3 === 0) {
        const spr = this.currentSprite();
        this.ghosts.push({ img: spr.img, frame: spr.frame, x: this.x, y: this.y, flip: this.facing * this.char.baseFacing, t: 0 });
      }
      return;
    }

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
      const speed = (dir === this.facing ? WALK_SPEED : WALK_SPEED * 0.78) * (this.char.speed || 1);
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
  const pad = { left: false, right: false, up: false, down: false, punch: false, kick: false, hadouken: false, dashSlash: false, rising: false, super: false };
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
  const DIFF = OPTIONS.difficulty;
  if (opp.attack && !opp.attack.def.projectile && dist < 200 && f.grounded &&
      Math.random() < [0.22, 0.45, 0.68][DIFF]) {
    ai.wantBlock = true; ai.timer = 14;
  }
  if (ai.wantBlock) {
    pad[backKey] = true;
    if (--ai.timer <= 0) ai.wantBlock = false;
    return pad;
  }

  // anti-air: rising slash under a jump-in
  if (!opp.grounded && dist < 230 && f.grounded && !f.attack &&
      Math.random() < [0.025, 0.06, 0.13][DIFF]) {
    pad.rising = true;
    return pad;
  }

  if (f.meter >= 100 && dist < 320 && f.grounded && !f.attack && Math.random() < [0.01, 0.025, 0.05][DIFF]) {
    pad.super = true;
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
      if (r < 0.14 && DIFF > 0) { ai.move = 'grab'; ai.timer = 12; }
      else if (r < 0.3) { ai.move = 'punch'; ai.timer = 10; }
      else if (r < 0.55) { ai.move = 'kick'; ai.timer = 12; }
      else if (r < 0.7) { ai.move = 'sweep'; ai.timer = 12; }
      else if (r < 0.85) { ai.move = 'retreat'; ai.timer = 16; }
      else { ai.move = 'wait'; ai.timer = 8; }
    }
    ai.timer = Math.round(ai.timer * [1.5, 1, 0.72][DIFF]);
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
    case 'grab': if (ai.fresh) { pad[fwdKey] = true; pad.punch = true; } break;
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
    this.shake = 0;
    this.slowmo = 0;
    this.zoom = 1;
    this.camX = W / 2;
    this.letterbox = 0;
    this.stageIdx = 0;
    this.combo = { owner: null, count: 0, timer: 0 };
    this.floats = [];
    this.arcade = false;
    this.training = false;
    this.fireflies = [];
    this.hitboxView = false;
    this.paused = false;
    this.pauseIdx = 0;
    this.optionsOpen = false;
    this.optIdx = 0;
    this.setWeather(['leaves', 'rain', 'storm'][Math.floor(Math.random() * 3)]);
  }

  // ---------------- Pause & Options ----------------
  optionsInput() {
    const rows = 6; // music, sfx, blood, difficulty, fx, back
    if (keysPressed.has('ArrowUp') || keysPressed.has('KeyW')) { this.optIdx = (this.optIdx + rows - 1) % rows; SFX.select(); }
    if (keysPressed.has('ArrowDown') || keysPressed.has('KeyS')) { this.optIdx = (this.optIdx + 1) % rows; SFX.select(); }
    const dec = keysPressed.has('ArrowLeft') || keysPressed.has('KeyA');
    const inc = keysPressed.has('ArrowRight') || keysPressed.has('KeyD');
    if (dec || inc) {
      const d = inc ? 1 : -1;
      if (this.optIdx === 0) OPTIONS.musicVol = clamp(OPTIONS.musicVol + d, 0, 10);
      if (this.optIdx === 1) OPTIONS.sfxVol = clamp(OPTIONS.sfxVol + d, 0, 10);
      if (this.optIdx === 2) OPTIONS.blood = !OPTIONS.blood;
      if (this.optIdx === 3) OPTIONS.difficulty = clamp(OPTIONS.difficulty + d, 0, 2);
      if (this.optIdx === 4) { OPTIONS.fx = clamp(OPTIONS.fx + d, 0, 2); if (typeof applyFX === 'function') applyFX(); }
      if (musicGain && !MUSIC.muted) musicGain.gain.value = 0.9 * (OPTIONS.musicVol / 10);
      saveOptions();
      SFX.select();
    }
    if (keysPressed.has('Escape') || (keysPressed.has('Enter') && this.optIdx === 5)) {
      SFX.confirm();
      return true;  // exit options
    }
    return false;
  }

  optionsTap(p) {
    const top = 165, rowH = 50;
    const row = Math.floor((p.y - top + 18) / rowH);
    if (row >= 0 && row < 6) {
      this.optIdx = row;
      if (row === 5) { keysPressed.add('Enter'); return; }
      keysPressed.add(p.x < W / 2 ? 'ArrowLeft' : 'ArrowRight');
    }
  }

  drawOptionsPanel(c) {
    c.save();
    c.fillStyle = 'rgba(6,8,18,0.88)';
    c.fillRect(W / 2 - 330, 90, 660, 380);
    c.strokeStyle = '#ffd060';
    c.lineWidth = 3;
    c.strokeRect(W / 2 - 330, 90, 660, 380);
    c.textAlign = 'center';
    c.font = 'bold 34px Impact, "Arial Black", sans-serif';
    c.fillStyle = '#ffd060';
    c.fillText('OPTIONS', W / 2, 140);
    const rows = [
      ['MUSIC VOLUME', OPTIONS.musicVol + '/10'],
      ['SFX VOLUME', OPTIONS.sfxVol + '/10'],
      ['BLOOD', OPTIONS.blood ? 'ON' : 'OFF'],
      ['DIFFICULTY', ['EASY', 'NORMAL', 'HARD'][OPTIONS.difficulty]],
      ['VISUAL FX', ['OFF', 'CRT', 'FULL'][OPTIONS.fx]],
      ['BACK', ''],
    ];
    c.font = 'bold 21px "Courier New", monospace';
    rows.forEach(([label, val], i) => {
      const y = 188 + i * 50;
      const sel = this.optIdx === i;
      c.fillStyle = sel ? '#ffffff' : 'rgba(255,255,255,0.45)';
      c.textAlign = 'left';
      c.fillText((sel ? '▶ ' : '  ') + label, W / 2 - 290, y);
      c.textAlign = 'right';
      c.fillText(val, W / 2 + 290, y);
      if (i < 2) {   // volume slider cells
        for (let s = 0; s < 10; s++) {
          c.fillStyle = s < [OPTIONS.musicVol, OPTIONS.sfxVol][i]
            ? (sel ? '#ffd820' : '#a8901a') : 'rgba(255,255,255,0.15)';
          c.fillRect(W / 2 - 40 + s * 18, y - 14, 13, 16);
        }
      }
    });
    c.font = '15px "Courier New", monospace';
    c.textAlign = 'center';
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillText('←/→ adjust · ↑/↓ move · ESC back', W / 2, 452);
    c.restore();
  }

  drawPauseOverlay(c) {
    c.save();
    c.fillStyle = 'rgba(4,6,14,0.7)';
    c.fillRect(0, 0, W, H);
    if (this.optionsOpen) {
      this.drawOptionsPanel(c);
      c.restore();
      return;
    }
    c.textAlign = 'center';
    c.font = 'bold 52px Impact, "Arial Black", sans-serif';
    c.fillStyle = '#ffd060';
    c.fillText('PAUSED', W / 2, 180);
    const items = ['RESUME', 'OPTIONS', 'QUIT TO TITLE'];
    c.font = 'bold 26px "Courier New", monospace';
    items.forEach((t, i) => {
      const sel = this.pauseIdx === i;
      c.fillStyle = sel ? '#fff' : 'rgba(255,255,255,0.45)';
      c.fillText((sel ? '▶ ' : '  ') + t + (sel ? ' ◀' : '  '), W / 2, 250 + i * 50);
    });
    c.restore();
  }

  pauseUpdate() {
    if (this.optionsOpen) {
      if (this.optionsInput()) this.optionsOpen = false;
      return;
    }
    if (keysPressed.has('ArrowUp') || keysPressed.has('KeyW')) { this.pauseIdx = (this.pauseIdx + 2) % 3; SFX.select(); }
    if (keysPressed.has('ArrowDown') || keysPressed.has('KeyS')) { this.pauseIdx = (this.pauseIdx + 1) % 3; SFX.select(); }
    if (keysPressed.has('Escape')) { this.paused = false; return; }
    if (keysPressed.has('Enter')) {
      SFX.confirm();
      if (this.pauseIdx === 0) this.paused = false;
      else if (this.pauseIdx === 1) { this.optionsOpen = true; this.optIdx = 0; }
      else { this.paused = false; this.screen = 'title'; this.screenT = 0; }
    }
  }

  pauseTap(p) {
    if (this.optionsOpen) { this.optionsTap(p); return; }
    const row = Math.floor((p.y - 225) / 50);
    if (row >= 0 && row < 3) { this.pauseIdx = row; keysPressed.add('Enter'); }
  }

  setWeather(kind) {
    this.weather = kind;
    this.weatherT = 0;
    this.leaves = [];
    this.rain = [];
    this.splashes = [];
    this.lightning = { next: 180 + Math.random() * 240, flash: 0, boltT: 0, bolt: null, thunderIn: 0 };
  }

  updateWeather() {
    const w = this.weather;
    this.weatherT++;
    this.wind = Math.sin(this.weatherT * 0.003) * 0.9 - 0.6;
    // drifting leaves
    const maxLeaves = w === 'leaves' ? 16 : 5;
    if (this.leaves.length < maxLeaves && Math.random() < 0.07) {
      this.leaves.push({
        x: Math.random() < 0.55 ? W + 24 : Math.random() * W,
        y: -16 - Math.random() * 40,
        vy: 0.5 + Math.random() * 0.9,
        drift: 1 + Math.random() * 2.2,
        phase: Math.random() * 6.28,
        spin: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * 0.12,
        size: 3.5 + Math.random() * 3,
        color: ['#c87830', '#d8a040', '#9a5a20', '#b8642a'][Math.floor(Math.random() * 4)],
      });
    }
    for (const l of this.leaves) {
      l.phase += 0.05 + Math.random() * 0.02;
      l.x += this.wind * l.drift + Math.sin(l.phase) * 1.3;
      l.y += l.vy + Math.cos(l.phase * 0.7) * 0.5;
      l.spin += l.vr;
    }
    this.leaves = this.leaves.filter(l => l.y < H + 20 && l.x > -40);
    // fireflies on moonlit stages
    if (STAGES[this.stageIdx || 0].fireflies) {
      while (this.fireflies.length < 14) {
        this.fireflies.push({ x: Math.random() * W, y: 200 + Math.random() * 260, phase: Math.random() * 6.28, sp: 0.2 + Math.random() * 0.4 });
      }
      for (const fl of this.fireflies) {
        fl.phase += 0.045;
        fl.x += Math.sin(fl.phase * 0.7) * fl.sp;
        fl.y += Math.cos(fl.phase * 0.5) * fl.sp * 0.7;
      }
    } else this.fireflies.length = 0;
    // rain
    if (w === 'rain' || w === 'storm') {
      const drops = w === 'storm' ? 9 : 5;
      for (let i = 0; i < drops; i++) {
        if (this.rain.length > 230) break;
        this.rain.push({
          x: Math.random() * (W + 220) - 110, y: -24,
          spd: 16 + Math.random() * 8,
          len: 13 + Math.random() * 11,
          floor: GROUND + Math.random() * 80,
        });
      }
      for (const d of this.rain) {
        d.y += d.spd;
        d.x -= 3.5;
        if (d.y >= d.floor && this.splashes.length < 70) {
          this.splashes.push({ x: d.x, y: d.floor, t: 0 });
          d.y = 9999;
        }
      }
      this.rain = this.rain.filter(d => d.y < 1000);
      this.splashes = this.splashes.filter(s => ++s.t < 9);
      // lightning
      const L = this.lightning;
      if (--L.next <= 0) {
        L.flash = 14;
        L.boltT = 9;
        L.thunderIn = 13;
        const pts = [];
        let bx = 120 + Math.random() * (W - 240), by = 0;
        while (by < GROUND - 30) {
          pts.push([bx, by]);
          by += 32 + Math.random() * 36;
          bx += (Math.random() - 0.5) * 64;
        }
        pts.push([bx, GROUND]);
        L.bolt = pts;
        L.next = (w === 'storm' ? 260 : 620) + Math.random() * 420;
      }
      if (L.flash > 0) L.flash--;
      if (L.boltT > 0) L.boltT--;
      if (L.thunderIn > 0 && --L.thunderIn === 0) {
        playSample(['expl1', 'expl2', 'expl3'], 0.6, 0.15, 0.45);
        this.shake = Math.max(this.shake, 7);
      }
    }
  }

  drawLeaves(c) {
    c.save();
    for (const l of this.leaves) {
      c.save();
      c.translate(l.x, l.y);
      c.rotate(l.spin);
      c.globalAlpha = 0.85;
      c.fillStyle = l.color;
      c.beginPath();
      c.ellipse(0, 0, l.size, l.size * 0.45, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    c.restore();
  }

  drawFireflies(c) {
    if (!this.fireflies.length) return;
    c.save();
    for (const fl of this.fireflies) {
      const a = 0.35 + 0.3 * Math.sin(fl.phase * 2);
      c.globalAlpha = Math.max(0.08, a);
      dot(c, fl.x, fl.y, 2.2, '#d8ff90');
      c.globalAlpha = a * 0.3;
      dot(c, fl.x, fl.y, 5, '#d8ff90');
    }
    c.restore();
  }

  drawRain(c) {
    if (this.weather !== 'rain' && this.weather !== 'storm') return;
    c.save();
    c.strokeStyle = 'rgba(175,195,235,0.38)';
    c.lineWidth = 1.4;
    c.beginPath();
    for (const d of this.rain) {
      c.moveTo(d.x, d.y);
      c.lineTo(d.x - 3, d.y + d.len);
    }
    c.stroke();
    c.strokeStyle = 'rgba(190,210,245,0.45)';
    for (const s of this.splashes) {
      c.beginPath();
      c.arc(s.x, s.y, 1.5 + s.t * 0.9, Math.PI, Math.PI * 2);
      c.stroke();
    }
    c.restore();
  }

  drawBolt(c) {
    const L = this.lightning;
    if (!L || L.boltT <= 0 || !L.bolt) return;
    c.save();
    c.globalAlpha = Math.min(1, L.boltT / 6);
    c.strokeStyle = '#eaf2ff';
    c.lineWidth = 3.5;
    c.shadowColor = '#9db9ff';
    c.shadowBlur = 18;
    c.beginPath();
    L.bolt.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.stroke();
    c.restore();
  }

  drawFlash(c) {
    const L = this.lightning;
    if (!L || L.flash <= 0) return;
    c.save();
    c.globalAlpha = Math.min(0.5, L.flash / 16);
    c.fillStyle = '#cfe0ff';
    c.fillRect(0, 0, W, H);
    c.restore();
  }

  startMatch() {
    const st = STAGES[this.stageIdx || 0];
    this.setWeather(st.weather || ['leaves', 'rain', 'storm'][Math.floor(Math.random() * 3)]);
    this.p1 = new Fighter(CHARACTERS[this.sel1], 250, 1, true);
    this.p2 = new Fighter(CHARACTERS[this.sel2], 710, -1, false);
    this.wins1 = 0; this.wins2 = 0;
    this.round = 1;
    this.projectiles = [];
    this.sparks = [];
    this.screen = 'versus';
    this.screenT = 0;
    SFX.gong();
    VOICE.say('vo_prepare');
  }

  startRound() {
    this.p1.resetRound();
    this.p2.resetRound();
    this.projectiles = [];
    this.sparks = [];
    this.blood = [];
    this.stains = [];
    this.hitstop = 0;
    this.shake = 0;
    this.slowmo = 0;
    this.zoom = 1;
    this.superFlash = 0;
    this.combo = { owner: null, count: 0, timer: 0 };
    this.floats = [];
    this.timeLeft = ROUND_TIME;
    this.timerAcc = 0;
    this.suddenDeath = false;
    this.flawless = false;
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
    GAMEPAD.pads[0] = pollGamepad(0);
    GAMEPAD.pads[1] = pollGamepad(1);
    this.updateWeather();
    if (keysPressed.has('KeyM')) MUSIC.toggleMute();
    if (audioCtx) {
      const battle = (this.screen === 'fight' || this.screen === 'intro' || this.screen === 'roundend' ||
        this.screen === 'matchend' || this.screen === 'versus') && !this.paused;
      MUSIC.ensure(battle ? STAGES[this.stageIdx || 0].music : 'music_calm');
    }
    const inFight = this.screen === 'fight' || this.screen === 'intro' || this.screen === 'roundend';
    if (this.paused) {
      this.pauseUpdate();
      keysPressed.clear();
      TOUCH.queue.clear();
      return;
    }
    if (inFight && (keysPressed.has('Escape') || keysPressed.has('KeyP'))) {
      this.paused = true;
      this.pauseIdx = 0;
      this.optionsOpen = false;
      keysPressed.clear();
      TOUCH.queue.clear();
      return;
    }
    this.screenT = (this.screenT || 0) + 1;

    switch (this.screen) {
      case 'title':
        this.demoT++;
        if (keysPressed.has('Enter')) { this.screen = 'mode'; this.screenT = 0; SFX.confirm(); }
        break;

      case 'mode': {
        const N = 5;
        if (keysPressed.has('ArrowUp') || keysPressed.has('KeyW')) { this.modeIdx = (this.modeIdx + N - 1) % N; SFX.select(); }
        if (keysPressed.has('ArrowDown') || keysPressed.has('KeyS')) { this.modeIdx = (this.modeIdx + 1) % N; SFX.select(); }
        if (keysPressed.has('Enter')) {
          SFX.confirm();
          if (this.modeIdx === 4) {
            this.screen = 'options'; this.screenT = 0; this.optIdx = 0;
          } else {
            this.arcade = this.modeIdx === 0;
            this.training = this.modeIdx === 3;
            this.vsCpu = this.modeIdx !== 2;
            this.arcadeIdx = 0;
            this.screen = 'select'; this.screenT = 0;
            this.done1 = false; this.done2 = false;
            VOICE.say('vo_choose');
          }
        }
        if (keysPressed.has('Escape')) { this.screen = 'title'; this.screenT = 0; }
        break;
      }

      case 'options':
        if (this.optionsInput()) { this.screen = 'mode'; this.screenT = 0; }
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
            if (this.arcade) {
              const others = [];
              for (let i = 0; i < n; i++) if (i !== this.sel1 && !CHARACTERS[i].boss) others.push(i);
              for (let i = others.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [others[i], others[j]] = [others[j], others[i]];
              }
              for (let i = 0; i < n; i++) if (CHARACTERS[i].boss && i !== this.sel1) others.push(i);
              this.ladder = others;
              this.sel2 = this.ladder[0];
            } else if (this.training) {
              this.sel2 = (this.sel1 + 1) % n;
            } else {
              do { this.sel2 = Math.floor(Math.random() * n); } while (this.sel2 === this.sel1);
            }
            this.done2 = true;
          }
        } else if (!this.done2) {
          if (keysPressed.has('ArrowLeft')) { this.sel2 = (this.sel2 + n - 1) % n; SFX.select(); }
          if (keysPressed.has('ArrowRight')) { this.sel2 = (this.sel2 + 1) % n; SFX.select(); }
          if (keysPressed.has('KeyK')) { this.done2 = true; SFX.confirm(); }
        }
        if (this.done1 && this.done2 && this.screenT > 30) {
          if (this.arcade) {
            this.stageIdx = this.arcadeIdx % STAGES.length;
            this.startMatch();
          } else {
            this.screen = 'stagesel';
            this.screenT = 0;
          }
        }
        if (keysPressed.has('Escape')) { this.screen = 'mode'; this.screenT = 0; }
        break;
      }

      case 'stagesel':
        if (keysPressed.has('KeyA') || keysPressed.has('ArrowLeft')) { this.stageIdx = (this.stageIdx + STAGES.length - 1) % STAGES.length; SFX.select(); }
        if (keysPressed.has('KeyD') || keysPressed.has('ArrowRight')) { this.stageIdx = (this.stageIdx + 1) % STAGES.length; SFX.select(); }
        if (keysPressed.has('Enter') || keysPressed.has('KeyF')) { SFX.confirm(); this.startMatch(); }
        if (keysPressed.has('Escape')) { this.screen = 'select'; this.screenT = 0; this.done1 = this.done2 = false; }
        break;

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
          VOICE.say(finalRound ? 'vo_final_round' : 'vo_round_' + Math.min(3, this.round));
        }
        if (r1) {
          // kata demonstration: each fighter shows their blade work
          if (k === 55) this.p1.startAttack('punch');
          if (k === 90) this.p2.startAttack('kick');
          if (k === 125) this.p1.startAttack('sweep');
          if (k === 160) this.p2.startAttack('punch');
          // countdown
          if (k === 200) { this.setAnnounce('READY?', 40); VOICE.say('vo_ready'); }
          if (k === 245) { this.setAnnounce('3', 26); VOICE.say('vo_3'); }
          if (k === 275) { this.setAnnounce('2', 26); VOICE.say('vo_2'); }
          if (k === 305) { this.setAnnounce('1', 26); VOICE.say('vo_1'); }
        } else {
          if (k === 60) { this.setAnnounce('READY?', 32); VOICE.say('vo_ready'); }
        }
        const startAt = r1 ? 335 : 100;
        if (k >= startAt) {
          this.screen = 'fight';
          this.screenT = 0;
          this.setAnnounce('FIGHT!', 45);
          VOICE.say('vo_fight');
          this.p1.controllable = true;
          this.p2.controllable = true;
        }
        this.updateFight(true);
        break;
      }

      case 'fight':
        this.updateFight(false);
        // round timer
        if (!this.training && ++this.timerAcc >= 60) {
          this.timerAcc = 0;
          if (--this.timeLeft <= 0) this.endRound(true);
          else if (this.timeLeft === 10) VOICE.say('vo_hurry');
        }
        if (this.training) {
          if (keysPressed.has('KeyB')) this.hitboxView = !this.hitboxView;
          if (this.frame - (this.lastDmgF || 0) > 110) {
            for (const f of [this.p1, this.p2]) {
              if (f.hp < MAX_HP && f.state !== 'hit' && f.state !== 'down' && f.state !== 'ko') {
                f.hp = f.hpGhost = MAX_HP;
              }
            }
            this.p1.meter = 100;
          }
        }
        break;

      case 'roundend': {
        if (this.flawless && this.screenT === 60) {
          this.setAnnounce('FLAWLESS VICTORY', 75);
          VOICE.say('vo_flawless');
          this.flawless = false;
        }
        // winner performs a victory kata over the fallen opponent
        const v = this.victor;
        if (v && v.hp > 0 && v.grounded) {
          if (v.state === 'win' && this.screenT >= 70) { v.state = 'idle'; }
          if (this.screenT === 75) v.startAttack('punch');
          if (this.screenT === 120) v.startAttack('kick');
          if (this.screenT === 165) v.startAttack('risingSlash');
        }
        this.updateFight(true);
        if (this.screenT > 240) {
          if (this.wins1 >= ROUNDS_TO_WIN || this.wins2 >= ROUNDS_TO_WIN) {
            this.screen = 'matchend';
            this.screenT = 0;
            const winner = this.wins1 >= ROUNDS_TO_WIN ? this.p1 : this.p2;
            if (this.arcade) {
              if (winner === this.p1) {
                const last = this.arcadeIdx >= this.ladder.length - 1;
                this.setAnnounce('VICTORY!', 9999, last ? 'ENTER — CLAIM THE CROWN' : 'ENTER — NEXT OPPONENT');
                VOICE.say('vo_winner');
              } else {
                this.setAnnounce('GAME OVER', 9999, 'ENTER — TRY AGAIN · ESC — QUIT');
                VOICE.say('vo_game_over');
              }
            } else {
              this.setAnnounce(winner.char.name + ' WINS!', 9999, winner.char.taunt);
              if (this.vsCpu) VOICE.say(winner === this.p1 ? 'vo_you_win' : 'vo_you_lose');
              else VOICE.say('vo_congrats');
            }
          } else {
            this.round++;
            this.startRound();
          }
        }
        break;
      }

      case 'matchend': {
        const v = this.victor;
        if (v && v.state !== 'ko' && v.state !== 'down' && v.grounded && !v.attack &&
            this.screenT % 120 === 60) {
          if (v.state === 'win') v.state = 'idle';
          const seq = ['punch', 'kick', 'sweep', 'risingSlash', 'dashSlash'];
          v.startAttack(seq[Math.floor(this.screenT / 120) % seq.length]);
        }
        this.updateFight(true);
        if (this.arcade) {
          if (keysPressed.has('Escape')) { this.screen = 'title'; this.screenT = 0; this.arcade = false; break; }
          if (keysPressed.has('Enter') && this.screenT > 40) {
            SFX.confirm();
            if (this.victor === this.p1) {
              this.arcadeIdx++;
              if (this.arcadeIdx >= this.ladder.length) {
                this.screen = 'arcadewin';
                this.screenT = 0;
                VOICE.say('vo_congrats');
              } else {
                this.sel2 = this.ladder[this.arcadeIdx];
                this.stageIdx = this.arcadeIdx % STAGES.length;
                this.startMatch();
              }
            } else {
              this.startMatch();   // retry same opponent
            }
          }
          break;
        }
        if (keysPressed.has('Enter')) { this.screen = 'title'; this.screenT = 0; SFX.confirm(); }
        break;
      }

      case 'arcadewin':
        this.updateFight(true);
        if (keysPressed.has('Enter') && this.screenT > 60) {
          this.screen = 'title'; this.screenT = 0; this.arcade = false; SFX.confirm();
        }
        break;
    }

    if (this.announce) {
      this.announce.t++;
      if (this.announce.t > this.announce.dur) this.announce = null;
    }

    keysPressed.clear();
    TOUCH.queue.clear();
  }

  updateFight(frozen) {
    if (!this.p1) return;
    if (this.hitstop > 0) { this.hitstop--; return; }   // impact freeze
    if (this.slowmo > 0) {
      this.slowmo--;
      if ((this.frame & 1) === 0) return;   // cinematic half speed
    }
    this.updateBlood();
    const pad1 = frozen ? { ...EMPTY_PAD } : mergePads(mergeTouchPad(readPad(P1_KEYS)), GAMEPAD.pads[0]);
    const pad2 = frozen || this.training ? { ...EMPTY_PAD }
      : this.vsCpu ? cpuThink(this.p2, this.p1, this) : mergePads(readPad(P2_KEYS), GAMEPAD.pads[1]);

    for (const f of [this.p1, this.p2]) {
      if (f.hpGhost > f.hp) f.hpGhost = Math.max(f.hp, f.hpGhost - 0.55);
      else f.hpGhost = f.hp;
    }
    if (this.combo.timer > 0 && --this.combo.timer === 0) this.combo.count = 0;
    if (this.floats) this.floats = this.floats.filter(ft => ++ft.t < 60);
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
        else {
          this.hitstop = 7;
          if (target.hp <= 0) this.slowmo = 110;
          else this.slowmo = 18;
          this.shake = target.hp <= 0 ? 14 : 7;
          this.spawnBlood(pr.x, pr.y, Math.sign(pr.vx) || 1, target.hp <= 0 ? 55 : 20);
          SFX.specialHit();
          pr.owner.meter = Math.min(100, pr.owner.meter + 9);
          this.registerCombo(pr.owner);
        }
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
    const a = attacker.attack;
    if (!a) return;
    if (a.hasHit && !(a.def.rehit && a.t - (a.lastHitT || 0) >= a.def.rehit)) return;
    const hb = attacker.attackBox();
    if (!hb) return;
    if (defender.state === 'down' || defender.state === 'ko') return;
    if (defender.invulnT > 0) return;
    if (!rectsOverlap(hb, defender.body)) return;

    a.hasHit = true;
    a.lastHitT = a.t;
    const def = a.def;

    // throws beat block, whiff on airborne opponents
    if (def.isThrow) {
      if (!defender.grounded) return;
      const dir = defender.x >= attacker.x ? 1 : -1;
      defender.hp = Math.max(0, defender.hp - 10);
      defender.attack = null;
      defender.state = defender.hp <= 0 ? 'ko' : 'hit';
      defender.stateT = 0;
      defender.vy = -9;
      defender.vx = dir * 7;
      defender.y -= 2;
      if (defender.hp <= 0) SFX.ko(); else SFX.fall();
      attacker.meter = Math.min(100, attacker.meter + 12);
      this.hitstop = 8;
      this.shake = 9;
      this.spawnBlood(defender.x, defender.y - 120, dir, 14);
      this.sparks.push(new HitSpark(defender.x, defender.y - 120, false));
      this.registerCombo(attacker);
      this.checkKO();
      return;
    }

    const blocked = defender.canBlock(defenderPad);
    const sparkX = (Math.max(hb.x, defender.body.x) + Math.min(hb.x + hb.w, defender.body.x + defender.body.w)) / 2;
    const sparkY = hb.y + hb.h / 2;
    this.sparks.push(new HitSpark(sparkX, sparkY, blocked));
    // counter-hit: interrupted the defender's own startup
    const counter = !blocked && defender.attack && defender.attack.t < defender.attack.st;
    // combo damage scaling
    let dmg = Math.round(def.damage * (attacker.char.power || 1));
    if (!blocked) {
      dmg = Math.max(1, Math.round(dmg * Math.pow(0.9, Math.max(0, this.comboCount(attacker) - 1))));
      if (counter) dmg = Math.round(dmg * 1.3);
    }
    defender.receiveHit(dmg, def.kb, !!def.knockdown, attacker.x, blocked);
    if (counter) {
      defender.stateT = -8;   // extended stun
      this.floatText('COUNTER!', defender.x, defender.y - 200, '#ff5040');
    }
    attacker.meter = Math.min(100, attacker.meter + (blocked ? 5 : 11));
    defender.meter = Math.min(100, defender.meter + (blocked ? 3 : 8));
    if (!blocked) this.registerCombo(attacker);
    if (blocked && def.chip) defender.hp = Math.max(1, defender.hp - def.chip);
    if (!blocked) {
      this.hitstop = def.special ? 12 : 9;
      if (defender.hp <= 0) this.slowmo = 110;
      else if (def.special) this.slowmo = 26;
      this.shake = defender.hp <= 0 ? 14 : 8;
      const dir = defender.x >= attacker.x ? 1 : -1;
      let amount = def.damage * 2 + (def.knockdown ? 8 : 0) + (def.special ? 8 : 0);
      if (defender.hp <= 0) amount += 40;   // fatal spray
      this.spawnBlood(sparkX, sparkY, dir, amount);
      if (def.special) SFX.specialHit();
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
    // dead-even time-out -> one-hit sudden death instead of a dull tie
    if (timeUp && this.p1.hp === this.p2.hp && !this.suddenDeath) {
      this.suddenDeath = true;
      this.p1.hp = this.p1.hpGhost = 1;
      this.p2.hp = this.p2.hpGhost = 1;
      this.timeLeft = 20;
      this.setAnnounce('SUDDEN DEATH', 80);
      VOICE.say('vo_sudden');
      return;
    }
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
      this.flawless = winner.hp >= MAX_HP;
    }
    if (winner === this.p1) this.wins1++;
    else if (winner === this.p2) this.wins2++;
    if (winner && winner.state !== 'ko' && winner.state !== 'down') {
      winner.state = 'win';
      winner.stateT = 0;
      winner.attack = null;
    }
    this.victor = winner || null;
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
      const st = STAGES[this.stageIdx || 0];
      if (st.moon) {
        c.save();
        c.globalCompositeOperation = 'screen';
        c.globalAlpha = 0.65;
        dot(c, 170, 95, 60, st.moon);
        c.globalAlpha = 0.22;
        dot(c, 170, 95, 85, st.moon);
        c.restore();
      }
      // gentle vignette for fighter contrast
      c.fillStyle = 'rgba(0,0,10,0.12)';
      c.fillRect(0, 0, W, H);
      if (st.tint) { c.fillStyle = st.tint; c.fillRect(0, 0, W, H); }
      if (this.weather === 'rain') { c.fillStyle = 'rgba(14,22,52,0.28)'; c.fillRect(0, 0, W, H); }
      if (this.weather === 'storm') { c.fillStyle = 'rgba(10,16,46,0.4)'; c.fillRect(0, 0, W, H); }
    } else {
      c.fillStyle = '#101018';
      c.fillRect(0, 0, W, H);
    }
  }

  drawHud(c) {
    const barW = 330, barH = 20, y = 30;
    const cx = W / 2;
    const x1 = cx - 64 - barW, x2 = cx + 64;
    const drawBar = (x, hp, ghost, anchorRight) => {
      c.fillStyle = '#101010';
      c.fillRect(x - 3, y - 3, barW + 6, barH + 6);
      c.fillStyle = '#b81616';
      c.fillRect(x, y, barW, barH);
      const gw = barW * (ghost / MAX_HP);
      c.fillStyle = '#ff7030';   // damage trail
      c.fillRect(anchorRight ? x + barW - gw : x, y, gw, barH);
      const w = barW * (hp / MAX_HP);
      c.fillStyle = '#ffd820';
      c.fillRect(anchorRight ? x + barW - w : x, y, w, barH);
      c.fillStyle = 'rgba(255,255,255,0.3)';
      c.fillRect(x, y + 2, barW, 3);
      c.strokeStyle = '#f8f8f8';
      c.lineWidth = 2;
      c.strokeRect(x - 2, y - 2, barW + 4, barH + 4);
    };
    drawBar(x1, this.p1.hp, this.p1.hpGhost, true);
    drawBar(x2, this.p2.hp, this.p2.hpGhost, false);

    // central KO badge
    dot(c, cx, y + barH / 2, 24, '#6e0a0a');
    dot(c, cx, y + barH / 2, 20, '#c81414');
    c.font = 'bold 20px Impact, "Arial Black", sans-serif';
    c.textAlign = 'center';
    c.fillStyle = '#ffd820';
    c.fillText('KO', cx, y + barH / 2 + 7);

    // timer below the badge
    const tstr = String(this.timeLeft == null ? ROUND_TIME : this.timeLeft).padStart(2, '0');
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

    // super meter bars
    const mY = y + barH + 30;
    const mW = 220;
    const drawMeter = (x, f, anchorRight) => {
      c.fillStyle = 'rgba(0,0,0,0.5)';
      c.fillRect(x, mY, mW, 9);
      const w = mW * (f.meter / 100);
      const full = f.meter >= 100;
      c.fillStyle = full ? (Math.floor(this.frame / 5) % 2 ? '#ffffff' : '#40d0ff') : '#2898e8';
      c.fillRect(anchorRight ? x + mW - w : x, mY, w, 9);
      c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.lineWidth = 1.5;
      c.strokeRect(x, mY, mW, 9);
      if (full) {
        c.font = 'bold 12px "Courier New", monospace';
        c.fillStyle = '#fff';
        c.textAlign = anchorRight ? 'left' : 'right';
        c.fillText('SUPER READY', anchorRight ? x + mW + 8 : x - 8, mY + 9);
      }
    };
    drawMeter(x1, this.p1, true);
    drawMeter(x2 + barW - mW, this.p2, false);

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
    this.drawRain(c);
    this.drawLeaves(c);

    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(0, 0, W, H);

    // slash arc behind the title
    const sw = 1 - Math.pow(1 - Math.min(1, this.demoT / 40), 3);
    c.save();
    c.translate(W / 2, 195);
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineCap = 'round';
    c.shadowColor = '#aac4ff';
    c.shadowBlur = 22;
    c.lineWidth = 7;
    c.beginPath();
    c.arc(0, 70, 330, Math.PI * 1.12, Math.PI * (1.12 + 0.76 * sw));
    c.stroke();
    c.restore();

    c.textAlign = 'center';
    c.font = 'bold 108px Impact, "Arial Black", sans-serif';
    c.lineWidth = 11;
    c.strokeStyle = '#1a0a08';
    c.strokeText('SWIFT SWORD', W / 2, 230);
    const grad = c.createLinearGradient(0, 130, 0, 240);
    grad.addColorStop(0, '#f4f6ff');
    grad.addColorStop(0.5, '#c8d4e8');
    grad.addColorStop(0.52, '#8a1414');
    grad.addColorStop(1, '#d03010');
    c.fillStyle = grad;
    c.fillText('SWIFT SWORD', W / 2, 230);

    c.font = 'bold 20px "Courier New", monospace';
    c.fillStyle = '#ffd060';
    c.fillText('— A SAMURAI DUEL IN THE OAK WOODS —', W / 2, 290);

    if (Math.floor(this.demoT / 30) % 2 === 0) {
      c.font = 'bold 26px "Courier New", monospace';
      c.fillStyle = '#fff';
      c.fillText('PRESS ENTER', W / 2, 420);
    }
    c.font = 'bold 16px "Courier New", monospace';
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillText('free CC0/free-license art: LuizMelo · brullov · Kenney · FreePD', W / 2, 500);
  }

  drawMode(c) {
    this.drawStage(c);
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.fillRect(0, 0, W, H);
    c.textAlign = 'center';
    c.font = 'bold 48px Impact, "Arial Black", sans-serif';
    c.fillStyle = '#ffd060';
    c.fillText('SELECT MODE', W / 2, 160);

    const opts = ['ARCADE', 'VS CPU', '2 PLAYERS', 'TRAINING', 'OPTIONS'];
    c.font = 'bold 30px "Courier New", monospace';
    opts.forEach((o, i) => {
      const sel = this.modeIdx === i;
      c.fillStyle = sel ? '#fff' : 'rgba(255,255,255,0.45)';
      c.fillText((sel ? '▶ ' : '  ') + o + (sel ? ' ◀' : '  '), W / 2, 215 + i * 52);
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
      const cx = W / 2 + (i - (CHARACTERS.length - 1) / 2) * 215;
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
    c.fillText(this.vsCpu ? 'P2: CPU'
      : TOUCH.enabled ? 'P2: tap a card' : 'P2: ←/→ move — K confirm', W / 2 + 240, 470);
  }

  comboCount(attacker) {
    return this.combo.owner === attacker ? this.combo.count + 1 : 1;
  }

  registerCombo(attacker) {
    this.lastDmgF = this.frame;
    if (this.combo.owner === attacker && this.combo.timer > 0) this.combo.count++;
    else { this.combo.owner = attacker; this.combo.count = 1; }
    this.combo.timer = 55;
    if (this.combo.count === 3) VOICE.say('vo_combo');
    if (this.combo.count >= 2) {
      this.floatText(this.combo.count + ' HIT COMBO', attacker === this.p1 ? 200 : W - 200, 160,
        attacker.char.fireball);
    }
  }

  floatText(text, x, y, color) {
    if (!this.floats) this.floats = [];
    this.floats.push({ text, x, y, color, t: 0 });
  }

  spawnBlood(x, y, dir, n) {
    if (!OPTIONS.blood) return;
    if (!this.blood) { this.blood = []; this.stains = []; }
    for (let i = 0; i < n; i++) {
      if (this.blood.length > 260) break;
      const a = Math.random() * Math.PI - Math.PI / 2;
      const sp = 2 + Math.random() * 6.5;
      this.blood.push({
        x, y,
        vx: dir * Math.abs(Math.cos(a)) * sp + (Math.random() - 0.5) * 2.5,
        vy: -Math.abs(Math.sin(a)) * sp - 2 - Math.random() * 3,
        r: 1.5 + Math.random() * 3,
        t: 0,
        floor: GROUND + 4 + Math.random() * 28,
      });
    }
  }

  updateBlood() {
    if (!this.blood) return;
    for (const b of this.blood) {
      b.t++;
      b.vy += 0.5;
      b.x += b.vx;
      b.y += b.vy;
      if (b.y >= b.floor) {
        if (this.stains.length < 140) {
          this.stains.push({
            x: b.x, y: Math.min(H - 30, b.floor),
            rx: b.r * (2 + Math.random() * 2.2), ry: b.r * (0.6 + Math.random() * 0.5),
            a: 0.7,
          });
        }
        b.t = 999;
      }
    }
    this.blood = this.blood.filter(b => b.t < 90 && b.x > -20 && b.x < W + 20);
    for (const s of this.stains) s.a -= 0.0011;
    this.stains = this.stains.filter(s => s.a > 0.03);
  }

  drawStains(c) {
    if (!this.stains) return;
    c.save();
    c.fillStyle = '#7a0d0d';
    for (const s of this.stains) {
      c.globalAlpha = Math.min(0.7, s.a);
      c.beginPath();
      c.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  drawBloodDrops(c) {
    if (!this.blood) return;
    c.save();
    c.globalAlpha = 0.9;
    for (const b of this.blood) {
      c.fillStyle = b.t % 3 ? '#b01515' : '#8a0f0f';
      c.beginPath();
      c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  drawStageSelect(c) {
    this.drawStage(c);
    c.fillStyle = 'rgba(0,0,0,0.62)';
    c.fillRect(0, 0, W, H);
    c.textAlign = 'center';
    c.font = 'bold 44px Impact, "Arial Black", sans-serif';
    c.fillStyle = '#ffd060';
    c.fillText('CHOOSE THE BATTLEGROUND', W / 2, 110);
    STAGES.forEach((st, i) => {
      const cx = W / 2 + (i - (STAGES.length - 1) / 2) * 280;
      const cy = 270;
      const sel = this.stageIdx === i;
      // mini preview
      c.save();
      c.beginPath();
      c.rect(cx - 120, cy - 70, 240, 140);
      c.clip();
      if (BG_IMG.complete && BG_IMG.naturalWidth) c.drawImage(BG_IMG, cx - 120, cy - 70, 240, 140);
      if (st.tint) { c.fillStyle = st.tint; c.fillRect(cx - 120, cy - 70, 240, 140); }
      if (st.moon) { c.globalAlpha = 0.8; dot(c, cx - 75, cy - 40, 18, st.moon); c.globalAlpha = 1; }
      c.restore();
      c.strokeStyle = sel ? '#ffd820' : 'rgba(255,255,255,0.35)';
      c.lineWidth = sel ? 5 : 2;
      c.strokeRect(cx - 120, cy - 70, 240, 140);
      c.font = 'bold 19px "Courier New", monospace';
      c.fillStyle = sel ? '#fff' : 'rgba(255,255,255,0.5)';
      c.fillText(st.name, cx, cy + 100);
    });
    c.font = 'bold 18px "Courier New", monospace';
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.fillText('A/D or ←/→ choose — ENTER to fight', W / 2, 440);
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

  drawHitboxes(c) {
    c.save();
    c.lineWidth = 2;
    for (const f of [this.p1, this.p2]) {
      const b = f.body;
      c.strokeStyle = '#30ff70';
      c.strokeRect(b.x, b.y, b.w, b.h);
      const hb = f.attackBox();
      if (hb) { c.strokeStyle = '#ff4040'; c.strokeRect(hb.x, hb.y, hb.w, hb.h); }
    }
    c.restore();
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
    // cinematic punch-in during slow motion
    const targetZoom = this.slowmo > 0 ? 1.22 : 1;
    this.zoom += (targetZoom - this.zoom) * 0.08;
    if (this.zoom > 1.004) {
      const span = (W / 2) * (1 - 1 / this.zoom);
      const mid = clamp((this.p1.x + this.p2.x) / 2, W / 2 - span, W / 2 + span);
      this.camX += (mid - this.camX) * 0.1;
      c.translate(W / 2, 330);
      c.scale(this.zoom, this.zoom);
      c.translate(-this.camX, -330);
    } else {
      this.camX = W / 2;
    }
    this.drawStage(c);
    // draw the fighter farther from camera first (the one who is knocked down draws under)
    const order = [this.p1, this.p2];
    if (this.p1.state === 'down' || this.p1.state === 'ko') { /* p1 first by default */ }
    else if (this.p2.state === 'down' || this.p2.state === 'ko') order.reverse();
    this.drawStains(c);
    this.drawGhosts(c, order[0]);
    this.drawGhosts(c, order[1]);
    order[0].draw(c);
    order[1].draw(c);
    this.drawSlashTrail(c, order[0]);
    this.drawSlashTrail(c, order[1]);
    for (const pr of this.projectiles) pr.draw(c);
    for (const s of this.sparks) s.draw(c);
    this.drawBloodDrops(c);
    this.drawBolt(c);
    this.drawRain(c);
    this.drawLeaves(c);
    this.drawFireflies(c);
    if (this.hitboxView) this.drawHitboxes(c);
    this.drawCallout(c, order[0]);
    this.drawCallout(c, order[1]);
    if (this.floats) {
      for (const ft of this.floats) {
        c.save();
        c.globalAlpha = Math.max(0, 1 - ft.t / 60);
        c.font = 'bold 24px Impact, "Arial Black", sans-serif';
        c.textAlign = 'center';
        c.lineWidth = 4;
        c.strokeStyle = '#140826';
        c.strokeText(ft.text, ft.x, ft.y - ft.t * 0.5);
        c.fillStyle = ft.color;
        c.fillText(ft.text, ft.x, ft.y - ft.t * 0.5);
        c.restore();
      }
    }
    c.restore();
    this.drawFlash(c);
    if (this.superFlash > 0) {
      c.save();
      c.globalAlpha = Math.min(0.55, this.superFlash / 26 * 0.55);
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, W, H);
      c.restore();
      this.superFlash--;
    }
    // cinematic letterbox bars
    const targetBar = this.slowmo > 0 || this.screen === 'roundend' || this.screen === 'matchend' ? 42 : 0;
    this.letterbox += (targetBar - this.letterbox) * 0.12;
    if (this.letterbox > 0.5) {
      c.fillStyle = '#000';
      c.fillRect(0, 0, W, this.letterbox);
      c.fillRect(0, H - this.letterbox, W, this.letterbox);
    }
    this.drawHud(c);
    this.drawAnnounce(c);

    if (this.screen === 'fight' && this.screenT < 240 && this.round === 1) {
      c.font = 'bold 18px "Courier New", monospace';
      c.textAlign = 'center';
      c.fillStyle = 'rgba(255,255,255,0.75)';
      c.fillText(TOUCH.enabled
        ? 'Drag left side to move · tap buttons to attack · hold away from foe to block'
        : 'F/G attack · specials ↓→F/↓→G/↓↓F · H=super(full bar) · fwd+F close=throw · 2xTap=dash', W / 2, H - 14);
    }
  }

  drawTouchControls(c) {
    if (!TOUCH.enabled) return;
    const fighting = this.screen === 'fight' || this.screen === 'intro' || this.screen === 'roundend';
    if (!fighting) return;
    c.save();
    // pause button
    c.globalAlpha = 0.5;
    c.fillStyle = '#fff';
    c.fillRect(W / 2 - 14, 116, 9, 24);
    c.fillRect(W / 2 + 5, 116, 9, 24);
    // floating stick
    const o = TOUCH.stickOrigin || { x: 140, y: H - 120 };
    c.globalAlpha = TOUCH.stickOrigin ? 0.4 : 0.22;
    c.strokeStyle = '#ffffff';
    c.lineWidth = 3;
    c.beginPath(); c.arc(o.x, o.y, 58, 0, Math.PI * 2); c.stroke();
    const k = TOUCH.stickPos || o;
    const kx = clamp(k.x, o.x - 44, o.x + 44), ky = clamp(k.y, o.y - 44, o.y + 44);
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(kx, ky, 24, 0, Math.PI * 2); c.fill();
    // buttons
    for (const b of TOUCH_BUTTONS) {
      if (b.needsMeter && (!this.p1 || this.p1.meter < 100)) continue;
      const held = Object.values(TOUCH.held).includes(b.id) || TOUCH.queue.has(b.id);
      c.globalAlpha = held ? 0.65 : 0.3;
      c.fillStyle = b.color;
      c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2); c.fill();
      c.globalAlpha = held ? 0.95 : 0.55;
      c.strokeStyle = '#ffffff';
      c.lineWidth = 2.5;
      c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#ffffff';
      c.font = 'bold ' + (b.r > 40 ? 16 : 12) + 'px "Courier New", monospace';
      c.textAlign = 'center';
      c.fillText(b.label, b.x, b.y + 5);
    }
    c.restore();
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
      case 'options': this.drawStage(c); c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, W, H); this.drawOptionsPanel(c); break;
      case 'select': this.drawSelect(c); break;
      case 'stagesel': this.drawStageSelect(c); break;
      case 'arcadewin': {
        this.drawStage(c);
        c.fillStyle = 'rgba(4,2,12,0.78)';
        c.fillRect(0, 0, W, H);
        if (this.p1) {
          const ch = this.p1.char;
          const img = SHEETS[ch.id] && SHEETS[ch.id].Idle;
          if (img && img.complete && ch.face) {
            c.save();
            c.imageSmoothingEnabled = false;
            c.translate(W / 2, 215);
            c.scale(7 * (ch.baseFacing || 1), 7);
            c.drawImage(img, ch.face.x, ch.face.y, ch.face.s, ch.face.s, -ch.face.s / 2, -ch.face.s / 2, ch.face.s, ch.face.s);
            c.restore();
          }
          c.textAlign = 'center';
          c.font = 'bold 64px Impact, "Arial Black", sans-serif';
          c.lineWidth = 9;
          c.strokeStyle = '#3a1500';
          c.strokeText('CHAMPION', W / 2, 400);
          const grad = c.createLinearGradient(0, 340, 0, 400);
          grad.addColorStop(0, '#fff0a0');
          grad.addColorStop(1, '#ff8020');
          c.fillStyle = grad;
          c.fillText('CHAMPION', W / 2, 400);
          c.font = 'bold 22px "Courier New", monospace';
          c.fillStyle = '#fff';
          c.fillText(this.p1.char.name + ' HAS CONQUERED THE OAK WOODS', W / 2, 445);
          if (Math.floor(this.screenT / 30) % 2 === 0) {
            c.font = 'bold 18px "Courier New", monospace';
            c.fillText('PRESS ENTER', W / 2, 495);
          }
        }
        break;
      }
      case 'versus': this.drawVersus(c); break;
      default: this.drawFightScreen(c); break;
    }
    this.drawTouchControls(c);
    if (this.paused) this.drawPauseOverlay(c);
  }
}

// ---------------- PixiJS post-processing layer ----------------
// The 960x540 game buffer becomes a GPU texture; a CRT + bloom filter stack is
// applied on the way to the screen. Falls back to a plain 2D blit when WebGL or
// Pixi is unavailable (older browsers, headless tests) so the game always runs.
const FX = { app: null, tex: null, sprite: null, crt: null, bloom: null, on: false };
function initPixi() {
  if (typeof PIXI === 'undefined' || !canvas.addEventListener) return false;
  try {
    const big = !(typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches);
    const rw = big ? 1920 : 1280, rh = big ? 1080 : 720;
    FX.app = new PIXI.Application({ view: canvas, width: rw, height: rh,
      backgroundColor: 0x000000, antialias: false, powerPreference: 'high-performance' });
    FX.app.ticker.stop();
    FX.tex = PIXI.Texture.from(gameCanvas);
    FX.tex.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
    FX.sprite = new PIXI.Sprite(FX.tex);
    FX.sprite.width = rw;
    FX.sprite.height = rh;
    FX.app.stage.addChild(FX.sprite);
    const F = PIXI.filters;
    FX.bloom = new F.AdvancedBloomFilter({ threshold: 0.5, bloomScale: 0.85, brightness: 1, blur: 5, quality: 6 });
    FX.crt = new F.CRTFilter({ curvature: 2, lineWidth: 2.4, lineContrast: 0.2,
      noise: 0.07, noiseSize: 1, vignetting: 0.34, vignettingAlpha: 0.72, vignettingBlur: 0.4 });
    applyFX();
    return true;
  } catch (e) { return false; }
}
function applyFX() {
  if (!FX.sprite) return;
  const list = [];
  if (OPTIONS.fx >= 2) list.push(FX.bloom);
  if (OPTIONS.fx >= 1) list.push(FX.crt);
  FX.sprite.filters = list.length ? list : null;
}

// ---------------- Main loop ----------------
const game = new Game();
window.game = game;   // exposed for debugging/testing
let last = 0, acc = 0;
const STEP = 1000 / 60;
let pixiTried = false;

function render() {
  if (!pixiTried) { pixiTried = true; FX.on = initPixi(); }
  ctx.imageSmoothingEnabled = false;   // keep pixel art crisp
  game.draw(ctx);
  if (FX.on) {
    if (FX.crt && OPTIONS.fx >= 1) FX.crt.time += 0.6;
    FX.tex.update();
    FX.app.render();
  } else {
    if (!viewCtx) { try { viewCtx = canvas.getContext('2d'); } catch (e) { viewCtx = null; } }
    if (viewCtx) {
      viewCtx.imageSmoothingEnabled = false;
      viewCtx.drawImage(gameCanvas, 0, 0, canvas.width, canvas.height);
    }
  }
}

function loop(ts) {
  if (!last) last = ts;
  acc += Math.min(100, ts - last);
  last = ts;
  while (acc >= STEP) { game.update(); acc -= STEP; }
  render();
  requestAnimationFrame(loop);
}

// PWA: offline cache (https / localhost only)
if (typeof navigator !== 'undefined' && navigator.serviceWorker &&
    typeof location !== 'undefined' && location.protocol && location.protocol.indexOf('http') === 0) {
  try { navigator.serviceWorker.register('sw.js'); } catch (e) { /* unsupported */ }
}
requestAnimationFrame(loop);

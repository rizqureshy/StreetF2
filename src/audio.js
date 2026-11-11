// Swift Sword — audio. Recorded samples only (Kenney CC0 SFX + announcer,
// generated/FreePD music); nothing is synthesised at runtime.
import { OPTIONS } from './options.js';

let ctx = null;
let sfxGain = null, musicGain = null;
const SAMPLES = {};       // name -> { url, raw, buf, loading }

const SFX_FILES = {
  slice1: 'sfx/knife_slice.mp3', slice2: 'sfx/knife_slice_2.mp3',
  swing1: 'sfx/draw_knife_1.mp3', swing2: 'sfx/draw_knife_2.mp3', swing3: 'sfx/draw_knife_3.mp3',
  punchH1: 'sfx/impact_punch_heavy_000.mp3', punchH2: 'sfx/impact_punch_heavy_001.mp3', punchH3: 'sfx/impact_punch_heavy_002.mp3',
  punchM1: 'sfx/impact_punch_medium_000.mp3', punchM2: 'sfx/impact_punch_medium_001.mp3',
  chop: 'sfx/chop.mp3',
  metal1: 'sfx/impact_metal_light_000.mp3', metal2: 'sfx/impact_metal_light_001.mp3', metal3: 'sfx/impact_metal_medium_000.mp3',
  body1: 'sfx/impact_soft_heavy_000.mp3', body2: 'sfx/impact_soft_heavy_001.mp3',
  floor: 'sfx/impact_wood_heavy_000.mp3',
  gong: 'sfx/impact_bell_heavy_000.mp3',
  land1: 'sfx/footstep_wood_000.mp3', land2: 'sfx/footstep_wood_001.mp3',
  cloth1: 'sfx/cloth_1.mp3', cloth2: 'sfx/cloth_3.mp3',
  click1: 'sfx/click1.mp3', click2: 'sfx/click3.mp3',
  laser1: 'sfx/laser_large_000.mp3', laser2: 'sfx/laser_large_001.mp3',
  force1: 'sfx/force_field_000.mp3', force2: 'sfx/force_field_001.mp3', force3: 'sfx/force_field_002.mp3',
  expl1: 'sfx/explosion_crunch_000.mp3', expl2: 'sfx/explosion_crunch_001.mp3', expl3: 'sfx/explosion_crunch_002.mp3',
  vo_ready: 'vo/ready.mp3', vo_go: 'vo/go.mp3', vo_round: 'vo/round.mp3', vo_final_round: 'vo/final_round.mp3',
  vo_you_win: 'vo/you_win.mp3', vo_you_lose: 'vo/you_lose.mp3', vo_time_over: 'vo/time_over.mp3',
  vo_hurry: 'vo/hurry_up.mp3', vo_tie: 'vo/its_a_tie.mp3', vo_congrats: 'vo/congratulations.mp3',
  vo_1: 'vo/1.mp3', vo_2: 'vo/2.mp3', vo_3: 'vo/3.mp3', vo_fight: 'vo/fight.mp3',
  vo_round_1: 'vo/round_1.mp3', vo_round_2: 'vo/round_2.mp3', vo_round_3: 'vo/round_3.mp3',
  vo_choose: 'vo/choose_your_character.mp3', vo_p1: 'vo/player_1.mp3', vo_p2: 'vo/player_2.mp3',
  vo_prepare: 'vo/prepare_yourself.mp3', vo_combo: 'vo/combo.mp3', vo_flawless: 'vo/flawless_victory.mp3',
  vo_sudden: 'vo/sudden_death.mp3', vo_winner: 'vo/winner.mp3', vo_game_over: 'vo/game_over.mp3',
};
const MUSIC_FILES = {
  title: 'music/title.mp3', duel: 'music/duel.mp3', night: 'music/night.mp3', doom: 'music/doom.mp3', battle: 'music/battle.mp3',
};
const BASE = 'assets/';

function loadSample(name, url) {
  const s = SAMPLES[name] || (SAMPLES[name] = { url, raw: null, buf: null, loading: null });
  if (s.raw || s.buf || s.loading || typeof fetch !== 'function') return s.loading || Promise.resolve();
  s.loading = fetch(BASE + url).then(r => (r.ok ? r.arrayBuffer() : null)).then(a => {
    if (a) { s.raw = a; if (ctx) return decode(name); }
  }).catch(() => {}).finally(() => { s.loading = null; });
  return s.loading;
}
function decode(name) {
  const s = SAMPLES[name];
  if (!s || !s.raw || s.buf || !ctx) return Promise.resolve();
  const raw = s.raw; s.raw = null;
  return new Promise(res => ctx.decodeAudioData(raw, b => { s.buf = b; res(); }, () => res()));
}

export function preloadSfx() {
  return Promise.all(Object.entries(SFX_FILES).map(([n, u]) => loadSample(n, u)));
}

function init() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    sfxGain = ctx.createGain(); sfxGain.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.connect(ctx.destination);
    applyVolumes();
    for (const n of Object.keys(SAMPLES)) if (!n.startsWith('music_')) decode(n);
  }
  if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* retry on next gesture */ } }
}

// Full iOS unlock ritual: WebKit only counts some gesture types (notably
// touchend) for audio activation, and the hardware silent switch mutes
// WebAudio unless an HTML <audio> element flips the session to 'playback'.
let unlocked = false, silentEl = null;
export function unlockAudio() {
  init();
  if (!ctx) return;
  if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* later */ } }
  if (unlocked) return;
  try {
    const s = ctx.createBufferSource();
    s.buffer = ctx.createBuffer(1, 1, 22050);
    s.connect(ctx.destination); s.start(0);
  } catch (e) { /* ignore */ }
  try {
    silentEl = document.createElement('audio');
    silentEl.src = BASE + 'sfx/silence.mp3';
    silentEl.loop = true; silentEl.volume = 0.01;
    silentEl.setAttribute('playsinline', '');
    const p = silentEl.play();
    unlocked = true;
    if (p && p.catch) p.catch(() => { unlocked = false; });
  } catch (e) { /* ignore */ }
  if (Music.want) Music.play(Music.want);
}
if (typeof window !== 'undefined' && window.addEventListener) {
  for (const ev of ['pointerdown', 'touchend', 'keydown', 'click']) window.addEventListener(ev, unlockAudio, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) { try { ctx.suspend(); } catch (e) { /* ignore */ } }
    else { try { ctx.resume(); } catch (e) { /* ignore */ } }
  });
}

export function applyVolumes() {
  if (!ctx) return;
  sfxGain.gain.value = OPTIONS.sfxVol / 10;
  musicGain.gain.value = Music.muted ? 0 : 0.42 * (OPTIONS.musicVol / 10);
}

/** Play one of `names` (random pick). pan: -1..1 */
/** Capture hook: when enabled, every sample request is logged with the game clock (used to rebuild a soundtrack offline). */
export const AudioLog = { on: false, t: 0, events: [] };

export function play(names, vol = 1, jitter = 0.05, rate = 1, pan = 0) {
  if (AudioLog.on) AudioLog.events.push({ t: +AudioLog.t.toFixed(4), names: Array.isArray(names) ? names : [names], vol, rate, pan: +(+pan || 0).toFixed(2) });
  if (!ctx) return false;
  const list = Array.isArray(names) ? names : [names];
  const cands = list.filter(n => SAMPLES[n] && SAMPLES[n].buf);
  if (!cands.length) return false;
  const src = ctx.createBufferSource();
  src.buffer = SAMPLES[cands[Math.floor(Math.random() * cands.length)]].buf;
  src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * jitter);
  const g = ctx.createGain();
  g.gain.value = vol;
  let node = src.connect(g);
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); node = node.connect(p); }
  node.connect(sfxGain);
  src.start();
  return true;
}

export const say = (name, vol = 1) => play(name, vol, 0.015);

export const SFX = {
  hit: p => { play(['slice1', 'slice2'], 0.85, 0.05, 1, p); play(['punchH1', 'punchH2', 'punchH3'], 0.8, 0.05, 1, p); },
  heavyHit: p => { play(['slice1', 'slice2'], 0.95, 0.05, 0.86, p); play(['punchH1', 'punchH2', 'punchH3'], 1, 0.05, 0.84, p); play('chop', 0.55, 0.05, 0.9, p); },
  block: p => play(['metal1', 'metal2', 'metal3'], 0.75, 0.08, 1, p),
  clash: p => { play('metal3', 0.9, 0.05, 0.8, p); play(['expl1', 'expl2'], 0.3, 0.05, 1.3, p); },
  whoosh: p => play(['swing1', 'swing2', 'swing3'], 0.55, 0.1, 1, p),
  whooshHeavy: p => play(['swing1', 'swing2', 'swing3'], 0.7, 0.08, 0.74, p),
  jump: p => play(['cloth1', 'cloth2'], 0.7, 0.1, 1, p),
  dashStep: p => play(['cloth1', 'cloth2'], 0.6, 0.1, 1.3, p),
  land: p => play(['land1', 'land2'], 0.4, 0.1, 1, p),
  fall: p => { play(['body1', 'body2'], 0.9, 0.05, 1, p); play('floor', 0.5, 0.05, 1, p); },
  ko: p => { play(['body1', 'body2'], 1, 0.05, 0.9, p); play(['expl1', 'expl2', 'expl3'], 0.42, 0.05, 0.9, p); },
  sweep: p => { play(['punchM1', 'punchM2'], 0.85, 0.05, 1, p); play('chop', 0.5, 0.05, 1, p); },
  select: () => play('click1', 0.8, 0),
  confirm: () => play('click2', 0.9, 0),
  gong: () => play('gong', 0.85, 0),
  charge: p => { play(['laser1', 'laser2'], 0.4, 0.05, 1, p); play('force1', 0.25, 0.1, 1, p); },
  superCharge: p => { play('force2', 0.6, 0.05, 0.7, p); play(['laser1', 'laser2'], 0.45, 0.05, 0.8, p); },
  dash: p => { play(['slice1', 'slice2'], 0.7, 0.12, 1, p); play('force3', 0.4, 0.15, 1, p); },
  rising: p => { play('force2', 0.5, 0.08, 1, p); play(['slice1', 'slice2'], 0.6, 0.1, 1.1, p); },
  specialHit: p => play(['expl1', 'expl2', 'expl3'], 0.45, 0.05, 1, p),
  eruption: p => { play(['expl1', 'expl2', 'expl3'], 0.9, 0.05, 0.62, p); play('floor', 0.9, 0.05, 0.7, p); },
  thunder: () => { play(['expl1', 'expl2', 'expl3'], 0.5, 0.1, 0.42); },
};

// --- music: one decoded track at a time, cross-faded -----------------------
export const Music = {
  want: null, playing: null, src: null, trackGain: null, muted: false, token: 0,
  play(name) {
    this.want = name;
    if (!ctx || !name) return;
    if (this.playing === name) return;
    const token = ++this.token;
    const key = 'music_' + name;
    const s = SAMPLES[key] || (SAMPLES[key] = { url: MUSIC_FILES[name], raw: null, buf: null, loading: null });
    const start = () => {
      if (token !== this.token || !s.buf) return;
      this.fadeOut(0.5);
      const src = ctx.createBufferSource();
      src.buffer = s.buf; src.loop = true;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.9);
      src.connect(g).connect(musicGain);
      src.start();
      this.src = src; this.trackGain = g; this.playing = name;
      // drop other decoded tracks to keep memory down
      for (const [k, v] of Object.entries(SAMPLES)) if (k.startsWith('music_') && k !== key) v.buf = null;
    };
    if (s.buf) start();
    else (s.raw ? Promise.resolve() : loadSample(key, s.url)).then(() => decode(key)).then(start);
  },
  fadeOut(sec = 0.5) {
    const src = this.src, g = this.trackGain;
    this.src = null; this.trackGain = null; this.playing = null;
    if (!src || !ctx) return;
    try {
      g.gain.cancelScheduledValues(ctx.currentTime);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + sec);
      src.stop(ctx.currentTime + sec + 0.05);
    } catch (e) { try { src.stop(); } catch (e2) { /* already stopped */ } }
  },
  stop() { this.want = null; this.token++; this.fadeOut(0.4); },
  duck(on) {
    if (!this.trackGain || !ctx) return;
    this.trackGain.gain.cancelScheduledValues(ctx.currentTime);
    this.trackGain.gain.setTargetAtTime(on ? 0.35 : 1, ctx.currentTime, 0.15);
  },
  toggleMute() { this.muted = !this.muted; applyVolumes(); return this.muted; },
};

export const audioState = () => (ctx ? ctx.state : 'none');

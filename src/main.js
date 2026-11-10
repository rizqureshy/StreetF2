// Swift Sword — boot, game flow and the frame loop that ties the simulation
// to rendering, effects, audio and UI.
import * as THREE from 'three';
import { STEP, CHARACTERS, STAGES, DIFFICULTY, charById, stageById, STAGE_HALF } from './config.js';
import { Match } from './sim.js';
import { OPTIONS, saveOptions } from './options.js';
import { pollInput, readPad, endTick, drainNav, Touch } from './input.js';
import { SFX, say, Music, preloadSfx, applyVolumes, unlockAudio } from './audio.js';
import { loadAssets } from './assets.js';
import { Gfx, Director, QUALITY } from './gfx.js';
import { Stage } from './stage3d.js';
import { FX } from './fx.js';
import { FighterView } from './fighter3d.js';
import { UI } from './ui.js';

const params = new URLSearchParams(location.search);
const ui = new UI();
const sfx = name => SFX[name] && SFX[name]();

function webglOK() {
  try { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch (e) { return false; }
}
if (!webglOK()) {
  ui.fatal('Swift Sword needs WebGL 2, which this browser or device does not provide.<br><br>You can still play the <a href="classic/">classic 2D edition</a>.');
  throw new Error('WebGL2 unavailable');
}

const gfx = new Gfx(document.getElementById('view'));
const { scene, camera, renderer } = gfx;
const stage = new Stage(scene, renderer);
const fx = new FX(scene);
const director = new Director(camera);
stage.onThunder = () => { if (G.screen !== 'attract' || G.menuOpen) SFX.thunder(); };
gfx.onResize = () => fx.setPixelScale(gfx.pixelHeight, camera.fov);
gfx.onResize();

const post = { aberr: 0, flash: 0, flashColor: new THREE.Color(1, 1, 1), dark: 0, darkTarget: 0, darkT: 0, focus: new THREE.Vector2(0.5, 0.5), sat: 1.08, exposureBoost: 0, bloomBoost: 0 };

// --------------------------------------------------------------------------
// Game state
// --------------------------------------------------------------------------
const G = {
  screen: 'loading',      // loading | attract (title + menus over a demo fight) | select | stagesel | versus | match | result
  menuOpen: false,
  mode: 'arcade',         // arcade | cpu | versus | training | watch
  pick: [0, 1],           // roster indices
  stageIdx: 0,
  match: null,
  attract: false,         // current match is the title-screen demo
  views: [null, null],
  paused: false,
  slowT: 0, slowScale: 1,
  acc: 0, time: 0,
  arcade: null,           // { ladder: [{char, stage, alt}], idx }
  timers: [],             // { t, fn } real-time callbacks
  debug: params.has('debug'),
};
window.__game = { G, ui, gfx, director, stage, fx };

const STEP_MODE = params.has('step');
G.pendingSim = 0;
/**
 * Test hook: run `n` simulation ticks immediately. p1/p2 are optional
 * functions (tick index -> partial pad) for scripted input.
 */
window.__game.advance = (n, p1, p2) => {
  const blank = () => ({ left: false, right: false, up: false, down: false, light: false, heavy: false, wave: false, dash: false, rising: false, super: false });
  for (let i = 0; i < n; i++) {
    for (let k = G.timers.length - 1; k >= 0; k--) { const t = G.timers[k]; if ((t.t -= 1 / 60) <= 0) { G.timers.splice(k, 1); t.fn(); } }
    const m = G.match;
    if (!m || G.paused) continue;
    for (const f of m.fighters) { f.px = f.x; f.py = f.y; }
    for (const p of m.projectiles) p.px = p.x;
    const frozen = m.hitstop > 0;
    m.tick(G.attract ? null : Object.assign(blank(), p1 ? p1(i) : null), G.attract ? null : Object.assign(blank(), p2 ? p2(i) : null));
    if (!frozen) G.pendingSim += 1 / 60;
    drainEvents();
  }
  return G.match ? G.match.screen : G.screen;
};
const after = (sec, fn) => G.timers.push({ t: sec, fn });
const clearTimers = () => { G.timers.length = 0; };
const unlocked = c => !c.boss || OPTIONS.shuraUnlocked || params.has('unlock');

function setView(side, char, opts = {}) {
  const old = G.views[side];
  if (old) { scene.remove(old.group, old.trail.mesh); old.dispose(); }
  const v = new FighterView(char, opts);
  scene.add(v.group, v.trail.mesh);
  G.views[side] = v;
  return v;
}
function loadStage(idx) {
  G.stageIdx = idx;
  if (!stage.def || stage.def.id !== STAGES[idx].id || stage.quality !== gfx.quality) { stage.load(STAGES[idx], gfx.quality); fx.clearStains(); }
}

// --------------------------------------------------------------------------
// Flow
// --------------------------------------------------------------------------
function startMatch({ p1, p2, stageIdx, cpu, training = false, attract = false, alt = false, cinematic = true, tag = '' }) {
  clearTimers();
  loadStage(stageIdx);
  fx.reset();
  setView(0, p1); setView(1, p2, { alt: alt || p1.id === p2.id });
  G.match = new Match({ p1, p2, cpu, training, difficulty: OPTIONS.difficulty, cinematic: cinematic && !attract && !training });
  if (training) { G.match.p1.meter = 100; }
  G.attract = attract; G.paused = false; G.acc = 0; G.slowT = 0;
  G.screen = attract ? 'attract' : 'match';
  post.dark = post.darkTarget = 0;
  if (!attract) {
    ui.show('hud'); ui.hudInit(G.match, tag); ui.fighting(true); ui.hudVisible(!G.match.cinematic);
    ui.active = matchNav;
    Music.play(STAGES[stageIdx].music);
  }
  director.setShot('fight', 0, true);
  drainEvents();
}

function startAttract() {
  const a = Math.floor(Math.random() * 3), b = (a + 1 + Math.floor(Math.random() * 2)) % 3;
  startMatch({ p1: CHARACTERS[a], p2: CHARACTERS[b], stageIdx: Math.floor(Math.random() * STAGES.length), cpu: [true, true], attract: true });
  ui.fighting(false); ui.letterbox(false);
}

function goTitle() {
  if (!G.attract || !G.match) startAttract();
  G.menuOpen = false;
  Music.play('title');
  ui.openTitle(() => { sfx('confirm'); goMenu(); });
}

function goMenu(focus = 0) {
  if (!G.attract || !G.match) startAttract();
  G.screen = 'attract'; G.menuOpen = true;
  ui.fighting(false); ui.letterbox(false);
  Music.play('title');
  ui.openMenu({
    title: 'SWIFT SWORD', kanji: '剣', focus, sfx,
    items: [
      { label: 'ARCADE', sub: 'Climb the ladder. Face what waits in the ashes.', pick: () => startSelect('arcade') },
      { label: 'VERSUS CPU', sub: 'One duel against a fighter of your choosing.', pick: () => startSelect('cpu') },
      { label: 'TWO PLAYERS', sub: 'Share a keyboard, or plug in two gamepads.', pick: () => startSelect('versus') },
      { label: 'TRAINING', sub: 'Practice freely. Health and spirit refill.', pick: () => startSelect('training') },
      { label: 'WATCH', sub: 'Let two masters settle it while you study.', pick: () => startSelect('watch') },
      { label: 'HOW TO PLAY', pick: () => ui.openHelp(null) },
      { label: 'OPTIONS', pick: () => openOptions(() => goMenu(6)) },
      { label: 'CLASSIC 2D', sub: 'The original pixel edition.', pick: () => { location.href = 'classic/'; } },
    ],
    onBack: goTitle,
  });
}

function openOptions(back, keep = []) {
  const step = (key, d, lo, hi) => { OPTIONS[key] = Math.max(lo, Math.min(hi, OPTIONS[key] + d)); saveOptions(); applyVolumes(); };
  const qNames = ['auto', 'low', 'medium', 'high'];
  const setQ = d => {
    const i = (qNames.indexOf(OPTIONS.quality) + d + qNames.length) % qNames.length;
    gfx.setQuality(qNames[i]); saveOptions();
    stage.load(STAGES[G.stageIdx], gfx.quality);
  };
  ui.openMenu({
    title: 'OPTIONS', kanji: '道', center: true, keep, sfx,
    items: [
      { label: 'MUSIC', value: () => OPTIONS.musicVol * 10 + '%', left: () => step('musicVol', -1, 0, 10), right: () => step('musicVol', 1, 0, 10) },
      { label: 'SOUND', value: () => OPTIONS.sfxVol * 10 + '%', left: () => step('sfxVol', -1, 0, 10), right: () => { step('sfxVol', 1, 0, 10); } },
      { label: 'DIFFICULTY', value: () => DIFFICULTY[OPTIONS.difficulty], left: () => step('difficulty', -1, 0, 2), right: () => step('difficulty', 1, 0, 2) },
      { label: 'BLOOD', value: () => (OPTIONS.blood ? 'ON' : 'OFF'), left: () => { OPTIONS.blood = !OPTIONS.blood; saveOptions(); if (!OPTIONS.blood) fx.clearStains(); }, right: () => { OPTIONS.blood = !OPTIONS.blood; saveOptions(); if (!OPTIONS.blood) fx.clearStains(); } },
      { label: 'GRAPHICS', value: () => (OPTIONS.quality === 'auto' ? 'AUTO (' + gfx.quality.name + ')' : gfx.quality.name), left: () => setQ(-1), right: () => setQ(1) },
      { label: 'FULLSCREEN', pick: toggleFullscreen },
      { label: 'BACK', pick: back },
    ],
    hint: Touch.enabled ? 'Tap the left or right half of a row to change it' : 'A / D or ← / → to change  ·  Esc to go back',
    onBack: back,
  });
}
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
}

const MODE_TITLE = { arcade: 'ARCADE — CHOOSE YOUR FIGHTER', cpu: 'VERSUS CPU', versus: 'TWO PLAYERS', training: 'TRAINING', watch: 'WATCH — CHOOSE THE DUELISTS' };
function startSelect(mode) {
  G.mode = mode; G.screen = 'select'; G.match = null; G.attract = false; G.menuOpen = false;
  clearTimers(); fx.reset();
  loadStage(mode === 'arcade' ? 0 : G.stageIdx);
  ui.fighting(false); ui.letterbox(false);
  const two = mode !== 'arcade';
  setView(0, CHARACTERS[G.pick[0]]);
  setView(1, CHARACTERS[G.pick[1]], { alt: G.pick[0] === G.pick[1] });
  G.views[1].group.visible = two;
  director.setShot('select', 0, true);
  say('vo_choose');
  const label2 = mode === 'versus' ? 'P2' : mode === 'watch' ? 'CPU 2' : mode === 'training' ? 'DUMMY' : 'CPU';
  ui.openSelect({
    title: MODE_TITLE[mode], sfx, unlocked,
    players: [{ label: mode === 'watch' ? 'CPU 1' : 'P1', human: true }, { label: label2, human: mode === 'versus', pick: two, preview: two }],
    start: G.pick,
    onMove: (side, idx) => {
      G.pick[side] = idx;
      const other = G.views[1 - side];
      const v = setView(side, CHARACTERS[idx], { alt: side === 1 && G.pick[0] === G.pick[1] });
      if (!unlocked(CHARACTERS[idx])) for (const m of v.materials) m.color.setScalar(0.02);
      v.group.visible = side === 0 || two;
      if (other) other.group.visible = other === G.views[0] || two;
    },
    onLock: side => { G.views[side].flash = 1.2; fx.shock(side === 0 ? -1.55 : 1.55, 1.1, CHARACTERS[G.pick[side]].color, 1.6); say(side === 0 ? 'vo_p1' : 'vo_p2'); },
    onDone: () => after(0.45, () => (mode === 'arcade' ? startArcade() : startStageSelect())),
    onBack: () => goMenu(['arcade', 'cpu', 'versus', 'training', 'watch'].indexOf(mode)),
  });
}

function startStageSelect() {
  G.screen = 'stagesel';
  ui.openStages({
    start: G.stageIdx, sfx,
    onMove: idx => loadStage(idx),
    onPick: idx => { loadStage(idx); beginVersus({ p1: CHARACTERS[G.pick[0]], p2: CHARACTERS[G.pick[1]], stageIdx: idx }); },
    onBack: () => startSelect(G.mode),
  });
}

function startArcade() {
  const me = CHARACTERS[G.pick[0]];
  const others = CHARACTERS.filter(c => !c.boss && c.id !== me.id);
  const ladder = [
    { char: others[0], stage: 0 }, { char: others[1], stage: 2 },
    { char: me.boss ? charById('kurogane') : me, stage: 0, alt: true, sub: 'Your own shadow bars the way' },
    { char: charById('shura'), stage: 1, sub: 'Final battle' },
  ];
  if (me.boss) ladder[3] = { char: charById('shura'), stage: 1, alt: true, sub: 'Final battle' };
  G.arcade = { ladder, idx: 0 };
  nextArcade();
}
function nextArcade() {
  const a = G.arcade, r = a.ladder[a.idx];
  beginVersus({ p1: CHARACTERS[G.pick[0]], p2: r.char, stageIdx: r.stage, alt: !!r.alt, sub: `STAGE ${a.idx + 1} OF ${a.ladder.length}` + (r.sub ? ' — ' + r.sub.toUpperCase() : '') });
}

function beginVersus(o) {
  G.screen = 'versus'; G.match = null;
  clearTimers(); fx.reset();
  loadStage(o.stageIdx);
  setView(0, o.p1); setView(1, o.p2, { alt: o.alt || o.p1.id === o.p2.id });
  ui.fighting(false); ui.letterbox(true);
  ui.openVersus(o.p1, o.p2, STAGES[o.stageIdx], o.sub);
  director.setShot('versus', 0, true);
  SFX.gong(); say('vo_prepare');
  Music.play(STAGES[o.stageIdx].music);
  post.flash = 0.6; post.flashColor.set(0xffffff);
  const mode = G.mode;
  const cpu = mode === 'versus' ? [false, false] : mode === 'watch' ? [true, true] : [false, true];
  const tag = mode === 'training' ? 'TRAINING — health and spirit refill · Esc for the move list · B shows hit boxes' : mode === 'watch' ? 'WATCH MODE' : mode === 'arcade' ? `ARCADE · ${DIFFICULTY[OPTIONS.difficulty]}` : '';
  G.pending = Object.assign({ cpu, training: mode === 'training', tag }, o);
  const go = () => { if (G.screen !== 'versus') return; ui.active = null; startMatch(G.pending); };
  after(mode === 'training' ? 1.2 : 2.9, go);
  ui.active = { nav: a => { if (a === 'confirm') { clearTimers(); go(); } } };
}

function rematch() { ui.remove('result'); beginVersus(G.pending); }

function onMatchEnd(winner) {
  const m = G.match;
  if (G.attract) { after(4, () => { if (G.attract) { const open = G.menuOpen; startAttract(); G.menuOpen = open; } }); return; }
  const won = winner === m.p1;
  ui.letterbox(true);
  const show = o => after(1.1, () => { if (G.match === m) { ui.hudVisible(false); ui.openResult(Object.assign({ sfx }, o)); } });
  const quit = { label: 'MAIN MENU', pick: () => { ui.remove('result'); goMenu(); } };
  if (G.mode === 'arcade') {
    const a = G.arcade;
    if (won && a.idx >= a.ladder.length - 1) {
      say('vo_congrats');
      const first = !OPTIONS.shuraUnlocked;
      OPTIONS.shuraUnlocked = true; saveOptions();
      show({ title: 'THE BLADE REMAINS', kanji: '侍', quote: first ? 'The demon is sealed. SHURA may now be chosen.' : winner.char.taunt, color: winner.char.color, items: [{ label: 'RETURN', pick: () => { ui.remove('result'); goMenu(); } }] });
    } else if (won) {
      say('vo_winner');
      show({ title: winner.char.name + ' WINS', kanji: '勝', quote: winner.char.taunt, color: winner.char.color, items: [{ label: 'NEXT OPPONENT', pick: () => { ui.remove('result'); a.idx++; nextArcade(); } }, quit] });
    } else {
      say('vo_game_over');
      show({ title: 'DEFEAT', kanji: '敗', quote: winner.char.taunt, color: '#c2261c', items: [{ label: 'TRY AGAIN', pick: rematch }, quit] });
    }
    return;
  }
  if (G.mode === 'cpu') say(won ? 'vo_you_win' : 'vo_you_lose'); else say('vo_winner');
  show({ title: winner.char.name + ' WINS', kanji: G.mode === 'cpu' && !won ? '敗' : '勝', quote: winner.char.taunt, color: winner.char.color,
    items: [{ label: 'REMATCH', pick: rematch }, { label: 'CHANGE FIGHTERS', pick: () => { ui.remove('result'); startSelect(G.mode); } }, quit] });
}

// --- pause ---------------------------------------------------------------
function pause() {
  if (G.screen !== 'match' || G.paused || !G.match || G.match.screen === 'matchend') return;
  G.paused = true; Music.duck(true);
  const resume = () => { G.paused = false; Music.duck(false); ui.show('hud'); ui.active = matchNav; };
  const open = () => ui.openMenu({
    title: 'PAUSED', kanji: '止', center: true, keep: ['hud'], sfx,
    items: [
      { label: 'RESUME', pick: resume },
      { label: 'MOVE LIST', pick: () => ui.openHelp(G.match.p1.char) },
      { label: 'OPTIONS', pick: () => openOptions(open, ['hud']) },
      { label: 'RESTART MATCH', pick: () => { G.paused = false; Music.duck(false); startMatch(G.pending); } },
      { label: 'QUIT TO MENU', pick: () => { G.paused = false; Music.duck(false); goMenu(); } },
    ],
    onBack: resume,
  });
  open();
}
const matchNav = {
  nav: (a, player) => {
    const m = G.match;
    if (!m) return;
    if (a === 'pause' || a === 'back') pause();
    else if (a === 'confirm' && m.skipIntro()) { ui.clearCards(); director.setShot('fight'); ui.letterbox(false); ui.hudVisible(true); }
    else if (a === 'key' && player === 0) { /* handled below via raw codes */ }
  },
};
document.getElementById('pausebtn').addEventListener('click', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('keydown', e => {
  if (e.code === 'KeyB' && G.match && G.match.training) G.debug = !G.debug;
  if (e.code === 'KeyM') Music.toggleMute();
  if (e.code === 'F11' || (e.code === 'Enter' && e.altKey)) { e.preventDefault(); toggleFullscreen(); }
});

// --------------------------------------------------------------------------
// Simulation events -> presentation
// --------------------------------------------------------------------------
const _v = new THREE.Vector3();
const pan = x => Math.max(-0.8, Math.min(0.8, (x - camera.position.x) / 6));
function toScreen(x, y) { _v.set(x, y, 0).project(camera); return [(_v.x * 0.5 + 0.5) * gfx.width, (-_v.y * 0.5 + 0.5) * gfx.height]; }
function slow(sec, scale) { if (sec * (1 - scale) > G.slowT * (1 - G.slowScale)) { G.slowT = sec; G.slowScale = scale; } }

function drainEvents() {
  const m = G.match;
  if (!m) return;
  const quiet = G.attract;
  const evs = m.events.splice(0, m.events.length);
  for (const e of evs) {
    switch (e.type) {
      case 'sfx': if (!quiet && SFX[e.name]) SFX[e.name](pan(e.x)); break;
      case 'vo': if (!quiet) say(e.name); break;
      case 'announce':
        if (quiet) break;
        ui.announce(e.text, e.dur, e);
        if (e.vo) say(e.vo);
        if (e.gong) SFX.gong();
        if (e.fight) { post.flash = 0.35; post.flashColor.set(0xffffff); director.punch = 0.6; }
        break;
      case 'cine':
        if (quiet) break;
        director.setShot(e.shot, e.side ?? (e.shot === 'p2' ? 1 : 0), e.shot === 'establish' || e.shot === 'p1' || e.shot === 'p2');
        ui.letterbox(e.shot !== 'fight');
        ui.hudVisible(e.shot === 'fight' || e.shot === 'win');
        if (e.shot === 'establish') ui.stageCard(STAGES[G.stageIdx]);
        break;
      case 'nameCard': if (!quiet) ui.nameCard(e.side, m.fighters[e.side].char); break;
      case 'roundStart': fx.clearProjectiles(); post.dark = post.darkTarget = 0; break;
      case 'callout': if (!quiet) ui.callout(e.f.side, e.text, e.isSuper); break;
      case 'superStart': {
        const f = e.f, v = G.views[f.side];
        post.flash = 0.55; post.flashColor.set(f.char.color);
        post.darkTarget = 0.72; post.darkT = 1.0;
        const [sx, sy] = toScreen(f.x, 1.1 * f.scale); post.focus.set(sx / gfx.width, 1 - sy / gfx.height);
        slow(0.5, 0.3); director.shake(0.4); director.punch = 1;
        fx.shock(f.x, 1.1 * f.scale, f.char.color, 2.6);
        if (v) v.flash = 0.8;
        if (!quiet) SFX.specialHit(pan(f.x));
        break;
      }
      case 'projectile': fx.addProjectile(e.proj); break;
      case 'projEnd': fx.removeProjectile(e.proj, e.fizzle); break;
      case 'clash': fx.sparks(e.x, e.y, 0.1, 0xffffff, 40, 8); fx.ring(e.x, e.y, 0.1, 0xffffff, 1.6, 0.35); director.shake(0.3); if (!quiet) SFX.clash(pan(e.x)); break;
      case 'eruption': fx.eruption(e.x, e.f.char.color); director.shake(1); post.flash = 0.22; post.flashColor.set(e.f.char.color); if (!quiet) SFX.eruption(pan(e.x)); break;
      case 'thud': fx.dust(e.x, 0, e.ko ? 16 : 10); director.shake(e.ko ? 0.45 : 0.22); break;
      case 'hit': onHit(e, quiet); break;
      case 'combo':
        if (quiet) break;
        ui.combo(e.side, e.count, e.damage);
        if (e.count === 3) say('vo_combo', 0.8);
        break;
      case 'roundEnd': if (!quiet) Music.duck(true); after(2.2, () => Music.duck(false)); break;
      case 'matchEnd': onMatchEnd(e.winner); break;
    }
  }
}

function onHit(e, quiet) {
  const color = e.attacker.char.color;
  const dv = G.views[e.defender.side];
  fx.hitImpact(e, color);
  const p = pan(e.x);
  if (e.blocked) {
    director.shake(0.12); post.aberr = Math.max(post.aberr, 0.004);
    if (!quiet) SFX.block(p);
    return;
  }
  if (dv) dv.hit(e.ko ? 1.6 : 1);
  const big = e.isSuper || e.special || e.heavy || e.thrown;
  director.shake(e.ko ? 0.95 : big ? 0.5 : 0.3);
  director.punch = Math.max(director.punch, e.ko ? 1 : big ? 0.5 : 0.25);
  post.aberr = Math.max(post.aberr, e.ko ? 0.03 : big ? 0.014 : 0.008);
  if (!quiet) {
    if (e.ko) SFX.ko(p);
    else if (e.thrown || e.res === 'launch') SFX.sweep(p);
    else if (big) SFX.heavyHit(p);
    else SFX.hit(p);
    if (e.special && !e.ko) SFX.specialHit(p);
    if (e.counter) { const [x, y] = toScreen(e.defender.x, 2.0 * e.defender.scale); ui.float('COUNTER', x, y, '#ff5a48'); }
  }
  if (e.ko) {
    slow(1.5, 0.2);
    post.flash = 0.9; post.flashColor.set(0xffffff); post.bloomBoost = 1.2;
    director.setShot('ko', e.defender.side);
    stage.strike();
    if (!quiet) ui.letterbox(true);
  } else if (e.isSuper) slow(0.22, 0.4);
  else if (e.special || e.counter) slow(0.2, 0.5);
}

// --------------------------------------------------------------------------
// Debug hit-box overlay (training mode, key B)
// --------------------------------------------------------------------------
const dbg = new THREE.Group(); dbg.renderOrder = 20; scene.add(dbg);
const dbgBoxes = [];
function drawBox(i, b, color) {
  let l = dbgBoxes[i];
  if (!l) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 1, 0), new THREE.Vector3(0, 1, 0)]);
    l = dbgBoxes[i] = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ depthTest: false, transparent: true }));
    l.renderOrder = 20; dbg.add(l);
  }
  l.visible = !!b;
  if (b) { l.position.set(b.x, b.y, 0.3); l.scale.set(b.w, b.h, 1); l.material.color.set(color); }
}
function updateDebug() {
  dbg.visible = G.debug && !!G.match;
  if (!dbg.visible) return;
  const m = G.match;
  drawBox(0, m.p1.body, 0x40ff80); drawBox(1, m.p2.body, 0x40ff80);
  drawBox(2, m.p1.attackBox(), 0xff3030); drawBox(3, m.p2.attackBox(), 0xff3030);
  m.projectiles.slice(0, 4).forEach((p, i) => drawBox(4 + i, p.box, 0xffd040));
  for (let i = 4 + m.projectiles.length; i < 8; i++) drawBox(i, null);
}

// --------------------------------------------------------------------------
// Frame loop
// --------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  G.time += dt; G.frames = (G.frames || 0) + 1;
  pollInput();
  for (const n of drainNav()) ui.nav(n.action, n.player);
  if (!STEP_MODE) for (let i = G.timers.length - 1; i >= 0; i--) { const t = G.timers[i]; if ((t.t -= dt) <= 0) { G.timers.splice(i, 1); t.fn(); } }

  const m = G.match;
  let simDt = 0, alpha = 1;
  if (STEP_MODE) {
    // tests drive the simulation through __game.advance(); the loop only renders
    if (m) { simDt = G.pendingSim; G.pendingSim = 0; }
    endTick();
  } else if (m && !G.paused) {
    if (G.slowT > 0) G.slowT -= dt;
    const scale = G.slowT > 0 ? G.slowScale : 1;
    G.acc += dt * 1000 * scale;
    let ticks = 0;
    while (G.acc >= STEP && ticks < 4) {
      for (const f of m.fighters) { f.px = f.x; f.py = f.y; }
      for (const p of m.projectiles) p.px = p.x;
      const human = !G.attract;
      const solo = G.mode !== 'versus';
      let p1 = null, p2 = null;
      if (human) {
        p1 = readPad(0, true);
        if (solo) { const o = readPad(1, false); for (const k of Object.keys(p1)) p1[k] = p1[k] || o[k]; } else p2 = readPad(1, false);
      }
      m.tick(p1, p2);
      endTick();
      G.acc -= STEP; ticks++;
      drainEvents();
      if (G.match !== m) break;
    }
    if (ticks === 4) G.acc = 0;
    if (G.match === m) { alpha = G.acc / STEP; simDt = m.hitstop > 0 ? 0 : dt * scale; }
  } else endTick();

  const cur = G.match;
  if (cur) {
    for (const f of cur.fighters) { const v = G.views[f.side]; if (v) v.update(f, alpha, dt, simDt); }
    if (G.screen === 'match' && !G.paused) ui.hudUpdate(cur);
  } else {
    // menu showcase: fighters stand ready, facing each other
    const sep = G.screen === 'versus' ? 1.25 : 1.55;
    G.views.forEach((v, i) => {
      if (!v) return;
      v.group.position.set(i === 0 ? -sep : sep, 0, 0); v.group.scale.x = i === 0 ? 1 : -1;
      v.x = v.group.position.x; v.y = 0; v.facing = i === 0 ? 1 : -1;
      v.flash = Math.max(0, v.flash - dt * 3);
      v.preview('idle', dt);
      if (v.flash > 0) for (const mt of v.materials) mt.emissive.setRGB(v.flash, v.flash * 0.9, v.flash * 0.8);
    });
  }
  fx.update(dt, cur ? simDt : dt, alpha);
  director.update(dt, G.views[0] && G.views[1] ? G.views : [null, null]);
  stage.update(dt, camera);
  updateDebug();

  // post-processing transients
  post.aberr *= Math.exp(-dt * 9);
  post.flash *= Math.exp(-dt * 7);
  post.bloomBoost *= Math.exp(-dt * 3);
  if (post.darkT > 0) { post.darkT -= dt; if (post.darkT <= 0) post.darkTarget = 0; }
  post.dark += (post.darkTarget - post.dark) * Math.min(1, dt * 10);
  post.exposureBoost = stage.flash * 0.35;
  const def = stage.def || STAGES[0];
  gfx.render(G.time, { exposure: def.exposure, bloom: def.bloom + stage.flash * 0.5 }, post);
}

// --------------------------------------------------------------------------
// Boot
// --------------------------------------------------------------------------
(async function boot() {
  try {
    ui.loading(0.02, 'Sharpening blades…');
    const sfxReady = preloadSfx();
    await loadAssets(renderer, p => ui.loading(0.05 + p * 0.8));
    ui.loading(0.88, 'Lighting the lanterns…');
    await new Promise(r => setTimeout(r, 30));
    // portraits for the HUD and the roster
    for (const c of CHARACTERS) {
      const v = new FighterView(c);
      ui.portraits[c.id] = gfx.portrait(v, 256);
      v.dispose();
    }
    ui.loading(0.95, 'Summoning the storm…');
    await Promise.race([sfxReady, new Promise(r => setTimeout(r, 2500))]);
    if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]);
    ui.loading(1);

    // deep links for testing / sharing: ?auto=arcade|cpu|versus|training|watch&p1=kaito&p2=akane&stage=storm
    const auto = params.get('auto');
    if (auto) {
      G.mode = auto;
      const p1 = charById(params.get('p1')) || CHARACTERS[0], p2 = charById(params.get('p2')) || CHARACTERS[1];
      const st = Math.max(0, STAGES.findIndex(s => s.id === params.get('stage')));
      G.pick = [CHARACTERS.indexOf(p1), CHARACTERS.indexOf(p2)];
      if (auto === 'arcade') { G.stageIdx = st; startArcade(); }
      else beginVersus({ p1, p2, stageIdx: st });
    } else goTitle();
    requestAnimationFrame(t => { last = t; frame(t); });
    window.__game.ready = true;
  } catch (err) {
    console.error(err);
    ui.fatal('Swift Sword could not start: ' + (err && err.message ? err.message : err) + '<br><br>Try reloading, or play the <a href="classic/">classic 2D edition</a>.');
  }
})();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
window.addEventListener('pointerdown', unlockAudio, { once: true });

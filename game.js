/* ============================================================
   STREET FIGHTER 2 — JS EDITION
   A fan-made homage built with HTML5 Canvas + vanilla JS.
   ============================================================ */
'use strict';

// ---------------- Constants ----------------
const W = 960, H = 540;
const GROUND = 470;
const GRAVITY = 0.7;
const JUMP_VY = -14.5;
const WALK_SPEED = 3.2;
const STAGE_MARGIN = 40;
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
const SFX = {
  hit:      () => { beep(160, 0.12, 'square', 0.18, -80); beep(90, 0.18, 'sawtooth', 0.10, -40); },
  block:    () => beep(420, 0.07, 'square', 0.10, -100),
  whiff:    () => beep(300, 0.05, 'triangle', 0.06, 80),
  fireball: () => { beep(220, 0.30, 'sawtooth', 0.12, 300); },
  jump:     () => beep(260, 0.10, 'triangle', 0.07, 160),
  ko:       () => { beep(300, 0.7, 'sawtooth', 0.2, -260); },
  select:   () => beep(700, 0.06, 'square', 0.08),
  confirm:  () => { beep(520, 0.08, 'square', 0.1); setTimeout(() => beep(780, 0.10, 'square', 0.1), 70); },
  sweep:    () => beep(120, 0.16, 'sawtooth', 0.14, -60),
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
  };
}
const EMPTY_PAD = { left: false, right: false, up: false, down: false, punch: false, kick: false, hadouken: false };

// ---------------- Characters ----------------
const CHARACTERS = [
  {
    id: 'ryu', name: 'RYU',
    gi: '#e8e6e0', giDark: '#c9c6bd', skin: '#e0b08a', hair: '#2e2118',
    band: '#cc2222', belt: '#1a1a1a', glove: '#aa2222', fireball: '#5fb0ff',
    taunt: 'YOU MUST DEFEAT MY HADOUKEN!',
  },
  {
    id: 'ken', name: 'KEN',
    gi: '#d62828', giDark: '#a81f1f', skin: '#e8bb90', hair: '#e8c84a',
    band: '#7a1212', belt: '#5a3210', glove: '#7a3b10', fireball: '#ffb030',
    taunt: 'ATTACK ME IF YOU DARE!',
  },
];

// ---------------- Attack definitions ----------------
// Frame data: startup, active, recovery (in 60fps frames).
// Hitboxes are relative to fighter origin (feet center), facing +x.
const ATTACKS = {
  punch:       { startup: 4, active: 5, recovery: 9,  damage: 6, kb: 4.5, box: { x: 20, y: -94, w: 40, h: 26 } },
  kick:        { startup: 6, active: 5, recovery: 13, damage: 8, kb: 6,   box: { x: 22, y: -80, w: 44, h: 30 } },
  crouchPunch: { startup: 4, active: 4, recovery: 8,  damage: 5, kb: 3.5, box: { x: 16, y: -60, w: 36, h: 22 }, crouch: true },
  sweep:       { startup: 7, active: 5, recovery: 16, damage: 7, kb: 4,   box: { x: 14, y: -16, w: 44, h: 16 }, crouch: true, knockdown: true },
  jumpKick:    { startup: 5, active: 12, recovery: 6, damage: 9, kb: 6,   box: { x: 8,  y: -52, w: 42, h: 32 }, air: true },
  hadouken:    { startup: 13, active: 1, recovery: 18, damage: 0, kb: 0,  box: null, projectile: true },
};
const HITSTUN = 18;
const BLOCKSTUN = 12;

// ---------------- Helpers ----------------
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

function bentLimb(c, x1, y1, x2, y2, bend, w, color) {
  const mx = (x1 + x2) / 2 + (y2 - y1) * bend;
  const my = (y1 + y2) / 2 - (x2 - x1) * bend;
  c.strokeStyle = color;
  c.lineWidth = w;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(mx, my);
  c.lineTo(x2, y2);
  c.stroke();
}

// ---------------- Projectile (Hadouken) ----------------
class Projectile {
  constructor(owner) {
    this.owner = owner;
    this.facing = owner.facing;
    this.x = owner.x + this.facing * 50;
    this.y = owner.y - 70;
    this.vx = this.facing * 7.5;
    this.alive = true;
    this.t = 0;
  }
  update() {
    this.x += this.vx;
    this.t++;
    if (this.x < -40 || this.x > W + 40) this.alive = false;
  }
  get box() { return { x: this.x - 16, y: this.y - 14, w: 32, h: 28 }; }
  draw(c) {
    const col = this.owner.char.fireball;
    c.save();
    // trail
    for (let i = 1; i <= 3; i++) {
      c.globalAlpha = 0.18 / i + 0.05;
      c.fillStyle = col;
      c.beginPath();
      c.arc(this.x - this.vx * i * 1.6, this.y, 14 - i * 2, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    const pulse = 2 * Math.sin(this.t * 0.5);
    c.fillStyle = col;
    c.beginPath();
    c.arc(this.x, this.y, 14 + pulse, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(this.x, this.y, 7 + pulse * 0.5, 0, Math.PI * 2);
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
    this.proj = null;
    this.downTimer = 0;
    this.controllable = false;
  }

  get grounded() { return this.y >= GROUND - 0.01; }
  get crouching() { return this.state === 'crouch' || (this.attack && this.attack.def.crouch); }

  get body() {
    const h = this.grounded ? (this.crouching ? 72 : 110) : 96;
    if (this.state === 'down' || this.state === 'ko') {
      return { x: this.x - 40, y: this.y - 26, w: 80, h: 26 };
    }
    return { x: this.x - 19, y: this.y - h, w: 38, h: h };
  }

  attackBox() {
    if (!this.attack || this.attack.def.projectile) return null;
    const a = this.attack;
    if (a.t < a.def.startup || a.t >= a.def.startup + a.def.active) return null;
    const b = a.def.box;
    const bx = this.facing === 1 ? this.x + b.x : this.x - b.x - b.w;
    return { x: bx, y: this.y + b.y, w: b.w, h: b.h };
  }

  startAttack(name) {
    this.attack = { name, def: ATTACKS[name], t: 0, hasHit: false };
    this.state = 'attack';
    this.stateT = 0;
    if (name === 'hadouken') SFX.fireball();
  }

  update(pad, opp, game) {
    this.stateT++;
    const fwd = this.facing === 1 ? pad.right : pad.left;
    const back = this.facing === 1 ? pad.left : pad.right;

    // --- quarter-circle-forward detection for Hadouken ---
    if (this.qcfTimer > 0) this.qcfTimer--; else this.qcfStage = 0;
    if (pad.down && !fwd) { this.qcfStage = 1; this.qcfTimer = 26; }
    else if (this.qcfStage >= 1 && fwd) { this.qcfStage = 2; this.qcfTimer = 14; }

    // --- physics ---
    if (!this.grounded || this.vy < 0) {
      this.vy += GRAVITY;
      this.y += this.vy;
      this.x += this.vx;
      this.clampX();
      if (this.y >= GROUND) {
        this.y = GROUND;
        this.vy = 0;
        if (this.state === 'jump') { this.state = 'idle'; this.attack = null; }
        if (this.state === 'hit') { this.state = 'down'; this.downTimer = 36; this.stateT = 0; }
        if (this.state === 'ko') { /* stays down */ }
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
      if (a.def.projectile && a.t === a.def.startup && !this.projAlive(game)) {
        game.projectiles.push(new Projectile(this));
      }
      const total = a.def.startup + a.def.active + a.def.recovery;
      if (a.def.air) {
        if (this.grounded) { this.attack = null; this.state = 'idle'; }
      } else if (a.t >= total) {
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

    // special move
    const wantHadouken = pad.hadouken || (pad.punch && this.qcfStage === 2);
    if (wantHadouken && !this.projAlive(game)) {
      this.startAttack('hadouken');
      this.qcfStage = 0;
      return;
    }
    if (pad.punch) { this.startAttack(pad.down ? 'crouchPunch' : 'punch'); SFX.whiff(); return; }
    if (pad.kick)  { this.startAttack(pad.down ? 'sweep' : 'kick'); SFX.whiff(); return; }

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
      this.vx = dir * kb * 0.7;
      SFX.block();
      return;
    }
    this.hp = Math.max(0, this.hp - dmg);
    this.attack = null;
    if (this.hp <= 0) {
      this.state = 'ko';
      this.stateT = 0;
      this.vy = -7;
      this.vx = dir * 3.5;
      this.y -= 1;
      SFX.ko();
      return;
    }
    if (knockdown || !this.grounded) {
      this.state = 'hit';
      this.stateT = 0;
      this.vy = -6.5;
      this.vx = dir * 3;
      this.y -= 1;
      SFX.sweep();
    } else {
      this.state = 'hit';
      this.stateT = 0;
      this.vx = dir * kb;
      SFX.hit();
    }
  }

  // ---------------- Rendering ----------------
  pose() {
    const t = this.stateT;
    // defaults: standing guard
    const p = {
      hip: [0, -50], neck: [1, -86], head: [3, -97],
      backFoot: [-16, 0], frontFoot: [14, 0],
      backHand: [13, -66], frontHand: [22, -76],
      legBendF: 0.12, legBendB: -0.12, armBendF: 0.35, armBendB: 0.4,
      lying: false,
    };
    const breathe = Math.sin(t * 0.08) * 1.5;

    switch (this.state) {
      case 'idle':
        p.neck[1] += breathe * 0.5;
        p.head[1] += breathe * 0.6;
        p.frontHand[1] += breathe;
        break;
      case 'walk': {
        const s = Math.sin(this.walkPhase * 4);
        p.frontFoot = [14 + s * 13, -Math.max(0, s) * 5];
        p.backFoot = [-16 - s * 13, -Math.max(0, -s) * 5];
        p.hip[1] += Math.abs(s);
        break;
      }
      case 'crouch':
        p.hip = [0, -26]; p.neck = [2, -54]; p.head = [5, -65];
        p.backFoot = [-19, 0]; p.frontFoot = [16, 0];
        p.frontHand = [20, -50]; p.backHand = [11, -44];
        p.legBendF = 0.4; p.legBendB = -0.4;
        break;
      case 'jump': {
        p.hip = [0, -46]; p.neck = [2, -82]; p.head = [4, -93];
        p.backFoot = [-9, -16]; p.frontFoot = [9, -20];
        p.frontHand = [20, -88]; p.backHand = [-12, -80];
        p.legBendF = 0.5; p.legBendB = -0.5;
        break;
      }
      case 'block': {
        p.frontHand = [17, -72]; p.backHand = [15, -84];
        p.neck[0] -= 3; p.head[0] -= 4;
        break;
      }
      case 'hit': {
        p.neck = [-9, -83]; p.head = [-14, -93];
        p.frontHand = [24, -58]; p.backHand = [-22, -72];
        p.hip = [2, -48];
        break;
      }
      case 'down': case 'ko':
        p.lying = true;
        break;
      case 'win': {
        const up = Math.min(1, t / 20);
        p.frontHand = [lerp(22, 8, up), lerp(-76, -126, up)];
        p.backHand = [10, -60];
        p.head[1] -= up * 2;
        p.armBendF = 0.1;
        break;
      }
      case 'attack': {
        const a = this.attack;
        if (!a) break;
        const { startup, active, recovery } = a.def;
        let ext;
        if (a.t < startup) ext = a.t / startup;
        else if (a.t < startup + active) ext = 1;
        else ext = Math.max(0, 1 - (a.t - startup - active) / recovery);

        if (a.name === 'punch') {
          p.frontHand = [lerp(22, 56, ext), lerp(-76, -82, ext)];
          p.neck[0] += 5 * ext; p.head[0] += 5 * ext;
          p.armBendF = 0.35 * (1 - ext);
        } else if (a.name === 'kick') {
          p.frontFoot = [lerp(14, 56, ext), lerp(0, -64, ext)];
          p.neck[0] -= 7 * ext; p.head[0] -= 8 * ext;
          p.hip[0] -= 3 * ext;
          p.legBendF = 0.25 * (1 - ext);
          p.frontHand = [16, -80]; p.backHand = [-14, -70];
        } else if (a.name === 'crouchPunch') {
          p.hip = [0, -26]; p.neck = [2, -54]; p.head = [5, -65];
          p.backFoot = [-19, 0]; p.frontFoot = [16, 0];
          p.legBendF = 0.4; p.legBendB = -0.4;
          p.frontHand = [lerp(18, 48, ext), -50];
          p.backHand = [10, -44];
          p.armBendF = 0.3 * (1 - ext);
        } else if (a.name === 'sweep') {
          p.hip = [0, -22]; p.neck = [-4, -50]; p.head = [-3, -61];
          p.backFoot = [-16, 0];
          p.frontFoot = [lerp(16, 52, ext), lerp(0, -6, ext)];
          p.legBendF = 0.1; p.legBendB = -0.5;
          p.frontHand = [14, -44]; p.backHand = [-16, -40];
        } else if (a.name === 'jumpKick') {
          p.hip = [0, -46]; p.neck = [2, -82]; p.head = [4, -93];
          p.backFoot = [-10, -22];
          p.frontFoot = [lerp(9, 42, ext), lerp(-20, -26, ext)];
          p.legBendF = 0.4 * (1 - ext); p.legBendB = -0.5;
          p.frontHand = [18, -86]; p.backHand = [-14, -78];
        } else if (a.name === 'hadouken') {
          p.hip = [-3, -44]; p.neck = [3, -80]; p.head = [7, -91];
          p.backFoot = [-23, 0]; p.frontFoot = [18, 0];
          p.legBendF = 0.25; p.legBendB = -0.25;
          const e = Math.min(1, ext * 1.3);
          p.frontHand = [lerp(14, 42, e), lerp(-60, -68, e)];
          p.backHand = [lerp(8, 40, e), lerp(-56, -74, e)];
          p.armBendF = 0.15; p.armBendB = 0.15;
        }
        break;
      }
    }
    return p;
  }

  draw(c) {
    const ch = this.char;
    c.save();
    // shadow
    c.globalAlpha = 0.3;
    c.fillStyle = '#000';
    c.beginPath();
    c.ellipse(this.x, GROUND + 6, 34, 7, 0, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;

    c.translate(this.x, this.y);
    c.scale(this.facing, 1);

    const p = this.pose();

    if (p.lying) {
      // lying flat on back
      const flicker = this.state === 'ko' && Math.floor(this.stateT / 4) % 2 === 0;
      if (!flicker || this.state === 'down') {
        bentLimb(c, -8, -10, 24, -4, 0.1, 12, ch.gi);          // legs
        bentLimb(c, -8, -12, 30, -10, -0.1, 12, ch.gi);
        bentLimb(c, -10, -14, -42, -14, 0, 22, ch.gi);          // torso
        bentLimb(c, -36, -16, -14, -26, 0.2, 8, ch.skin);       // arm up
        c.fillStyle = ch.skin;                                   // head
        c.beginPath(); c.arc(-52, -16, 10, 0, Math.PI * 2); c.fill();
        c.fillStyle = ch.hair;
        c.beginPath(); c.arc(-54, -19, 9, Math.PI * 0.8, Math.PI * 1.9); c.fill();
      }
      c.restore();
      return;
    }

    const [hx, hy] = p.hip;
    const [nx, ny] = p.neck;
    const shoulderB = [nx - 4, ny + 6];
    const shoulderF = [nx + 4, ny + 5];

    // back arm
    bentLimb(c, shoulderB[0], shoulderB[1], p.backHand[0], p.backHand[1], p.armBendB, 9, ch.skin);
    c.fillStyle = ch.glove;
    c.beginPath(); c.arc(p.backHand[0], p.backHand[1], 5.5, 0, Math.PI * 2); c.fill();

    // back leg
    bentLimb(c, hx - 3, hy, p.backFoot[0], p.backFoot[1] - 4, p.legBendB, 13, ch.gi);
    c.fillStyle = '#fff';
    c.fillRect(p.backFoot[0] - 8, p.backFoot[1] - 7, 15, 7); // foot wrap

    // torso (gi)
    bentLimb(c, hx, hy, nx, ny, 0, 26, ch.gi);
    bentLimb(c, hx, hy + 2, nx, ny + 8, 0, 18, ch.giDark);
    // belt
    c.fillStyle = ch.belt;
    c.fillRect(hx - 13, hy - 4, 26, 7);

    // front leg
    bentLimb(c, hx + 3, hy, p.frontFoot[0], p.frontFoot[1] - 4, p.legBendF, 13, ch.gi);
    c.fillStyle = '#fff';
    c.fillRect(p.frontFoot[0] - 7, p.frontFoot[1] - 7, 15, 7);

    // head
    const [headX, headY] = p.head;
    c.fillStyle = ch.skin;
    c.beginPath(); c.arc(headX, headY, 11, 0, Math.PI * 2); c.fill();
    // hair
    c.fillStyle = ch.hair;
    c.beginPath(); c.arc(headX - 1, headY - 3, 11, Math.PI * 0.9, Math.PI * 2.05); c.fill();
    // headband
    c.fillStyle = ch.band;
    c.fillRect(headX - 11, headY - 6, 22, 5);
    // headband tails
    c.strokeStyle = ch.band; c.lineWidth = 3; c.lineCap = 'round';
    const wave = Math.sin(this.stateT * 0.2) * 3;
    c.beginPath();
    c.moveTo(headX - 10, headY - 4);
    c.lineTo(headX - 22, headY - 1 + wave);
    c.stroke();
    // eye
    c.fillStyle = '#1a1a1a';
    c.fillRect(headX + 4, headY - 2, 3, 3);

    // front arm
    bentLimb(c, shoulderF[0], shoulderF[1], p.frontHand[0], p.frontHand[1], p.armBendF, 9, ch.skin);
    c.fillStyle = ch.glove;
    c.beginPath(); c.arc(p.frontHand[0], p.frontHand[1], 6, 0, Math.PI * 2); c.fill();

    c.restore();
  }
}

// ---------------- CPU AI ----------------
function cpuThink(f, opp, game) {
  const ai = f.ai;
  const pad = { left: false, right: false, up: false, down: false, punch: false, kick: false, hadouken: false };
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
  if (opp.attack && !opp.attack.def.projectile && dist < 120 && f.grounded && Math.random() < 0.45) {
    ai.wantBlock = true; ai.timer = 14;
  }
  if (ai.wantBlock) {
    pad[backKey] = true;
    if (--ai.timer <= 0) ai.wantBlock = false;
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
    } else if (dist > 140) {
      if (r < 0.45) { ai.move = 'approach'; ai.timer = 18; }
      else if (r < 0.65) { ai.move = 'jumpin'; ai.timer = 30; }
      else if (r < 0.8 && !f.projAlive(game)) { ai.move = 'fireball'; ai.timer = 8; }
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
      else if (!f.grounded && dist < 130 && !f.attack) pad.kick = true;
      else pad[fwdKey] = true;
      break;
    case 'fireball': if (ai.fresh) pad.hadouken = true; break;
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
    const r = 6 + this.t * 2.2;
    c.save();
    c.translate(this.x, this.y);
    c.strokeStyle = this.blocked ? '#88bbff' : (this.t % 2 ? '#ffdd33' : '#ffffff');
    c.lineWidth = 3;
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
    this.p1 = new Fighter(CHARACTERS[this.sel1], 280, 1, true);
    this.p2 = new Fighter(CHARACTERS[this.sel2], 680, -1, false);
    this.wins1 = 0; this.wins2 = 0;
    this.round = 1;
    this.startRound();
  }

  startRound() {
    this.p1.resetRound();
    this.p2.resetRound();
    this.projectiles = [];
    this.sparks = [];
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
    this.frame++;
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
        if (!this.done1) {
          if (keysPressed.has('KeyA') || keysPressed.has('KeyD')) { this.sel1 = 1 - this.sel1; SFX.select(); }
          if (keysPressed.has('KeyF') || keysPressed.has('Enter')) { this.done1 = true; SFX.confirm(); }
        }
        if (this.vsCpu) {
          if (this.done1 && !this.done2) {
            this.sel2 = 1 - this.sel1;
            this.done2 = true;
          }
        } else if (!this.done2) {
          if (keysPressed.has('ArrowLeft') || keysPressed.has('ArrowRight')) { this.sel2 = 1 - this.sel2; SFX.select(); }
          if (keysPressed.has('KeyK')) { this.done2 = true; SFX.confirm(); }
        }
        if (this.done1 && this.done2 && this.screenT > 30) this.startMatch();
        if (keysPressed.has('Escape')) { this.screen = 'mode'; this.screenT = 0; }
        break;
      }

      case 'intro':
        if (this.screenT === 1) this.setAnnounce('ROUND ' + this.round, 80);
        if (this.screenT === 85) this.setAnnounce('FIGHT!', 45);
        if (this.screenT >= 100) {
          this.screen = 'fight';
          this.screenT = 0;
          this.p1.controllable = true;
          this.p2.controllable = true;
        }
        this.updateFight(true);
        break;

      case 'fight':
        this.updateFight(false);
        // round timer
        if (++this.timerAcc >= 60) {
          this.timerAcc = 0;
          if (--this.timeLeft <= 0) this.endRound(true);
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
    const pad1 = frozen ? { ...EMPTY_PAD } : readPad(P1_KEYS);
    const pad2 = frozen ? { ...EMPTY_PAD }
      : this.vsCpu ? cpuThink(this.p2, this.p1, this) : readPad(P2_KEYS);

    this.p1.update(pad1, this.p2, this);
    this.p2.update(pad2, this.p1, this);

    // body push (keep fighters from overlapping)
    if (this.p1.grounded && this.p2.grounded &&
        this.p1.state !== 'down' && this.p2.state !== 'down' &&
        this.p1.state !== 'ko' && this.p2.state !== 'ko') {
      const overlap = 38 - Math.abs(this.p1.x - this.p2.x);
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
    // attacker pushback on connect
    attacker.vx = 0;
    attacker.x -= attacker.facing * 3;
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
    // sky
    const sky = c.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#1a1a4e');
    sky.addColorStop(0.5, '#7a3a6a');
    sky.addColorStop(1, '#e8804a');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, GROUND);

    // sun
    c.fillStyle = '#ffd070';
    c.beginPath(); c.arc(W / 2, GROUND - 60, 55, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,208,112,0.25)';
    c.beginPath(); c.arc(W / 2, GROUND - 60, 75, 0, Math.PI * 2); c.fill();

    // distant skyline
    c.fillStyle = '#2a1535';
    for (let i = 0; i < 14; i++) {
      const bx = i * 72 - 20;
      const bh = 40 + ((i * 37) % 70);
      c.fillRect(bx, GROUND - bh, 52, bh);
    }
    // windows
    c.fillStyle = 'rgba(255,220,120,0.5)';
    for (let i = 0; i < 14; i++) {
      const bx = i * 72 - 20;
      const bh = 40 + ((i * 37) % 70);
      for (let wy = GROUND - bh + 8; wy < GROUND - 10; wy += 16) {
        if ((i + wy) % 3 !== 0) continue;
        c.fillRect(bx + 8, wy, 5, 6);
        c.fillRect(bx + 30, wy, 5, 6);
      }
    }

    // ground
    const gnd = c.createLinearGradient(0, GROUND, 0, H);
    gnd.addColorStop(0, '#9a7448');
    gnd.addColorStop(1, '#5a4028');
    c.fillStyle = gnd;
    c.fillRect(0, GROUND, W, H - GROUND);
    // perspective lines
    c.strokeStyle = 'rgba(0,0,0,0.18)';
    c.lineWidth = 2;
    for (let i = 0; i <= 8; i++) {
      const xTop = (i / 8) * W;
      const xBot = W / 2 + (xTop - W / 2) * 1.7;
      c.beginPath(); c.moveTo(xTop, GROUND); c.lineTo(xBot, H); c.stroke();
    }
    c.beginPath(); c.moveTo(0, GROUND); c.lineTo(W, GROUND); c.stroke();
  }

  drawHud(c) {
    const barW = 360, barH = 24, y = 24;
    const drawBar = (x, hp, flip) => {
      c.fillStyle = '#7a1010';
      c.fillRect(x, y, barW, barH);
      const w = barW * (hp / MAX_HP);
      c.fillStyle = hp > 30 ? '#f8d020' : '#f85030';
      if (flip) c.fillRect(x + barW - w, y, w, barH);
      else c.fillRect(x, y, w, barH);
      c.strokeStyle = '#fff';
      c.lineWidth = 3;
      c.strokeRect(x, y, barW, barH);
    };
    drawBar(40, this.p1.hp, true);
    drawBar(W - 40 - barW, this.p2.hp, false);

    // names
    c.fillStyle = '#fff';
    c.font = 'bold 16px "Courier New", monospace';
    c.textAlign = 'left';
    c.fillText(this.p1.char.name + (this.vsCpu ? '' : ' (P1)'), 42, y + barH + 18);
    c.textAlign = 'right';
    c.fillText(this.p2.char.name + (this.vsCpu ? ' (CPU)' : ' (P2)'), W - 42, y + barH + 18);

    // round win pips
    const pip = (x, won) => {
      c.beginPath(); c.arc(x, y + barH + 13, 6, 0, Math.PI * 2);
      c.fillStyle = won ? '#ffd020' : 'rgba(0,0,0,0.4)';
      c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke();
    };
    pip(W / 2 - 80, this.wins1 >= 1); pip(W / 2 - 100, this.wins1 >= 2);
    pip(W / 2 + 80, this.wins2 >= 1); pip(W / 2 + 100, this.wins2 >= 2);

    // timer
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(W / 2 - 34, y - 6, 68, barH + 12);
    c.strokeStyle = '#fff'; c.lineWidth = 2;
    c.strokeRect(W / 2 - 34, y - 6, 68, barH + 12);
    c.fillStyle = this.timeLeft <= 10 ? '#ff5040' : '#fff';
    c.font = 'bold 30px "Courier New", monospace';
    c.textAlign = 'center';
    c.fillText(String(this.timeLeft).padStart(2, '0'), W / 2, y + 22);
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
      this.demoF = [new Fighter(CHARACTERS[0], 300, 1, true), new Fighter(CHARACTERS[1], 660, -1, false)];
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
    c.font = '14px "Courier New", monospace';
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillText('A fan-made homage. Not affiliated with Capcom.', W / 2, 510);
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
    c.font = '16px "Courier New", monospace';
    c.fillStyle = 'rgba(255,255,255,0.7)';
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
      const cx = W / 2 + (i === 0 ? -160 : 160);
      const cy = 270;
      // card
      c.fillStyle = '#16213a';
      c.fillRect(cx - 90, cy - 110, 180, 230);
      // portrait: big head + gi shoulders
      c.fillStyle = ch.gi;
      c.beginPath(); c.arc(cx, cy + 60, 70, Math.PI, 0); c.fill();
      c.fillStyle = ch.skin;
      c.beginPath(); c.arc(cx, cy - 10, 44, 0, Math.PI * 2); c.fill();
      c.fillStyle = ch.hair;
      c.beginPath(); c.arc(cx - 3, cy - 22, 44, Math.PI * 0.85, Math.PI * 2.1); c.fill();
      c.fillStyle = ch.band;
      c.fillRect(cx - 44, cy - 32, 88, 14);
      c.fillStyle = '#1a1a1a';
      c.fillRect(cx - 18, cy - 4, 9, 8);
      c.fillRect(cx + 11, cy - 4, 9, 8);
      c.font = 'bold 26px "Courier New", monospace';
      c.fillStyle = '#fff';
      c.fillText(ch.name, cx, cy + 105);

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

    c.font = '16px "Courier New", monospace';
    c.fillStyle = '#7ab0ff';
    c.fillText('P1: A/D move — F confirm', W / 2 - 240, 470);
    c.fillStyle = '#ff8a7a';
    c.fillText(this.vsCpu ? 'P2: CPU' : 'P2: ←/→ move — K confirm', W / 2 + 240, 470);
  }

  drawFightScreen(c) {
    this.drawStage(c);
    // draw the fighter farther from camera first (the one who is knocked down draws under)
    const order = [this.p1, this.p2];
    if (this.p1.state === 'down' || this.p1.state === 'ko') { /* p1 first by default */ }
    else if (this.p2.state === 'down' || this.p2.state === 'ko') order.reverse();
    order[0].draw(c);
    order[1].draw(c);
    for (const pr of this.projectiles) pr.draw(c);
    for (const s of this.sparks) s.draw(c);
    this.drawHud(c);
    this.drawAnnounce(c);

    if (this.screen === 'fight' && this.screenT < 240 && this.round === 1) {
      c.font = '14px "Courier New", monospace';
      c.textAlign = 'center';
      c.fillStyle = 'rgba(255,255,255,0.75)';
      c.fillText('P1: WASD move · F punch · G kick · ↓→+F Hadouken · hold back to block', W / 2, H - 14);
    }
  }

  draw(c) {
    c.clearRect(0, 0, W, H);
    switch (this.screen) {
      case 'title': this.drawTitle(c); break;
      case 'mode': this.drawMode(c); break;
      case 'select': this.drawSelect(c); break;
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
  game.draw(ctx);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Swift Sword — deterministic fight simulation. No rendering, no audio: the
// simulation only mutates its own state and appends to `match.events`, which
// the presentation layer drains every frame. Runs at a fixed 60 Hz.
import {
  STAGE_HALF, START_X, GRAVITY, JUMP_VY, JUMP_VX, WALK_SPEED, BACK_FACTOR, DASH_SPEED, DASH_FRAMES,
  MAX_HP, ROUND_TIME, ROUNDS_TO_WIN, HITSTUN, BLOCKSTUN, DOWN_LIE, DOWN_RISE, BODY_HALF, PUSH_WIDTH,
  INPUT_BUFFER, PROJECTILES, moveset,
} from './config.js';

export const BUTTONS = ['light', 'heavy', 'wave', 'dash', 'rising', 'super'];
export const emptyPad = () => ({ left: false, right: false, up: false, down: false, light: false, heavy: false, wave: false, dash: false, rising: false, super: false });

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ---------------------------------------------------------------------------
export class Projectile {
  constructor(owner, kind, opts = {}) {
    const p = PROJECTILES[kind];
    this.owner = owner;
    this.kind = kind;
    this.spec = p;
    this.facing = owner.facing;
    this.x = owner.x + this.facing * 0.95;
    this.y = p.y * (kind === 'quake' ? 1 : owner.char.height / 1.78) + (opts.dy || 0);
    this.vx = this.facing * p.speed * (opts.speed || 1);
    this.startX = this.x;
    this.alive = true;
    this.t = 0;
    this.id = Projectile.nextId++;
  }
  update() {
    this.x += this.vx;
    this.t++;
    if (Math.abs(this.x) > STAGE_HALF + 1.6) this.alive = false;
    if (this.spec.range && Math.abs(this.x - this.startX) > this.spec.range) this.alive = false;
  }
  get box() { return { x: this.x - this.spec.hw, y: this.y - this.spec.hh, w: this.spec.hw * 2, h: this.spec.hh * 2 }; }
}
Projectile.nextId = 1;

// ---------------------------------------------------------------------------
export class Fighter {
  constructor(char, side, match) {
    this.char = char;
    this.moves = moveset(char);
    this.side = side;                 // 0 = player one (starts left), 1 = player two
    this.match = match;
    this.startX = side === 0 ? -START_X : START_X;
    this.startFacing = side === 0 ? 1 : -1;
    this.ai = { timer: 0, move: 'wait', wantBlock: false, fresh: false };
    this.pad = emptyPad();
    this.resetRound();
  }

  resetRound() {
    this.x = this.startX;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = this.startFacing;
    this.hp = MAX_HP;
    this.hpGhost = MAX_HP;
    this.meter = 0;
    this.state = 'idle';     // idle, walk, crouch, jump, attack, hit, block, down, ko, win
    this.stateT = 0;
    this.attack = null;      // { name, def, t, st, act, total, hasHit, connected, lastHitT }
    this.attackSeq = 0;      // increments on every attack start (renderer uses it to restart clips)
    this.walkDir = 0;        // +1 advancing, -1 retreating
    this.hitKind = 'chest';  // chest | head | launch
    this.hitSeq = 0;
    this.qcfStage = 0; this.qcfTimer = 0;
    this.ddStage = 0; this.ddTimer = 0;
    this.prevDown = false; this.prevL = false; this.prevR = false;
    this.tapDir = 0; this.tapTimer = 0;
    this.dashT = 0; this.dashDir = 0;
    this.invulnT = 0;
    this.downTimer = 0;
    this.landT = 99;         // frames since last landing
    this.airT = 0;
    this.buf = { light: 0, heavy: 0, wave: 0, dash: 0, rising: 0, super: 0 };
    this.controllable = false;
    this.pad = emptyPad();
  }

  get grounded() { return this.y <= 0.0001; }
  get crouching() { return this.state === 'crouch' || !!(this.attack && this.attack.def.crouch); }
  get scale() { return this.char.height / 1.78; }

  get body() {
    const s = this.scale;
    if (this.state === 'down' || this.state === 'ko') {
      if (this.grounded) return { x: this.x - 0.75 * s, y: 0, w: 1.5 * s, h: 0.4 * s };
    }
    const h = (this.grounded ? (this.crouching ? 1.12 : 1.74) : 1.5) * s;
    return { x: this.x - BODY_HALF * s, y: this.y, w: BODY_HALF * 2 * s, h };
  }

  attackBox() {
    const a = this.attack;
    if (!a || a.def.projectile || !a.def.box) return null;
    if (a.t < a.st || a.t >= a.st + a.act) return null;
    const b = a.def.box, s = this.scale;
    const bx = this.facing === 1 ? this.x + b.x * s : this.x - (b.x + b.w) * s;
    return { x: bx, y: this.y + b.y * s, w: b.w * s, h: b.h * s };
  }

  emit(ev) { ev.f = this; this.match.events.push(ev); }
  sfx(name) { this.match.events.push({ type: 'sfx', name, x: this.x }); }

  startAttack(name) {
    const def = this.moves[name];
    this.attack = { name, def, t: 0, hasHit: false, connected: false, lastHitT: 0, st: def.startup, act: def.active, total: def.startup + def.active + def.recovery, buffer: false };
    this.attackSeq++;
    this.state = 'attack';
    this.stateT = 0;
    this.dashT = 0;
    for (const k of Object.keys(this.buf)) this.buf[k] = 0;
    if (def.special) this.emit({ type: 'callout', text: (this.char.moves && this.char.moves[name]) || def.label, isSuper: !!def.isSuper });
    if (def.projectile) this.sfx(def.isSuper ? 'superCharge' : 'charge');
    else if (def.dash) this.sfx('dash');
    else if (def.rising) this.sfx('rising');
    else if (def.heavy || def.isSuper) this.sfx('whooshHeavy');
    else this.sfx('whoosh');
  }

  // Register button presses (also called while the match is in hit-stop so no input is lost).
  bufferInput(pad) {
    for (const k of Object.keys(this.buf)) if (pad[k]) this.buf[k] = INPUT_BUFFER;
  }
  pressed(k) { return this.buf[k] > 0; }

  update(pad, opp) {
    const m = this.match;
    this.pad = pad;
    this.stateT++;
    this.landT++;
    this.bufferInput(pad);
    const fwd = this.facing === 1 ? pad.right : pad.left;

    // --- motion detectors ---
    if (this.qcfTimer > 0) this.qcfTimer--; else this.qcfStage = 0;
    if (pad.down && !fwd) { this.qcfStage = 1; this.qcfTimer = 26; }
    else if (this.qcfStage >= 1 && fwd) { this.qcfStage = 2; this.qcfTimer = 14; }

    const downEdge = pad.down && !this.prevDown;
    this.prevDown = pad.down;
    if (this.ddTimer > 0) this.ddTimer--; else this.ddStage = 0;
    if (downEdge) {
      if (this.ddStage === 1) { this.ddStage = 2; this.ddTimer = 14; }
      else { this.ddStage = 1; this.ddTimer = 20; }
    }

    const lEdge = pad.left && !this.prevL, rEdge = pad.right && !this.prevR;
    this.prevL = pad.left; this.prevR = pad.right;
    if (this.tapTimer > 0) this.tapTimer--; else this.tapDir = 0;
    let dashStart = 0;
    for (const [edge, dir] of [[lEdge, -1], [rEdge, 1]]) {
      if (!edge) continue;
      if (this.tapDir === dir) { dashStart = dir; this.tapDir = 0; }
      else { this.tapDir = dir; this.tapTimer = 15; }
    }
    if (this.invulnT > 0) this.invulnT--;

    // --- airborne physics ---
    if (!this.grounded || this.vy > 0) {
      this.airT++;
      this.vy -= GRAVITY;
      this.y += this.vy;
      this.x += this.vx;
      this.clampX();
      if (this.y <= 0) {
        this.y = 0; this.vy = 0; this.vx = 0; this.airT = 0;
        this.landT = 0;
        if (this.state === 'jump') { this.state = 'idle'; this.stateT = 0; this.attack = null; this.sfx('land'); }
        else if (this.state === 'attack') this.sfx('land');
        else if (this.state === 'hit') { this.state = 'down'; this.downTimer = DOWN_LIE + DOWN_RISE; this.stateT = 0; this.sfx('fall'); this.emit({ type: 'thud', x: this.x }); }
        else if (this.state === 'ko') { this.sfx('fall'); this.emit({ type: 'thud', x: this.x, ko: true }); }
      }
    }

    for (const k of Object.keys(this.buf)) if (this.buf[k] > 0) this.buf[k]--;

    // --- knocked down / finished ---
    if (this.state === 'down') {
      if (this.grounded && --this.downTimer <= 0) { this.state = 'idle'; this.stateT = 0; this.invulnT = 4; }
      return;
    }
    if (this.state === 'ko' || this.state === 'win') return;

    // --- stun ---
    if (this.state === 'hit') {
      if (this.grounded) {
        this.x += this.vx; this.vx *= 0.82;
        if (this.stateT > HITSTUN) { this.state = 'idle'; this.stateT = 0; this.vx = 0; }
      }
      this.clampX();
      return;
    }
    if (this.state === 'block') {
      this.x += this.vx; this.vx *= 0.8;
      if (this.stateT > BLOCKSTUN) { this.state = 'idle'; this.stateT = 0; this.vx = 0; }
      this.clampX();
      return;
    }

    // --- attacking ---
    if (this.attack) {
      const a = this.attack, d = a.def;
      a.t++;
      if (d.projectile) {
        if (a.t === a.st && (d.superN || !this.projAlive())) this.spawnProjectile(0);
        if (d.superN) for (let i = 1; i < d.superN; i++) if (a.t === a.st + i * 12) this.spawnProjectile(i);
      }
      if (d.dash && a.t >= a.st - 4 && a.t < a.st + a.act) { this.x += this.facing * d.dash; this.clampX(); }
      if (d.rising && a.t === Math.max(1, a.st - 2)) { this.vy = 0.152; this.vx = this.facing * 0.03; this.y += 0.02; }
      if (d.eruption && a.t === a.st) this.emit({ type: 'eruption', x: this.x + this.facing * 1.7 * this.scale, facing: this.facing });
      // chain: a connected light attack can cancel into the next one
      if (d.chain && a.connected && this.pressed('light')) a.buffer = true;
      if (a.buffer && a.t >= a.st + a.act + 1 && this.controllable) { this.startAttack(d.chain); return; }
      if (d.air) {
        if (this.grounded) { this.attack = null; this.state = 'idle'; this.stateT = 0; }
      } else if (a.t >= a.total) {
        this.attack = null;
        this.state = this.grounded ? (d.crouch && pad.down ? 'crouch' : 'idle') : 'jump';
        this.stateT = 0;
      }
      return;
    }

    if (!this.controllable) {
      if (this.grounded && this.state !== 'idle') { this.state = 'idle'; this.stateT = 0; }
      else if (!this.grounded) this.state = 'jump';
      this.walkDir = 0;
      return;
    }

    if (this.grounded) this.facing = opp.x >= this.x ? 1 : -1;

    // --- air: falling blade ---
    if (!this.grounded) {
      if (this.pressed('light') || this.pressed('heavy')) this.startAttack('airSlash');
      return;
    }

    // --- grounded actions ---
    const light = this.pressed('light'), heavy = this.pressed('heavy');
    if ((this.pressed('super') || (light && heavy)) && this.meter >= 100) {
      this.meter = 0;
      this.startAttack(this.char.superMove);
      this.emit({ type: 'superStart' });
      return;
    }
    if ((this.pressed('wave') || (light && this.qcfStage === 2)) && !this.projAlive()) {
      this.startAttack('wave'); this.qcfStage = 0; return;
    }
    if (this.pressed('rising') || (light && this.ddStage === 2)) {
      this.startAttack('risingSlash'); this.ddStage = 0; return;
    }
    if (this.pressed('dash') || (heavy && this.qcfStage === 2)) {
      this.startAttack('dashSlash'); this.qcfStage = 0; return;
    }
    if (light && fwd && !pad.down && Math.abs(opp.x - this.x) < 1.15 * this.scale && opp.grounded &&
        opp.state !== 'hit' && opp.state !== 'down' && opp.state !== 'ko' && opp.state !== 'block') {
      this.startAttack('throw'); return;
    }
    if (light) { this.startAttack(pad.down ? 'crouchLight' : 'slash1'); return; }
    if (heavy) { this.startAttack(pad.down ? 'sweep' : 'heavy'); return; }

    if (dashStart) {
      this.dashT = DASH_FRAMES; this.dashDir = dashStart;
      if (dashStart !== this.facing) this.invulnT = 9;      // back-dash evades
      this.sfx('dashStep');
    }
    if (this.dashT > 0) {
      this.dashT--;
      this.x += this.dashDir * DASH_SPEED * this.char.speed;
      this.clampX();
      if (this.state !== 'walk') this.stateT = 0;
      this.state = 'walk';
      this.walkDir = this.dashDir * this.facing;
      return;
    }

    if (pad.up) {
      this.vy = JUMP_VY;
      this.vx = ((pad.right ? 1 : 0) - (pad.left ? 1 : 0)) * JUMP_VX * (0.6 + 0.4 * this.char.speed);
      this.y = 0.01;
      this.state = 'jump'; this.stateT = 0; this.airT = 0;
      this.sfx('jump');
      return;
    }
    if (pad.down) {
      if (this.state !== 'crouch') this.stateT = 0;
      this.state = 'crouch'; this.walkDir = 0;
      return;
    }
    if (pad.left !== pad.right) {
      const dir = pad.right ? 1 : -1;
      const speed = (dir === this.facing ? WALK_SPEED : WALK_SPEED * BACK_FACTOR) * this.char.speed;
      this.x += dir * speed;
      this.clampX();
      if (this.state !== 'walk' || this.walkDir !== dir * this.facing) this.stateT = 0;
      this.state = 'walk';
      this.walkDir = dir * this.facing;
      return;
    }
    if (this.state !== 'idle') this.stateT = 0;
    this.state = 'idle';
    this.walkDir = 0;
  }

  spawnProjectile(i) {
    const pr = new Projectile(this, this.char.proj, i ? { dy: this.char.proj === 'quake' ? 0 : i * 0.26, speed: 1 + i * 0.12 } : {});
    this.match.projectiles.push(pr);
    this.emit({ type: 'projectile', proj: pr });
  }

  projAlive() { return this.match.projectiles.some(p => p.owner === this && p.alive); }
  clampX() { this.x = clamp(this.x, -STAGE_HALF, STAGE_HALF); }
  holdingBack() { return this.facing === 1 ? this.pad.left : this.pad.right; }
  canBlock() {
    return this.grounded && !this.attack && this.holdingBack() &&
      (this.state === 'idle' || this.state === 'walk' || this.state === 'crouch' || this.state === 'block');
  }

  receiveHit(dmg, kb, knockdown, fromX, blocked, high) {
    const dir = this.x >= fromX ? 1 : -1;
    if (blocked) {
      this.state = 'block'; this.stateT = 0; this.vx = dir * kb; this.dashT = 0;
      return 'block';
    }
    dmg = Math.max(1, Math.round(dmg * this.char.defense));
    this.hp = Math.max(0, this.hp - dmg);
    // super armour: the hit lands but does not interrupt
    if (this.hp > 0 && this.attack && this.attack.def.armor && this.attack.t < this.attack.st + this.attack.act) return 'armor';
    this.attack = null;
    this.dashT = 0;
    this.hitSeq++;
    if (this.hp <= 0) {
      this.state = 'ko'; this.stateT = 0; this.hitKind = 'launch';
      this.vy = 0.085; this.vx = dir * 0.05; this.y += 0.01;
      return 'ko';
    }
    this.state = 'hit'; this.stateT = 0;
    if (knockdown || !this.grounded) {
      this.hitKind = 'launch';
      this.vy = 0.074; this.vx = dir * 0.046; this.y += 0.01;
      return 'launch';
    }
    this.hitKind = high ? 'head' : 'chest';
    this.vx = dir * kb * 1.4;
    return 'hit';
  }
}

// ---------------------------------------------------------------------------
// CPU opponent
// ---------------------------------------------------------------------------
export function cpuThink(f, opp, match) {
  const ai = f.ai, rnd = match.rng;
  const pad = emptyPad();
  if (!f.controllable || f.state === 'down' || f.state === 'ko') return pad;
  const D = match.difficulty;
  const dist = Math.abs(opp.x - f.x);
  const fwdKey = opp.x > f.x ? 'right' : 'left';
  const backKey = opp.x > f.x ? 'left' : 'right';

  // chain a connected light attack
  if (f.attack && f.attack.def.chain && f.attack.connected && rnd() < [0.08, 0.2, 0.4][D]) { pad.light = true; return pad; }

  const incoming = match.projectiles.find(p => p.alive && p.owner !== f &&
    Math.sign(p.vx) === Math.sign(f.x - p.x) && Math.abs(p.x - f.x) < 1.7);
  if (incoming && f.grounded) {
    if (incoming.kind === 'quake' || rnd() < 0.5) { pad.up = true; pad[fwdKey] = true; }
    else pad[backKey] = true;
    return pad;
  }

  if (opp.attack && !opp.attack.def.projectile && dist < 2.3 && f.grounded && rnd() < [0.2, 0.42, 0.66][D]) {
    ai.wantBlock = true; ai.timer = 14;
  }
  if (ai.wantBlock) {
    pad[backKey] = true;
    if (--ai.timer <= 0) ai.wantBlock = false;
    return pad;
  }

  if (!opp.grounded && dist < 2.2 && f.grounded && !f.attack && rnd() < [0.02, 0.055, 0.12][D]) { pad.rising = true; return pad; }
  if (f.meter >= 100 && dist < 3.0 && f.grounded && !f.attack && rnd() < [0.01, 0.025, 0.05][D]) { pad.super = true; return pad; }

  if (ai.timer > 0) ai.timer--;
  else {
    const r = rnd();
    if (dist > 3.4) {
      if (r < 0.35 && !f.projAlive()) { ai.move = 'wave'; ai.timer = 8; }
      else if (r < 0.52) { ai.move = 'jumpin'; ai.timer = 30; }
      else { ai.move = 'approach'; ai.timer = 24; }
    } else if (dist > 2.1) {
      if (r < 0.38) { ai.move = 'approach'; ai.timer = 16; }
      else if (r < 0.54) { ai.move = 'dash'; ai.timer = 10; }
      else if (r < 0.68) { ai.move = 'jumpin'; ai.timer = 30; }
      else if (r < 0.82 && !f.projAlive()) { ai.move = 'wave'; ai.timer = 8; }
      else { ai.move = 'wait'; ai.timer = 14; }
    } else {
      if (r < 0.12 && D > 0 && dist < 1.1) { ai.move = 'grab'; ai.timer = 12; }
      else if (r < 0.36) { ai.move = 'light'; ai.timer = 10; }
      else if (r < 0.54) { ai.move = 'heavy'; ai.timer = 14; }
      else if (r < 0.66) { ai.move = 'sweep'; ai.timer = 12; }
      else if (r < 0.74) { ai.move = 'lowlight'; ai.timer = 10; }
      else if (r < 0.88) { ai.move = 'retreat'; ai.timer = 16; }
      else { ai.move = 'wait'; ai.timer = 8; }
    }
    ai.timer = Math.round(ai.timer * [1.5, 1, 0.72][D]);
    ai.fresh = true;
  }

  switch (ai.move) {
    case 'approach': pad[fwdKey] = true; break;
    case 'retreat': pad[backKey] = true; break;
    case 'jumpin':
      if (ai.fresh && f.grounded) { pad.up = true; pad[fwdKey] = true; }
      else if (!f.grounded && dist < 2.0 && !f.attack) pad.heavy = true;
      else pad[fwdKey] = true;
      break;
    case 'wave': if (ai.fresh) pad.wave = true; break;
    case 'dash': if (ai.fresh) pad.dash = true; break;
    case 'light': if (ai.fresh) pad.light = true; break;
    case 'heavy': if (ai.fresh) pad.heavy = true; break;
    case 'sweep': if (ai.fresh) { pad.down = true; pad.heavy = true; } break;
    case 'lowlight': if (ai.fresh) { pad.down = true; pad.light = true; } break;
    case 'grab': if (ai.fresh) { pad[fwdKey] = true; pad.light = true; } break;
  }
  ai.fresh = false;
  return pad;
}

// ---------------------------------------------------------------------------
// Match: two fighters, rounds, intro / fight / round-end / match-end flow.
// ---------------------------------------------------------------------------
export class Match {
  /**
   * @param {object} o  p1, p2 (character defs), cpu: [bool, bool], training, difficulty (0-2), rng
   */
  constructor(o) {
    this.rng = o.rng || Math.random;
    this.difficulty = o.difficulty ?? 1;
    this.cpu = o.cpu || [false, true];
    this.training = !!o.training;
    this.cinematic = o.cinematic !== false;
    this.events = [];
    this.projectiles = [];
    this.p1 = new Fighter(o.p1, 0, this);
    this.p2 = new Fighter(o.p2, 1, this);
    this.fighters = [this.p1, this.p2];
    this.round = 1;
    this.wins = [0, 0];
    this.frame = 0;
    this.combo = { count: 0, timer: 0, owner: null, damage: 0 };
    this.victor = null;
    this.startRound();
  }

  emit(ev) { this.events.push(ev); }
  announce(text, dur, opts = {}) { this.emit(Object.assign({ type: 'announce', text, dur }, opts)); }

  startRound() {
    this.p1.resetRound();
    this.p2.resetRound();
    this.projectiles.length = 0;
    this.timeLeft = ROUND_TIME;
    this.timerAcc = 0;
    this.hitstop = 0;
    this.suddenDeath = false;
    this.flawless = false;
    this.screen = 'intro';
    this.screenT = 0;
    this.combo.count = 0; this.combo.timer = 0;
    this.lastDmgF = 0;
    this.emit({ type: 'roundStart', round: this.round });
  }

  get finalRound() { return this.wins[0] === ROUNDS_TO_WIN - 1 && this.wins[1] === ROUNDS_TO_WIN - 1; }
  get introLength() { return this.round === 1 && this.cinematic ? 452 : 104; }

  /** Jump the opening cinematic straight to the countdown. */
  skipIntro() {
    if (this.screen !== 'intro' || !(this.round === 1 && this.cinematic)) return false;
    if (this.screenT >= 284) return false;
    for (const f of this.fighters) { f.attack = null; f.state = 'idle'; f.stateT = 0; }
    this.screenT = 284;
    return true;
  }

  tick(pad1, pad2) {
    this.frame++;
    this.screenT++;
    const k = this.screenT;
    switch (this.screen) {
      case 'intro': {
        if (this.round === 1 && this.cinematic) {
          // establishing shot -> each fighter shows their blade work -> countdown
          if (k === 1) this.emit({ type: 'cine', shot: 'establish' });
          if (k === 76) { this.emit({ type: 'cine', shot: 'p1' }); this.emit({ type: 'nameCard', side: 0 }); }
          if (k === 96) this.p1.startAttack('slash1');
          if (k === 124) this.p1.startAttack('slash2');
          if (k === 180) { this.emit({ type: 'cine', shot: 'p2' }); this.emit({ type: 'nameCard', side: 1 }); }
          if (k === 200) this.p2.startAttack('heavy');
          if (k === 285) {
            this.emit({ type: 'cine', shot: 'fight' });
            this.announce('ROUND 1', 62, { vo: 'vo_round_1', gong: true, kanji: '壱' });
          }
          if (k === 352) this.announce('3', 26, { vo: 'vo_3', count: true });
          if (k === 382) this.announce('2', 26, { vo: 'vo_2', count: true });
          if (k === 412) this.announce('1', 26, { vo: 'vo_1', count: true });
        } else {
          if (k === 1) {
            this.emit({ type: 'cine', shot: 'fight' });
            const fin = this.finalRound;
            this.announce(fin ? 'FINAL ROUND' : 'ROUND ' + this.round, 62,
              { vo: fin ? 'vo_final_round' : 'vo_round_' + Math.min(3, this.round), gong: true, kanji: fin ? '終' : ['壱', '弐', '参'][Math.min(2, this.round - 1)] });
          }
          if (k === 62) this.announce('READY', 34, { vo: 'vo_ready' });
        }
        if (k >= this.introLength) {
          this.screen = 'fight'; this.screenT = 0;
          this.announce('FIGHT', 48, { vo: 'vo_fight', fight: true });
          this.p1.controllable = true; this.p2.controllable = true;
        }
        this.updateFight(true, pad1, pad2);
        break;
      }
      case 'fight':
        this.updateFight(false, pad1, pad2);
        if (this.screen !== 'fight') break;
        if (!this.training && this.hitstop <= 0 && ++this.timerAcc >= 60) {
          this.timerAcc = 0;
          if (--this.timeLeft <= 0) this.endRound(true);
          else if (this.timeLeft === 10) this.emit({ type: 'vo', name: 'vo_hurry' });
        }
        if (this.training && this.frame - this.lastDmgF > 110) {
          for (const f of this.fighters) {
            if (f.hp < MAX_HP && f.state !== 'hit' && f.state !== 'down' && f.state !== 'ko') f.hp = f.hpGhost = MAX_HP;
          }
          this.p1.meter = 100;
        }
        break;
      case 'roundend': {
        if (this.flawless && k === 64) { this.announce('FLAWLESS VICTORY', 80, { vo: 'vo_flawless' }); this.flawless = false; }
        const v = this.victor;
        if (v && v.hp > 0 && v.grounded) {
          // the winner performs a short kata over the fallen opponent
          if (v.state === 'win' && k >= 78 && k < 190) { v.state = 'idle'; v.stateT = 0; }
          if (k === 84) v.startAttack('slash1');
          if (k === 112) v.startAttack('slash2');
          if (k === 150) v.startAttack('heavy');
          if (k === 205 && !v.attack) { v.state = 'win'; v.stateT = 0; }
        }
        if (k === 78 && v) this.emit({ type: 'cine', shot: 'win', side: v.side });
        this.updateFight(true, pad1, pad2);
        if (k > 262) {
          if (this.wins[0] >= ROUNDS_TO_WIN || this.wins[1] >= ROUNDS_TO_WIN) {
            this.screen = 'matchend'; this.screenT = 0;
            this.winner = this.wins[0] >= ROUNDS_TO_WIN ? this.p1 : this.p2;
            this.emit({ type: 'matchEnd', winner: this.winner });
          } else {
            this.round++;
            this.startRound();
          }
        }
        break;
      }
      case 'matchend': {
        const v = this.victor;
        if (v && v.state !== 'ko' && v.state !== 'down' && v.grounded && !v.attack && k % 170 === 90) {
          const seq = ['slash1', 'heavy', 'dashSlash', 'sweep', 'risingSlash'];
          v.state = 'idle';
          v.startAttack(seq[Math.floor(k / 170) % seq.length]);
        } else if (v && v.state === 'idle' && !v.attack && v.grounded && v.stateT > 12) { v.state = 'win'; v.stateT = 0; }
        this.updateFight(true, pad1, pad2);
        break;
      }
    }
  }

  updateFight(frozen, pad1, pad2) {
    if (this.hitstop > 0) {
      this.hitstop--;
      if (!frozen) { if (pad1) this.p1.bufferInput(pad1); if (pad2) this.p2.bufferInput(pad2); }
      return;
    }
    const p1 = this.p1, p2 = this.p2;
    let a = emptyPad(), b = emptyPad();
    if (!frozen) {
      a = this.cpu[0] ? cpuThink(p1, p2, this) : (pad1 || a);
      b = this.training && this.cpu[1] ? emptyPad() : this.cpu[1] ? cpuThink(p2, p1, this) : (pad2 || b);
    }
    for (const f of this.fighters) {
      if (f.hpGhost > f.hp) f.hpGhost = Math.max(f.hp, f.hpGhost - 0.55); else f.hpGhost = f.hp;
    }
    if (this.combo.timer > 0 && --this.combo.timer === 0) { this.combo.count = 0; this.combo.damage = 0; }
    p1.update(a, p2);
    p2.update(b, p1);

    // keep the fighters from standing inside each other
    if (p1.grounded && p2.grounded && p1.state !== 'down' && p2.state !== 'down' && p1.state !== 'ko' && p2.state !== 'ko') {
      const ov = PUSH_WIDTH * (p1.scale + p2.scale) / 2 - Math.abs(p1.x - p2.x);
      if (ov > 0) {
        const dir = p1.x <= p2.x ? 1 : -1;
        p1.x -= dir * ov / 2; p2.x += dir * ov / 2;
        p1.clampX(); p2.clampX();
      }
    }

    if (!frozen) {
      this.resolveHit(p1, p2);
      this.resolveHit(p2, p1);
    }

    for (const pr of this.projectiles) {
      if (!pr.alive) continue;
      pr.update();
      if (!pr.alive) { this.emit({ type: 'projEnd', proj: pr, fizzle: true }); continue; }
      const target = pr.owner === p1 ? p2 : p1;
      if (!frozen && target.state !== 'down' && target.state !== 'ko' && target.invulnT <= 0 && overlap(pr.box, target.body)) {
        pr.alive = false;
        const blocked = target.canBlock();
        const spec = pr.spec;
        const dmg = Math.round(spec.damage * pr.owner.char.power);
        const hpBefore = target.hp;
        const res = target.receiveHit(dmg, spec.kb, !!spec.knockdown, pr.x - pr.facing, blocked, false);
        if (blocked) target.hp = Math.max(1, target.hp - 2);
        else {
          this.hitstop = 7;
          pr.owner.meter = Math.min(100, pr.owner.meter + 9);
          this.registerCombo(pr.owner, hpBefore - target.hp);
          this.lastDmgF = this.frame;
        }
        this.emit({ type: 'hit', x: pr.x, y: pr.y, blocked, special: true, proj: pr, attacker: pr.owner, defender: target, ko: res === 'ko', dir: pr.facing, dmg: hpBefore - target.hp, res });
        this.emit({ type: 'projEnd', proj: pr });
        this.checkKO();
      }
      for (const other of this.projectiles) {
        if (other !== pr && other.alive && pr.alive && other.owner !== pr.owner && overlap(pr.box, other.box)) {
          pr.alive = false; other.alive = false;
          this.emit({ type: 'clash', x: (pr.x + other.x) / 2, y: (pr.y + other.y) / 2 });
          this.emit({ type: 'projEnd', proj: pr }); this.emit({ type: 'projEnd', proj: other });
        }
      }
    }
    this.projectiles = this.projectiles.filter(p => p.alive);
  }

  resolveHit(attacker, defender) {
    const a = attacker.attack;
    if (!a) return;
    if (a.hasHit && !(a.def.rehit && a.t - a.lastHitT >= a.def.rehit)) return;
    const hb = attacker.attackBox();
    if (!hb) return;
    if (defender.state === 'down' || defender.state === 'ko' || defender.invulnT > 0) return;
    const body = defender.body;
    if (!overlap(hb, body)) return;
    const def = a.def;
    if (def.isThrow && !defender.grounded) return;

    a.hasHit = true; a.connected = true; a.lastHitT = a.t;
    const dir = defender.x >= attacker.x ? 1 : -1;
    const sx = (Math.max(hb.x, body.x) + Math.min(hb.x + hb.w, body.x + body.w)) / 2;
    const sy = clamp(hb.y + hb.h * 0.55, body.y + 0.25, body.y + body.h - 0.15);
    const hpBefore = defender.hp;

    if (def.isThrow) {
      defender.hp = Math.max(0, defender.hp - Math.round(def.damage * attacker.char.power));
      defender.attack = null; defender.hitSeq++;
      defender.state = defender.hp <= 0 ? 'ko' : 'hit';
      defender.hitKind = 'launch';
      defender.stateT = 0; defender.vy = 0.092; defender.vx = dir * 0.07; defender.y += 0.02;
      attacker.meter = Math.min(100, attacker.meter + 12);
      this.hitstop = 9;
      this.registerCombo(attacker, hpBefore - defender.hp);
      this.lastDmgF = this.frame;
      this.emit({ type: 'hit', x: defender.x, y: 1.2 * defender.scale, blocked: false, thrown: true, attacker, defender, ko: defender.hp <= 0, dir, dmg: hpBefore - defender.hp, def, res: defender.hp <= 0 ? 'ko' : 'launch' });
      this.checkKO();
      return;
    }

    const blocked = defender.canBlock();
    const counter = !blocked && !!defender.attack && defender.attack.t < defender.attack.st && !defender.attack.def.armor;
    let dmg = Math.round(def.damage * attacker.char.power);
    if (!blocked) {
      dmg = Math.max(1, Math.round(dmg * Math.pow(0.9, Math.max(0, this.comboCount(attacker) - 1))));
      if (counter) dmg = Math.round(dmg * 1.3);
    }
    const high = hb.y + hb.h * 0.5 > body.y + body.h * 0.62;
    const res = defender.receiveHit(dmg, def.kb, !!def.knockdown, attacker.x, blocked, high);
    if (counter && res === 'hit') defender.stateT = -8;
    attacker.meter = Math.min(100, attacker.meter + (blocked ? 5 : 11));
    defender.meter = Math.min(100, defender.meter + (blocked ? 3 : 8));
    if (blocked && def.chip) defender.hp = Math.max(1, defender.hp - def.chip);
    if (!blocked) {
      this.registerCombo(attacker, hpBefore - defender.hp);
      this.hitstop = def.isSuper ? 13 : def.special || def.heavy ? 12 : 9;
      this.lastDmgF = this.frame;
    } else this.hitstop = 4;
    // attacker recoil on contact
    if (!def.dash) { attacker.vx = 0; attacker.x -= attacker.facing * 0.05; attacker.clampX(); }
    this.emit({ type: 'hit', x: sx, y: sy, blocked, special: !!def.special, isSuper: !!def.isSuper, heavy: !!def.heavy, counter, attacker, defender, ko: res === 'ko', dir, dmg: hpBefore - defender.hp, def, res });
    this.checkKO();
  }

  comboCount(attacker) { return this.combo.owner === attacker && this.combo.timer > 0 ? this.combo.count : 0; }
  registerCombo(attacker, dmg) {
    if (this.combo.owner === attacker && this.combo.timer > 0) { this.combo.count++; this.combo.damage += dmg; }
    else { this.combo.count = 1; this.combo.owner = attacker; this.combo.damage = dmg; }
    this.combo.timer = 62;
    if (this.combo.count >= 2) this.emit({ type: 'combo', count: this.combo.count, damage: this.combo.damage, side: attacker.side });
  }

  checkKO() {
    if (this.screen !== 'fight') return;
    if (this.p1.hp <= 0 || this.p2.hp <= 0) this.endRound(false);
  }

  endRound(timeUp) {
    const p1 = this.p1, p2 = this.p2;
    if (timeUp && p1.hp === p2.hp && !this.suddenDeath) {
      this.suddenDeath = true;
      p1.hp = p1.hpGhost = 1; p2.hp = p2.hpGhost = 1;
      this.timeLeft = 20;
      this.announce('SUDDEN DEATH', 80, { vo: 'vo_sudden' });
      return;
    }
    p1.controllable = false; p2.controllable = false;
    let winner = null;
    if (timeUp) {
      if (p1.hp > p2.hp) winner = p1; else if (p2.hp > p1.hp) winner = p2;
      this.announce('TIME UP', 90, { vo: winner ? 'vo_time_over' : 'vo_tie' });
    } else {
      winner = p1.hp > 0 ? p1 : p2;
      if (p1.hp <= 0 && p2.hp <= 0) winner = null;
      this.announce('K.O.', 96, { ko: true });
      this.flawless = !!winner && winner.hp >= MAX_HP;
    }
    if (winner) this.wins[winner.side]++;
    if (winner && winner.state !== 'ko' && winner.state !== 'down' && !winner.attack && winner.grounded) { winner.state = 'win'; winner.stateT = 0; }
    this.victor = winner;
    this.screen = 'roundend'; this.screenT = 0;
    this.emit({ type: 'roundEnd', winner, timeUp });
  }
}

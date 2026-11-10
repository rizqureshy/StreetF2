// Swift Sword — input: keyboard (two players), gamepads and touch, merged into
// the simulation's pad format plus a small menu-navigation event stream.
import { emptyPad, BUTTONS } from './sim.js';

const keysDown = Object.create(null);
const keysPressed = new Set();          // key codes pressed since the last sim tick
const navQueue = [];                    // 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'pause' (+ player index)

export const KEYMAPS = [
  { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', light: 'KeyF', heavy: 'KeyG', super: 'KeyH', wave: 'KeyR', dash: 'KeyT', rising: 'KeyY' },
  { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', light: 'KeyK', heavy: 'KeyL', super: 'Semicolon', wave: 'KeyI', dash: 'KeyO', rising: 'KeyP' },
];

const NAV_KEYS = {
  ArrowUp: ['up', 1], ArrowDown: ['down', 1], ArrowLeft: ['left', 1], ArrowRight: ['right', 1],
  KeyW: ['up', 0], KeyS: ['down', 0], KeyA: ['left', 0], KeyD: ['right', 0],
  Enter: ['confirm', 0], NumpadEnter: ['confirm', 1], Space: ['confirm', 0], KeyF: ['confirm', 0], KeyK: ['confirm', 1],
  Escape: ['back', 0], Backspace: ['back', 0], KeyP: ['pause', 0],
};

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', e => {
    if (e.repeat) { if (NAV_KEYS[e.code] && /^Arrow|^Key[WASD]$/.test(e.code)) navQueue.push({ action: NAV_KEYS[e.code][0], player: NAV_KEYS[e.code][1], repeat: true }); return; }
    if (!keysDown[e.code]) keysPressed.add(e.code);
    keysDown[e.code] = true;
    const nav = NAV_KEYS[e.code];
    if (nav) navQueue.push({ action: nav[0], player: nav[1], code: e.code });
    else navQueue.push({ action: 'key', code: e.code, player: 0 });
    if (/^Arrow|^Space$/.test(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', e => { keysDown[e.code] = false; });
  window.addEventListener('blur', () => { for (const k of Object.keys(keysDown)) keysDown[k] = false; });
}

// --- touch (state is written by the on-screen controls in ui.js) -----------
export const Touch = {
  enabled: typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
  dir: { left: false, right: false, up: false, down: false },
  queue: new Set(),
  press(btn) { this.queue.add(btn); },
};

// --- gamepads ---------------------------------------------------------------
const padPrev = [{}, {}];
const GP_BUTTONS = { light: 2, heavy: 0, dash: 1, rising: 3, wave: 5, super: 7 };
function pollGamepad(idx) {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  let gp = null;
  try { gp = navigator.getGamepads()[idx]; } catch (e) { return null; }
  if (!gp || !gp.connected) return null;
  const prev = padPrev[idx];
  const held = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  const st = {
    left: held(14) || ax < -0.4, right: held(15) || ax > 0.4,
    up: held(12) || ay < -0.55, down: held(13) || ay > 0.5,
    start: held(9), back: held(8),
  };
  for (const [name, i] of Object.entries(GP_BUTTONS)) st[name] = held(i);
  const edges = {};
  for (const k of Object.keys(st)) { edges[k] = st[k] && !prev[k]; prev[k] = st[k]; }
  for (const d of ['up', 'down', 'left', 'right']) if (edges[d]) navQueue.push({ action: d, player: idx });
  if (edges.heavy || edges.light) navQueue.push({ action: 'confirm', player: idx });
  if (edges.dash || edges.back) navQueue.push({ action: 'back', player: idx });
  if (edges.start) navQueue.push({ action: 'pause', player: idx });
  return { st, edges };
}
const gpEdge = [Object.create(null), Object.create(null)];
const gpState = [null, null];

/** Call once per rendered frame. */
export function pollInput() {
  for (let i = 0; i < 2; i++) {
    const g = pollGamepad(i);
    gpState[i] = g ? g.st : null;
    if (g) for (const b of BUTTONS) if (g.edges[b]) gpEdge[i][b] = true;
  }
}

/** Build the simulation pad for player `i` (edges are consumed by endTick). */
export function readPad(i, useTouch) {
  const map = KEYMAPS[i];
  const pad = emptyPad();
  pad.left = !!keysDown[map.left]; pad.right = !!keysDown[map.right];
  pad.up = !!keysDown[map.up]; pad.down = !!keysDown[map.down];
  for (const b of BUTTONS) pad[b] = keysPressed.has(map[b]);
  const g = gpState[i];
  if (g) {
    pad.left = pad.left || g.left; pad.right = pad.right || g.right; pad.up = pad.up || g.up; pad.down = pad.down || g.down;
    for (const b of BUTTONS) pad[b] = pad[b] || !!gpEdge[i][b];
  }
  if (useTouch && Touch.enabled) {
    pad.left = pad.left || Touch.dir.left; pad.right = pad.right || Touch.dir.right;
    pad.up = pad.up || Touch.dir.up; pad.down = pad.down || Touch.dir.down;
    for (const b of Touch.queue) pad[b] = true;
  }
  return pad;
}

/** Clear edge-triggered state after a simulation tick has consumed it. */
export function endTick() {
  keysPressed.clear();
  Touch.queue.clear();
  for (const e of gpEdge) for (const k of Object.keys(e)) delete e[k];
}

export function drainNav() { return navQueue.splice(0, navQueue.length); }
export function anyGamepad() { return !!(gpState[0] || gpState[1]); }

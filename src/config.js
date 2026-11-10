// Swift Sword — shared game data. Pure data, no DOM/three imports, so the
// simulation and its tests can run headless in Node.
//
// Units: metres and 60 Hz frames. Fighters live on a 2D plane (x = stage
// axis, y = height above the floor); the renderer maps that into 3D.

export const STEP = 1000 / 60;
export const STAGE_HALF = 5.2;        // fighters are clamped to |x| <= STAGE_HALF
export const START_X = 1.9;
export const GRAVITY = 0.0082;
export const JUMP_VY = 0.168;
export const JUMP_VX = 0.047;
export const WALK_SPEED = 0.039;
export const BACK_FACTOR = 0.78;
export const DASH_SPEED = 0.11;
export const DASH_FRAMES = 13;
export const MAX_HP = 100;
export const ROUND_TIME = 99;
export const ROUNDS_TO_WIN = 2;
export const HITSTUN = 26;
export const BLOCKSTUN = 18;
export const DOWN_LIE = 24;           // frames flat on the ground
export const DOWN_RISE = 34;          // frames getting back up
export const BODY_HALF = 0.31;
export const PUSH_WIDTH = 0.98;
export const INPUT_BUFFER = 8;

// ---------------------------------------------------------------------------
// Attacks. startup/active/recovery are frames. `box` is the hit volume in
// metres relative to the fighter origin (feet centre) facing +x:
// x = near edge, y = bottom, w = reach, h = height.
// `anim` ties the frame data to an animation clip: the startup frames play
// clip time pre -> hit, so the blade always crosses the target on the exact
// frame the hitbox turns on; the rest plays hit -> end (then `rec`).
// ---------------------------------------------------------------------------
export const ATTACKS = {
  slash1: {
    label: 'SLASH', startup: 9, active: 5, recovery: 15, damage: 6, kb: 0.05,
    box: { x: 0.1, y: 0.8, w: 1.7, h: 0.95 }, chain: 'slash2',
    anim: { clip: 'slashA', pre: 0.03, hit: 0.235, end: 0.43, rec: ['slashARec', 0, 0.9] },
  },
  slash2: {
    label: 'CROSS CUT', startup: 10, active: 5, recovery: 17, damage: 7, kb: 0.055,
    box: { x: 0.1, y: 0.35, w: 1.8, h: 1.5 }, chain: 'slash3',
    anim: { clip: 'slashB', pre: 0.06, hit: 0.25, end: 0.53, rec: ['slashBRec', 0, 0.95] },
  },
  slash3: {
    label: 'SKYFALL', startup: 15, active: 6, recovery: 27, damage: 10, kb: 0.07, knockdown: true,
    box: { x: 0.15, y: 0, w: 1.95, h: 2.1 },
    anim: { clip: 'spin', pre: 0.36, hit: 0.665, end: 1.55 },
  },
  heavy: {
    label: 'CLEAVE', startup: 17, active: 6, recovery: 25, damage: 12, kb: 0.085, chip: 1, heavy: true,
    box: { x: 0.15, y: 0, w: 2.0, h: 2.3 },
    anim: { clip: 'cleave', pre: 0.08, hit: 0.42, end: 1.4 },
  },
  crouchLight: {
    label: 'LOW THRUST', startup: 9, active: 5, recovery: 14, damage: 5, kb: 0.04, crouch: true,
    box: { x: 0.15, y: 0.25, w: 1.85, h: 0.75 },
    anim: { clip: 'spin', pre: 0.0, hit: 0.14, end: 0.3 },
  },
  sweep: {
    label: 'REAPING SWEEP', startup: 13, active: 6, recovery: 22, damage: 8, kb: 0.04, crouch: true, knockdown: true,
    box: { x: 0.1, y: 0, w: 1.75, h: 0.6 },
    anim: { clip: 'flurry', pre: 2.42, hit: 2.63, end: 3.75 },
  },
  airSlash: {
    label: 'FALLING BLADE', startup: 8, active: 14, recovery: 10, damage: 9, kb: 0.06, air: true,
    box: { x: -0.1, y: -0.55, w: 1.75, h: 1.7 },
    anim: { clip: 'slashB', pre: 0.05, hit: 0.25, end: 0.5 },
  },
  wave: {
    label: 'WAVE', startup: 20, active: 1, recovery: 28, damage: 0, kb: 0, projectile: true, special: true,
    anim: { clip: 'overhand', pre: 0.1, hit: 0.4, end: 1.25 },
  },
  dashSlash: {
    label: 'DASH', startup: 13, active: 15, recovery: 20, damage: 10, kb: 0.07, knockdown: true,
    dash: 0.075, chip: 2, special: true,
    box: { x: 0.05, y: 0.45, w: 1.95, h: 1.15 },
    anim: { clip: 'dash', pre: 0.08, hit: 0.32, end: 1.45 },
  },
  risingSlash: {
    label: 'RISE', startup: 9, active: 18, recovery: 24, damage: 11, kb: 0.06, knockdown: true,
    rising: true, chip: 2, special: true,
    box: { x: -0.3, y: 0.3, w: 1.6, h: 2.5 },
    anim: { clip: 'spin', pre: 0.02, hit: 0.16, end: 0.74, rec: ['spin', 1.2, 1.65] },
  },
  throw: {
    label: 'BREAKER', startup: 7, active: 4, recovery: 20, damage: 10, kb: 0, isThrow: true,
    box: { x: 0.05, y: 0.4, w: 0.95, h: 1.3 },
    anim: { clip: 'hook', pre: 0.1, hit: 0.27, end: 0.47, rec: ['hookRec', 0, 0.6] },
  },
  // --- supers ---
  superWave: {
    label: 'BARRAGE', startup: 24, active: 1, recovery: 46, damage: 0, kb: 0, projectile: true,
    special: true, isSuper: true, superN: 3,
    segs: [
      [0, 24, 'overhand', 0.1, 0.4], [24, 36, 'slashA', 0.1, 0.26], [36, 48, 'slashB', 0.08, 0.27],
      [48, 71, 'slashBRec', 0.1, 0.95],
    ],
  },
  superCuts: {
    label: 'CUTS', startup: 12, active: 34, recovery: 24, damage: 4, kb: 0.03, knockdown: true,
    dash: 0.085, chip: 4, special: true, isSuper: true, rehit: 6,
    box: { x: -0.1, y: 0.2, w: 2.0, h: 1.8 },
    segs: [[0, 12, 'flurry', 0.12, 0.46], [12, 46, 'flurry', 0.46, 1.95], [46, 70, 'flurry', 3.45, 4.2]],
  },
  superCleave: {
    label: 'CLEAVER', startup: 34, active: 9, recovery: 40, damage: 30, kb: 0.1, knockdown: true,
    chip: 8, special: true, isSuper: true, armor: true, eruption: true,
    box: { x: 0.2, y: 0, w: 3.3, h: 3.0 },
    anim: { clip: 'flurry', pre: 2.2, hit: 2.63, end: 4.0 },
  },
};

// Projectile archetypes (half extents in metres).
export const PROJECTILES = {
  crescent: { speed: 0.09, y: 1.15, hw: 0.3, hh: 0.55, damage: 10, kb: 0.07 },
  fox:      { speed: 0.128, y: 1.2, hw: 0.26, hh: 0.26, damage: 7, kb: 0.05 },
  quake:    { speed: 0.072, y: 0.42, hw: 0.45, hh: 0.42, damage: 13, kb: 0.06, knockdown: true, range: 6.2 },
};

// ---------------------------------------------------------------------------
// Fighters. `over` patches entries of ATTACKS for that character.
// ---------------------------------------------------------------------------
export const CHARACTERS = [
  {
    id: 'kaito', name: 'KAITO', title: 'The Wandering Blade', kanji: '風', model: 'kaito',
    height: 1.78, speed: 1, power: 1, defense: 1,
    color: '#58b4ff', stats: { power: 3, speed: 3, reach: 3 },
    proj: 'crescent', superMove: 'superWave',
    blade: { length: 0.84, curve: 0.045, width: 0.034 },
    moves: { wave: 'TEMPEST WAVE', dashSlash: 'GALE DASH', risingSlash: 'DRAGON ASCENT', superWave: 'TEMPEST BARRAGE' },
    jump: 'jump',
    taunt: 'My blade never wavers.',
    bio: 'A masterless swordsman who walks the old roads, answering every challenge with one clean cut.',
  },
  {
    id: 'akane', name: 'AKANE', title: 'Fox of the Red Moon', kanji: '狐', model: 'akane',
    height: 1.68, speed: 1.17, power: 0.86, defense: 1.06,
    color: '#ff4d7a', stats: { power: 2, speed: 5, reach: 2 },
    proj: 'fox', superMove: 'superCuts',
    blade: { length: 0.72, curve: 0.02, width: 0.03 },
    moves: { wave: 'FOXFIRE', dashSlash: 'CRIMSON STEP', risingSlash: 'MOON VAULT', superCuts: 'THOUSAND CUTS' },
    over: {
      wave: { startup: 15, recovery: 23, segs: [[0, 10, 'castIn', 0.1, 0.53], [10, 15, 'castShoot', 0, 0.12], [15, 30, 'castShoot', 0.12, 0.5], [30, 39, 'castOut', 0, 0.43]] },
      slash1: { startup: 8 }, slash2: { startup: 9 }, dashSlash: { dash: 0.088 },
    },
    jump: 'flip',
    taunt: 'You never even saw the mask slip.',
    bio: 'Shrine-born assassin. Faster than rumor, and twice as hard to catch.',
  },
  {
    id: 'kurogane', name: 'KUROGANE', title: 'The Iron Shogun', kanji: '鉄', model: 'kurogane',
    height: 1.94, speed: 0.86, power: 1.25, defense: 0.88,
    color: '#ff8a2a', stats: { power: 5, speed: 2, reach: 4 },
    proj: 'quake', superMove: 'superCleave',
    blade: { length: 1.02, curve: 0.06, width: 0.042 },
    moves: { wave: 'EARTH SPLITTER', dashSlash: 'IRON CHARGE', risingSlash: 'WARLORD RISING', superCleave: 'HELL CLEAVER' },
    over: {
      wave: { startup: 24, recovery: 30, anim: { clip: 'cleave', pre: 0.08, hit: 0.42, end: 1.4 } },
      heavy: { startup: 19, box: { x: 0.15, y: 0, w: 2.25, h: 2.5 } },
      slash1: { box: { x: 0.1, y: 0.8, w: 1.95, h: 1.0 } }, slash2: { box: { x: 0.1, y: 0.35, w: 2.0, h: 1.6 } },
      slash3: { box: { x: 0.15, y: 0, w: 2.2, h: 2.3 } },
    },
    jump: 'jump',
    taunt: 'Kneel. The war was over before you drew.',
    bio: 'Lord of a burned province. His armor has not been opened in ten years.',
  },
  {
    id: 'shura', name: 'SHURA', title: 'Demon of the Ashes', kanji: '鬼', model: 'kurogane', boss: true,
    height: 2.08, speed: 0.98, power: 1.34, defense: 0.84,
    color: '#ff2a1a', stats: { power: 5, speed: 3, reach: 5 },
    tint: [1.0, 0.42, 0.38], glow: [0.5, 0.02, 0.0],
    proj: 'quake', superMove: 'superCleave',
    blade: { length: 1.12, curve: 0.07, width: 0.046, glow: '#ff3010' },
    moves: { wave: 'HELLFIRE RIFT', dashSlash: 'DEMON CHARGE', risingSlash: 'ONI RISING', superCleave: 'MASSACRE' },
    over: {
      wave: { startup: 21, recovery: 28, anim: { clip: 'cleave', pre: 0.08, hit: 0.42, end: 1.4 } },
      heavy: { box: { x: 0.15, y: 0, w: 2.4, h: 2.6 } },
      slash1: { box: { x: 0.1, y: 0.8, w: 2.05, h: 1.05 } }, slash2: { box: { x: 0.1, y: 0.35, w: 2.1, h: 1.7 } },
      slash3: { box: { x: 0.15, y: 0, w: 2.3, h: 2.4 } },
    },
    jump: 'jump',
    taunt: 'Your soul is mine.',
    bio: 'What the fire left behind when the keep fell. It does not remember being a man.',
  },
];
export const charById = id => CHARACTERS.find(c => c.id === id);

// Resolve a character's own version of an attack (base data + overrides).
const movesetCache = new Map();
export function moveset(char) {
  let m = movesetCache.get(char.id);
  if (!m) {
    m = {};
    for (const [name, def] of Object.entries(ATTACKS)) {
      const o = (char.over && char.over[name]) || null;
      m[name] = o ? Object.assign({}, def, o) : def;
      if (o && o.segs) delete m[name].anim;
      if (o && o.anim) delete m[name].segs;
    }
    movesetCache.set(char.id, m);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------
export const STAGES = [
  {
    id: 'moon', name: 'MOONLIT SHRINE', kanji: '月', sub: 'Where the old gods still listen',
    bg: 'moon', ground: 'ground_stone', music: 'duel',
    fog: 0x0b1228, fogDensity: 0.03,
    sky: 0x2a3a6a, groundTint: 0x8a94b8,
    key: { color: 0xa9c4ff, intensity: 3.1, pos: [-7, 9, -6] },
    fill: { color: 0xffb08a, intensity: 0.85, pos: [5, 4, 9] },
    hemi: { sky: 0x4a62a8, ground: 0x1a1420, intensity: 0.85 },
    exposure: 1.02, bloom: 0.55, weather: 'petals', props: 'shrine',
  },
  {
    id: 'siege', name: 'BURNING KEEP', kanji: '炎', sub: 'The last night of a proud house',
    bg: 'siege', ground: 'ground_ash', music: 'doom',
    fog: 0x1c0a08, fogDensity: 0.034,
    sky: 0x5a1a10, groundTint: 0xb89a8a,
    key: { color: 0xff7a3a, intensity: 3.2, pos: [8, 6, -7] },
    fill: { color: 0xffd9b8, intensity: 1.5, pos: [-5, 5, 9] },
    hemi: { sky: 0xa0402a, ground: 0x241008, intensity: 1.2 },
    exposure: 1.05, bloom: 0.45, weather: 'embers', props: 'siege',
  },
  {
    id: 'storm', name: 'STORM GROVE', kanji: '嵐', sub: 'Thunder keeps its own counsel',
    bg: 'storm', ground: 'ground_slate', music: 'night',
    fog: 0x0c181b, fogDensity: 0.04,
    sky: 0x20403f, groundTint: 0x93a8a8, wet: true,
    key: { color: 0xa8e8e0, intensity: 2.6, pos: [3, 10, -8] },
    fill: { color: 0xb8d0e0, intensity: 0.8, pos: [-4, 5, 9] },
    hemi: { sky: 0x3a6866, ground: 0x0c1412, intensity: 0.95 },
    exposure: 1.05, bloom: 0.5, weather: 'rain', props: 'grove',
  },
];
export const stageById = id => STAGES.find(s => s.id === id);

export const DIFFICULTY = ['EASY', 'NORMAL', 'HARD'];

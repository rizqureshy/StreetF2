// Specials, supers, throws, dashes, pause, training pieces.
const { boot } = require('./harness');
const { game, press, release, frames } = boot();
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } };

frames(3);
press('Enter'); frames(2); release('Enter');
press('ArrowDown'); frames(2); release('ArrowDown');
press('ArrowDown'); frames(2); release('ArrowDown');         // 2 PLAYERS
press('Enter'); frames(2); release('Enter');
assert(!game.vsCpu, '2P mode');
press('KeyF'); frames(2); release('KeyF');
press('KeyK'); frames(2); release('KeyK');
frames(40);
assert(game.screen === 'stagesel', 'stagesel, got ' + game.screen);
press('KeyD'); frames(2); release('KeyD');                   // moonlit stage
press('Enter'); frames(2); release('Enter');
assert(game.stageIdx === 1, 'stage 1 picked');
frames(620);
assert(game.screen === 'fight', 'fight, got ' + game.screen);

// QCF wave
press('KeyS'); frames(4); release('KeyS');
press('KeyD'); frames(2);
press('KeyF'); frames(2); release('KeyF'); release('KeyD');
assert(game.p1.attack && game.p1.attack.name === 'hadouken', 'wave input');
frames(140);

// super
game.p1.meter = 100;
game.p1.state = 'idle'; game.p1.attack = null;
press('KeyH'); frames(2); release('KeyH');
assert(game.p1.attack && game.p1.attack.name === game.p1.char.superMove, 'super triggers');
assert(game.p1.meter === 0, 'meter spent');
frames(220);

// throw (opponent must be clean idle)
game.p1.x = 400; game.p2.x = 488;
game.p1.state = 'idle'; game.p1.attack = null;
game.p2.state = 'idle'; game.p2.attack = null; game.p2.stateT = 50;
press('KeyD'); frames(1);
press('KeyF'); frames(2);
assert(game.p1.attack && game.p1.attack.name === 'throw', 'throw, got ' + (game.p1.attack && game.p1.attack.name));
release('KeyF'); release('KeyD');
frames(120);

// dash
game.p1.state = 'idle'; game.p1.attack = null;
const x0 = game.p1.x;
press('KeyA'); frames(2); release('KeyA'); frames(3);
press('KeyA'); frames(2); release('KeyA');
frames(15);
assert(Math.abs(game.p1.x - x0) > 60, 'dash distance');

// pause
press('Escape'); frames(2); release('Escape');
assert(game.paused, 'pause opens');
press('Escape'); frames(2); release('Escape');
assert(!game.paused, 'pause closes');

console.log('mechanics OK');

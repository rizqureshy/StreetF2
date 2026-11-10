// Full match flow vs CPU with chaotic inputs; asserts no crash and screen flow.
const { boot } = require('./harness');
const { game, press, release, frames } = boot();
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } };

frames(5);
assert(game.screen === 'title', 'boots to title, got ' + game.screen);
press('Enter'); frames(2); release('Enter');                 // -> mode
press('ArrowDown'); frames(2); release('ArrowDown');         // ARCADE -> VS CPU
press('Enter'); frames(2); release('Enter');                 // -> select
assert(game.screen === 'select' && game.vsCpu && !game.arcade, 'vs-cpu select');
press('KeyF'); frames(2); release('KeyF');                   // confirm char
frames(40);
assert(game.screen === 'stagesel', 'stage select, got ' + game.screen);
press('Enter'); frames(2); release('Enter');                 // pick stage
assert(game.screen === 'versus', 'versus splash');
frames(200);                                                  // versus auto-advances
frames(420);                                                  // kata intro + countdown
assert(game.screen === 'fight', 'fight begins, got ' + game.screen);

const keys = ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyF', 'KeyG', 'KeyH'];
for (let f = 0; f < 60 * 240; f++) {
  if (f % 13 === 0) press(keys[Math.floor(Math.random() * keys.length)]);
  if (f % 29 === 0) keys.forEach(release);
  frames(1);
  if (game.screen === 'matchend') break;
}
assert(['matchend', 'fight', 'intro', 'roundend'].includes(game.screen), 'match progressed');
console.log('smoke OK — final screen:', game.screen, 'wins', game.wins1 + '-' + game.wins2);

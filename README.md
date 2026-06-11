# Street Fighter 2 — JS Edition

A fan-made Street Fighter 2 homage built with HTML5 Canvas and vanilla JavaScript.
No dependencies, no build step — just open it in a browser and fight.

## How to play

Open `index.html` in any modern browser, or serve the folder:

```bash
npx http-server .
# then open http://localhost:8080
```

## Modes

- **1 Player vs CPU** — fight an AI opponent that approaches, jumps in, blocks, sweeps, and throws fireballs.
- **2 Players** — local versus on one keyboard.

Matches are best of 3 rounds, 99 seconds each. KO your opponent or have more health when time runs out.

## Controls

| Action | Player 1 | Player 2 |
|---|---|---|
| Move | A / D | ← / → |
| Jump | W | ↑ |
| Crouch | S | ↓ |
| Punch | F | K |
| Kick | G | L |
| **Hadouken** | ↓ then → + Punch | ↓ then → + Punch |
| Block | Hold back (away from opponent) | Hold back |

Menus: **Enter** to confirm, **Esc** to go back.

## Move list

- **Punch / Kick** — standing strikes
- **Crouch + Punch** — low jab
- **Crouch + Kick** — sweep (knocks down)
- **Jump + Punch/Kick** — flying kick
- **Hadouken** (↓→ + Punch) — fireball projectile; chips through block, fireballs cancel each other out

## Fighters

- **RYU** — the wandering warrior
- **KEN** — the flashy American champion

## Tech notes

- Single-file engine (`game.js`): fixed 60fps timestep, frame-data based attacks
  (startup / active / recovery), hitbox vs hurtbox collision, hit/block stun,
  knockdowns, and a quarter-circle-forward input detector for specials.
- Fighters are drawn procedurally with canvas primitives (no sprite assets).
- Sound effects synthesized at runtime with WebAudio.

*A fan-made homage for educational purposes. Not affiliated with or endorsed by Capcom.*

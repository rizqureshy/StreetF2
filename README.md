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
| Block | Hold back (away from opponent) | Hold back |
| Music on/off | M | M |

Menus: **Enter** to confirm, **Esc** to go back.

## Move list

- **Punch / Kick** — sword strikes (hit lands when the blade is visually extended)
- **Crouch + Punch** — low slash
- **Crouch + Kick** — sweep (knocks down)
- **Jump + Punch/Kick** — aerial slash

### Special moves

- **Energy wave** (↓ → + Punch) — projectile; waves cancel each other out
  - KAITO: *Tempest Wave* · KENJI: *Phantom Wave*
- **Dash slash** (↓ → + Kick) — lunging strike with afterimages, knocks down, chips through block
  - KAITO: *Gale Dash* · KENJI: *Shadow Dash*
- **Rising slash** (↓ ↓ + Punch) — launching anti-air uppercut, knocks down, chips through block
  - KAITO: *Dragon Ascent* · KENJI: *Demon Rise*

## Sound

Everything is synthesized live with WebAudio — no audio files. The score is an
eerie Japanese-style piece built from koto plucks on a hirajoshi pentatonic
scale, taiko drums, and temple bells; it shifts from a sparse, unsettling menu
theme to a driving battle rhythm during fights. Press **M** to toggle music.

## Fighters

Real pixel-art sprite characters with full animation sets
(idle, run, jump, fall, two attacks, take-hit, death):

- **KAITO** — wandering swordsman in a straw hat, blue energy wave
- **KENJI** — masked rogue samurai, purple energy wave

## Tech notes

- Single-file engine (`game.js`): fixed 60fps timestep, frame-data based attacks
  (startup / active / recovery), hitbox vs hurtbox collision, hit/block stun,
  knockdowns, and a quarter-circle-forward input detector for specials.
- Sprite-sheet renderer: animation states map onto the fighter state machine,
  with frame timing synced to attack frame data. Nearest-neighbor scaling
  keeps the pixel art crisp.
- Hit-freeze frames and screen shake on heavy impacts.
- Sound effects synthesized at runtime with WebAudio.

## Art credits

- Fighter sprites: ["Martial Hero"](https://luizmelo.itch.io/martial-hero) and
  ["Martial Hero 2"](https://luizmelo.itch.io/martial-hero-2) by **LuizMelo** —
  free to use in any project.
- Background & shop: "Oak Woods" environment asset pack by **brullov**
  ([itch.io](https://brullov.itch.io/oak-woods)) — free for commercial and
  non-commercial use.

*A fan-made homage for educational purposes. Not affiliated with or endorsed by Capcom.*

# Swift Sword

A 2D samurai dueling game built with HTML5 Canvas and vanilla JavaScript,
inspired by classic arcade fighters. No dependencies, no build step — just
open it in a browser and fight.

## How to play

Play it installed: the game is a **PWA** — open it once on
GitHub Pages, add to home screen, and it works fully offline.

Open `index.html` in any modern browser, or serve the folder:

```bash
npx http-server .
# then open http://localhost:8080
```

## Modes

- **Arcade** — climb the ladder against every fighter; ONI awaits at the top. Difficulty ramps as you go.
- **VS CPU** — single match against the AI (Easy/Normal/Hard in Options).
- **2 Players** — local versus on one keyboard (or two gamepads).
- **Training** — infinite health and meter, frozen timer, hitbox overlay (B), dummy opponent.

Matches are best of 3 rounds, 99 seconds each. KO your opponent or have more
health when time runs out — a dead-even timeout triggers **SUDDEN DEATH**.

## Controls

| Action | Player 1 | Player 2 |
|---|---|---|
| Move | A / D | ← / → |
| Jump | W | ↑ |
| Crouch | S | ↓ |
| Punch | F | K |
| Kick | G | L |
| Block | Hold back (away from opponent) | Hold back |
| **Super** (full meter) | H (or Punch+Kick) | ; (or K+L) |
| Throw (close) | Forward + Punch | Forward + Punch |
| Dash | Double-tap ←/→ | Double-tap ←/→ |
| Pause | Esc / P | Esc / P |
| Music on/off | M | M |

**Gamepad** (both players): stick/d-pad move · X slash · A kick · B dash
slash · Y rising slash · RB wave · RT super · Start pause.

Menus: **Enter** to confirm, **Esc** to go back.

### Touch controls (mobile)

On touch devices an on-screen layout appears automatically: drag anywhere on
the left side to move (floating stick — up to jump, down to crouch, hold away
from your opponent to block) and tap the buttons on the right: **SLASH**,
**KICK**, plus dedicated **WAVE / DASH / RISE** buttons for the special moves.
Menus are fully tap-navigable — in 2-player mode, P1 taps a fighter card
first, then P2 taps theirs. Add the page to your home screen for the best
fullscreen experience.

## Move list

- **Punch / Kick** — sword strikes (hit lands when the blade is visually extended)
- **Crouch + Punch** — low slash
- **Crouch + Kick** — sweep (knocks down)
- **Jump + Punch/Kick** — aerial slash

Hits draw blood — sprays scale with damage, knockdowns and KOs gush, and
stains pool on the arena floor for the rest of the round. Round winners
perform a victory kata over their fallen opponent.

**Cinematic presentation**: knockouts trigger slow motion with a camera
punch-in and letterbox bars; special-move hits briefly slow time. Each match
rolls one of three weather moods — drifting autumn **leaves**, steady **rain**,
or a full **storm** with lightning bolts and rolling thunder.

### Special moves

- **Energy wave** (↓ → + Punch) — projectile; waves cancel each other out
  - KAITO: *Tempest Wave* · KENJI: *Phantom Wave*
- **Dash slash** (↓ → + Kick) — lunging strike with afterimages, knocks down, chips through block
  - KAITO: *Gale Dash* · KENJI: *Shadow Dash*
- **Rising slash** (↓ ↓ + Punch) — launching anti-air uppercut, knocks down, chips through block
  - KAITO: *Dragon Ascent* · KENJI: *Demon Rise*

## Sound

- **Sound effects** are real recorded samples (Kenney audio packs, CC0):
  sword slices and draws, heavy body punches, metal clangs on block, cloth
  rustle on jump, body falls on knockdown, and a temple gong at round start.
- **Announcer voice** (Kenney Voiceover Pack — Fighter): "Ready?", "Go!",
  "Round", "Final Round", "Hurry up!", "Time over", "You win / You lose".
- **Music** is real recorded tracks from [FreePD.com](https://freepd.com) (CC0):
  "Coy Koi" (Japanese koto piece) on the menus and "Ancient Rite" (grim ritual
  percussion) in battle, looped seamlessly. **M** toggles music.
- **No synthesized audio anywhere** — every sound in the game is a recorded asset.

## Match flow

Character select leads into a **VS face-off splash** (big pixel portraits,
taunts), then the fighters perform a short **kata demonstration** of their
blade work while the announcer counts down — *Ready? … 3 … 2 … 1 … FIGHT!*

## Fighters

Real pixel-art sprite characters with full animation sets
(idle, run, jump, fall, two attacks, take-hit, death):

- **KAITO** — wandering swordsman in a straw hat; balanced. Super: *Tempest Barrage* (triple wave)
- **KENJI** — masked rogue samurai; rushdown. Super: *Thousand Cuts* (multi-hit dash)
- **RONIN** — a ghost in faded robes; fastest walk, lighter blows. Super: *Hundred Ghosts*
- **ONI** — the blood demon; slow, hits like a landslide. Arcade final boss. Super: *Massacre*

Three battlegrounds: **Oak Woods** (dusk), **Moonlit Woods** (fireflies, pale
moon), and **Blood Moon** (red storm, lightning). Each has its own music.

## Tech notes

- Single-file engine (`game.js`): fixed 60fps timestep, frame-data based attacks
  (startup / active / recovery), hitbox vs hurtbox collision, hit/block stun,
  knockdowns, and a quarter-circle-forward input detector for specials.
- Sprite-sheet renderer: animation states map onto the fighter state machine,
  with frame timing synced to attack frame data. Nearest-neighbor scaling
  keeps the pixel art crisp.
- Hit-freeze frames, screen shake, slow-motion KOs with camera punch-in and
  letterbox bars, and a per-match weather system (leaves / rain / storm).
- All audio is recorded assets decoded into WebAudio buffers — no synthesis.
- **PixiJS WebGL rendering**: the 960x540 game buffer is a GPU texture (base
  layer); above it a GPU effects layer adds ambient ember/ash particles,
  glowing energy projectiles, impact spark bursts, super shockwaves, and
  dynamic lightning light; the whole composite gets a bloom + CRT (scanlines,
  curvature, vignette) pass. Toggle in Options (OFF / CRT / FULL); auto-falls
  back to a plain 2D blit when WebGL is unavailable.

## Art credits

- Fighter sprites: ["Martial Hero"](https://luizmelo.itch.io/martial-hero) and
  ["Martial Hero 2"](https://luizmelo.itch.io/martial-hero-2) by **LuizMelo** —
  free to use in any project.
- Background & shop: "Oak Woods" environment asset pack by **brullov**
  ([itch.io](https://brullov.itch.io/oak-woods)) — free for commercial and
  non-commercial use.
- Sound effects & announcer voice: **Kenney** audio packs — Impact Sounds,
  RPG Audio, Sci-Fi Sounds, UI Audio, Voiceover Pack: Fighter
  ([kenney.nl](https://kenney.nl), CC0).
- Music: "Coy Koi" and "Ancient Rite" from **FreePD.com** (CC0).

*Originally started as a Street Fighter 2 fan homage; now an original game.
All art, sound, and music are free / CC0-licensed assets credited above.*

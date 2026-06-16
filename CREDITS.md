# Swift Sword — Asset Credits

All assets are free / CC0-licensed. Thank you to these creators:

## Character sprites
- **"Martial Hero"** and **"Martial Hero 2"** by **LuizMelo**
  (https://luizmelo.itch.io/martial-hero, https://luizmelo.itch.io/martial-hero-2)
  — free to use in any project. KAITO and KENJI use these sheets directly;
  RONIN and ONI are runtime palette tints of the same art.

## Stage art
- **"Oak Woods"** environment pack by **brullov** (https://brullov.itch.io/oak-woods)
  — free for commercial and non-commercial use. All three stages are
  lighting/tint variants of this environment.

## Sound effects
- **Kenney** audio packs (https://kenney.nl, CC0): Impact Sounds, RPG Audio,
  Sci-Fi Sounds, UI Audio.

## Announcer voice
- **Kenney Voiceover Packs** (https://kenney.nl, CC0): countdown, FIGHT,
  rounds, combo, flawless victory, sudden death, menus.

## Music (FreePD.com, CC0)
- "Coy Koi" — menu theme
- "Ancient Rite" — Oak Woods battle theme
- "Honor Bound" — Moonlit Woods battle theme
- "The Land of the Dead" — Blood Moon battle theme

## Rendering
- **PixiJS** v7.4.2 (https://pixijs.com, MIT) — WebGL post-processing layer.
- **pixi-filters** v5.3.0 (https://github.com/pixijs/filters, MIT) —
  CRT and AdvancedBloom shaders.
- GPU effects layer (embers, energy glows, spark bursts, shockwaves,
  dynamic light) built on PixiJS ParticleContainer + additive blending.

## Engine
- Custom HTML5 Canvas + WebAudio game engine. The game renders to a 960x540
  buffer that PixiJS uploads as a GPU texture for the CRT + bloom pass; a plain
  2D blit is used when WebGL is unavailable. MIT licensed.

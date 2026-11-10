# Swift Sword — Credits

## Generated for this game (via Higgsfield)

Created with the Higgsfield generation platform specifically for Swift Sword:

- **Fighter concept art** (KAITO, AKANE, KUROGANE) — GPT Image.
- **Fighter 3D meshes and PBR textures** — Tripo H3.1 image-to-3D from the
  concept art. KAITO and KUROGANE were rigged with Meshy auto-rigging; AKANE
  was rigged with this repository's own `tools/autorig.mjs`. SHURA is a
  runtime variant of KUROGANE.
- **Stage backdrops** (Moonlit Shrine, Burning Keep, Storm Grove) and
  **ground textures** — GPT Image.
- **Music** — "title" and "duel" tracks, ElevenLabs Music.

## Animation

- **Universal Animation Library 1 & 2** by **Quaternius**
  (https://quaternius.com, CC0). Clips are retargeted to each fighter's
  skeleton and baked into the character files by `tools/`.

## Sound effects and announcer

- **Kenney** audio packs (https://kenney.nl, CC0): Impact Sounds, RPG Audio,
  Sci-Fi Sounds, UI Audio, Voiceover Pack.

## Additional music (FreePD.com, CC0)

- "Honor Bound" — Storm Grove
- "The Land of the Dead" — Burning Keep
- "Coy Koi", "Ancient Rite" — classic edition

## Fonts (SIL Open Font License 1.1)

- **Shippori Mincho B1** by FONTDASU — interface lettering.
- **Yuji Boku** by Kinuta Font Factory — brush kanji (subset).
  Licence texts are in `assets/fonts/`.

## Libraries

- **three.js** r187 (https://threejs.org, MIT) — rendering, vendored under
  `vendor/three/` with its licence.
- Asset pipeline only (not shipped): glTF-Transform, meshoptimizer, sharp,
  Playwright.

## Classic edition (`classic/`)

- **"Martial Hero" 1 & 2** sprites by **LuizMelo**
  (https://luizmelo.itch.io) — free to use.
- **"Oak Woods"** environment by **brullov** (https://brullov.itch.io/oak-woods).
- **PixiJS** v7.4.2 and **pixi-filters** v5.3.0 (MIT).

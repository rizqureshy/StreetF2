# SWIFT SWORD — Completion Roadmap

*Research-backed plan for taking Swift Sword from a polished prototype to a
complete, content-rich fighting game. All asset sources verified for license
and availability where marked ✅.*

> **STATUS (2026-06-13):** Phases A, B, D, E, G **shipped** — gamepad, options/
> pause/persistence, dashes, super meter & supers, throws, combos, counter-hits,
> sudden death, full announcer, 4-fighter roster (palette-swap wave), 3 stages
> with stage select & per-stage music, arcade ladder with boss, training mode,
> PWA + offline, CI, credits. Remaining: roster wave with NEW sprite packs
> (Phase C/F art acquisition — blocked on network policy; needs itch.io
> downloads dropped into assets/ or located GitHub mirrors).

---

## 1. Vision

A complete, free, browser-native 2D weapon-fighting game:

- **6 playable fighters**, each with a unique archetype, moveset, and 3–4 special moves plus a super
- **5 stages** with multi-layer parallax, per-stage music, and weather
- **Arcade ladder, VS, 2-player, and Training modes**
- **Full announcer voice**, real countdown, combo calls, flawless-victory calls
- **Keyboard + touch + gamepad** input; installable as a PWA; saves settings/progress
- Every asset under CC0 / free-for-any-use licenses with a complete CREDITS file

### A note on licensing strategy (the "GNU" question)

GPL-licensed art exists (much of OpenGameArt), but GPL art imposes copyleft
obligations on distribution that are awkward for game assets. Everything
selected below is **CC0 (public domain) or "free for any project including
commercial"** — strictly more permissive than GPL, with zero obligations
beyond optional credit. We credit everyone anyway (Section 9).

---

## 2. Current state (already shipped)

- Engine: fixed-timestep 60fps, frame-data attacks with per-character
  blade-sync windows, hitbox/hurtbox collision, hit/block stun, knockdowns,
  projectiles, chip damage, throws-free 3-special movesets, CPU AI
- 2 fighters (KAITO / KENJI — LuizMelo Martial Hero 1 & 2)
- 1 stage (brullov Oak Woods + animated shop)
- Cinematics: slow-mo KOs, camera punch-in, letterbox, victory kata, VS splash,
  kata intro with countdown, blood + floor stains, weather (leaves/rain/storm)
- Audio: all recorded assets (Kenney SFX, Kenney announcer subset, FreePD music)
- Touch controls, viewport scaling, iOS audio unlock, GitHub Pages deployment

---

## 3. Roster expansion → 6 fighters

### Asset sources

**Tier 1 — same pipeline as current fighters (LuizMelo, free for any use,
200×200 frame strips, integrates with zero engine changes):**

| Character pack | Archetype fit | Canonical source |
|---|---|---|
| Martial Hero 3 | rival samurai (boss) | luizmelo.itch.io/martial-hero-3 |
| Huntress / Huntress 2 | agile zoner (spear) | luizmelo.itch.io/huntress |
| Hero Knight / Fantasy Knight | sword-and-shield mid-range | luizmelo.itch.io/hero-knight |
| Evil Wizard 2 | heavy caster | luizmelo.itch.io/evil-wizard-2 |
| Medieval King Pack 2 | broadsword heavy | luizmelo.itch.io/medieval-king-pack-2 |

**Tier 2 — richer animation sets (chierit, free incl. commercial, 8+ anims,
multiple attack chains, 288px frames — normalize via per-char `scale`):**

| Character pack | Archetype fit |
|---|---|
| Fire Knight | heavy rushdown, flame trails |
| Water Priestess | graceful zoner, water projectiles |
| Wind Hashashin | teleport rushdown (perfect KENJI rival) |
| Leaf Ranger | ranged trap zoner |
| Ground Monk | grappler |

Source: chierit.itch.io/elementals-* (free, credit appreciated).

**Acquisition path:** mirrors of these packs are embedded in hundreds of
public GitHub game repos (this is how Martial Hero 1/2, Oak Woods, and all
Kenney audio were obtained — proven pipeline). Located at implementation time
per pack; fallback is downloading from itch.io and committing directly.

### Integration pipeline (per character, ~1 hour each, proven)

1. Pixel-probe each sheet: foot line, center-x, body bounds (existing tooling)
2. Probe attack frames for blade extents → swing windows + hitboxes
3. Character config entry: frames, scale, footY, cx, swing, moves, face crop
4. Unique frame data + walk speed + HP/damage multipliers per archetype
5. Select-screen card, VS portrait — automatic from config

### Per-character movesets (design)

Universal additions first (Section 4), then per fighter:

- **KAITO** (balanced): keep kit; add **Parry Stance** (hold back+punch:
  reflects projectiles); Super: **Tempest Barrage** — triple wave volley
- **KENJI** (rushdown): keep kit; add **Shadow Step** (↓↓+K teleport behind
  opponent); Super: **Thousand Cuts** — cinematic multi-hit dash
- **HUNTRESS** (zoner): angled arrow shot (air OK), spear toss (slow, big
  damage), backflip kick (creates space); Super: **Arrow Storm** — arcing rain
- **KNIGHT** (heavy): shield charge (armored — absorbs one hit), command grab,
  shield stance (auto-block, takes chip); slowest walk, highest HP/damage;
  Super: **Crusader's Verdict** — unblockable overhead slam
- **WIZARD** (trap caster): flame pillar (placed at distance), slow meteor arc,
  hex (briefly slows opponent), float (slow descent jump); lowest HP;
  Super: **Cataclysm** — full-screen meteor barrage
- **MARTIAL HERO 3 / RIVAL** (arcade boss): enhanced KAITO kit, faster
  startup, meter gain bonus — unlockable after clearing arcade

---

## 4. New universal mechanics

| Mechanic | Design | Effort |
|---|---|---|
| **Super meter** | builds on hit/block/whiff; 100 units; super costs full bar; meter UI under health bars | M |
| **Super moves** | per character; trigger ↓→↓→+P; screen flash + letterbox + slow-mo cinematic | M |
| **Throws** | close + forward/back + kick; untechable vs blocking opponents; adds mixup | M |
| **Dashes** | double-tap forward/back (and on-screen swipe on touch); backdash has brief invulnerability | S |
| **Combo counter** | consecutive hits before recovery; damage scaling (0.9^n); "COMBO" announcer at 3+ | S |
| **Counter-hit** | extra damage + longer stun when interrupting an attack's startup | S |
| **Sudden death** | double-KO / 0-0 tie → one-hit round (announcer line exists ✅) | S |
| **Flawless victory** | no-damage round → announcer call ✅ + bonus screen text | S |

---

## 5. Stages → 5 total (each: parallax, music, weather default)

| Stage | Source / license | Mood | Music (FreePD ✅ verified catalog) |
|---|---|---|---|
| Oak Woods ✅ | brullov (free) | autumn forest | "Ancient Rite" (current) |
| Gothicvania Cemetery | ansimuz (free/CC0) | night graveyard, fog | Horror/"The Land of the Dead" |
| Mountain Dusk | ansimuz (free) | sunset peaks | Epic/"Honor Bound" |
| Warped City | ansimuz (free) | neon rain (storm default) | Electronic category pick |
| Glacial Mountains | vnitti (CC-BY 4.0) | **snow** (new weather type) | Epic/"The Ice Giants" |

Engine work: stage config (bg layers + parallax factors, ground Y, music key,
default weather), stage-select carousel after character select, snow particle
weather, per-stage ambient sound loop (wind / crows / city rain).

---

## 6. Audio completion

**Announcer — full Kenney Voiceover pack (CC0), mirror VERIFIED ✅
(`Boyquotes/kenney-voiceover-for-godot`):** real spoken countdown
"3…2…1", "FIGHT", "ROUND 1/2/3", "FINAL ROUND", "CHOOSE YOUR CHARACTER"
(select screen), "PLAYER 1 / PLAYER 2" (versus), "PREPARE YOURSELF",
"COMBO" / "MULTI KILL" (combo calls), "FLAWLESS VICTORY", "SUDDEN DEATH",
"TIE BREAKER", "WINNER", "GAME OVER", "ARCADE MODE" / "BATTLE MODE" /
"CHAMPIONSHIP MODE" (menu narration).

**Music** — FreePD catalog verified ✅ (`0lhi/FreePD`, CC0): per-stage tracks
above + menu theme (current "Coy Koi") + arcade-ending theme
(Scoring category) + results jingle.

**SFX additions**: arrow loose/impact (Kenney Impact has plenty ✅ in hand),
shield clang (impact_plate set ✅), magic casts (Sci-Fi pack ✅), grab/throw
(cloth + body ✅), dash woosh (force_field ✅), per-stage ambience.

All audio converted to MP3 via the proven static-ffmpeg pipeline (iOS-safe).

---

## 7. Modes & UX

1. **Arcade mode**: ladder vs every fighter (random order, rival last),
   difficulty ramps via AI decision-rate/reaction params; victory screen with
   stats; "GAME OVER" + continue countdown on loss
2. **Training mode**: infinite health/time, hitbox overlay toggle (H), input
   history display, dummy behavior (stand/block/jump)
3. **Options menu**: music + SFX volume sliders, blood on/off, difficulty,
   weather override, control remapping; persisted in localStorage
4. **Pause** (Esc / touch button) with resume/options/quit
5. **Gamepad support** (Gamepad API): d-pad/stick + 4 buttons; rumble on hit
   where supported — biggest feel upgrade for desktop
6. **PWA**: manifest + service worker caching all assets → installable on
   phones, fully offline; icon from KAITO face crop
7. **Attract mode**: CPU vs CPU demo behind the title after 10s idle

---

## 8. Polish backlog

- Health-bar damage trail (red ghost segment that drains after hits)
- Dust puffs on dash/landing; spark variety per attack strength
- Per-character intro lines and win quotes on the versus/results screens
- Round-end stats: max combo, damage dealt, time
- Animated stage thumbnails in stage select
- Hit-low/hit-high distinct flinches (sheets permitting)
- Progressive asset loading with a real progress bar (count-based exists)
- In-game credits screen (assets + licenses)

---

## 9. Engineering & quality

- **Code structure**: split `game.js` (~2,300 lines) into modules —
  `engine.js` (loop/input/audio), `fighter.js`, `ai.js`, `fx.js` (particles/
  weather/cinematics), `ui.js` (screens/HUD), `data.js` (characters/stages/
  attacks). Keep zero-build (script tags in order) to preserve the
  no-toolchain property.
- **Data-driven content**: characters and stages as pure config objects —
  adding a fighter touches no engine code.
- **Tests in repo**: move the headless smoke harness into `tests/` with
  `npm test`; add per-mechanic tests (meter, throws, combo scaling).
- **CI**: GitHub Action running syntax check + headless smoke on every push.
- **QA matrix**: Chrome/Firefox/Safari desktop; Android Chrome; iOS Safari
  (audio, touch, fullscreen); gamepad on Chrome/Edge.

---

## 10. Delivery phases

| Phase | Contents | Estimate |
|---|---|---|
| **A — Feel & foundation** | gamepad, options + volume + blood toggle, pause, localStorage, health-bar trail, dashes | 1 session |
| **B — Combat depth** | super meter + supers for KAITO/KENJI, throws, combo counter + scaling, counter-hits, full announcer integration (countdown, combo, flawless, sudden death) | 1–2 sessions |
| **C — Roster wave 1** | Huntress + Hero Knight (or Fire Knight + Wind Hashashin if chierit mirrors land first): full kits, AI personalities | 1–2 sessions |
| **D — Stages & music** | 3 new stages + stage select + snow weather + per-stage music/ambience | 1 session |
| **E — Modes** | arcade ladder + training mode + attract demo | 1 session |
| **F — Roster wave 2 + boss** | Wizard + rival boss, arcade endings | 1 session |
| **G — Ship it** | PWA, credits screen, CI, QA matrix pass, README/itch-page copy | 1 session |

Phases are independently shippable; each ends merged to `main` and live on
Pages.

---

## 11. Risks & mitigations

- **Mirror availability** for specific art packs varies → proven fallbacks:
  GitHub-wide repo search (worked 6/6 times so far), or download from itch.io
  and commit directly (all selected packs permit redistribution in builds).
- **Style mixing** (LuizMelo 200px vs chierit 288px) → per-character scale
  normalization to ~175px on-screen height; pick one family per roster wave
  for visual cohesion.
- **iOS audio regressions** → keep silent-element unlock; test each phase.
- **Scope creep** → phases A–B before any new content; mechanics multiply the
  value of every character added after.

---

*Asset credits maintained in README; full per-file CREDITS.md lands in
Phase G alongside the in-game credits screen.*

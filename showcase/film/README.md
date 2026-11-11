# The making-of film

Source for the 4½-minute explainer video about how Swift Sword was made
(1920×1080, 30 fps). The film is an HTML timeline rendered frame by frame in
headless Chromium, then encoded with ffmpeg. Nothing here is loaded by the game.

| Path | What it is |
| --- | --- |
| `film/film.html` | The whole edit: `renderAt(t)` draws the frame for any time `t` |
| `film/thumb.html` | The thumbnail (`thumbnail.jpg`) |
| `script.json` | Narration script and caption text, 13 segments |
| `vo/*.mp3`, `vo/timing.json` | Recorded narration and its pause timing (used to time captions) |
| `captions.srt` | Caption file to upload alongside the video |
| `tools/` | Capture, render and mix scripts |

Three images the film uses are not in the repo: `film/img/sketch_pencil.png`,
`film/img/sketch_color.png` and `film/img/bug_black.jpg`.

## Rebuilding

Needs Node, Playwright with Chromium, and ffmpeg. Serve this folder on port
8400 and the repo root on port 8300 (`npx http-server . -p <port> -s -c-1`).

1. **Old builds.** `git archive` the eleven milestone commits into
   `builds/01` … `builds/11`, then `node tools/cap2d.js <nn> 780` for each.
2. **3D footage.** `node tools/cap3d.js <name> "<query>" '<opts>'` using the
   game's `?capture=30` mode. The film uses `c_storm` (seed 85), `c_moon`
   (seed 35), `c_siege` (seed 103) and `c_title`.
3. **Audio.** Convert `vo/*.mp3` to 48 kHz mono WAV, then
   `node tools/sfxmix.mjs && sh tools/mix.sh` → `audio/mix.wav`.
4. **Picture.** `node tools/render.js 0 8130` → `frames/%06d.jpg`.
5. **Encode.** `ffmpeg -framerate 30 -i frames/%06d.jpg -i audio/mix.wav
   -c:v libx264 -crf 17 -pix_fmt yuv420p -c:a aac -movflags +faststart out.mp4`
6. **Captions.** `node tools/srt.js captions.srt`.

`node tools/still.js "12,45.5,230" sheet.jpg 3` makes a contact sheet of any
moments in the film for review.

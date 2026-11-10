# Asset pipeline

Offline scripts that produced `assets/models/*.glb`. They are **not** needed
to play, test or deploy the game.

```
npm install            # inside tools/
```

Working files (source meshes, rigs, the animation libraries) live in
`tools/work/`, which is git-ignored — they are large and can be regenerated.

1. **`prep_mesh.mjs in.glb out.glb <yawDeg> <height>`** — normalises a
   generated mesh: faces +Z, feet on the floor, scaled to a height in metres.
   (Image-to-3D output usually faces +X; auto-riggers assume +Z.)
2. **Rig** the prepped mesh — either with an external auto-rigger, or with
   **`autorig.mjs template_rig.glb template_mesh.glb target_mesh.glb out.glb`**,
   which fits an existing rig's skeleton to a new mesh using body landmarks
   and computes skin weights (nearest *visible* bone, geodesic spreading,
   Laplacian smoothing).
3. **`build_character.mjs rig.glb out.glb`** (run from the repo root while
   `npm start` is serving it) — opens `bake.html` in headless Chromium, where
   `retarget.js` retargets the clips listed in `clips.mjs` from the Quaternius
   Universal Animation Library (`tools/work/ual1.glb`, `ual2.glb`, CC0) onto
   the rig; then embeds the clips and the sword-mount frame in the GLB,
   resizes textures, converts them to WebP and meshopt-compresses the file.

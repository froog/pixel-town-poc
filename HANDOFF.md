# Codex Handoff: Pixel-Art Seaside Town 3D World POC

## Goal

Build a proof of concept that uses the generated ultra-wide pixel-art seaside town image as art direction and layout reference, then turns selected objects into reusable 3D assets for a navigable browser world.

The project should remain pragmatic: use AI image-to-3D generation where it helps, but use procedural/manual geometry for roads, poles, walls, wires, ocean, sky, and repeated simple structures.

## Current deliverable

This folder contains a working scaffold:

```text
pixel-town-poc/
  index.html
  src/main.js
  scripts/prepare_assets.py
  scripts/generate_proxy_glbs.py
  scripts/run_local.sh
  config/crop_config.json
  scene/town_layout.json
  assets/source/panorama.png
  assets/crops/*.png
  assets/glb/*.glb
  decisions/asset_review.md
```

Run it with:

```bash
cd pixel-town-poc
./scripts/run_local.sh
```

Open `http://localhost:8000`.

## Design direction

The desired final feeling is a 3D diorama rendered like pixel art, not a realistic 3D reconstruction. Preserve:

- bright cyan sky,
- seaside Japanese-town atmosphere,
- blue roofs,
- utility poles and wires,
- temple/shrine,
- station/train stop,
- park/playground,
- road intersection,
- ocean and green mountains,
- crisp blocky pixel-art colours and shading.

## Why this starts with proxy assets

Single-image-to-3D scene conversion is not reliable enough to convert the whole panorama into a coherent world in one pass. This scaffold uses the source image for:

1. layout reference,
2. asset crop extraction,
3. colour/style reference,
4. visual backdrop while the 3D scene is built.

The proxy GLBs are intentionally simple. They let us test scale, placement, camera style, browser rendering, and asset replacement workflow before spending time on heavier 3D generation.

## Automated pipeline already included

### `scripts/prepare_assets.py`

Reads `config/crop_config.json`, then:

- opens `assets/source/panorama.png`,
- crops named objects into `assets/crops/`,
- creates a 32-colour palette preview,
- writes `assets/asset_manifest.json`,
- writes review prompts into `decisions/asset_review.md`.

### `scripts/generate_proxy_glbs.py`

Creates deterministic procedural GLB placeholders using `trimesh`:

- `house_blue_proxy.glb`,
- `shrine_proxy.glb`,
- `station_proxy.glb`,
- `train_proxy.glb`,
- `vending_proxy.glb`.

These are placeholders only; replace them gradually.

### `src/main.js`

Creates a Three.js scene with:

- panorama backdrop,
- simple ground/ocean planes,
- procedural roads/crosswalks,
- procedural park blockout,
- utility pole and wire placeholders,
- GLB proxy loading,
- crop-image billboards for visual reference,
- simple keyboard toggles.

## Human decision points

Before introducing heavy image-to-3D tools, review `decisions/asset_review.md` and decide:

1. Which crop should become the first real AI-generated mesh?
2. Which objects should stay procedural?
3. Whether the final camera should be orbit-only, fixed-path, or walkable.
4. How close the user should be allowed to get to generated meshes.
5. Whether image crops should be used as texture cards, style references, or direct model-generation inputs.

Suggested first asset replacement order:

1. Shrine/temple, because it is visually distinctive.
2. Station/train, because it makes the right side feel alive.
3. Blue-roof house, because it can become a reusable modular asset.
4. Vending machine, because it is a good foreground detail.
5. Trees and park props, only if procedural versions feel too generic.

## Recommended next technical iteration

### Phase 1: improve the scaffold

- Add screenshot capture.
- Add a simple layout editor mode that writes object transforms back to JSON.
- Add labels in the world for each asset.
- Add a style toggle: normal render vs pixelated render pass.
- Add ambient animation: sea shimmer, train idle movement, crossing lights, cloud drift.

### Phase 2: image-to-3D replacement pipeline

Create a new script, for example:

```text
scripts/run_image_to_3d_asset.py
```

It should accept:

```bash
python scripts/run_image_to_3d_asset.py --asset shrine --backend hunyuan3d
```

Expected output:

```text
assets/generated/shrine_raw.glb
assets/generated/shrine_clean.glb
assets/generated/shrine_notes.md
```

Backends to consider:

- Hunyuan3D for higher-quality image/text-to-3D assets.
- TRELLIS for high-fidelity generated assets and possible radiance/Gaussian outputs.
- TripoSR-style pipelines for quick local tests.
- Blender Python/manual modelling for simple objects.

### Phase 3: Blender cleanup

Add a Blender batch-cleanup script:

```text
scripts/blender_cleanup.py
```

Target operations:

- apply scale and origin,
- decimate if needed,
- remove loose geometry,
- simplify materials,
- bake or resize textures,
- enforce nearest-neighbour/pixel texture settings where possible,
- export `.glb`.

### Phase 4: browser renderer polish

Keep Three.js unless there is a strong reason to switch. Add:

- GLB loading progress,
- asset metadata panel,
- configurable camera modes,
- pixelation post-process,
- texture filtering enforcement,
- optional orthographic camera mode.

## Style constraints

- Prefer low-poly silhouette clarity over noisy mesh detail.
- Prefer simple flat/toon materials.
- Use nearest-neighbour texture filtering for pixel art.
- Avoid realistic PBR shine except for tiny window/water accents.
- Keep colours close to `assets/source/palette_32_preview.png`.
- Preserve the readable composition of the original panorama.

## Risks

- Single-image-to-3D outputs may hallucinate backs/sides of objects.
- Generated meshes may be too organic or lumpy for pixel art.
- Crops may include too much background; manual masks may be needed.
- Whole-scene 3D generation is likely to be inconsistent.
- Browser performance will suffer if raw generated meshes are not cleaned and decimated.

## Definition of done for the next milestone

A good next milestone is:

- one proxy asset replaced by a generated or manually cleaned GLB,
- the browser scene still loads without a build step,
- the new asset has acceptable scale/origin,
- textures read as pixel-art-compatible,
- `scene/town_layout.json` remains the source of truth for placement,
- human notes are added for whether the asset is worth keeping.

## Suggested Codex prompt

Use this folder as the working project. Keep the current no-build Three.js static app working. First inspect the scripts and scene layout. Then improve the POC in small commits: add a screenshot capture button, add object labels, and add a simple pixelated post-process or low-resolution render mode. Do not replace the existing image source. Preserve the `scripts/run_local.sh` workflow. After that, add a stubbed `scripts/run_image_to_3d_asset.py` interface for replacing one proxy GLB at a time with generated assets, but do not assume any heavyweight model is installed unless explicitly configured.

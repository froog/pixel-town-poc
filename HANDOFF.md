# Codex Handoff: Pixel Town 3D Asset Pipeline POC

## Goal

Build a proof of concept that turns a generated pixel-art seaside town panorama
into a stylised 3D world through an incremental asset pipeline.

The current repository is focused on the pipeline scaffolding. It does not yet
contain the full Three.js world implementation or source panorama assets.

## Current Deliverable

This checkout contains:

```text
pixel-town-poc/
  index.html
  scripts/
    parse_scene.py
    route_assets.py
    generate_clean_asset_image.py
    run_image_to_3d_asset.py
  assets/
    scene_parse.json
    asset_routes.json
    intermediate/
      shrine_01_clean.txt
      shrine_01_clean_meta.json
    generated/
      shrine_01_raw.glb
      shrine_01_generation_meta.json
      shrine_01_notes.md
  docs/
    SCRIPT_INTERFACES.md
    Pixel_Town_3D_POC_Handoff.docx
```

`index.html` is present but currently references `./src/main.js`, which is not
in this checkout. Treat the browser viewer as a future or restoration task.

## Current Working Pipeline

Run the stub pipeline with:

```bash
python3 scripts/parse_scene.py \
  --image assets/source/panorama.png \
  --out assets/scene_parse.json

python3 scripts/route_assets.py \
  --scene assets/scene_parse.json \
  --out assets/asset_routes.json

python3 scripts/generate_clean_asset_image.py \
  --asset shrine_01 \
  --scene assets/scene_parse.json \
  --mode clean-render \
  --outdir assets/intermediate

python3 scripts/run_image_to_3d_asset.py \
  --asset shrine_01 \
  --scene assets/scene_parse.json \
  --routes assets/asset_routes.json \
  --mode clean-render \
  --backend stub \
  --outdir assets/generated
```

The parser currently records the `--image` path but does not open or validate
the image file.

## Implemented Scripts

### `scripts/parse_scene.py`

Writes a deterministic starter inventory of scene objects, including:

- `shrine_01`
- `house_blue_01`
- `park_01`
- `station_01`
- `train_01`
- `utility_poles_01`
- `vending_machine_01`

Output: `assets/scene_parse.json`.

### `scripts/route_assets.py`

Reads the scene parse and recommends a route for each object.

Current examples:

- shrine, station, vending machine: `clean_render_then_i23d`
- blue-roof house, train: `direct_crop_to_i23d`
- park, utility poles and wires: `procedural`

Output: `assets/asset_routes.json`.

### `scripts/generate_clean_asset_image.py`

Builds the expected clean-render prompt metadata for one asset.

Current stub outputs:

- `assets/intermediate/shrine_01_clean.txt`
- `assets/intermediate/shrine_01_clean_meta.json`

The `.txt` file is a placeholder for future PNG output.

### `scripts/run_image_to_3d_asset.py`

Builds placeholder image-to-3D outputs for one asset.

Current stub outputs:

- `assets/generated/shrine_01_raw.glb`
- `assets/generated/shrine_01_generation_meta.json`
- `assets/generated/shrine_01_notes.md`

The `.glb` file is not a valid model yet; it is a placeholder artifact.

## Design Direction

The intended final feeling is a stylised 3D diorama rendered like pixel art, not
a realistic reconstruction. Preserve:

- bright cyan sky,
- seaside Japanese-town atmosphere,
- blue roofs,
- utility poles and wires,
- shrine or temple forms,
- station and train stop,
- park or playground,
- road intersection,
- ocean and green mountains,
- crisp blocky colors and simple shading.

## Human Decision Points

Before adding heavy generation tools, review:

1. Whether the stub scene inventory has the right objects and priorities.
2. Whether each object route is correct.
3. Which asset should be the first real backend test.
4. Whether to prioritize a browser viewer or real asset generation next.
5. Whether generated meshes should be close-up navigable or only diorama-scale.

Suggested first asset tests:

1. `shrine_01`, because it is visually distinctive.
2. `house_blue_01`, because it can become a reusable modular building.
3. `vending_machine_01`, because it is a compact foreground prop.

## Recommended Next Technical Iteration

1. Add or restore `assets/source/panorama.png`.
2. Add validation that distinguishes placeholder GLB files from valid GLB
   assets.
3. Connect one real clean-image backend while preserving `--backend stub`.
4. Connect one real image-to-3D backend while preserving `--backend stub`.
5. Rebuild or restore the Three.js viewer under `src/main.js`.

## Risks

- Single-image-to-3D outputs may hallucinate backs and sides.
- Generated meshes may look too organic for pixel art.
- Crops may need masks or clean generated intermediates.
- Browser performance will suffer if raw generated meshes are not cleaned.
- Legacy docs or stale paths can mislead future work unless kept current.

## Definition Of Done For The Next Milestone

A good next milestone is:

- one real backend path is wired behind the existing CLI,
- `--backend stub` still works for fast tests,
- generated artifacts include metadata and review notes,
- invalid placeholder GLBs are clearly marked or validated,
- the docs describe the actual repository state.

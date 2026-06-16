# Pixel Town 3D Asset Pipeline POC

This project is a proof of concept for turning a generated pixel-art seaside
town panorama into a stylised 3D world through a staged, testable asset
pipeline.

The current checkout is an **automation scaffold**, not yet a complete browser
world. It focuses on scene parsing, asset routing, clean intermediate asset
generation, and stubbed image-to-3D output for one asset at a time.

The project direction is deliberately hybrid:

- use the panorama as source art and layout reference,
- parse the scene into candidate objects,
- route each object to an appropriate generation path,
- generate or model assets one-by-one,
- clean and normalise assets later,
- place approved assets into a browser-rendered scene in a future iteration.

The goal is not a single-shot conversion of one image into a perfect 3D scene.
The goal is a pragmatic workflow that can be reviewed, tested, and improved in
small steps.

## Current Repository Shape

```text
pixel-town-poc/
  index.html
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
  scripts/
    parse_scene.py
    route_assets.py
    generate_clean_asset_image.py
    run_image_to_3d_asset.py
```

`index.html` is currently only a legacy browser shell. It references
`./src/main.js`, but `src/main.js` is not present yet, so the browser viewer is
not expected to run in this checkout.

## Implemented Now

- Stub scene parser that emits a starter object inventory.
- Stub asset router that assigns each object to a generation strategy.
- Stub clean-asset-image generator that writes prompt metadata and a placeholder
  text artifact.
- Stub image-to-3D runner that writes placeholder GLB bytes, generation
  metadata, and review notes.
- Sample generated outputs for `shrine_01`.
- Script interface documentation in `docs/SCRIPT_INTERFACES.md`.

## Not Implemented Yet

- Real VLM scene parsing.
- Real image generation for clean intermediate asset images.
- Real image-to-3D backend invocation.
- Valid generated GLB geometry.
- Blender cleanup and normalisation.
- Browser scene implementation under `src/main.js`.
- Source panorama and crop-generation assets in this checkout.

## Recommended Hybrid Pipeline

### 1. Parse the scene

```bash
python3 scripts/parse_scene.py \
  --image assets/source/panorama.png \
  --out assets/scene_parse.json
```

The `--image` path is recorded in metadata only by the current stub; the file is
not opened yet.

### 2. Route assets

```bash
python3 scripts/route_assets.py \
  --scene assets/scene_parse.json \
  --out assets/asset_routes.json
```

Allowed route values are:

- `procedural`
- `direct_crop_to_i23d`
- `clean_render_then_i23d`
- `multiview_then_i23d`
- `manual_model`

### 3. Generate a clean intermediate asset image

```bash
python3 scripts/generate_clean_asset_image.py \
  --asset shrine_01 \
  --scene assets/scene_parse.json \
  --mode clean-render \
  --outdir assets/intermediate
```

The current implementation writes:

- `assets/intermediate/shrine_01_clean.txt`
- `assets/intermediate/shrine_01_clean_meta.json`

A real backend should eventually replace the `.txt` placeholder with PNG or
multi-view image output.

### 4. Run image-to-3D

```bash
python3 scripts/run_image_to_3d_asset.py \
  --asset shrine_01 \
  --scene assets/scene_parse.json \
  --routes assets/asset_routes.json \
  --mode clean-render \
  --backend stub \
  --outdir assets/generated
```

The current implementation writes:

- `assets/generated/shrine_01_raw.glb`
- `assets/generated/shrine_01_generation_meta.json`
- `assets/generated/shrine_01_notes.md`

The GLB is a placeholder byte file, not a valid 3D model.

## Human Checkpoints

Human review should happen at these points:

1. Scene inventory review: confirm object names, categories, priorities, and
   approximate bounding boxes.
2. Routing review: confirm which objects should be procedural, AI-generated, or
   manually modelled.
3. Clean intermediate review: decide whether generated isolated images still
   match the source object.
4. Post-3D review: inspect silhouette, mesh quality, scale, and style once a
   real backend is connected.
5. In-world review: inspect whether approved assets feel correct in the browser
   scene once the viewer exists.

## Recommended First Experiments

Use these assets for early A/B testing:

- `shrine_01`
- `house_blue_01`
- `vending_machine_01`

Compare:

- direct crop to image-to-3D,
- clean render to image-to-3D,
- manual or procedural fallback.

## Near-Term Next Steps

1. Add or restore the source panorama under `assets/source/`.
2. Decide whether to rebuild the browser viewer or keep focusing on the asset
   pipeline first.
3. Replace `generate_clean_asset_image.py` stub output with a real PNG-producing
   backend.
4. Replace `run_image_to_3d_asset.py` stub output with a backend adapter while
   keeping `--backend stub` for tests.
5. Add validation so placeholder GLB files cannot be mistaken for production
   assets.

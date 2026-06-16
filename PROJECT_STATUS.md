# Project Status

This repository is currently a lightweight scaffold for the Pixel Town 3D asset
pipeline.

## What Is Implemented

- `scripts/parse_scene.py` writes a stub scene inventory to
  `assets/scene_parse.json`.
- `scripts/route_assets.py` writes route recommendations to
  `assets/asset_routes.json`.
- `scripts/generate_clean_asset_image.py` writes clean-render prompt metadata
  and a placeholder text artifact for `shrine_01`.
- `scripts/run_image_to_3d_asset.py` writes placeholder image-to-3D outputs for
  `shrine_01`.
- `docs/SCRIPT_INTERFACES.md` describes the expected CLI contracts and data
  flow.

## What Is Stubbed Or Missing

- No real source panorama is present under `assets/source/`.
- The scene parser does not inspect the input image yet.
- The clean asset generator does not call an image backend yet.
- The image-to-3D runner does not call a model backend yet.
- `assets/generated/shrine_01_raw.glb` is a placeholder byte file, not a valid
  GLB model.
- `index.html` references `./src/main.js`, but `src/main.js` is not present, so
  the browser viewer is not runnable yet.

## Current Sample Command Sequence

```bash
python3 scripts/parse_scene.py --image assets/source/panorama.png --out assets/scene_parse.json
python3 scripts/route_assets.py --scene assets/scene_parse.json --out assets/asset_routes.json
python3 scripts/generate_clean_asset_image.py --asset shrine_01 --scene assets/scene_parse.json --mode clean-render --outdir assets/intermediate
python3 scripts/run_image_to_3d_asset.py --asset shrine_01 --scene assets/scene_parse.json --routes assets/asset_routes.json --mode clean-render --backend stub --outdir assets/generated
```

The `--image` path is currently metadata only; the file does not need to exist
for the stub parser.

## Recommended Next Work

1. Add or restore the source panorama.
2. Decide whether the next milestone is a browser viewer or a real asset
   backend.
3. Add validation around generated artifacts, especially GLB validity.
4. Keep `--backend stub` as the fast test path while adding real backend
   adapters.

# Project Status

This repository is currently a lightweight scaffold for the Pixel Town 3D asset
pipeline.

## What Is Implemented

- `scripts/parse_scene.py` validates the source image, records dimensions, and
  writes a stub scene inventory to `assets/scene_parse.json`.
- `scripts/route_assets.py` writes route recommendations to
  `assets/asset_routes.json`.
- `scripts/generate_clean_asset_image.py` writes clean-render prompt metadata,
  a placeholder text artifact, and a source crop PNG for `shrine_01`.
- `scripts/run_image_to_3d_asset.py` supports both `--backend stub` and a real
  local `--backend tripo` adapter.
- A first real TripoSR GLB has been generated for `shrine_01`.
- A second TripoSR GLB has been generated from an AI-generated clean concept
  image for `shrine_01`.
- `docs/SCRIPT_INTERFACES.md` describes the expected CLI contracts and data
  flow.

## What Is Stubbed Or Missing

- The first TripoSR mesh is rough and mostly captures the shrine roof mass.
- The generated-concept TripoSR mesh has stronger roof detail and higher mesh
  density, but still collapses much of the building body into rough geometry and
  drifts from the original source shrine.
- The clean asset generator does not call an image backend yet.
- `assets/generated/shrine_01_raw.glb` is valid when generated with
  `--backend tripo`, but still needs cleanup and quality review.
- `index.html` references `./src/main.js`, but `src/main.js` is not present, so
  the browser viewer is not runnable yet.

## Current Sample Command Sequence

```bash
python3 scripts/parse_scene.py --image assets/source/panorama.png --out assets/scene_parse.json
python3 scripts/route_assets.py --scene assets/scene_parse.json --out assets/asset_routes.json
python3 scripts/generate_clean_asset_image.py --asset shrine_01 --scene assets/scene_parse.json --mode clean-render --outdir assets/intermediate
python3 scripts/run_image_to_3d_asset.py --asset shrine_01 --scene assets/scene_parse.json --routes assets/asset_routes.json --mode clean-render --backend stub --outdir assets/generated
```

To run the real TripoSR backend, provide a local TripoSR checkout and venv:

```bash
python3 scripts/run_image_to_3d_asset.py --asset shrine_01 --scene assets/scene_parse.json --routes assets/asset_routes.json --mode clean-render --backend tripo --outdir assets/generated --tripo-repo /tmp/triposr-run --tripo-python /tmp/triposr-venv/bin/python --device cpu --mc-resolution 128 --chunk-size 4096
```

To run the generated clean concept image variant:

```bash
python3 scripts/run_image_to_3d_asset.py --asset shrine_01 --scene assets/scene_parse.json --routes assets/asset_routes.json --mode clean-render --backend tripo --outdir assets/generated --input-image assets/intermediate/shrine_01_concept.png --output-suffix _concept --tripo-repo /tmp/triposr-run --tripo-python /tmp/triposr-venv/bin/python --device cpu --mc-resolution 128 --chunk-size 4096
```

## Recommended Next Work

1. Build the generic reviewed-inventory and prompt-manifest flow described in
   `docs/AUTOMATED_HYBRID_WORKFLOW.md`.
2. Generate a less ornate, source-faithful shrine concept image.
3. Wire `generate_clean_asset_image.py` to an image-generation backend that uses
   parsed scene/object context to produce a clean background-free concept image.
4. Add validation around generated artifacts, especially GLB validity.
5. Add cleanup/normalisation for generated GLBs.
6. Decide whether the next milestone is a browser viewer or better asset
   generation.

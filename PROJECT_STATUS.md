# Project Status

This repository is currently a lightweight scaffold for the Pixel Town 3D asset
pipeline, with a basic Three.js scene for previewing the cleaned shrine asset.

## What Is Implemented

- `scripts/parse_scene.py` validates the source image, records dimensions, and
  writes a stub scene inventory to `assets/scene_parse.json`.
- `scripts/route_assets.py` writes route recommendations to
  `assets/asset_routes.json`.
- `scripts/generate_clean_asset_image.py` writes clean-render prompt metadata,
  a placeholder text artifact, and a source crop PNG for `shrine_01`.
- `scripts/run_image_to_3d_asset.py` supports both `--backend stub` and a real
  local `--backend tripo` adapter.
- `scripts/run_prompt_to_3d_asset.py` supports direct metadata prompt-to-3D
  generation with `--backend stub` and local `--backend parametric`.
- A first real TripoSR GLB has been generated for `shrine_01`.
- A second TripoSR GLB has been generated from an AI-generated clean concept
  image for `shrine_01`.
- A third, simpler browser-asset-oriented concept image has also been generated
  and passed through TripoSR as `shrine_01_simple`.
- `scripts/cleanup_glb_asset.py` performs a first cleanup pass for generated
  GLBs while preserving vertex colors.
- `index.html` and `src/main.js` provide a basic Three.js viewer for
  `assets/generated/shrine_01_simple_clean.glb`.
- Direct parametric GLBs have been generated for `house_blue_01`, `train_01`,
  `vending_machine_01`, and a shrine baseline.
- `docs/SCRIPT_INTERFACES.md` describes the expected CLI contracts and data
  flow.

## What Is Stubbed Or Missing

- The first TripoSR mesh is rough and mostly captures the shrine roof mass.
- The generated-concept TripoSR mesh has stronger roof detail and higher mesh
  density, but still collapses much of the building body into rough geometry and
  drifts from the original source shrine.
- The simpler concept is the best current input for browser asset work: clearer,
  less ornate, and more source-faithful, though TripoSR still only reconstructs
  the roof/body partially from a single view.
- `assets/generated/shrine_01_simple_clean.glb` is grounded, centered, scaled to
  2.0 units tall, and keeps the TripoSR vertex colors.
- The clean asset generator does not call an image backend yet.
- `assets/generated/shrine_01_raw.glb` is valid when generated with
  `--backend tripo`, but still needs cleanup and quality review.
- The browser scene is intentionally minimal and currently hard-codes
  `shrine_01_simple_clean.glb`; it does not yet read a generic placement
  manifest.
- The parametric backend is intentionally simple box/gable geometry. It is a
  browser-friendly baseline, not a full modelling system.

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

To run the simpler browser-asset concept variant:

```bash
python3 scripts/run_image_to_3d_asset.py --asset shrine_01 --scene assets/scene_parse.json --routes assets/asset_routes.json --mode clean-render --backend tripo --outdir assets/generated --input-image assets/intermediate/shrine_01_simple_concept.png --output-suffix _simple --tripo-repo /tmp/triposr-run --tripo-python /tmp/triposr-venv/bin/python --device cpu --mc-resolution 128 --chunk-size 4096
```

To clean the simple variant for browser placement:

```bash
/tmp/triposr-venv/bin/python scripts/cleanup_glb_asset.py --input assets/generated/shrine_01_simple_raw.glb --out assets/generated/shrine_01_simple_clean.glb --meta assets/generated/shrine_01_simple_cleanup_meta.json --min-faces 128 --target-height 2.0 --up-axis y
```

To preview the cleaned asset in the browser:

```bash
python3 -m http.server 8010
```

Then open `http://localhost:8010`.

To run the direct local parametric route:

```bash
python3 scripts/run_prompt_to_3d_asset.py --asset vending_machine_01 --scene assets/scene_parse.json --routes assets/asset_routes.json --backend parametric --outdir assets/generated
```

## Recommended Next Work

1. Build the generic reviewed-inventory and prompt-manifest flow described in
   `docs/AUTOMATED_HYBRID_WORKFLOW.md`.
2. Add a generic browser-placement manifest so future approved assets are not
   hard-coded in `src/main.js`.
3. Add validation around generated artifacts, especially GLB validity.
4. Wire `generate_clean_asset_image.py` to an image-generation backend that uses
   parsed scene/object context to produce a clean background-free concept image.
5. Decide whether the next milestone is better asset generation or multi-asset
   browser composition.

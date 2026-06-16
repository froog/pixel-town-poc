# Pixel Town 3D Asset Pipeline POC Handoff

## Goal

Build a proof of concept that turns a generated pixel-art seaside town panorama
into a stylised 3D world through an incremental asset pipeline.

The current repository contains the source panorama, real crop generation, and a
working local TripoSR backend hook. The browser viewer is still a future or
restoration task.

## Current Repository Shape

```text
pixel-town-poc/
  index.html
  assets/source/panorama.png
  assets/scene_parse.json
  assets/asset_routes.json
  assets/intermediate/shrine_01_clean.png
  assets/generated/shrine_01_raw.glb
  assets/generated/shrine_01_raw_input.png
  assets/generated/shrine_01_preview.png
  scripts/parse_scene.py
  scripts/route_assets.py
  scripts/generate_clean_asset_image.py
  scripts/run_image_to_3d_asset.py
```

`index.html` references `./src/main.js`, which is not present. Treat the browser
viewer as future work.

## Recommended Hybrid Method

The preferred branch for distinctive assets is:

1. Parse the panorama into object records with IDs, names, descriptions,
   approximate locations, priority, complexity, and occlusion.
2. Use a target object record, such as `shrine_01`, plus source-scene context to
   generate a clean isolated 3D-style concept image of that object.
3. Feed that clean concept image into an image-to-3D backend.
4. Review the mesh, then clean and normalise it before world integration.

This should beat direct crop-to-3D for the shrine because the current crop
contains stairs, trees, sky, signage, and nearby props. The risk is concept
drift: the generated clean image may look plausible but no longer match the
source. Keep a human checkpoint between clean-image generation and 3D
generation.

## Working Pipeline

```bash
python3 scripts/parse_scene.py --image assets/source/panorama.png --out assets/scene_parse.json
python3 scripts/route_assets.py --scene assets/scene_parse.json --out assets/asset_routes.json
python3 scripts/generate_clean_asset_image.py --asset shrine_01 --scene assets/scene_parse.json --mode clean-render --outdir assets/intermediate
python3 scripts/run_image_to_3d_asset.py --asset shrine_01 --scene assets/scene_parse.json --routes assets/asset_routes.json --mode clean-render --backend tripo --outdir assets/generated --tripo-repo /tmp/triposr-run --tripo-python /tmp/triposr-venv/bin/python --device cpu --mc-resolution 128 --chunk-size 4096
```

The parser validates the image and emits pixel-space bounding boxes. The
clean-image step currently creates a source crop, not yet a generated isolated
asset render.

## First Real Output

- TripoSR generated a valid GLB at `assets/generated/shrine_01_raw.glb`.
- The mesh contains one geometry with 5,048 vertices and 10,056 faces.
- `assets/generated/shrine_01_raw_input.png` records the processed input used by
  TripoSR.
- `assets/generated/shrine_01_preview.png` is a lightweight local preview render.
- Quality note: the mesh mostly captures the shrine roof mass and needs a
  cleaner isolated input plus cleanup.

## Hybrid Clean-Image Experiment

- Generated a cleaner shrine concept image at
  `assets/intermediate/shrine_01_concept.png`.
- Saved the chroma-key source at
  `assets/intermediate/shrine_01_concept_chromakey.png`.
- Ran TripoSR with `--input-image assets/intermediate/shrine_01_concept.png`
  and `--output-suffix _concept`.
- Generated `assets/generated/shrine_01_concept_raw.glb`, with one geometry,
  26,967 vertices, and 53,708 faces.
- Generated `assets/generated/shrine_01_concept_preview.png`.
- Result: stronger roof detail and better object isolation than the crop-based
  run, but noticeable concept drift and still-rough body geometry.

## Implemented Now

- Source panorama stored at `assets/source/panorama.png`.
- Scene parser validates image dimensions and writes `bbox_pixels`.
- Clean-image step can create a real crop PNG from source art.
- Image-to-3D runner supports `--backend stub` and `--backend tripo`.
- A first real TripoSR smoke test completed on Apple M4 CPU.

## Still Missing

- Real VLM scene parsing.
- Generated clean isolated asset images.
- Mesh cleanup, origin/scale normalisation, and decimation policy.
- Browser scene implementation under `src/main.js`.
- Automated GLB validation and visual review gates.

## Recommended Next Technical Iteration

1. Generate a more source-faithful shrine concept image with less ornamentation.
2. Wire a real image-generation backend into `generate_clean_asset_image.py`.
3. Rerun TripoSR at higher resolution and compare mesh quality.
4. Add a cleanup script for scale, origin, orientation, and material
   simplification.
5. Add GLB validation so placeholder and generated outputs are clearly
   distinguished.

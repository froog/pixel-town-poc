# Script Interfaces and Expected Data Flow

This document defines the next layer of automation for the Pixel Town 3D POC.

The goal is to make the workflow explicit enough that a coding agent (for example Codex) can implement or extend it incrementally.

For the broader future automation loop with user review gates, see
`docs/AUTOMATED_HYBRID_WORKFLOW.md`.

---

## 1. `scripts/parse_scene.py`

### Purpose

Parse the source panorama into a structured object inventory.

### Responsibilities

- accept and validate a source image,
- optionally accept a crop config or prompt file,
- produce a machine-readable list of objects,
- attach metadata useful for routing and world reconstruction.

### CLI

```bash
python3 scripts/parse_scene.py \
  --image assets/source/panorama.png \
  --out assets/scene_parse.json
```

### Expected output schema

```json
{
  "source_image": "assets/source/panorama.png",
  "scene_summary": "A pixel-art seaside town with shrine, station, houses, road, utility poles, park and train.",
  "objects": [
    {
      "id": "shrine_01",
      "name": "shrine",
      "category": "hero_structure",
      "bbox": [0.02, 0.20, 0.14, 0.55],
      "depth_band": "foreground",
      "priority": "high",
      "reusable": true,
      "occlusion": "medium",
      "complexity": "high",
      "notes": "Traditional shrine on stone terrace"
    }
  ]
}
```

### Human review point

Check object names, object count, categories, and bounding boxes.

---

## 2. `scripts/route_assets.py`

### Purpose

Decide which generation strategy each object should use.

### Responsibilities

- read scene parse JSON,
- classify each object into a pipeline route,
- emit a routing manifest.

### CLI

```bash
python3 scripts/route_assets.py \
  --scene assets/scene_parse.json \
  --out assets/asset_routes.json
```

### Allowed route values

- `procedural`
- `direct_crop_to_i23d`
- `clean_render_then_i23d`
- `multiview_then_i23d`
- `manual_model`

### Expected output schema

```json
{
  "routes": [
    {
      "asset_id": "shrine_01",
      "route": "clean_render_then_i23d",
      "reason": [
        "hero asset",
        "partially occluded",
        "benefits from cleaner silhouette"
      ]
    }
  ]
}
```

### Human review point

Confirm the route chosen for each important asset.

---

## 3. `scripts/generate_clean_asset_image.py`

### Purpose

Generate a clean isolated object image to use as an image-to-3D input.

This is the key hybrid step. It should take the parsed object record plus
source-scene context and ask an image-generation backend for a single-object,
background-free, 3D-style concept render. That generated image then becomes the
input to the image-to-3D stage.

### Responsibilities

- read scene parse JSON,
- find the target asset,
- optionally crop the panorama automatically,
- generate a clean isolated concept image,
- preserve source-scene identity while removing background clutter,
- optionally generate multiple angles,
- write metadata about the generated intermediate.

### CLI

```bash
python3 scripts/generate_clean_asset_image.py \
  --asset shrine_01 \
  --scene assets/scene_parse.json \
  --mode clean-render \
  --outdir assets/intermediate
```

### Optional flags

- `--views single|turntable4`
- `--background transparent|white|studio`
- `--style pixel-friendly|toon|neutral-3d`
- `--backend stub|openai|other`
- `--dry-run`

Future real backends should include prompt fields derived from:

- object name and category,
- object notes and visual description,
- approximate location/depth in the source scene,
- source crop path when available,
- route reason and target style.

### Outputs

- Current stub output: `assets/intermediate/shrine_01_clean.txt`
- Future real-backend output: `assets/intermediate/shrine_01_clean.png`
- `assets/intermediate/shrine_01_clean_meta.json`

### Human review point

Does the clean image still look like the same object?

---

## 4. `scripts/run_image_to_3d_asset.py`

### Purpose

Run the selected 2D input through an image-to-3D pipeline.

### Responsibilities

- read scene parse + routes,
- resolve the input image based on mode,
- call a chosen backend,
- write raw output placeholders or actual generated assets,
- emit metadata for downstream cleanup.

### CLI

```bash
python3 scripts/run_image_to_3d_asset.py \
  --asset shrine_01 \
  --scene assets/scene_parse.json \
  --routes assets/asset_routes.json \
  --mode clean-render \
  --backend stub \
  --outdir assets/generated
```

### Modes

- `direct`
- `clean-render`
- `multiview`

### Suggested backends

- `stub`
- `hunyuan3d`
- `trellis`
- `tripo`
- `manual`

### Optional backend-control flags

- `--input-image PATH`: override the image resolved from `--mode`.
- `--output-suffix SUFFIX`: write a named output variant such as
  `shrine_01_concept_raw.glb`.
- `--tripo-repo PATH`: local TripoSR checkout for `--backend tripo`.
- `--tripo-python PATH`: Python interpreter for the TripoSR environment.
- `--device cpu|cuda:0|...`: backend device hint.
- `--mc-resolution N`: TripoSR marching-cubes resolution.
- `--chunk-size N`: TripoSR evaluation chunk size.

These flags make A/B tests possible without overwriting the baseline crop-based
output.

### Outputs

- `assets/generated/shrine_01_raw.glb`
- `assets/generated/shrine_01_raw_input.png` when the backend emits a processed input
- `assets/generated/shrine_01_generation_meta.json`
- `assets/generated/shrine_01_notes.md`

The `stub` backend writes a placeholder byte file at the `.glb` path. The
`tripo` backend can call a local TripoSR checkout and write a valid GLB.

### Human review point

Is the asset worth cleaning, or should it be rerouted?

---

## 5. `scripts/cleanup_glb_asset.py`

### Purpose

Standardise and clean raw GLB assets before they enter the browser scene.

This lightweight cleanup script is available now and does not require Blender.
It is intended as the first pass before heavier manual or Blender cleanup.

### CLI

```bash
python3 scripts/cleanup_glb_asset.py \
  --input assets/generated/shrine_01_simple_raw.glb \
  --out assets/generated/shrine_01_simple_clean.glb \
  --meta assets/generated/shrine_01_simple_cleanup_meta.json \
  --min-faces 128 \
  --target-height 2.0 \
  --up-axis y
```

### Tasks

- remove tiny loose mesh components,
- preserve TripoSR vertex colors,
- center the asset horizontally,
- set the base on the ground plane,
- scale to a target height,
- export cleaned `.glb`,
- write cleanup metadata.

### Future: `scripts/blender_cleanup.py`

Blender cleanup is still useful later for deeper work:

- decimation and retopology,
- material simplification,
- texture baking,
- manual orientation fixes,
- origin/pivot editing,
- preview renders.

---

## Suggested execution sequence

```text
parse_scene.py
  -> route_assets.py
    -> generate_clean_asset_image.py (optional depending on route)
      -> run_image_to_3d_asset.py
        -> blender_cleanup.py (future)
          -> browser scene integration
```

# Script Interfaces and Expected Data Flow

This document defines the next layer of automation for the Pixel Town 3D POC.

The goal is to make the workflow explicit enough that a coding agent (for example Codex) can implement or extend it incrementally.

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

### Responsibilities

- read scene parse JSON,
- find the target asset,
- optionally crop the panorama automatically,
- generate a clean isolated concept image,
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

## 5. Future: `scripts/blender_cleanup.py`

### Purpose

Standardise and clean raw assets before they enter the scene.

### Tasks

- set origin,
- apply transforms,
- decimate,
- simplify materials,
- resize textures,
- export `.glb`.

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

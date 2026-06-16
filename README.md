# Pixel Town 3D Asset Proof of Concept

This project is a proof of concept for turning the generated pixel-art seaside panorama into a stylised 3D world.

The current direction is a **hybrid asset pipeline**:

- use the panorama as source art and scene/layout reference,
- parse the scene into candidate objects,
- route each object to the most appropriate asset-generation path,
- generate or model assets one-by-one,
- clean and normalise them,
- place them back into a browser-rendered scene.

The goal is **not** to do a single-shot “convert one image into a whole perfect 3D world.”
Instead, the goal is to build a pragmatic, testable, repeatable workflow.

---

## Current project status

Current docs in this folder now focus on:

1. documenting the recommended hybrid pipeline,
2. defining decision points for asset routing,
3. scaffolding the next batch of scripts,
4. keeping the project easy to hand off to Codex or another coding agent.

Core docs:

- `HANDOFF.md`
- `PROJECT_STATUS.md`
- `docs/Pixel_Town_3D_POC_Handoff.md`
- `docs/PIPELINE_OPTIONS.md`
- `docs/SCRIPT_INTERFACES.md`

---

## Recommended hybrid pipeline

The current recommended pipeline is:

### Stage 1 — Source art and scene understanding

- use the latest panorama as source art,
- parse the scene with a VLM or structured prompt,
- generate an object inventory,
- record object names, categories, approximate locations, and priority.

### Stage 2 — Asset routing

For each object, choose one of these paths:

- **procedural**
  - roads, wires, poles, walls, stairs, ground, ocean planes, simple park pieces.
- **direct crop -> image-to-3D**
  - when the source crop is already clear and isolated enough.
- **clean render -> image-to-3D**
  - when the object is cluttered, partly occluded, or likely to benefit from a synthetic isolated asset image first.
- **multi-view generation -> image-to-3D**
  - for more difficult hero assets where geometry quality matters.
- **manual model / Blender-assisted**
  - for assets that remain poor after AI generation or require stronger control.

### Stage 3 — Asset cleanup

- normalise scale,
- fix origin,
- simplify topology,
- simplify materials/textures,
- export `.glb`,
- generate preview renders.

### Stage 4 — World integration

- place assets into a layout JSON,
- render in a browser engine,
- iterate one asset at a time.

---

## Why the “clean render -> image-to-3D” path matters

A key option now documented in the project is:

1. parse scene,
2. identify object,
3. generate a clean isolated “3D concept render” of the object,
4. send that into an image-to-3D model.

This is often better than direct crop -> image-to-3D when:

- the original crop contains too much background,
- the object silhouette is unclear,
- the source view is awkward,
- the object is partly hidden,
- we want more deliberate control over proportions or style.

But it also introduces drift risk, so it should be a **selective branch**, not the only path.

---

## Next scripts to implement

The following script interfaces are now scaffolded:

- `scripts/parse_scene.py`
- `scripts/route_assets.py`
- `scripts/generate_clean_asset_image.py`
- `scripts/run_image_to_3d_asset.py`

See `docs/SCRIPT_INTERFACES.md` for details.

---

## Suggested workflow

### 1. Parse the scene

```bash
python scripts/parse_scene.py \
  --image assets/source/panorama.png \
  --out assets/scene_parse.json
```

### 2. Route assets

```bash
python scripts/route_assets.py \
  --scene assets/scene_parse.json \
  --out assets/asset_routes.json
```

### 3. Generate a clean intermediate asset image (optional)

```bash
python scripts/generate_clean_asset_image.py \
  --asset shrine_01 \
  --scene assets/scene_parse.json \
  --mode clean-render \
  --outdir assets/intermediate
```

### 4. Run image-to-3D

```bash
python scripts/run_image_to_3d_asset.py \
  --asset shrine_01 \
  --scene assets/scene_parse.json \
  --routes assets/asset_routes.json \
  --mode clean-render \
  --backend stub \
  --outdir assets/generated
```

---

## Human checkpoints

Human review should happen at these points:

1. **scene inventory review** — check whether the parser found the right objects.
2. **routing review** — confirm which assets should be procedural vs AI-generated.
3. **clean intermediate review** — inspect whether an isolated image still matches the source.
4. **post-3D review** — inspect silhouette, mesh quality, and style.
5. **in-world review** — inspect whether the asset feels correct in the browser scene.

---

## Recommended first experiments

Use three assets for A/B testing:

- shrine
- blue-roof house
- vending machine

Compare:

- direct crop -> image-to-3D
- clean render -> image-to-3D
- manual/procedural fallback

This should quickly show whether the intermediate clean-render step is worth the added complexity.

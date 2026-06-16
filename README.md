# Pixel Town 3D Asset Pipeline POC

This project is a proof of concept for turning a generated pixel-art seaside
town panorama into a stylised 3D world through a staged, testable asset
pipeline.

The current checkout is an **automation scaffold plus a basic browser scene**,
not yet a complete browser world. It focuses on scene parsing, asset routing,
clean intermediate asset generation, cleanup, and loading one approved asset at
a time into Three.js.

The project direction is deliberately hybrid:

- use the panorama as source art and layout reference,
- parse the scene into candidate objects,
- route each object to an appropriate generation path,
- generate or model assets one-by-one,
- clean and normalise assets,
- place approved assets into a browser-rendered scene.

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
    AUTOMATED_HYBRID_WORKFLOW.md
    SCRIPT_INTERFACES.md
    Pixel_Town_3D_POC_Handoff.md
  scripts/
    parse_scene.py
    route_assets.py
    generate_clean_asset_image.py
    run_image_to_3d_asset.py
    cleanup_glb_asset.py
  src/
    main.js
```

`index.html` now loads a small Three.js viewer from `src/main.js`. Serve the
folder over HTTP and open the local URL in a browser to inspect the cleaned
shrine asset.

## Implemented Now

- Stub scene parser that emits a starter object inventory.
- Stub asset router that assigns each object to a generation strategy.
- Stub clean-asset-image generator that writes prompt metadata and a placeholder
  text artifact, and can write a real source crop PNG.
- Real TripoSR backend hook for `scripts/run_image_to_3d_asset.py`.
- Sample TripoSR-generated outputs for `shrine_01`.
- Cleanup/normalisation for generated GLBs while preserving vertex colors.
- Basic Three.js scene that loads `assets/generated/shrine_01_simple_clean.glb`.
- Script interface documentation in `docs/SCRIPT_INTERFACES.md`.

## Not Implemented Yet

- Real VLM scene parsing.
- Real image generation for clean intermediate asset images.
- Blender-grade cleanup, retopology, or decimation.
- Multi-asset scene composition.
- Production-quality clean asset generation.

## Recommended Hybrid Pipeline

The recommended path for visually distinctive assets is:

1. Parse the scene into object records with IDs, names, descriptions, rough
   locations, complexity, occlusion, and priority.
2. Use each object record plus source-scene context to generate a clean isolated
   3D-style concept image of that object.
3. Feed that clean concept image into an image-to-3D backend.
4. Review, clean, normalise, and only then place the mesh into the world.

This is the preferred branch for assets like `shrine_01` because direct crops
contain background, stairs, trees, and adjacent props. The tradeoff is drift:
the generated clean image can become prettier but less faithful to the source,
so every clean image needs human review before 3D generation.

### 1. Parse the scene

```bash
python3 scripts/parse_scene.py \
  --image assets/source/panorama.png \
  --out assets/scene_parse.json
```

The `--image` path is validated and used to add pixel-space bounding boxes when
present.

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

- `assets/intermediate/shrine_01_clean.png`
- `assets/intermediate/shrine_01_clean.txt`
- `assets/intermediate/shrine_01_clean_meta.json`

The PNG is currently a crop from the source panorama, not a fully isolated
generated clean render. The next version should use the parsed object record as
prompt context and generate a background-free, single-object concept render.

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
- `assets/generated/shrine_01_raw_input.png`
- `assets/generated/shrine_01_generation_meta.json`
- `assets/generated/shrine_01_notes.md`

With `--backend stub`, the GLB is a placeholder byte file. With
`--backend tripo`, the GLB is generated by a local TripoSR checkout.

Example TripoSR run:

```bash
python3 scripts/run_image_to_3d_asset.py \
  --asset shrine_01 \
  --scene assets/scene_parse.json \
  --routes assets/asset_routes.json \
  --mode clean-render \
  --backend tripo \
  --outdir assets/generated \
  --tripo-repo /tmp/triposr-run \
  --tripo-python /tmp/triposr-venv/bin/python \
  --device cpu \
  --mc-resolution 128 \
  --chunk-size 4096
```

Current first-run result: TripoSR produces a valid GLB for `shrine_01`, but the
mesh mostly captures the shrine roof mass. A cleaner isolated input image is the
next quality lever.

Current best browser-asset candidate:

- `assets/intermediate/shrine_01_simple_concept.png`
- `assets/generated/shrine_01_simple_clean.glb`
- `assets/generated/shrine_01_simple_preview.png`

This simpler concept is less ornate and more source-faithful than the first
generated concept. The cleaned GLB is grounded, centered, scaled, and preserves
TripoSR vertex colors.

### 5. Preview in Three.js

```bash
python3 -m http.server 8010
```

Then open:

```text
http://localhost:8010
```

The viewer uses CDN-hosted Three.js modules, loads the cleaned shrine GLB,
enables vertex colors on imported meshes, adds orbit controls, and provides a
small ground/grid reference. Press `R` in the browser to reset the camera.

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
   scene.

Future automation should keep these as explicit gates rather than silent
decisions: confirm the object inventory, confirm generated prompts, approve
clean concept images, then approve or reject generated meshes. See
`docs/AUTOMATED_HYBRID_WORKFLOW.md`.

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

1. Build the generic reviewed-inventory and prompt-manifest flow described in
   `docs/AUTOMATED_HYBRID_WORKFLOW.md`.
2. Replace the source-crop clean image with a generated isolated asset image.
3. Add validation so placeholder GLB files cannot be mistaken for production
   assets.
4. Add a generic scene-placement manifest so future approved assets can be
   positioned without hard-coding `shrine_01`.

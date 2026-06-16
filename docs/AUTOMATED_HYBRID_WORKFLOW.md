# Automated Hybrid Asset Workflow

This document describes the intended non-shrine-specific workflow for turning a
source panorama into reviewed 3D asset candidates.

The pipeline should automate repetitive work while keeping the user in the loop
at the points where taste and source fidelity matter.

## Workflow Summary

1. Scan the source image for major objects.
2. Present the object inventory to the user for confirmation.
3. Let the user tweak names, priorities, bounding boxes, routes, and omissions.
4. Generate prompts for approved objects.
5. Present the prompts to the user for confirmation.
6. Generate clean isolated concept images, or send the reviewed prompt directly
   to a prompt-to-3D backend.
7. Present the generated images or direct meshes for source-fidelity review.
8. Pass approved images into image-to-3D backends when using the hybrid route.
9. Clean generated meshes while preserving color.
10. Present cleaned meshes for review, browser placement, reroute, or rejection.

## Stage 1: Scene Scan

Input:

- `assets/source/panorama.png`

Output:

- `assets/scene_parse.json`

Object records should include:

- stable `id`, for example `shrine_01` or `vending_machine_01`,
- human-friendly `name`,
- `category`,
- normalized `bbox`,
- pixel `bbox_pixels`,
- `depth_band`,
- `priority`,
- `reusable`,
- `occlusion`,
- `complexity`,
- `notes`,
- optional `source_crop`.

The first implementation can be a VLM-assisted parse. Later versions can mix
VLM object detection, manual boxes, and saved project-specific object classes.

## Stage 2: User Inventory Review

Before routing or generation, show the user a reviewable inventory.

The user should be able to:

- rename objects,
- merge duplicates,
- delete unimportant objects,
- add missing objects,
- tweak bounding boxes,
- change priority,
- mark an object as procedural, generated, manual, or deferred.

Persist review decisions instead of overwriting the raw parse:

- raw parse: `assets/scene_parse.json`
- reviewed inventory: `assets/scene_inventory_reviewed.json`

## Stage 3: Route Assets

Input:

- reviewed inventory

Output:

- `assets/asset_routes.json`

Route values:

- `procedural`
- `direct_crop_to_i23d`
- `clean_render_then_i23d`
- `prompt_to_3d_direct`
- `multiview_then_i23d`
- `manual_model`
- `defer`

The router can recommend routes automatically, but the reviewed route should be
treated as the source of truth.

## Stage 4: Generate Prompt Manifest

For each approved object that needs a clean generated image, create a prompt
record before generating images.

Output:

- `assets/prompt_manifest.json`

Example:

```json
{
  "asset_id": "shrine_01",
  "route": "clean_render_then_i23d",
  "prompt_status": "needs_review",
  "prompt": "Create a clean isolated 3D-style concept render...",
  "source_context": {
    "source_image": "assets/source/panorama.png",
    "source_crop": "assets/crops/shrine_01.png",
    "object_notes": "Traditional shrine/temple on a stone terrace on the far left.",
    "style": "pixel-friendly low-poly/toon 3D"
  },
  "constraints": [
    "single object only",
    "background-free or chroma-key background",
    "preserve source identity",
    "avoid extra scenery"
  ]
}
```

Prompt generation should be automatic, but image generation should wait until
the user confirms or edits the prompts.

## Stage 5: User Prompt Review

The user should approve, edit, or reject each prompt.

Useful review states:

- `needs_review`
- `approved`
- `edited`
- `rejected`
- `deferred`

This checkpoint matters because prompt wording controls the main tradeoff:

- cleaner geometry signal,
- versus source fidelity and concept drift.

## Stage 6: Clean Image Generation

Input:

- approved prompt manifest

Outputs:

- `assets/intermediate/<asset_id>_concept.png`
- `assets/intermediate/<asset_id>_concept_chromakey.png` when chroma keying is used
- `assets/intermediate/<asset_id>_concept_meta.json`

The generated image should be a single object with generous padding and a clean
silhouette. For image-to-3D, boring clarity is usually better than beautiful
scene composition.

## Stage 6B: Direct Prompt-To-3D Generation

For some objects, skip the intermediate generated image:

```text
object metadata -> reviewed prompt -> prompt-to-3D backend -> raw GLB
```

This route is useful when:

- the object can be described cleanly in text,
- source-image fidelity is less important than simple browser geometry,
- the intermediate image step is adding visual drift,
- a paid text-to-3D API can produce a usable GLB directly,
- or a local parametric generator can build the asset more cleanly than an AI
  mesh model.

Route value:

- `prompt_to_3d_direct`

For investigated local and paid options, see
`docs/DIRECT_PROMPT_TO_3D_OPTIONS.md`.

Suggested outputs:

- `assets/generated/<asset_id>_prompt3d_raw.glb`
- `assets/generated/<asset_id>_prompt3d_prompt.txt`
- `assets/generated/<asset_id>_prompt3d_generation_meta.json`
- `assets/generated/<asset_id>_prompt3d_notes.md`

The same cleanup, color/material preservation, validation, and browser-review
stages should run after direct prompt-to-3D generation.

## Stage 7: User Image Review

Before image-to-3D, the user should review each clean image.

Review questions:

- Does this still look like the source object?
- Did the image generator add unwanted decorations or change scale?
- Is the object isolated enough for image-to-3D?
- Should this image be approved, regenerated, edited, or rerouted?

Useful image review states:

- `approved_for_i23d`
- `needs_regeneration`
- `needs_manual_edit`
- `reroute_manual`
- `rejected`

## Stage 8: Image-To-3D Batch

Input:

- approved clean images
- routes
- backend configuration

Outputs:

- `assets/generated/<asset_id>_raw.glb`
- `assets/generated/<asset_id>_raw_input.png`
- `assets/generated/<asset_id>_preview.png`
- `assets/generated/<asset_id>_generation_meta.json`
- `assets/generated/<asset_id>_notes.md`

The runner should support batch mode eventually, but one asset at a time is
better until validation and review are solid.

## Stage 9: Cleanup And Color Preservation

Input:

- raw generated GLB,
- generation metadata,
- target browser scale/orientation settings.

Outputs:

- `assets/generated/<asset_id>_clean.glb`
- `assets/generated/<asset_id>_cleanup_meta.json`
- `assets/generated/<asset_id>_clean_preview.png`

The first cleanup pass should be mechanical and repeatable:

- remove tiny loose mesh components,
- preserve vertex colors or textures from the image-to-3D backend,
- center the model horizontally,
- ground the base at the world up-axis zero plane,
- scale to a target browser size,
- write mesh counts, bounds, components, and color-preservation status.

Current script:

```bash
python3 scripts/cleanup_glb_asset.py \
  --input assets/generated/<asset_id>_raw.glb \
  --out assets/generated/<asset_id>_clean.glb \
  --meta assets/generated/<asset_id>_cleanup_meta.json \
  --min-faces 128 \
  --target-height 2.0 \
  --up-axis y
```

Color path:

- TripoSR GLBs can contain vertex colors.
- Cleanup must preserve `ColorVisuals`/vertex colors by default.
- Browser rendering must enable vertex colors on loaded materials.
- Use ambient or hemisphere light so vertex colors read clearly.
- If a backend outputs textures instead of vertex colors, cleanup should preserve
  texture files or bake them into a browser-friendly material.

For browser integration, treat the cleaned GLB as the asset source of truth.
Raw GLBs are diagnostic artifacts.

## Stage 10: Mesh Review And Browser Readiness

Before world placement, each cleaned mesh needs review.

Review questions:

- Is the silhouette recognizable?
- Is the scale/origin usable?
- Is mesh density acceptable?
- Are textures/materials usable for the intended style?
- Should it be cleaned, regenerated, rerouted, or rejected?
- Do vertex colors or textures render correctly in the browser?
- Is the asset lightweight enough for repeated use?

Review states:

- `approved_for_browser`
- `needs_cleanup`
- `needs_decimation`
- `needs_color_fix`
- `needs_regeneration`
- `reroute_manual`
- `rejected`

## Suggested Future Scripts

- `scripts/review_scene_inventory.py`
  - prepares an editable reviewed-inventory file from the raw scene parse.
- `scripts/generate_asset_prompts.py`
  - creates prompt records for approved objects and routes.
- `scripts/review_prompt_manifest.py`
  - validates prompt review states before image generation.
- `scripts/generate_clean_asset_batch.py`
  - generates clean concept images from approved prompts.
- `scripts/review_clean_images.py`
  - prepares review metadata for generated images.
- `scripts/run_image_to_3d_batch.py`
  - runs approved clean images through a selected backend.
- `scripts/run_prompt_to_3d_asset.py`
  - runs approved object metadata prompts directly through a text-to-3D or
    parametric backend.
- `scripts/cleanup_glb_asset.py`
  - performs the first browser-oriented cleanup pass while preserving color.
- `scripts/validate_generated_assets.py`
  - checks GLB validity, mesh counts, file sizes, and required metadata.

## Automation Principle

Automate the mechanical parts:

- detection,
- routing recommendations,
- prompt drafting,
- image generation,
- backend invocation,
- mesh cleanup,
- color preservation checks,
- metadata writing,
- validation.

Keep humans in control of the subjective gates:

- object inventory,
- routing priorities,
- prompt approval,
- clean-image source fidelity,
- mesh acceptance.

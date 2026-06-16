# Automated Hybrid Asset Workflow

This document describes the intended non-shrine-specific workflow for turning a
source panorama into reviewed 3D asset candidates.

The pipeline should automate repetitive work while keeping the user in the loop
at the points where taste and source fidelity matter.

## Workflow Summary

1. Scan the source image for major objects.
2. Present the object inventory to the user for confirmation.
3. Let the user tweak names, priorities, bounding boxes, routes, and omissions.
4. Generate clean-image prompts for approved objects.
5. Present the prompts to the user for confirmation.
6. Generate clean isolated concept images.
7. Present the generated images for source-fidelity review.
8. Pass approved images into image-to-3D backends.
9. Present generated meshes for review, cleanup, reroute, or rejection.

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

## Stage 9: Mesh Review And Cleanup

Before world placement, each mesh needs review.

Review questions:

- Is the silhouette recognizable?
- Is the scale/origin usable?
- Is mesh density acceptable?
- Are textures/materials usable for the intended style?
- Should it be cleaned, regenerated, rerouted, or rejected?

Future cleanup output:

- `assets/generated/<asset_id>_clean.glb`
- `assets/generated/<asset_id>_cleanup_meta.json`

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
- `scripts/validate_generated_assets.py`
  - checks GLB validity, mesh counts, file sizes, and required metadata.

## Automation Principle

Automate the mechanical parts:

- detection,
- routing recommendations,
- prompt drafting,
- image generation,
- backend invocation,
- metadata writing,
- validation.

Keep humans in control of the subjective gates:

- object inventory,
- routing priorities,
- prompt approval,
- clean-image source fidelity,
- mesh acceptance.

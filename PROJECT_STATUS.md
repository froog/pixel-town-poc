# Project Status

Created a first proof-of-concept scaffold.

## What is implemented

- Source panorama copied into `assets/source/panorama.png`.
- Automatic crop generation from `config/crop_config.json`.
- Procedural proxy GLB generation for house, shrine, station, train and vending machine.
- Static Three.js browser viewer with orbit controls.
- Scene layout JSON describing asset placement.
- Human decision checklist in `decisions/asset_review.md`.
- Codex handoff in both Markdown and DOCX.

## What is not implemented yet

- Real image-to-3D model invocation.
- Blender cleanup pipeline.
- Pixelation post-process.
- In-browser layout editing and save-back.
- Walkable camera mode.

## Recommended next command

```bash
cd pixel-town-poc
./scripts/run_local.sh
```

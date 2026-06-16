# Direct Prompt-To-3D Route

This is a parallel alternative to the current hybrid route:

```text
object metadata -> clean concept image -> image-to-3D -> cleanup -> browser
```

The direct route is:

```text
object metadata -> reviewed 3D prompt -> prompt-to-3D backend -> cleanup -> browser
```

The goal is to test whether skipping the intermediate generated image reduces
drift, simplifies review, and produces browser-usable GLB assets faster.

## Local Machine Fit

Current development machine:

- Apple M4 Mac mini
- 10 CPU cores
- 10 GPU cores
- 24 GB unified memory
- no NVIDIA CUDA

That makes many research text-to-3D stacks a poor local fit. Most high-quality
open-source pipelines expect CUDA, NVIDIA VRAM, Linux-first dependencies, or
long optimization runs. Local experiments should stay small and pragmatic.

## Recommended Local Options

### 1. Metadata-To-Parametric GLB

Best fit for this project.

This is not black-box AI 3D generation. Instead, use the parsed object metadata
and a prompt/spec to generate simple Three.js or Blender geometry:

- blocky buildings,
- shrine bases and roofs,
- utility poles and wires,
- vending machines,
- trains,
- roads, walls, stairs, fences, signs.

Why it fits:

- runs instantly on this Mac,
- produces clean browser-friendly geometry,
- supports exact scale/origin/material control,
- avoids melted AI meshes,
- aligns with the pixel-led visual target.

Suggested output:

- `assets/generated/<asset_id>_parametric_raw.glb`
- `assets/generated/<asset_id>_parametric_meta.json`
- `assets/generated/<asset_id>_parametric_preview.png`

Recommended first test: `vending_machine_01` or `house_blue_01`, then a simple
shrine template with roof, body, steps, and optional torii gate.

### 2. Shap-E

OpenAI Shap-E is a local text/image-conditioned 3D model release. It can sample
a 3D model directly from a text prompt and exports usable mesh formats through
its examples.

Fit for this project:

- worth a quick baseline test,
- likely runs on CPU/MPS with some dependency wrangling,
- quality is older and less controllable than current paid APIs,
- may produce interesting blob-like concept meshes, not reliable browser props.

Use it as a "how bad is local direct text-to-3D?" baseline, not as the main
asset path.

Source: https://github.com/openai/shap-e

### 3. Point-E

OpenAI Point-E can generate point clouds from text and then convert them to
meshes, but its own docs describe the pure text model as lower quality and
limited to simple categories/colors.

Fit for this project:

- very lightweight local sanity check,
- not recommended for final assets,
- useful only as a cheap baseline.

Source: https://github.com/openai/point-e

### 4. Hunyuan3D / Research Text-To-3D Stacks

Hunyuan3D-1 supports text- and image-conditioned generation, but later
Hunyuan3D releases focus heavily on image-conditioned generation. Threestudio
and DreamFusion-style stacks are flexible but CUDA-oriented.

Fit for this machine:

- not recommended as the next local path on Apple Silicon,
- better suited to a rented NVIDIA GPU or cloud notebook,
- likely to cost more time than API testing for this POC.

Sources:

- https://github.com/Tencent-Hunyuan/Hunyuan3D-1
- https://github.com/Tencent-Hunyuan/Hunyuan3D-2
- https://github.com/threestudio-project/threestudio

## Paid API Options

Pricing and availability move quickly. These notes were checked on 2026-06-16
and should be verified before wiring production spend.

### Meshy

Best first paid API test for this repo.

Why:

- supports text-to-3D and image-to-3D,
- exports GLB/FBX/OBJ/USDZ/STL/BLEND/3MF,
- offers low-poly mode,
- has clear docs and API pricing,
- text-to-3D is a natural match for metadata prompts.

Current public pricing signals:

- Free plan: 100 credits/month.
- Pro: $20/month with 1,000 credits/month and API access.
- Text-to-3D Preview: Meshy 6 costs 20 credits; older models cost 10 credits.
- Texturing/refine costs 10 credits.

Rough cost on Pro:

- Meshy 6 text-to-3D preview only: about $0.40/model.
- Older model text-to-3D preview only: about $0.20/model.
- Preview plus texture/refine: add about $0.20/model.

Sources:

- https://www.meshy.ai/api
- https://www.meshy.ai/pricing
- https://www.meshy.ai/features/text-to-3d

### Tripo AI

Good candidate for stylized and game-ish assets, especially if we want text,
single-image, and multi-image generation under one provider.

Why:

- supports text/image/multi-image workflows,
- has style transforms such as voxel/Minecraft/cartoon/clay in its product
  surface,
- likely useful for rapid visual A/B testing.

Pricing caveat:

- Tripo's public docs are client-rendered and harder to quote from static docs.
- Public comparisons list API credits around $0.01/credit and estimate roughly
  $0.10-$0.25 per model, but this should be confirmed inside a Tripo account
  before implementation.

Sources:

- https://platform.tripo3d.ai/docs/billing
- https://www.tripo3d.ai/api

### Hyper3D Rodin via fal.ai

Good high-quality comparison, but probably not the cheapest first test.

Why:

- supports text-to-3D when no images are provided,
- exports GLB/USDZ/FBX/OBJ/STL,
- has PBR or shaded material options,
- has a clear pay-per-run option through fal.ai.

Current fal.ai pricing:

- $0.40 per generation.
- HighPack add-on costs 3x the base cost.

Fit:

- useful for a premium reference result,
- too expensive/heavy to use for every object initially.

Source: https://fal.ai/models/fal-ai/hyper3d/rodin

### Sloyd

Interesting because it blends AI with parametric templates, which matches the
browser-game asset target better than many fully generative mesh tools.

Why:

- exports clean GLB/FBX/OBJ/STL-style assets,
- template-based generation may produce more predictable topology,
- strong fit for modular props/buildings.

Pricing:

- Free starter/guest options exist.
- Plus is listed at $15/month monthly or $11/month yearly.
- Pro is listed at $50/month.
- API/SDK access appears positioned for Studio/Enterprise/custom plans.

Fit:

- worth testing manually in browser,
- API suitability needs confirmation with Sloyd before automation.

Sources:

- https://www.sloyd.ai/text-to-3d
- https://www.sloyd.ai/pricing

### 3D AI Studio Aggregator

Potentially useful later if we want one API surface across multiple engines
such as Hunyuan, TRELLIS, Tripo, and mesh tools.

Why:

- one API for several generation/post-processing models,
- pay-as-you-go claims,
- repair/convert/optimize tools may reduce our local cleanup burden.

Pricing signals from their 2026 comparison:

- Hunyuan Rapid: 35 credits, 2-3 minutes.
- TRELLIS.2: 15-55 credits.
- Credits are pay-as-you-go and reported as no subscription required.

Fit:

- good second-phase option if Meshy/Tripo results are promising but cleanup is
  still painful.

Source: https://www.3daistudio.com/blog/best-3d-model-generation-apis-2026

## Recommendation

Do not replace the hybrid pipeline yet. Add a parallel route:

```text
prompt_to_3d_direct
```

Run three A/B lanes for the same asset metadata:

1. `parametric_local`: metadata -> generated GLB from template/code.
2. `meshy_text_to_3d`: metadata prompt -> Meshy GLB.
3. `rodin_text_to_3d` or `tripo_text_to_3d`: premium/stylized comparison.

For this project, the likely winning architecture is mixed:

- use local parametric generation for simple repeatable browser assets,
- use paid text-to-3D for organic or visually distinctive hero props,
- keep image-to-3D only when source fidelity matters more than prompt simplicity.

## Prompt Shape

A direct prompt should be derived from the object record, but stricter than an
image prompt:

```text
Create a single low-poly browser-game 3D asset.
Object: shrine.
Source notes: Traditional shrine/temple on a stone terrace on the far left.
Style: clean stylized low-poly, pixel-town compatible, readable silhouette.
Geometry: small wooden shrine body, blue-gray tiled curved roof, simple steps,
few details, no railings unless specified.
Materials: warm wood, blue-gray roof, muted stone base.
Constraints: single object only, no background, no scene, no people, no trees,
centered origin, game-ready GLB, modest polygon count.
```

For paid APIs, keep prompts shorter and more concrete than image-generation
prompts. Multiple nouns and scene language increase the chance of extra objects.

## Implemented Script Shape

The first direct runner is available now:

```bash
python3 scripts/run_prompt_to_3d_asset.py \
  --asset shrine_01 \
  --scene assets/scene_parse.json \
  --routes assets/asset_routes.json \
  --backend parametric \
  --outdir assets/generated
```

Implemented backend names:

- `stub`
- `parametric`

Possible future backend names:
- `shap-e`
- `point-e`
- `meshy`
- `tripo`
- `rodin-fal`
- `sloyd`

Outputs:

- `assets/generated/<asset_id>_prompt3d_raw.glb`
- `assets/generated/<asset_id>_prompt3d_prompt.txt`
- `assets/generated/<asset_id>_prompt3d_generation_meta.json`
- `assets/generated/<asset_id>_prompt3d_notes.md`

The same cleanup and browser-review stages can run after either direct
prompt-to-3D or image-to-3D.

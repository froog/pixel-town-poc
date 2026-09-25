# Procedural World Plan

How to turn Umimi-chō + Yamate from a hand-laid diorama into a seeded,
procedurally generated Japanese coastal/countryside world, and which
countryside details to add as assets.

## 1. Where we are

What already exists and can be reused as-is:

| Piece | Today | Reuse as |
| --- | --- | --- |
| `heightAt(x, z)` in `terrain.js` | one big function: noise + hand-placed hills, cuttings, quay, road bands | the *base field*; hand terms become generated "stamps" |
| Asset functions (`house`, `minka`, `kura`, `torii`, `pagoda`, `paddyCell`, `utilityPole`, trees…) | parametric generators called at fixed coordinates | an **asset registry**: same functions, plus metadata for placement |
| `Batcher` | merges everything into 3 draw calls | per-chunk batching; repeated props move to `InstancedMesh` |
| `tunnel()`, `PORTALS`, rail/road bands | bespoke for two tunnels | generic "network crosses ridge" rule |
| Traffic `Path`, `lane()` | hand-written loops | lanes generated from the road graph |
| Viewport log + `#view=` links | camera state only | add `seed` + chunk id so any flagged view is reproducible |

The layout is hard-coded in `layout.js`, `main.js` and `rural.js`. The plan
below keeps every asset and replaces the coordinates with a pipeline.

## 2. Architecture: layered, seeded, chunked

Everything derives from one integer `seed` (put it in the URL: `?seed=2026`).
Generation runs top-down in layers; each layer only reads layers above it,
so any chunk can be regenerated independently and identically.

```
L0  macro terrain      coast, ridges, valleys          (region, coarse grid)
L1  hydrology          rivers, ponds, flow directions  (region)
L2  land use           sea / beach / town / paddy / satoyama forest / mountain
L3  networks           roads, railway, tunnels, bridges (region graph)
L4  parcels            building plots, paddy terraces, fields (per chunk)
L5  assets             buildings, trees, crops         (per chunk)
L6  details            poles, jizo, vending machines, mirrors, signs (per chunk)
L7  life               traffic lanes, tram schedule, birds, fireflies
```

### L0: macro terrain

- Keep the current style: fBm noise + large smooth "stamps" (ridges,
  valleys, bays) placed by the seed. Domain-warp the noise so ridgelines
  meander rather than looking like blobs.
- Generate at a **region** level (e.g. 512 × 512 units at 4-unit cells) so
  features larger than a chunk (the bay, the valley) are decided once.
- Terracing: quantise slopes near settlements into 0.5–1.0 unit steps for
  tanada (terraced paddies) and house platforms. The low-poly terracing
  paper below shows a clean way (flat terraces joined by vertical walls).

### L1: hydrology

- Compute flow direction + accumulation on the region grid (D8 is enough).
  Cells above an accumulation threshold become streams; large ones become
  rivers. Carve beds exactly like `riverZ` does today, but along the traced
  path.
- Irrigation ponds (tameike) at the heads of small side valleys; the
  satoyama model is literally "stream → canal → pond → terraced paddies".

### L2: land use

A per-cell classifier from height, slope, distance to sea/river/road:

| Class | Rule of thumb | Existing assets |
| --- | --- | --- |
| Sea / beach | below sea level / within 2 units of it | sea shader, sand |
| Harbour town | flat-ish, near coast, near the main road | houses, poles, station, harbour |
| Paddy | slope < 8°, near water, valley floor | `paddyCell`, hazakake, scarecrow |
| Tanada (terraced paddy) | slope 8–20°, near a stream | new: stepped paddy cells |
| Satoyama forest | slopes above villages | broadleaf trees, bamboo, persimmon |
| Sugi / mountain | steep or high | `sugi`, pines, rock |

### L3: networks (roads, rail, tunnels, bridges)

- Pick **settlement seeds** by scoring cells (flat, near water, near coast or
  valley mouth), keep them Poisson-disk spaced.
- Connect settlements with **A\* over a cost field** (slope cost, water cost,
  cost per metre of tunnel/bridge). The cheapest route decides by itself
  whether to cut, tunnel or bridge. Our two tunnels become "route crosses a
  ridge where cutting depth > N → tunnel", and the portal-ramp logic from
  `terrain.js` applies automatically.
- Inside towns, grow streets from the arterial with an extended L-system or
  a tensor field (grid-ish near the station, following contours on slopes).
  CityEngine-style: roads → blocks → parcels.
- The railway is the same A\* with a much stricter grade limit, so it
  prefers tunnels; stations sit where it passes settlements.

### L4: parcels

- Town: extract blocks between streets, inset for sidewalks, split with
  **oriented-bounding-box (OBB) subdivision** into road-facing lots.
- Farmland: split flat areas into paddy cells aligned to the valley axis;
  on slopes, follow contours to get terrace strips (bunds become the stone
  or earth walls between steps).
- Optionally an organic, Townscaper-style irregular quad grid for old
  village cores (hex → quads → relax), which gives crooked lanes cheaply.

### L5–L6: assets and details

Turn each asset function into a registry entry:

```js
register('minka', {
  build: minka,                 // existing generator
  footprint: [5, 4],
  landUse: ['paddy', 'satoyama'],
  maxSlope: 0.15,
  face: 'road',                 // rotate to face the nearest road
  cluster: 'farmstead',         // pulls in kura, persimmon, hydrangea
  density: 0.6,
});
```

- Placement: per land-use class, **Poisson-disk sampling** with density
  modulated by noise (blue noise looks natural and avoids overlaps; the
  existing `claim()/free()` becomes a spatial hash).
- Clusters/grammars: a "farmstead" = minka + kura + persimmon + vegetable
  plot + hydrangea hedge; a "shrine" = torii + hokora/hall + lanterns +
  big tree. Rules like these read as intentional, not random.
- Details along edges: every road segment gets poles every ~10 units,
  occasional curve mirrors at bends, jizo at junctions, vending machines
  near bus stops and stations. This is what made the hand-built town read
  as "Japan", so it should be systematic.

### Chunking, streaming, performance

- Chunks of 64 × 64 units. Regions (L0–L3) are decided first and are tiny;
  chunks (L4–L6) are generated on demand around the camera.
- Generate chunks in a **Web Worker** and transfer vertex buffers back
  (`postMessage(..., [buffer])`) so the main thread never stalls, which is
  also the fix for slow phone loading.
- Repeated props → `InstancedMesh` (trees, paddy rows, poles, torii). Unique
  buildings stay batched per chunk. This alone cuts the current ~1M
  vertices dramatically.
- LOD: near chunks full detail; mid chunks without small props; far chunks
  heightmap + tree billboards. Unload chunks outside ~3 rings.
- Memory budget per device class (`quality.js` already has `LITE`).

### Determinism and debugging

- Per-chunk RNG = hash(seed, chunkX, chunkZ, layer). Never use
  `Math.random()` in generation (the `Batcher` colour jitter currently does;
  move it to the seeded RNG).
- Add `seed` and chunk id to the viewport log, so a 🚩 flag reproduces the
  exact world as well as the camera.
- A debug overlay showing land-use and network layers (toggle key) makes
  generator bugs visible without flying around.

### Keeping the AI asset pipeline

The original pipeline (panorama → TripoSR GLB) plugs into the registry:
a cleaned GLB gets the same metadata as a procedural generator (footprint,
land-use, facing). The shrine toggle already proves this works in context.

## 3. Phased plan

| Phase | Result you can see | Rough size |
| --- | --- | --- |
| 1. Registry + seeded RNG | same world, but assets registered and deterministic; `?seed=` changes decoration only | 1 day |
| 2. Region terrain + hydrology | new coastlines, ridges and rivers per seed; current town kept as a "stamp" | 2–3 days |
| 3. Networks | A\* roads/rail between generated settlements; auto tunnels and bridges | 3–4 days |
| 4. Parcels + placement | towns, farmsteads, paddies and forests laid out by rules | 3–4 days |
| 5. Chunks + workers + instancing | endless-feeling world, fast on phones | 3–5 days |
| 6. Seasons + weather | the same seed in spring / summer / autumn / winter | 2–3 days |

Each phase ships on its own; phases 1 and 5 also improve the current
hand-built world.

## 4. Countryside details to add as assets

Grouped by where they belong in the pipeline. ✓ = already in the world.

### Farmland and water (L2/L4)

| Asset | What it is | Notes |
| --- | --- | --- |
| Tanada | terraced paddies stepping down a hillside | stone or earth bunds; the signature satoyama image |
| Tameike | irrigation pond | reed edges, a small sluice, frogs at night |
| Irrigation canals | narrow concrete channels beside paddies | tiny sluice gates, planks as footbridges |
| Hazakake / hazagi ✓ | rice-drying racks | autumn only when seasons exist |
| Vegetable plots ✓, daikon rows | dry fields near houses | |
| Tea rows | rounded hedges on slopes | good contour-following test |
| Vinyl greenhouses ✓ | | |
| Mujin hanbai | unmanned roadside vegetable stand with a coin box | small roof, shelves; lovely detail at road edges |
| Scarecrows ✓, bird-scaring tape/CD strings | | |
| Water wheel ✓, stepping stones ✓ | | |

### Sacred and folk (L5/L6)

| Asset | Notes |
| --- | --- |
| Hokora | miniature roadside shrine; place at junctions, field edges, under big trees |
| Inari shrine | red torii + fox (kitsune) statues; Inari is the rice god, so near paddies |
| Senbon torii ✓, shrine terrace ✓, temple + pagoda ✓ | |
| Jizo ✓ in rows with red bibs | also single jizo at dangerous corners |
| Dōsojin | carved roadside guardian stones at village boundaries |
| Sacred tree (shinboku) | huge tree with shimenawa rope; anchor for shrine clusters |
| Stone lanterns ✓, komainu ✓ | |
| Graveyards | grey stone clusters on hillside terraces behind temples |

### Village buildings (L5)

| Asset | Notes |
| --- | --- |
| Kayabuki minka ✓ | vary: hip vs irimoya, tin-covered thatch (very common today) |
| Kura storehouse ✓ | |
| Nagaya-mon gatehouse | long gate building for big farmsteads |
| Barn / tool shed with corrugated roof | cheap filler, very common |
| Village community hall (kōminkan) | one per settlement |
| Small school with a playground and swimming pool | cluster anchor |
| Onsen / sentō with chimney | steam particles |
| Village shop with a Showa-era sign | |
| Abandoned house (akiya) with overgrown garden | realism; rural depopulation is everywhere |

### Infrastructure (L3/L6)

| Asset | Notes |
| --- | --- |
| Utility poles ✓, curve mirrors ✓, tunnels ✓ | |
| Sabo dam | stepped concrete check dams in steep streams |
| Slope protection | concrete lattice (frame) on cut slopes; perfect for our cuttings |
| Stone retaining walls ✓ (shrine) | reuse for terraces and roads |
| Guardrails, snow poles with red/white arrows (north) | |
| Bus stop ✓, rural station ✓, level crossing ✓ | |
| Small concrete or red lacquered bridges | bridge type by road class |
| Kei trucks ✓, tractors, rice-planting machines | seasonal traffic |

### Everyday life (L6/L7)

| Asset | Notes |
| --- | --- |
| Laundry ✓, potted plants ✓, bicycles, mailboxes, gas cylinders | house dressing |
| Koinobori | carp streamers on poles in spring (Children's Day) |
| Firewood stacks, bamboo fences, persimmon trees ✓ | farmstead dressing |
| Cats ✓, crows, herons/egrets ✓, dragonflies, frogs (audio), fireflies ✓ | |

### Seasons (Phase 6)

| Season | Paddies | Details |
| --- | --- | --- |
| Spring | flooded mirror paddies, planting | sakura on shrine hills, rape blossom on banks, koinobori |
| Summer | green rows ✓ | hydrangeas ✓, cicadas ✓, fireflies ✓, festival lanterns |
| Autumn | golden rice, then stubble | hazakake full, higanbana (red spider lilies) on paddy ridges, maples, persimmons |
| Winter | bare stubble, snow | snow caps on thatch, dried persimmons hung under eaves (hoshigaki), yukitsuri ropes on pines |

## 5. Suggested first step

Phase 1 is small and low risk: add `src/town/registry.js`, route the
existing asset calls through it, and replace every `Math.random()` in
generation with the seeded RNG. After that, `?seed=` can already reshuffle
trees, houses and colours while the layout stays put, which makes the
later phases easy to test.

## Sources

- [Procedural Content Generation of Villages and Road System on Arbitrary Terrains](https://www.researchgate.net/publication/330945485_Procedural_Content_Generation_of_Villages_and_Road_System_on_Arbitrary_Terrains)
- [A method for road network generation based on tensor field and multi-agent](https://www.researchgate.net/publication/364451549_A_METHOD_FOR_ROAD_NETWORK_GENERATION_BASED_ON_TENSOR_FIELD_AND_MULTI-AGENT)
- [Procedural City: roads, blocks, OBB parcels (Jake Lem)](https://jakelem.com/code/procedural-city/)
- [procedural-cities paper (L-systems for street maps)](https://github.com/phiresky/procedural-cities/blob/master/paper.md)
- [Procedural Generation For Dummies: Road Generation](https://martindevans.me/game-development/2015/12/11/Procedural-Generation-For-Dummies-Roads/)
- [Generating an infinite world with Wave Function Collapse (Marian42)](https://marian42.de/article/infinite-wfc/)
- [High-performance WFC solver for three.js](https://discourse.threejs.org/t/building-a-high-performance-wave-function-collapse-solver-for-three-js/81704)
- [How Townscaper Works](https://www.gamedeveloper.com/game-platforms/how-townscaper-works-a-story-four-games-in-the-making)
- [Townscaper grid tutorial (Sylves)](https://boristhebrave.com/docs/sylves/1/articles/tutorials/townscaper.html)
- [Poisson Disk Sampling (Dev.Mag)](http://devmag.org.za/2009/05/03/poisson-disk-sampling/)
- [AutoBiomes: multi-biome landscapes](https://link.springer.com/article/10.1007/s00371-020-01920-7)
- [Procedural low-poly terrain with terracing](https://pith.science/paper/2505.09350)
- [Satoyama (Wikipedia)](https://en.wikipedia.org/wiki/Satoyama)
- [Satoyama: living together with nature (Nippon.com)](https://www.nippon.com/en/images/i00059/)
- [The Satoyama philosophy](https://japanwebmagazine.substack.com/p/the-satoyama-philosophy-japans-living)
- [Hokora (Wikipedia)](https://en.wikipedia.org/wiki/Hokora)
- [Inari shrine (Wikipedia)](https://en.wikipedia.org/wiki/Inari_shrine)
- [Japan's self-service vegetable stands](https://kyotoandbeyond.substack.com/p/how-japans-selfservice-vegetable)
- [Haza rice drying, Noto](http://noto-satoyamasatoumi.jp/detail_en.php?tp_no=284)
- [Koinobori (Wikipedia)](https://en.wikipedia.org/wiki/Koinobori)
- [Kayabuki no Sato, Miyama](https://www.kanpai-japan.com/miyama-kayabuki-no-sato)
- [What is a kominka?](https://stayjapan.com/media/what-is-kominka-traditional-japanese-farmhouse-guide/)
- [Sabo check dams in Japan](http://staff.civil.uq.edu.au/h.chanson/sabo.html)

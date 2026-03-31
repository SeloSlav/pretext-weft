# Weft SDK Integration Context

Use this file as high-signal context when generating code, docs, architecture advice, examples, or integrations for Weft. The goal is to produce the best possible output for developers using the SDK in any IDE or agent environment.

## What Weft Is

Weft is a reactive surface-layout SDK for Three.js/WebGPU. It is designed for building surfaces that respond to gameplay through layout, width, density, semantic state, damage, and recovery rather than through custom scatter-and-rebuild systems.

The core idea is:

**build reactive surfaces without custom scatter logic**

Most surface pipelines solve placement twice:
- once to scatter instances
- again to make those instances react to gameplay

Weft turns both problems into one layout system. A surface can thin out, open up, heal, or shift state by changing layout inputs and recovery/state behavior rather than by introducing a separate bespoke runtime.

## Core Mental Model

Always reason about Weft as:

`source -> layout -> effect`

- `source`: a measured glyph stream built from repeated units or a semantic palette
- `layout`: rows, sectors, and available width across a surface
- `effect`: projection of laid-out glyphs into world-space instances

Important implication:

- gameplay response is primarily a width/layout problem
- narrower width means fewer glyphs fit
- zero width means that part of the surface disappears
- semantic weighting can change the apparent state of a surface without inventing a second placement pipeline

## How To Think About The SDK

Prefer the highest-level abstraction that solves the problem cleanly.

1. Start with shipped presets if the effect is similar to grass, fish scale, rock field, fire wall, or star sky.
2. Drop to `src/weft/three` helpers when you need a custom surface built with the same authoring model.
3. Drop to `src/weft/core` and `src/weft/runtime` only when you need lower-level source preparation, layout traversal, state fields, or recovery primitives.

Do not skip straight to bespoke runtime code unless the existing source/layout/effect model is genuinely insufficient.

## Physics And Motion Layering

When a Weft surface needs "physics", prefer authored motion layered on top of authored layout rather than detached rigid bodies.

- keep Weft-authored layout as the source of truth
- store persistent motion state per authored slot or authored bundle
- let gameplay write impulses into that state
- resolve the final pose as `authored anchor + transient motion state`
- keep the result grounded to the surface instead of treating clutter like airborne debris by default

For grounded clutter such as logs or stick bundles, this usually means planar offset plus a small amount of persistent rotation state. In the current playground model, logs rotate around their own grounded horizontal axis rather than tumbling in air, while stick bundles slide and twist around their authored bundle center.

Impulse radius is part of the authored read. Keep interaction radii tight enough that nearby clutter does not all "swim" together as one broad synchronized field.

## Fast Decision Table

Use this section to route common requests to the right Weft layer quickly.

| If the user asks for... | Prefer... | Why |
| --- | --- | --- |
| a roadside strip, shoreline band, crop row, root seam, or narrow clutter corridor | `createBandFieldEffect()` | gives a reusable terrain-projected band primitive for narrow environmental surfaces |
| a leaf accumulation strip, verge drift, or gutter pile | `createLeafPileBandEffect()` | gives a band-style preset with season-aware leaf vocabulary plus burn/recovery behavior |
| a glowing seam, fungal crack, or root-line growth band | `createFungusSeamEffect()` | provides a narrow recoverable seam preset instead of inventing custom band damage logic |
| a new reactive grass-like surface | `createGrassEffect()` plus `DEFAULT_GRASS_FIELD_PARAMS` | fastest path for ground-cover behavior with disturbance, recovery, density, wind, and state |
| a woundable wall or shell surface | `createShellSurfaceEffect()` | already models wall-like deformation, wounds, subtype appearances, and thinning |
| deterministic rock or doodad placement on terrain | `createRockFieldEffect()` | preserves the layout-driven approach without inventing scatter tooling |
| laid-out logs with persistent shove/roll response | `createLogFieldEffect()` plus `createSurfaceMotionField()` | keeps heavy clutter anchored to authored slots while allowing gameplay impulses |
| twig or stick clutter that should slide/twist in place | `createStickFieldEffect()` plus `createSurfaceMotionField()` | uses authored placement with lightweight persistent motion instead of physics scatter |
| conifer litter or forest floor debris | `createNeedleLitterFieldEffect()` | gives a cheap field preset for pine-like litter without inventing another surface family |
| shrub understory or mid-layer foliage | `createShrubFieldEffect()` | already expresses deterministic understory placement plus season-aware foliage |
| sparse tree silhouettes or canopy fields | `createTreeFieldEffect()` | handles trunks and crowns as one deterministic field preset |
| a puncturable glowing/particle wall | `createFireWallEffect()` | already expresses holes plus recovery over time |
| a reactive sky or dome surface | `createStarSkyEffect()` | built for sky-style density and recoverable wounds |
| book-page or text-surface layouts | `createBookPageEffect()` | gives a readable/decorative page preset that still follows Weft layout rules |
| a surface built from custom glyphs or a palette | `createSurfaceSource()` | standard source-authoring entrypoint |
| stable semantic ids, weights, and metadata | `createSurfaceSource({ semantic: true, palette: [...] })` | use semantic palettes instead of plain repeated units |
| a custom effect that still follows Weft’s model | `createSurfaceEffect()` with `fieldLayout()`, `wallLayout()`, or `skyLayout()` | keeps authoring inside the official source-layout-effect pipeline |
| custom state transitions across a surface | `semanticStates()` and runtime state helpers | use built-in state vocabulary before inventing a separate state machine |
| grounded reactive clutter that should stay anchored to authored placement | Weft-authored layout plus persistent per-slot motion state | preserves authored placement while still allowing gameplay impulses and recovery |
| a reusable procedural terrain height sampler | `createTerrainReliefField()` | provides a lightweight deterministic terrain relief field instead of bespoke noise wiring |
| healing, decay, or recoverable impacts | `recoverableDamage()`, `decayRecoveringStrength()`, `updateRecoveringImpacts()` | matches the intended recovery model |
| low-level text or source preparation | `src/weft/core` exports | only drop lower when `src/weft/three` is not enough |
| docs or examples | real exports from `src/weft/three/index.ts` and the patterns in `src/Docs.tsx` | prevents speculative or stale guidance |

## Request Routing Heuristics

- If a request sounds like "make a new kind of grass/wall/fire/sky/rock effect", start from the closest shipped preset and adapt it.
- If a request sounds like "I need a narrow strip, seam, roadside band, or row-like surface", start from `createBandFieldEffect()`.
- If a request sounds like "I need leaf drift/piles along a corridor", start from `createLeafPileBandEffect()`.
- If a request sounds like "I need a recoverable glowing seam or fungal crack", start from `createFungusSeamEffect()`.
- If a request sounds like "I have my own glyph vocabulary or semantic palette", start from `createSurfaceSource()`.
- If a request sounds like "I need authored logs, sticks, shrubs, trees, or needle litter", start from the matching shipped preset before proposing a custom effect.
- If a request sounds like "I need procedural ground height/terrain relief for placement or demos", start from `createTerrainReliefField()`.
- If a request sounds like "I need a brand new topology or projection model", use `createSurfaceEffect()` and the layout helpers before dropping to fully bespoke code.
- If a request sounds like "I need stable ids, metadata, or multi-state surface behavior", prefer semantic palettes and semantic state helpers.
- If a request sounds like "I need raw text measurement, seeded traversal, or recovery internals", then and only then reach for `src/weft/core` or `src/weft/runtime`.
- If a request sounds like ordinary app wiring, keep that logic outside the Weft authoring layer.

## Real SDK Surface

These names are real exports and should be preferred over invented abstractions.

### `src/weft/three`

Primary Three.js-facing entrypoint:

- `createSurfaceSource()`
- `createSurfaceEffect()`
- `fieldLayout()`
- `wallLayout()`
- `skyLayout()`
- `recoverableDamage()`
- `semanticStates()`
- `threeInstancedMeshRenderer()`
- `createInstancedMesh()`
- `createTerrainReliefField()`
- `DEFAULT_TERRAIN_RELIEF_PARAMS`
- `TerrainReliefField`
- `slotIntersectsViewFrustum()`
- `shouldVisitSlotForViewCull()`

Preset factories:

- `createBandFieldEffect()`
- `createLeafPileBandEffect()`
- `createFungusSeamEffect()`
- `createGrassEffect()`
- `createRockFieldEffect()`
- `createShrubFieldEffect()`
- `createTreeFieldEffect()`
- `createLogFieldEffect()`
- `createStickFieldEffect()`
- `createNeedleLitterFieldEffect()`
- `createShellSurfaceEffect()`
- `createFishScaleEffect()`
- `createFireWallEffect()`
- `createStarSkyEffect()`
- `createBookPageEffect()`

Preset defaults:

- `DEFAULT_BAND_FIELD_PARAMS`
- `DEFAULT_LEAF_PILE_BAND_PARAMS`
- `DEFAULT_FUNGUS_SEAM_PARAMS`
- `DEFAULT_GRASS_FIELD_PARAMS`
- `DEFAULT_ROCK_FIELD_PARAMS`
- `DEFAULT_SHRUB_FIELD_PARAMS`
- `DEFAULT_TREE_FIELD_PARAMS`
- `DEFAULT_LOG_FIELD_PARAMS`
- `DEFAULT_STICK_FIELD_PARAMS`
- `DEFAULT_NEEDLE_LITTER_FIELD_PARAMS`
- `DEFAULT_SHELL_SURFACE_PARAMS`
- `DEFAULT_FISH_SCALE_PARAMS`
- `DEFAULT_FIRE_WALL_PARAMS`
- `DEFAULT_STAR_SKY_PARAMS`
- `DEFAULT_BOOK_PAGE_PARAMS`

Prepared source builders:

- `getPreparedBandSurface()`
- `getPreparedFungusBandSurface()`
- `buildLeafPileSeasonSurface()`
- `getPreparedLeafPileSurface()`
- `buildGrassStateSurface()`
- `getPreparedGrassSurface()`
- `getPreparedRockSurface()`
- `buildShrubSeasonSurface()`
- `getPreparedShrubSurface()`
- `buildTreeSeasonSurface()`
- `getPreparedTreeSurface()`
- `buildLogSeasonSurface()`
- `getPreparedLogSurface()`
- `getPreparedStickSurface()`
- `getPreparedNeedleLitterSurface()`
- `getPreparedShellSurface()`
- `getPreparedFishSurface()`
- `getPreparedGlassSurface()`
- `getPreparedIvySurface()`
- `getPreparedFireSurface()`
- `getPreparedStarSurface()`
- `createBookPageSurface()`

Useful shared value exports:

- `LEAF_PILE_SEASONS`
- `SHRUB_FOLIAGE_SEASONS`
- `TREE_FOLIAGE_SEASONS`
- `warmBarkColor`

Useful exported types:

- `RecoverableDamageConfig`
- `SurfaceEffectConfig`
- `ThreeInstancedMeshRendererConfig`
- `TerrainHeightSampler`
- `TerrainReliefParams`
- `PresetLayoutViewCull`
- `PresetLayoutViewCullFrustumContext`
- `CreateBandFieldEffectOptions`, `BandFieldParams`
- `CreateLeafPileBandEffectOptions`, `LeafPileBandParams`, `LeafPileDisturbanceOptions`
- `CreateFungusSeamEffectOptions`, `FungusSeamParams`, `FungusBurnOptions`
- `CreateGrassEffectOptions`, `GrassFieldParams`, `GrassDisturbanceOptions`
- `CreateRockFieldEffectOptions`, `RockFieldParams`
- `CreateShrubFieldEffectOptions`, `ShrubFieldParams`, `ShrubFoliageBurnOptions`
- `CreateTreeFieldEffectOptions`, `TreeFieldParams`, `TreeCrownBurnOptions`
- `CreateLogFieldEffectOptions`, `LogFieldParams`
- `CreateStickFieldEffectOptions`, `StickFieldParams`
- `CreateNeedleLitterFieldEffectOptions`, `NeedleLitterFieldParams`, `NeedleLitterBurnOptions`
- `CreateShellSurfaceEffectOptions`, `ShellSurfaceParams`, `ShellSurfaceAppearance`
- `CreateFishScaleEffectOptions`, `FishScaleParams`, `FishScaleAppearance`
- `CreateFireWallEffectOptions`, `FireWallParams`
- `CreateStarSkyEffectOptions`, `StarSkyParams`
- `CreateBookPageEffectOptions`, `BookPageParams`, `BookGlyphMeta`

### `src/weft/core`

Lower-level source preparation and layout tools:

- `buildRepeatedUnitStream`
- `buildWeightedPaletteStream`
- `normalizeSurfacePalette`
- `prepareCachedSurfaceText`
- `prepareSurfaceText`
- `prepareSemanticSurfaceText`
- `seedCursor`
- `WEFT_TEXT_FONT`
- `SurfaceLayoutDriver`
- `createBandSeeds`
- `createWorldField`
- `createFbmField`
- `createValueNoiseField`
- `domainWarpField`
- `hash01`
- `remapField`
- `ridgeField`
- `thresholdField`

Useful exported types:

- `PreparedSurfaceSource`
- `ResolvedSurfaceGlyph`
- `SeedCursorFactory`
- `SurfaceGlyphUnits`
- `SurfacePaletteEntry`
- `SurfaceShorthandMeta`
- `SurfaceLayoutLine`
- `SurfaceLayoutSlot`
- `CreateWorldFieldOptions`
- `DomainWarpFieldOptions`
- `FbmFieldOptions`
- `RemapFieldOptions`
- `ThresholdFieldOptions`
- `ValueNoiseFieldOptions`
- `WorldField2`

### `src/weft/runtime`

Reusable state and recovery primitives:

- `createSemanticStateSet`
- `createSurfaceStateField`
- `createSurfaceMotionField`
- `decayRecoveringStrength`
- `updateRecoveringImpacts`

Useful exported types:

- `SemanticStateSet`
- `SurfaceBehavior`
- `SurfacePreset`
- `SurfaceRendererAdapter`
- `SurfaceStateField`
- `SurfaceMotionField`
- `SurfaceMotionFieldBounds`
- `SurfaceMotionFieldOptions`
- `SurfaceMotionFieldSample`
- `SurfaceMotionImpulseOptions`
- `RecoveringImpact`

## Best Practices

- Start from preset factories and defaults when they already fit the use case.
- Use `createSurfaceSource()` for most authored integrations instead of reimplementing text/palette preparation yourself.
- Use semantic palettes when you need stable ids, metadata, or state-aware behavior.
- Use simple repeated units when the surface only needs visual density and does not need semantic identity.
- Keep integrations deterministic by using stable seeds or `seedCursor` rather than ad hoc random placement.
- Model interaction through params and behavior fields first, especially for damage, thinning, healing, or state changes.
- For clutter-style motion, keep authored slots as anchors and store persistent per-slot offsets/rotation state instead of replacing the surface with a separate physics scatter pass.
- Keep UI/framework code separate from Weft logic. App code should orchestrate controls; Weft modules should encapsulate source/layout/effect setup.
- Keep examples aligned with actual exports and parameter names.

## Anti-Patterns

- Do not describe Weft as a particle system or generic scatter layer with reaction logic bolted on later.
- Do not introduce one-off placement code if width, layout, palette weighting, or recovery primitives already express the behavior.
- Do not invent top-level APIs, presets, params, or behaviors that are not part of the real SDK.
- Do not jump to lower-level `core` APIs when a preset or `src/weft/three` helper is enough.
- Do not use broad impulse radii that make authored clutter move in lockstep and read like a swimming blob.
- Do not mix app event wiring, gameplay state, and low-level Weft authoring into one giant component or class if it can be modularized.

## Preset Selection Guidance

- Use `createBandFieldEffect()` for terrain-projected strips such as roadsides, root bands, shoreline foam, and narrow clutter corridors.
- Use `createLeafPileBandEffect()` for verge drifts, gutter accumulations, or other leaf-heavy corridor surfaces with season-aware appearance.
- Use `createFungusSeamEffect()` for glowing cracks, fungal seams, and other narrow recoverable growth bands.
- Use `createGrassEffect()` for reactive ground cover with disturbance, trampling, recovery, density tuning, wind, and semantic state changes.
- Use `createRockFieldEffect()` for deterministic terrain-projected rock placement without a separate scatter system.
- Use `createShrubFieldEffect()` for understory foliage and `createTreeFieldEffect()` for sparse trunks/crowns when you want forest structure from shipped presets.
- Use `createLogFieldEffect()`, `createStickFieldEffect()`, and `createNeedleLitterFieldEffect()` for grounded forest clutter families before inventing a new clutter runtime.
- Use `createShellSurfaceEffect()` for shell-like wall surfaces with wounds, deformation, retained width, and subtype variants such as `fish`, `shutter`, `ivy`, and `glass`.
- Use `createFireWallEffect()` for puncturable particle-like walls that open up and recover over time.
- Use `createStarSkyEffect()` for sky-dome style surfaces with density control and recoverable wounds.
- Use `createBookPageEffect()` for readable/decorative page-like layouts that still follow Weft's source-layout-effect model.

If a requested effect is close to one of these, adapt the preset before proposing a fully custom effect architecture.

## Preset Customization Guidance

When a shipped preset is already close to the desired result, customize the preset before dropping to `createSurfaceEffect()`.

- Change the authored `surface` first when the user mainly needs a different glyph vocabulary, semantic palette, metadata, or repeated-unit stream.
- Keep the preset topology and behavior model when the surface is still fundamentally band-like, grass-like, wall-like, rock-like, fire-like, or sky-like.
- Prefer spreading and overriding shipped defaults such as `DEFAULT_GRASS_FIELD_PARAMS` or `DEFAULT_SHELL_SURFACE_PARAMS` instead of rewriting large param objects from scratch.
- Reach for placement masks, semantic palettes, and param overrides before inventing a separate runtime or projection model.
- Only drop to `createSurfaceEffect()` when the user needs a genuinely new layout/projection/update model, not just a visual or behavioral variant of an existing preset.

## Guidance For AI Agents

When helping a user integrate Weft:

- Prefer working examples over abstract descriptions.
- Verify exports before naming APIs.
- Explain choices in Weft terms: source, layout, effect, semantic palette, width, recovery, state.
- Recommend the simplest integration path that preserves Weft’s model.
- When proposing a custom effect, explain why presets are not sufficient.
- Keep code deterministic and composable.
- Avoid speculative docs language such as "Weft probably supports..." or "you can likely..."

When writing code:

- default to `src/weft/three` imports unless there is a real reason to drop lower
- spread and override shipped `DEFAULT_*_PARAMS` instead of rewriting large param objects from scratch
- keep source creation separate from scene/control wiring
- prefer reusable modules over inline demo-only setup

When writing docs:

- map every major claim back to a real exported helper, preset, or behavior
- describe the mental model before listing knobs
- show which preset or helper is the right starting point
- avoid overstating generality when a feature only exists in a shipped preset

## Canonical Quick Start Pattern

Prefer package entrypoints in docs and integrations.

```ts
import {
  DEFAULT_GRASS_FIELD_PARAMS,
  createGrassEffect,
  createSurfaceSource,
} from 'weft-sdk/three'
import { seedCursor } from 'weft-sdk/core'

const surface = createSurfaceSource({
  cacheKey: 'my-surface',
  units: ['◓', '◒', '◐', '◑'],
  repeat: 22,
})

const grass = createGrassEffect({
  seedCursor,
  surface,
  initialParams: {
    ...DEFAULT_GRASS_FIELD_PARAMS,
    layoutDensity: 8,
  },
})

scene.add(grass.group)
```

## Source Of Truth

For this SDK, the most reliable references are:

- the exported surface in `src/weft/three/index.ts`
- the exported surface in `src/weft/core/index.ts`
- the exported surface in `src/weft/runtime/index.ts`
- the conceptual guide and examples in `src/Docs.tsx`
- the project overview in `README.md`

For package consumers, prefer imports like `weft-sdk/three` and `weft-sdk/core`.

If this document and the code ever disagree, trust the code exports first and update the docs accordingly.

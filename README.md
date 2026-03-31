# Weft

Deterministic reactive surface SDK for Three.js.

Weft lets you author surfaces as `source -> layout -> effect` so placement and gameplay response stay in one model instead of splitting into scatter code plus a separate reaction system.

- Live site: [pretext-weft.vercel.app](https://pretext-weft.vercel.app)
- npm package: [`weft-sdk`](https://www.npmjs.com/package/weft-sdk)
- AI integration guide: [`weft.md`](./weft.md)

Current release: `0.1.6` as of March 30, 2026.

![Playground screenshot](https://raw.githubusercontent.com/SeloSlav/weft/main/public/readme-playground-screenshot.png)

## Mental model

Think about Weft as:

`source -> layout -> effect`

- `source`: a measured stream built from repeated units or a semantic palette
- `layout`: rows, sectors, and available width across a surface
- `effect`: projection of laid-out glyphs into world-space instances

The key contract is width:

- narrower width means fewer glyphs fit
- zero width means that part of the surface disappears
- semantic state can change the apparent surface without inventing a second placement pipeline

## Where it fits

Weft is strongest when the thing you are placing can honestly be treated as a reactive surface:

- grass and ground cover
- roadside bands, seams, clutter corridors, and fungus strips
- leaf litter, sticks, needles, logs, rocks, shrubs, and trees
- shell-like walls, shutters, ivy, glass, and fish-scale surfaces
- puncturable fire walls and recoverable sky surfaces
- stylized page/text surfaces and other layout-driven instance fields

It is not trying to replace every biome or world-simulation system. It works best when deterministic layout, thinning, recovery, and semantic state are the main problem.

## Package layers

- `weft-sdk/three`: preset factories, layouts, behaviors, and Three.js-facing helpers
- `weft-sdk/core`: source preparation, deterministic seed cursors, layout traversal, and world-field helpers
- `weft-sdk/runtime`: reusable state, recovery, and sampled motion helpers

## Shipped presets

Current public presets include:

- `createBandFieldEffect()`
- `createLeafPileBandEffect()`
- `createFungusSeamEffect()`
- `createGrassEffect()`
- `createRockFieldEffect()`
- `createLogFieldEffect()`
- `createStickFieldEffect()`
- `createNeedleLitterFieldEffect()`
- `createShrubFieldEffect()`
- `createTreeFieldEffect()`
- `createShellSurfaceEffect()`
- `createFishScaleEffect()`
- `createFireWallEffect()`
- `createStarSkyEffect()`
- `createBookPageEffect()`

## Quick start

Install the package with Three.js:

```bash
npm install weft-sdk three
```

Then create a source, feed it into a preset, and mount the returned group into your scene:

```ts
import * as THREE from 'three'
import {
  DEFAULT_GRASS_FIELD_PARAMS,
  createGrassEffect,
  createSurfaceSource,
} from 'weft-sdk/three'
import { seedCursor } from 'weft-sdk/core'

const scene = new THREE.Scene()

const surface = createSurfaceSource({
  cacheKey: 'hello-weft',
  units: ['|', '/', '\\'],
  repeat: 24,
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

## Deterministic world fields

For larger authored worlds, use `weft-sdk/core` world fields to drive masks and density without inventing a separate scatter pipeline:

```ts
import {
  DEFAULT_TREE_FIELD_PARAMS,
  createTreeFieldEffect,
  getPreparedTreeSurface,
} from 'weft-sdk/three'
import { createWorldField, seedCursor } from 'weft-sdk/core'

const forestSignal = createWorldField(17, {
  scale: 28,
  roughness: 0.55,
  warpAmplitude: 9,
})

const trees = createTreeFieldEffect({
  seedCursor,
  surface: getPreparedTreeSurface(),
  initialParams: DEFAULT_TREE_FIELD_PARAMS,
  placementMask: {
    bounds: { minX: -64, maxX: 64, minZ: -64, maxZ: 64 },
    includeAtXZ: (x, z) => forestSignal(x, z) > 0.58,
  },
})
```

## Learn more

- For full preset/API detail, use the SDK docs page powered by `src/Docs.tsx`.
- For AI/codegen context, use [`weft.md`](./weft.md).
- For additional preset ideas, see [`preset-ideas.md`](./preset-ideas.md).

## Local development

Node.js 20+ is recommended.

```bash
npm install
npm run dev
```

The local site is WebGPU-only.

## Credits

- Layout and measurement: [Pretext](https://www.npmjs.com/package/@chenglou/pretext)
- Rendering: [Three.js](https://threejs.org/)

## License

[MIT](LICENSE)

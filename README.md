# Weft

Reactive surface-layout SDK for Three.js/WebGPU. Build gameplay-responsive grass, walls, doodads, and skyboxes without custom scatter logic.

- Live site: [pretext-weft.vercel.app](https://pretext-weft.vercel.app)
- Video demo: [x.com/SeloSlav/status/2038245103643333014](https://x.com/SeloSlav/status/2038245103643333014)
- npm package: [`weft-sdk`](https://www.npmjs.com/package/weft-sdk)

> Start here for SDK integration guidance and agent-ready context: [`weft.md`](./weft.md)

![Playground screenshot](https://raw.githubusercontent.com/SeloSlav/weft/main/public/readme-playground-screenshot.png)

The site has two faces:

- `Overview`: explains the engine argument and compares it to traditional scatter workflows
- `Playground`: a stylized **edge-of-town intersection** (asphalt, markings, curbs, buildings) where multiple Weft surfaces share one runtime

## Core idea

The core idea is simple:

**build reactive surfaces without custom scatter logic**

Most surface systems make you solve placement twice: once to scatter instances, then again to make them react to gameplay. Weft turns that into one layout problem, so the same surface can thin out, open up, heal, or change state without a second bespoke runtime.

Under the hood, the project uses typographic line breaking as the common placement primitive. A surface only needs:

- a glyph vocabulary, or a weighted semantic palette with ids and metadata
- a projection that turns laid-out rows and sectors into world-space instances

Gameplay response then becomes a width problem. Narrow a slot, and fewer glyphs fit. Return zero width, and that part of the surface disappears. Density comes from font metrics rather than hand-tuned scatter constants. Some samples use direct width changes; others keep layout stable and apply deterministic thinning on top.

## SDK

The repo includes these `Weft` layers:

- `weft-sdk/core`: source preparation, deterministic seed cursors, and `SurfaceLayoutDriver`
- `weft-sdk/runtime`: shared recovery/state primitives
- `weft-sdk/three`: Three.js-first helpers plus shipped presets for `grass`, `fish scale` walls (used here as shutter + ivy facades), `rock field` (rubble lot), `fire wall` (neon sign mode), and `star sky`

Install the package with Three.js:

```bash
npm install weft-sdk three
```

`three` is a peer dependency. `@chenglou/pretext` is bundled as a normal dependency of `weft-sdk`.

## Hello world

This is the smallest package-consumer example: create a source, build a grass effect, and add its group to your scene.

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

The SDK already supports a direct authoring path for new effects through source creation, layout helpers, behaviors, and presets:

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
  initialParams: DEFAULT_GRASS_FIELD_PARAMS,
})
```

Shipped preset entrypoints:

- `createGrassEffect()`
- `createFishScaleEffect()`
- `createRockFieldEffect()`
- `createFireWallEffect()`
- `createStarSkyEffect()`

## Current playground

The `Editor` hosts a **town-edge intersection** built from static meshes (asphalt with yellow stripes, curbs, building blocks, streetlights) plus these reactive surfaces:

- **Grass**: trampling, disturbance, wind, seasonal palette, density, recovery — blades skip the road mask; verge strips read a bit denser
- **Shutter facade** + **ivy facade**: two `createFishScaleEffect()` instances (metal slats vs vine palette) on building walls
- **Rubble lot**: `createRockFieldEffect()` instances only inside a defined lot zone (layout-driven “fracture” density, not physics explosions)
- **Neon sign**: `createFireWallEffect()` with `appearance: 'neon'` (magenta/cyan particles, no log prop)
- **Star sky**: density and sky-wound recovery
- Scene actions: clear facades, grass, neon, sky, or everything

All of this is wired through one `PlaygroundRuntime` using `src/weft/three` presets.

## Runtime interaction

In the current playground:

- `W`, `A`, `S`, `D` move
- `Shift` sprints
- `Space` jumps
- right mouse drag looks around
- mouse wheel zooms
- left click shoots the reticle target

Shots affect the world based on what is under the reticle:

- grass gets local disturbance
- the fish wall gets persistent wounds
- the fire wall gets punched holes
- the sky can be wounded when you shoot upward past world geometry

## How it is built

The architecture is intentionally split so the engine idea is not coupled to React:

- React is only the site shell, landing page, and control UI
- `Three.js` + `WebGPU` run the renderer
- the runtime is plain TypeScript, which keeps the layout system portable and suited to live surface updates
- `src/weft/core` handles source preparation, deterministic band seeding, and layout traversal
- [`Pretext`](https://www.npmjs.com/package/@chenglou/pretext) provides the underlying measurement and line breaking

At a high level the pipeline is:

1. Prepare a measured glyph stream with Weft core on top of Pretext.
2. Describe a surface as rows, sectors, and available width.
3. Run deterministic layout with seeded cursors.
4. Project laid-out glyphs into world-space instances.
5. Re-run layout or thinning when gameplay changes the width field.

## Run the playground

Node.js 20+ is recommended.

```bash
npm install
npm run dev
```

Then open the Vite URL in a **WebGPU-capable browser**.

Important:

- this playground is WebGPU-only
- Three.js WebGL fallback is intentionally disabled
- if WebGPU is unavailable, the app should fail clearly instead of silently switching renderers

Production build:

```bash
npm run build
npm run preview
```

## Project structure

```text
src/
  App.tsx                     Site shell with Overview / Playground navigation
  Landing.tsx                 Product framing and engine explanation
  Editor.tsx                  Playground controls and runtime host
  weft/
    core/                     Extracted source preparation and layout traversal
    runtime/                  Shared runtime behaviors and state primitives
    three/                    Three.js-first public API and presets
      presets/                Self-contained preset logic, defaults, and source builders
  createWebGPURenderer.ts     WebGPU-only renderer bootstrap
  playground/
    PlaygroundRuntime.ts      Shared world runtime and interaction loop
```

## What this repo is

- a working Three.js-first SDK for reactive surface layout
- a playground for comparing multiple surface types under one API
- a proof that gameplay-driven density can come from layout instead of scatter rebuilds

## Credits

- Layout and measurement: [Pretext](https://www.npmjs.com/package/@chenglou/pretext)
- Rendering: [Three.js](https://threejs.org/)

## License

[MIT](LICENSE)

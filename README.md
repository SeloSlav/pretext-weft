# Weft

Deterministic reactive surface SDK for Three.js. Author grass, facades, debris bands, fire walls, and wounds under one layout model instead of rebuilding scatter logic for every gameplay response.

- Live site: [pretext-weft.vercel.app](https://pretext-weft.vercel.app)
- Video demo: [x.com/SeloSlav/status/2038245103643333014](https://x.com/SeloSlav/status/2038245103643333014)
- npm package: [`weft-sdk`](https://www.npmjs.com/package/weft-sdk)

> Start here for SDK integration guidance and agent-ready context: [`weft.md`](./weft.md)

![Playground screenshot](https://raw.githubusercontent.com/SeloSlav/weft/main/public/readme-playground-screenshot.png)

The site has two faces:

- `Overview`: the engine thesis, mental model, and why this is not just another scatter workflow
- `Playground`: a stylized **edge-of-town intersection** where multiple reactive surfaces share one runtime

## Why Weft exists

Most surface systems make you solve placement twice:

1. scatter instances into the world
2. invent a second system to make those instances react to gameplay

That second system is where pipelines usually turn into a mess of masks, density maps, respawn timers, damage textures, custom rebuild code, and one-off recovery logic.

Weft turns both problems into one layout system.

The same authored surface can:

- thin out under damage or pressure
- open holes or corridors
- recover over time
- swap semantic state without changing its projection model
- stay deterministic as the world changes

## Mental model

Think about Weft as:

**source -> layout -> effect**

- `source`: a measured stream built from repeated units or a semantic palette with ids, weights, and metadata
- `layout`: rows, sectors, and available width across a surface
- `effect`: projection of the laid-out result into world-space instances

The key gameplay contract is width:

- narrower width means fewer units fit
- zero width means that part of the surface disappears
- semantic weights can shift the apparent state of a surface without inventing a second placement pipeline

This is what makes Weft feel different from ordinary scatter tooling. Placement and reactivity are the same problem.

## What Weft is for

Weft is strongest when the world element can honestly be treated as a reactive surface:

- grass and ground cover
- facades, shutters, ivy, and shell-like wall surfaces
- rubble belts, rock fields, and edge clutter
- puncturable fire or glow walls
- recoverable sky surfaces
- authored bands of crops, fungus, scales, wires, or fish-like swarms

It is **not** trying to replace every procgen or biome scatter workflow. If your placement problem depends on fully freeform ecological simulation, global 2D blue-noise constraints, landmark exceptions, nav-aware object avoidance, or broad open-world biome logic, Weft may be part of the answer, but not the whole answer.

## Why the model is useful

Weft gives Three.js games one deterministic surface runtime for:

- initial placement
- damage and thinning
- healing and recovery
- semantic state shifts
- preset-specific behaviors built on shared primitives

Instead of every effect reinventing its own packing and mutation logic, multiple surface types can share the same authoring model.

## SDK layers

The repo includes these `Weft` layers:

- `weft-sdk/three`: the main entrypoint for app code, layout helpers, behaviors, and shipped presets
- `weft-sdk/runtime`: shared recovery and state primitives
- `weft-sdk/core`: lower-level source preparation, deterministic seed cursors, and layout traversal

Shipped preset entrypoints:

- `createGrassEffect()`
- `createShellSurfaceEffect()`
- `createRockFieldEffect()`
- `createFireWallEffect()`
- `createStarSkyEffect()`

Install the package with Three.js:

```bash
npm install weft-sdk three
```

`three` is a peer dependency. `@chenglou/pretext` is bundled as a normal dependency of `weft-sdk`.

## Quick start

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

The main authoring path is:

1. create a source with `createSurfaceSource()`
2. choose a preset or build a custom surface effect
3. drive change through width, recovery, and semantic state instead of separate scatter rebuilds

## Customization paths

Presets are the fastest way to get something running, but they are not the end of the SDK.

The usual paths are:

- customize a shipped preset by changing its source, semantic palette, placement mask, and default params
- define your own effect config with `createSurfaceEffect()` and pair it with a custom renderer or runtime wrapper

Use the first path when the surface is still grass-like, wall-like, rock-like, fire-like, or sky-like and you mainly want a different authored look or behavior. Use the second path when you want a new projection model, shader system, or update flow while keeping Weft's source/layout/behavior model.

For shell-like walls, the shared preset is `createShellSurfaceEffect()`. It supports multiple subtype appearances such as `fish`, `shutter`, `ivy`, `glass`, and `glassBulb` while keeping the same wound/recovery model.

### Customize a preset

```ts
import {
  DEFAULT_SHELL_SURFACE_PARAMS,
  createShellSurfaceEffect,
  createSurfaceSource,
} from 'weft-sdk/three'
import { seedCursor } from 'weft-sdk/core'

const ivySurface = createSurfaceSource({
  cacheKey: 'ivy-shell',
  semantic: true,
  repeat: 22,
  palette: [
    { id: 'leaf', glyph: '◓', weight: 5, meta: { hueBias: 0.03 } },
    { id: 'bud', glyph: '•', weight: 2, meta: { hueBias: 0.08 } },
  ],
})

const ivyWall = createShellSurfaceEffect({
  seedCursor,
  surface: ivySurface,
  appearance: 'ivy',
  initialParams: {
    ...DEFAULT_SHELL_SURFACE_PARAMS,
    woundNarrow: 0.12,
    recoveryRate: 0.2,
    surfaceFlex: 0.18,
  },
})

scene.add(ivyWall.group)
```

### Define your own effect config

```ts
import * as THREE from 'three'
import {
  createSurfaceEffect,
  createSurfaceSource,
  fieldLayout,
  recoverableDamage,
  threeInstancedMeshRenderer,
} from 'weft-sdk/three'
import { seedCursor } from 'weft-sdk/core'

const emberSurface = createSurfaceSource({
  cacheKey: 'ember-band',
  units: ['.', '*', '•'],
  repeat: 20,
})

const emberEffect = createSurfaceEffect({
  id: 'ember-band',
  source: emberSurface,
  seedCursor,
  layout: fieldLayout({
    rows: 20,
    sectors: 32,
    advanceForRow: (row) => row * 11 + 3,
    staggerFactor: 0.4,
    minSpanFactor: 0.3,
  }),
  renderer: threeInstancedMeshRenderer({
    geometry: new THREE.PlaneGeometry(0.16, 0.16),
    material: new THREE.MeshBasicMaterial({ color: '#ff8a44' }),
    maxInstances: 2400,
  }),
  behaviors: [
    recoverableDamage({
      radius: 1.2,
      recoveryRate: 0.35,
    }),
  ],
})

// Your own module can project/update this config
// with a custom shader, material system, or runtime wrapper.
```

## Current playground

The `Editor` hosts a **town-edge intersection** built from static meshes plus multiple reactive surfaces sharing one runtime:

- **Grass**: trampling, disturbance, wind, seasonal palette shifts, density tuning, and recovery
- **Shell surfaces**: multiple `createShellSurfaceEffect()` instances with different subtypes such as `shutter`, `ivy`, and `glass`
- **Rubble lot**: `createRockFieldEffect()` constrained to a lot zone with deterministic fracture-like density
- **Neon sign**: `createFireWallEffect()` in `appearance: 'neon'` mode
- **Star sky**: density tuning plus recoverable sky wounds
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

## How it works

At a high level the pipeline is:

1. Prepare a measured source stream.
2. Describe a surface as rows, sectors, and available width.
3. Run deterministic layout with seeded cursors.
4. Project the laid-out result into world-space instances.
5. Re-run layout or thinning when gameplay changes the width field or semantic state.

Under the hood, Weft uses [`Pretext`](https://www.npmjs.com/package/@chenglou/pretext) for measurement and line breaking. That implementation detail matters because it makes density and packing stable, but it is not the main thing you are authoring. The main thing you author is a reactive surface.

## Architecture

The engine idea is intentionally not coupled to React:

- React is only the site shell, landing page, and control UI
- `Three.js` + `WebGPU` run the renderer
- the runtime is plain TypeScript and stays focused on live surface updates
- `src/weft/core` handles source preparation, deterministic band seeding, and layout traversal
- `src/weft/runtime` handles reusable recovery and state logic
- `src/weft/three` exposes the Three.js-facing authoring API

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
    core/                     Source preparation and layout traversal
    runtime/                  Shared recovery and state primitives
    three/                    Three.js-first public API and presets
      presets/                Preset logic, defaults, and source builders
  createWebGPURenderer.ts     WebGPU-only renderer bootstrap
  playground/
    PlaygroundRuntime.ts      Shared world runtime and interaction loop
```

## What this repo is

- a working Three.js-first SDK for reactive surface authoring
- a playable proof that placement and gameplay response can share one deterministic model
- a set of presets showing grass, wall, rubble, fire, and sky surfaces under one runtime

## Credits

- Layout and measurement: [Pretext](https://www.npmjs.com/package/@chenglou/pretext)
- Rendering: [Three.js](https://threejs.org/)

## License

[MIT](LICENSE)

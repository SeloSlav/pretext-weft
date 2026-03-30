type DocsProps = {
  onEnterEditor: () => void
}

import weftGuideUrl from '../weft.md?url'

const API_GROUPS = [
  {
    title: 'Core helpers',
    description: 'Create measured sources and low-level surface configs.',
    items: [
      'createSurfaceSource()',
      'createSurfaceEffect()',
      'createInstancedMesh()',
      'threeInstancedMeshRenderer()',
    ],
  },
  {
    title: 'Layouts and behaviors',
    description: 'Describe how a surface is traversed and how it reacts over time.',
    items: [
      'fieldLayout()',
      'wallLayout()',
      'skyLayout()',
      'recoverableDamage()',
      'semanticStates()',
    ],
  },
  {
    title: 'Preset factories',
    description: 'High-level effect entrypoints for the shipped presets.',
    items: [
      'createBandFieldEffect()',
      'createGrassEffect()',
      'createShellSurfaceEffect()',
      'createRockFieldEffect()',
      'createFireWallEffect()',
      'createStarSkyEffect()',
    ],
  },
  {
    title: 'Default params',
    description: 'Preset parameter defaults you can spread and override.',
    items: [
      'DEFAULT_BAND_FIELD_PARAMS',
      'DEFAULT_GRASS_FIELD_PARAMS',
      'DEFAULT_SHELL_SURFACE_PARAMS',
      'DEFAULT_ROCK_FIELD_PARAMS',
      'DEFAULT_FIRE_WALL_PARAMS',
      'DEFAULT_STAR_SKY_PARAMS',
    ],
  },
  {
    title: 'Prepared surface builders',
    description: 'Preset-owned source builders for ready-made surface vocabularies.',
    items: [
      'getPreparedBandSurface()',
      'buildGrassStateSurface()',
      'getPreparedGrassSurface()',
      'getPreparedShellSurface()',
      'getPreparedRockSurface()',
      'getPreparedFireSurface()',
      'getPreparedStarSurface()',
    ],
  },
] as const

const PRESET_GUIDES = [
  {
    name: 'Band field',
    factory: 'createBandFieldEffect()',
    builders: ['getPreparedBandSurface()'],
    useCase: 'A terrain-projected strip preset for roadsides, seams, rows, roots, foam bands, and other narrow environmental corridors.',
    params: ['layoutDensity', 'sizeScale', 'bandWidth', 'edgeSoftness'],
  },
  {
    name: 'Grass field',
    factory: 'createGrassEffect()',
    builders: ['buildGrassStateSurface()', 'getPreparedGrassSurface()'],
    useCase: 'Reactive ground cover that can be disturbed, healed, and swapped between healthy, dry, corrupted, and dead states.',
    params: ['disturbanceRadius', 'disturbanceStrength', 'trampleDepth', 'wind', 'recoveryRate', 'state', 'layoutDensity'],
  },
  {
    name: 'Shell surface',
    factory: 'createShellSurfaceEffect()',
    builders: ['getPreparedShellSurface()', "appearance: 'fish' | 'shutter' | 'ivy' | 'glass' | 'glassBulb'"],
    useCase: 'A layered shell-surface family for fish, shutter, ivy, and glass variants with persistent wounds, deformation, and subtype-specific reads.',
    params: ['woundRadius', 'woundNarrow', 'woundDepth', 'scaleLift', 'surfaceFlex', 'recoveryRate'],
  },
  {
    name: 'Rock field',
    factory: 'createRockFieldEffect()',
    builders: ['getPreparedRockSurface()'],
    useCase: 'Deterministic rock placement projected onto terrain without separate scatter tooling.',
    params: ['layoutDensity', 'sizeScale'],
  },
  {
    name: 'Fire wall',
    factory: 'createFireWallEffect()',
    builders: ['getPreparedFireSurface()'],
    useCase: 'A puncturable wall of particles that opens under damage and recovers over time.',
    params: ['recoveryRate', 'holeSize'],
  },
  {
    name: 'Star sky',
    factory: 'createStarSkyEffect()',
    builders: ['getPreparedStarSurface()'],
    useCase: 'A sky dome layout that supports density tuning and recoverable wounds in the sky.',
    params: ['layoutDensity', 'recoveryRate'],
  },
] as const

const EXAMPLES = [
  {
    title: 'Band field setup',
    code: `import {
  DEFAULT_BAND_FIELD_PARAMS,
  createBandFieldEffect,
  getPreparedBandSurface,
} from 'weft-sdk/three'
import { seedCursor } from 'weft-sdk/core'

const roadsideBand = createBandFieldEffect({
  seedCursor,
  surface: getPreparedBandSurface(),
  initialParams: {
    ...DEFAULT_BAND_FIELD_PARAMS,
    bandWidth: 3.2,
    edgeSoftness: 1.1,
  },
  placementMask: {
    bounds: { minX: -20, maxX: 20, minZ: -12, maxZ: 12 },
    distanceToBandAtXZ: (x, z) => z - Math.sin(x * 0.18) * 1.4,
  },
})

scene.add(roadsideBand.group)`,
  },
  {
    title: 'Grass quick start',
    code: `import {
  DEFAULT_GRASS_FIELD_PARAMS,
  createGrassEffect,
  createSurfaceSource,
} from 'weft-sdk/three'
import { seedCursor } from 'weft-sdk/core'

const surface = createSurfaceSource({
  cacheKey: 'field-shell',
  units: ['⟋', '⟍', '❘', '❙'],
  repeat: 28,
})

const grass = createGrassEffect({
  seedCursor,
  surface,
  initialParams: {
    ...DEFAULT_GRASS_FIELD_PARAMS,
    layoutDensity: 8,
  },
})

scene.add(grass.group)`,
  },
  {
    title: 'Where Weft goes in your app',
    code: `const scene = new THREE.Scene()

const grass = createGrassEffect({
  seedCursor,
  surface,
  initialParams: DEFAULT_GRASS_FIELD_PARAMS,
})

scene.add(grass.group)

function update(dt: number) {
  // Your game/runtime code stays here.
  // Drive Weft params, damage, or semantic state from gameplay.
}

function render() {
  renderer.render(scene, camera)
}`,
  },
  {
    title: 'Semantic palette source',
    code: `import { createSurfaceSource } from 'weft-sdk/three'

const coralSurface = createSurfaceSource({
  cacheKey: 'coral',
  semantic: true,
  repeat: 20,
  palette: [
    { id: 'branch', glyph: 'Y', weight: 4, meta: { scale: 1.2 } },
    { id: 'fan', glyph: '*', weight: 2, meta: { scale: 0.8 } },
    { id: 'bud', glyph: '.', weight: 6, meta: { scale: 0.4 } },
  ],
})`,
  },
  {
    title: 'Wall effect setup',
    code: `import {
  DEFAULT_FIRE_WALL_PARAMS,
  createFireWallEffect,
  getPreparedFireSurface,
} from 'weft-sdk/three'
import { seedCursor } from 'weft-sdk/core'

const fireWall = createFireWallEffect({
  seedCursor,
  surface: getPreparedFireSurface(),
  initialParams: {
    ...DEFAULT_FIRE_WALL_PARAMS,
    holeSize: 1.25,
  },
})

scene.add(fireWall.group)`,
  },
  {
    title: 'Customize a shipped preset',
    code: `import {
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

scene.add(ivyWall.group)`,
  },
  {
    title: 'Define a custom effect config',
    code: `import * as THREE from 'three'
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

// From here, your own module can project/update this config
// with a custom shader, material system, or runtime wrapper.`,
  },
] as const

export function Docs({ onEnterEditor }: DocsProps) {
  return (
    <div className="docs">
      <div className="docs__inner">
        <p className="docs__eyebrow">SDK docs</p>
        <h1 className="docs__title">Weft SDK guide and API reference</h1>
        <p className="docs__lead">
          This page documents the current SDK surface that ships in the package today. It is guide-first,
          but every section maps back to the real exports from <code className="docs__code-inline">weft-sdk/three</code>.
          The main value is not just that you can place dense surfaces. It is that the same authored
          surface can handle placement, damage, thinning, recovery, and state change under one deterministic
          model.
        </p>
        <div className="docs__callout docs__callout--agent">
          <strong className="docs__callout-title">AI agent guide</strong>
          <p className="docs__callout-text">
            Need a high-signal file for Claude, Cursor, or other coding agents? Read{' '}
            <a href={weftGuideUrl} target="_blank" rel="noreferrer">
              <code className="docs__code-inline">weft.md</code>
            </a>
            . It is written as copy-pasteable integration context. You can paste it directly into a Cursor
            rule, Claude project knowledge/instructions, or another agent setup file so codegen tools have
            the right mental model, real exports, and integration guidance for Weft.
          </p>
          <p className="docs__callout-text">
            If you are using an AI coding assistant, this is the file to hand it before asking for examples,
            integration help, architecture suggestions, or new surface ideas.
          </p>
        </div>

        <div className="docs__actions">
          <button type="button" className="btn btn--primary" onClick={onEnterEditor}>
            Open playground
          </button>
          <a className="btn btn--secondary" href="#quick-start">
            Jump to quick start
          </a>
        </div>

        <nav className="docs__toc" aria-label="Docs sections">
          <a className="docs__toc-link" href="#quick-start">Quick start</a>
          <a className="docs__toc-link" href="#where-it-fits">Where it fits</a>
          <a className="docs__toc-link" href="#concepts">Concepts</a>
          <a className="docs__toc-link" href="#customization">Customization</a>
          <a className="docs__toc-link" href="#presets">Preset guides</a>
          <a className="docs__toc-link" href="#api-reference">API reference</a>
          <a className="docs__toc-link" href="#examples">Examples</a>
        </nav>

        <section id="quick-start" className="docs__section">
          <h2 className="docs__section-title">Quick start</h2>
          <p className="docs__text">
            Install <code className="docs__code-inline">weft-sdk</code> with <code className="docs__code-inline">three</code>,
            then start by creating a measured source and feeding it into a preset factory. The preset gives
            you a Three.js group that you mount into your own scene like any other scene object.
          </p>
          <div className="docs__code-block">
            <p className="docs__code-label">Install</p>
            <pre className="docs__pre">{`npm install weft-sdk three`}</pre>
          </div>
          <div className="docs__code-block">
            <p className="docs__code-label">First effect</p>
            <pre className="docs__pre">{`import {
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

scene.add(grass.group)`}</pre>
          </div>
        </section>

        <section id="where-it-fits" className="docs__section">
          <h2 className="docs__section-title">Where Weft fits in your app</h2>
          <p className="docs__text">
            A common beginner question is "where does this actually go?" The short answer is: Weft plugs
            into your existing scene and runtime. It does not replace your camera, renderer, world update
            loop, ECS, player controller, or gameplay architecture.
          </p>
          <div className="docs__concept-grid">
            <article className="docs__concept-card">
              <h3 className="docs__card-title">1. Create the effect</h3>
              <p className="docs__card-text">
                Build a source with <code className="docs__code-inline">createSurfaceSource()</code>, then
                create a preset effect such as <code className="docs__code-inline">createGrassEffect()</code>.
              </p>
            </article>
            <article className="docs__concept-card">
              <h3 className="docs__card-title">2. Mount it into your scene</h3>
              <p className="docs__card-text">
                Each preset exposes a group. Add that group to your Three.js scene the same way you would
                add any mesh, light, or instanced object.
              </p>
            </article>
            <article className="docs__concept-card">
              <h3 className="docs__card-title">3. Drive it from gameplay</h3>
              <p className="docs__card-text">
                Your app still owns player input, collisions, world state, and timing. Weft is the surface
                layer that responds to those signals through params, damage, recovery, and semantic state.
              </p>
            </article>
          </div>
          <div className="docs__callout">
            <strong className="docs__callout-title">What Weft handles vs. what you handle</strong>
            <p className="docs__callout-text">
              Weft handles source preparation, deterministic layout, thinning, recovery helpers, and
              world-space projection for reactive surfaces.
            </p>
            <p className="docs__callout-text">
              Your app handles scene setup, camera control, render loop ownership, collision/gameplay rules,
              save state, networking, and any broader engine architecture around those surfaces.
            </p>
          </div>
        </section>

        <section id="concepts" className="docs__section">
          <h2 className="docs__section-title">Concepts</h2>
          <div className="docs__concept-grid">
            <article className="docs__concept-card">
              <h3 className="docs__card-title">1. Source</h3>
              <p className="docs__card-text">
                A source is a measured glyph stream. Use <code className="docs__code-inline">createSurfaceSource()</code>{' '}
                with either simple units or an explicit semantic palette when you need stable ids and metadata.
              </p>
            </article>
            <article className="docs__concept-card">
              <h3 className="docs__card-title">2. Layout</h3>
              <p className="docs__card-text">
                A layout describes rows, sectors, and width. Use <code className="docs__code-inline">fieldLayout()</code>,{' '}
                <code className="docs__code-inline">wallLayout()</code>, or <code className="docs__code-inline">skyLayout()</code>{' '}
                depending on the surface topology you want.
              </p>
            </article>
            <article className="docs__concept-card">
              <h3 className="docs__card-title">3. Effect</h3>
              <p className="docs__card-text">
                An effect projects laid-out glyphs into world-space instances. Preset factories such as{' '}
                <code className="docs__code-inline">createGrassEffect()</code> and{' '}
                <code className="docs__code-inline">createFireWallEffect()</code> package that projection for you.
              </p>
            </article>
          </div>

          <div className="docs__callout">
            <strong className="docs__callout-title">Mental model</strong>
            <p className="docs__callout-text">
              Weft turns surface density into a layout problem. Narrow width and fewer glyphs fit. Change
              semantic weights and the same surface shifts state without a separate scatter pipeline.
            </p>
            <p className="docs__callout-text">
              The main primitives behind that model are <code className="docs__code-inline">createSurfaceSource()</code>,{' '}
              <code className="docs__code-inline">recoverableDamage()</code>, and the layout helpers in{' '}
              <code className="docs__code-inline">weft-sdk/three</code>.
            </p>
            <p className="docs__callout-text">
              If you are evaluating fit, a good rule of thumb is this: Weft is strongest when world scatter can be treated as a deterministic reactive surface: ground cover, facade layers, rubble bands, crops, shell-like clutter, and other distributions that benefit from shared placement, thinning, recovery, and state change.
            </p>
          </div>
        </section>

        <section id="customization" className="docs__section">
          <h2 className="docs__section-title">Customization paths</h2>
          <p className="docs__text">
            Presets are the fastest way in, but they are not the end of the SDK. There are two common ways
            to go further.
          </p>
          <div className="docs__concept-grid">
            <article className="docs__concept-card">
              <h3 className="docs__card-title">1. Push a preset further</h3>
              <p className="docs__card-text">
                Keep the preset projection and behavior model, but swap in your own source, semantic palette,
                placement mask, subtype appearance, and param overrides. This is the right path when your surface is
                still "band-like", "grass-like", "shell-like", "rock-like", or "fire-like" but needs a
                different authored look or response.
              </p>
            </article>
            <article className="docs__concept-card">
              <h3 className="docs__card-title">2. Build your own effect</h3>
              <p className="docs__card-text">
                Use <code className="docs__code-inline">createSurfaceSource()</code>, a layout helper, and{' '}
                <code className="docs__code-inline">createSurfaceEffect()</code> when you want a new projection,
                material setup, or shader system on top of the same source -&gt; layout -&gt; effect model.
              </p>
            </article>
          </div>
          <div className="docs__callout">
            <strong className="docs__callout-title">Simple rule of thumb</strong>
            <p className="docs__callout-text">
              If the shipped preset already matches the surface topology, customize the preset first. If the
              topology or projection is new, keep Weft for source/layout/behavior and write a new renderer or
              runtime wrapper around those helpers.
            </p>
          </div>
        </section>

        <section id="presets" className="docs__section">
          <h2 className="docs__section-title">Preset guides</h2>
          <div className="docs__preset-grid">
            {PRESET_GUIDES.map((preset) => (
              <article key={preset.name} className="docs__preset-card">
                <h3 className="docs__card-title">{preset.name}</h3>
                <p className="docs__card-text">{preset.useCase}</p>
                <p className="docs__meta"><strong>Factory:</strong> <code className="docs__code-inline">{preset.factory}</code></p>
                <p className="docs__meta">
                  <strong>Default source:</strong>{' '}
                  {preset.builders.map((builder, index) => (
                    <span key={builder}>
                      {index > 0 ? ' / ' : ''}
                      <code className="docs__code-inline">{builder}</code>
                    </span>
                  ))}
                </p>
                <p className="docs__meta">
                  <strong>Main params:</strong>{' '}
                  {preset.params.map((param, index) => (
                    <span key={param}>
                      {index > 0 ? ', ' : ''}
                      <code className="docs__code-inline">{param}</code>
                    </span>
                  ))}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section id="api-reference" className="docs__section">
          <h2 className="docs__section-title">API reference</h2>
          <p className="docs__text">
            These groups mirror the public surface currently exported from{' '}
            <code className="docs__code-inline">weft-sdk/three</code>.
          </p>
          <div className="docs__api-grid">
            {API_GROUPS.map((group) => (
              <article key={group.title} className="docs__api-card">
                <h3 className="docs__card-title">{group.title}</h3>
                <p className="docs__card-text">{group.description}</p>
                <ul className="docs__api-list">
                  {group.items.map((item) => (
                    <li key={item}><code className="docs__code-inline">{item}</code></li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section id="examples" className="docs__section">
          <h2 className="docs__section-title">Copy-paste examples</h2>
          <div className="docs__examples">
            {EXAMPLES.map((example) => (
              <div key={example.title} className="docs__code-block">
                <p className="docs__code-label">{example.title}</p>
                <pre className="docs__pre">{example.code}</pre>
              </div>
            ))}
          </div>
          <div className="docs__actions docs__actions--final-cta">
            <p className="docs__text docs__text--final-cta">
              Thanks for reading along. Open the playground to see the same ideas running under one surface
              runtime.
            </p>
            <button type="button" className="btn btn--primary docs__final-cta-btn" onClick={onEnterEditor}>
              Open playground and explore the SDK
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

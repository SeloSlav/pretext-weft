type DocsProps = {
  onEnterEditor: () => void
}

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
      'createGrassEffect()',
      'createFishScaleEffect()',
      'createRockFieldEffect()',
      'createFireWallEffect()',
      'createStarSkyEffect()',
    ],
  },
  {
    title: 'Default params',
    description: 'Preset parameter defaults you can spread and override.',
    items: [
      'DEFAULT_GRASS_FIELD_PARAMS',
      'DEFAULT_FISH_SCALE_PARAMS',
      'DEFAULT_ROCK_FIELD_PARAMS',
      'DEFAULT_FIRE_WALL_PARAMS',
      'DEFAULT_STAR_SKY_PARAMS',
    ],
  },
  {
    title: 'Prepared surface builders',
    description: 'Preset-owned source builders for ready-made surface vocabularies.',
    items: [
      'buildGrassStateSurface()',
      'getPreparedGrassSurface()',
      'getPreparedFishSurface()',
      'getPreparedRockSurface()',
      'getPreparedFireSurface()',
      'getPreparedStarSurface()',
    ],
  },
] as const

const PRESET_GUIDES = [
  {
    name: 'Grass field',
    factory: 'createGrassEffect()',
    builders: ['buildGrassStateSurface()', 'getPreparedGrassSurface()'],
    useCase: 'Reactive ground cover that can be disturbed, healed, and swapped between healthy, dry, corrupted, and dead states.',
    params: ['disturbanceRadius', 'disturbanceStrength', 'trampleDepth', 'wind', 'recoveryRate', 'state', 'layoutDensity'],
  },
  {
    name: 'Fish scale wall',
    factory: 'createFishScaleEffect()',
    builders: ['getPreparedFishSurface()'],
    useCase: 'A curved wall surface with persistent wounds, deformation, and scale-level thinning.',
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
    title: 'Grass quick start',
    code: `import {
  DEFAULT_GRASS_FIELD_PARAMS,
  createGrassEffect,
  createSurfaceSource,
} from './src/weft/three'
import { seedCursor } from './src/weft/core'

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
    title: 'Semantic palette source',
    code: `import { createSurfaceSource } from './src/weft/three'

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
} from './src/weft/three'
import { seedCursor } from './src/weft/core'

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
] as const

export function Docs({ onEnterEditor }: DocsProps) {
  return (
    <div className="docs">
      <div className="docs__inner">
        <p className="docs__eyebrow">SDK docs</p>
        <h1 className="docs__title">Weft SDK guide and API reference</h1>
        <p className="docs__lead">
          This page documents the current SDK surface that ships in this repo today. It is guide-first,
          but every section maps back to the real exports from <code className="docs__code-inline">src/weft/three</code>.
        </p>

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
          <a className="docs__toc-link" href="#concepts">Concepts</a>
          <a className="docs__toc-link" href="#presets">Preset guides</a>
          <a className="docs__toc-link" href="#api-reference">API reference</a>
          <a className="docs__toc-link" href="#examples">Examples</a>
        </nav>

        <section id="quick-start" className="docs__section">
          <h2 className="docs__section-title">Quick start</h2>
          <p className="docs__text">
            The current SDK entrypoint inside this repo is <code className="docs__code-inline">src/weft/three</code>.
            Start by creating a measured source, then feed it into a preset factory.
          </p>
          <div className="docs__code-block">
            <p className="docs__code-label">First effect</p>
            <pre className="docs__pre">{`import {
  DEFAULT_GRASS_FIELD_PARAMS,
  createGrassEffect,
  createSurfaceSource,
} from './src/weft/three'
import { seedCursor } from './src/weft/core'

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
              <code className="docs__code-inline">src/weft/three/api.ts</code>.
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
            <code className="docs__code-inline">src/weft/three/index.ts</code>.
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
        </section>
      </div>
    </div>
  )
}

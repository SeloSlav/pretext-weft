import { useState } from 'react'

type LandingProps = {
  onEnterEditor: () => void
}

const SURFACE_STATES = [
  {
    id: 'healthy',
    label: 'Healthy',
    imageSrc: '/landing-state-healthy.png',
    alt: 'Dense bright green field state in the playground.',
    description: 'Dense cover, full color, and the same placement rules pushing the surface toward a healthy state.',
  },
  {
    id: 'dry',
    label: 'Dry',
    imageSrc: '/landing-state-dry.png',
    alt: 'Yellow dry field state in the playground.',
    description: 'The field keeps the same projection and layout logic while the palette and source weights shift toward a dry look.',
  },
  {
    id: 'corrupted',
    label: 'Corrupted',
    imageSrc: '/landing-state-corrupted.png',
    alt: 'Purple corrupted field state in the playground.',
    description: 'Corruption is just another semantic state: same terrain, same driver, visibly different output.',
  },
  {
    id: 'dead',
    label: 'Dead',
    imageSrc: '/landing-state-dead.png',
    alt: 'Sparse dead field state in the playground.',
    description: 'When width and source weights collapse, the surface thins out instead of needing a separate destruction pipeline.',
  },
] as const

export function Landing({ onEnterEditor }: LandingProps) {
  const [selectedStateId, setSelectedStateId] = useState<(typeof SURFACE_STATES)[number]['id']>('healthy')
  const selectedState =
    SURFACE_STATES.find((state) => state.id === selectedStateId) ?? SURFACE_STATES[0]

  return (
    <div className="landing">
      <div className="landing__inner">
        <p className="landing__eyebrow">A Reactive surface layout engine for three.js / WebGPU</p>
        <h1 className="landing__title">
          Build reactive surfaces{' '}
          <span className="landing__title-accent">without custom scatter logic</span>
        </h1>
        <p className="landing__lead">
          Most surface systems make you solve placement twice: once to scatter instances, then again to
          make them react to damage, growth, weather, or state changes. Weft turns that into one layout
          problem, so the same surface can thin out, open up, heal, or change state without a second
          bespoke runtime.
        </p>
        <p className="landing__lead">
          Weft runs a{' '}
          <strong style={{ color: '#c8d6e8' }}>typographic line-breaking algorithm</strong> across a grid
          of world slots. Start with a simple glyph array, or drop down to an explicit semantic palette
          when you need stable ids, weights, or metadata. It measures the resolved glyph stream and
          breaks lines to fit each slot's width. Density emerges from font metrics, not hand-tuned scatter
          constants.
        </p>

        <section className="landing__hero-media" aria-label="Hero gameplay demo">
          <div className="landing__hero-video-shell">
            <video
              className="landing__hero-video"
              src="/landing-hero-fire-wall.mp4"
              muted
              loop
              playsInline
              autoPlay
              controls
              preload="metadata"
            />
          </div>
          <p className="landing__hero-caption">
            The town-edge playground shoots through neon and facade surfaces; openings recover using the same
            reactive layout logic.
          </p>
        </section>

        <div className="landing__actions">
          <button type="button" className="btn btn--primary" onClick={onEnterEditor}>
            Open engine playground
          </button>
        </div>

        <p className="landing__lead">
          Shipped presets already cover grass, walls, doodad placement, and
          skyboxes through the same <code className="landing__code-inline">src/weft/three</code> entrypoint.
        </p>

        <div className="landing__compare">
          <div className="landing__compare-col">
            <p className="landing__compare-label landing__compare-label--bad">Traditional scatter</p>
            <ul className="landing__compare-list">
              <li>Random or blue-noise point distribution</li>
              <li>Density is a hand-tuned constant</li>
              <li>Responding to gameplay needs a separate system (damage texture, compute pass, CPU rebuild)</li>
              <li>Every effect reinvents its own packing logic</li>
              <li>Variation comes from RNG seeded per-instance</li>
            </ul>
          </div>
          <div className="landing__compare-col">
            <p className="landing__compare-label landing__compare-label--good">Weft</p>
            <ul className="landing__compare-list">
              <li>Line-breaking over a rows × sectors world grid</li>
              <li>Density emerges from font metrics and slot width</li>
              <li>Gameplay narrows a slot width and the layout engine handles the rest</li>
              <li>One control can swap a field between healthy, dry, corrupted, and dead states with the same projection code</li>
              <li>Every surface type shares the same driver and API</li>
              <li>Variation is token-seeded and deterministic per row band</li>
            </ul>
          </div>
        </div>

        <h2 className="landing__section-title">How quickly can you add a new surface</h2>
        <p className="landing__lead">
          A new surface type needs two things. A glyph vocabulary and a projection. That's it.
        </p>

        <div className="landing__code-block">
          <p className="landing__code-label">Step 1. Define your surface source (~10 lines)</p>
          <pre className="landing__pre">{`const shellUnits = ['◓', '◒', '◐', '◑', '◉', '◍', '◎'] as const

const surface = createSurfaceSource({
  cacheKey: 'my-surface',
  units: shellUnits,
  repeat: 22,
  font: WEFT_TEXT_FONT,
})`}</pre>
        </div>

        <section className="landing__demo-media" aria-label="Density tuning demo">
          <div className="landing__demo-video-shell">
            <video
              className="landing__demo-video"
              src="/landing-density-tuning.mp4"
              muted
              loop
              playsInline
              autoPlay
              controls
              preload="metadata"
            />
          </div>
          <p className="landing__demo-caption">
            The same controls can tune grass, rock, and sky densities live without switching to a different
            placement workflow for each surface.
          </p>
        </section>

        <p className="landing__lead">
          Need more control? The same API also accepts explicit entries like
          <code className="landing__code-inline">{` { id, glyph, weight, meta } `}</code>
          and normalizes both forms into the same semantic pipeline.
        </p>

        <div className="landing__code-block">
          <p className="landing__code-label">Step 2. Create an effect and mount it (~20 lines)</p>
          <pre className="landing__pre">{`const grass = createGrassEffect({
  seedCursor,
  surface,
  initialParams: {
    ...DEFAULT_GRASS_FIELD_PARAMS,
    layoutDensity: 8,
  },
})

scene.add(grass.group)`}</pre>
        </div>

        <p className="landing__lead">
          Weft gives you an SDK path built around sources, behaviors, and presets instead of hand-wiring
          every sample from scratch. The current repo already ships public preset factories for grass,
          grass, wall facades, rubble, neon, and sky while still exposing the layout core directly when you want lower-level
          control.
        </p>

        <h2 className="landing__section-title">The real payoff is gameplay-driven density</h2>
        <p className="landing__lead">
          The <code className="landing__code-inline">getMaxWidth</code> callback receives the current slot
          on every frame. Return a smaller number and fewer glyphs fit, so the surface visibly thins out.
          Return zero and the slot is empty. Some surfaces use that directly, while others keep layout
          stable while swapping semantic source weights to move the exact same terrain between visibly
          different world states, with no separate damage texture or compute pass.
        </p>

        <section className="landing__demo-media" aria-label="Gameplay response demo">
          <div className="landing__demo-video-shell">
            <video
              className="landing__demo-video"
              src="/landing-grass-shooting.mp4"
              muted
              loop
              playsInline
              autoPlay
              controls
              preload="metadata"
            />
          </div>
          <p className="landing__demo-caption">
            Shoot the grass and the same layout system thins the surface in place. No separate damage
            texture, scatter rebuild, or custom effect pipeline.
          </p>
        </section>

        <div className="landing__code-block">
          <pre className="landing__pre">{`getMaxWidth: (slot) => {
  const damage = this.getDamageAt(slot.spanCenter, slot.lineCoord)
  return slot.spanSize * LAYOUT_PX_PER_WORLD * (1 - damage)
},`}</pre>
        </div>

        <p className="landing__lead">
          In a traditional scatter pipeline, making density respond to gameplay is a non-trivial
          engineering task. Here the same surface can also become healthy, dry, corrupted, or dead just
          by changing the semantic source and re-running layout through the same projection callback.
        </p>

        <section className="landing__state-showcase" aria-label="Surface state transitions">
          <p className="landing__state-kicker">Same surface, different world states</p>
          <figure className="landing__state-hero">
            <img className="landing__state-hero-image" src={selectedState.imageSrc} alt={selectedState.alt} />
            <figcaption className="landing__state-hero-copy">
              <strong className="landing__state-title">{selectedState.label}</strong>
              <span className="landing__state-description">{selectedState.description}</span>
            </figcaption>
          </figure>
          <div className="landing__state-grid" role="list" aria-label="Surface state previews">
            {SURFACE_STATES.map((state) => {
              const isSelected = state.id === selectedState.id

              return (
                <button
                  key={state.id}
                  type="button"
                  className={`landing__state-card${isSelected ? ' landing__state-card--active' : ''}`}
                  onClick={() => setSelectedStateId(state.id)}
                  aria-pressed={isSelected}
                >
                  <img className="landing__state-card-image" src={state.imageSrc} alt="" />
                  <span className="landing__state-card-copy">
                    <strong className="landing__state-card-label">{state.label}</strong>
                    <span className="landing__state-card-description">{state.description}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <ul className="landing__features" aria-label="Engine properties">
          <li>
            <strong>One driver, every surface type</strong>
            <span>
              Grass, wall scales, rock fields, glow surfaces, sky, coral, ornament. All share{' '}
              <code>SurfaceLayoutDriver</code> and <code>forEachLaidOutLine</code>. You only write the
              glyph source and the per-token matrix placement.
            </span>
          </li>
          <li>
            <strong>Deterministic, not random</strong>
            <span>
              Each row gets a band seed derived from its index via <code>advanceForRow</code>. The same
              world state always produces the same layout. No RNG drift between frames.
            </span>
          </li>
          <li>
            <strong>WebGPU runtime for live surface updates</strong>
            <span>
              The renderer is built on plain TypeScript and Three.js WebGPU, so large instanced surfaces
              can be re-laid out, thinned, and recolored in response to gameplay without turning each
              effect into its own special-case pipeline.
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}
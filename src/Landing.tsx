type LandingProps = {
  onEnterEditor: () => void
}

export function Landing({ onEnterEditor }: LandingProps) {
  return (
    <div className="landing">
      <div className="landing__inner">
        <p className="landing__eyebrow">Surface layout engine</p>
        <h1 className="landing__title">
          Typography as a{' '}
          <span className="landing__title-accent">3D placement engine</span>
        </h1>
        <p className="landing__lead">
          Traditional scatter fills a surface with random or noise-driven points, then places instances at
          those points. Density, spacing, and variation are all hand-tuned constants with no semantic
          meaning. Making them respond to gameplay requires a separate system entirely.
        </p>
        <p className="landing__lead">
          This engine runs a{' '}
          <strong style={{ color: '#c8d6e8' }}>typographic line-breaking algorithm</strong> across a grid
          of world slots. A semantic surface palette resolves to a backing glyph stream for layout.
          Pretext measures that stream and breaks lines to fit each slot's width. The resolved tokens
          that come out drive instanced mesh placement. Density emerges from font metrics, not magic
          numbers.
        </p>

        <div className="landing__actions">
          <button type="button" className="btn btn--primary" onClick={onEnterEditor}>
            Open engine playground
          </button>
        </div>

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
            <p className="landing__compare-label landing__compare-label--good">This engine</p>
            <ul className="landing__compare-list">
              <li>Line-breaking over a rows × sectors world grid</li>
              <li>Density emerges from font metrics and slot width</li>
              <li>Gameplay narrows a slot width and the layout engine handles the rest</li>
              <li>Every surface type shares the same driver and API</li>
              <li>Variation is token-seeded and deterministic per row band</li>
            </ul>
          </div>
        </div>

        <h2 className="landing__section-title">How quickly can you add a new surface</h2>
        <p className="landing__lead">
          A new surface type needs two things. A semantic palette and a projection. That's it.
        </p>

        <div className="landing__code-block">
          <p className="landing__code-label">Step 1. Define your semantic palette (~30 lines)</p>
          <pre className="landing__pre">{`const shellPalette = [
  { id: 'crest-left', glyph: '◓', weight: 3, meta: { widthBias: 0.02 } },
  { id: 'crest-right', glyph: '◒', weight: 2, meta: { widthBias: 0.01 } },
  { id: 'core-eye', glyph: '◉', meta: { widthBias: 0.05 } },
] as const

export function getPreparedMySurface() {
  return prepareSemanticSurfaceText(
    'my-surface',
    shellPalette,
    22,
    SURFACE_TEXT_FONT,
  )
}`}</pre>
        </div>

        <div className="landing__code-block">
          <p className="landing__code-label">Step 2. Drive layout and place instances (~80–120 lines)</p>
          <pre className="landing__pre">{`this.driver = new SurfaceLayoutDriver({
  prepared, rows: 20, sectors: 12,
  advanceForRow: (row) => row * 13 + 5,
  seedCursor,
})

this.driver.forEachLaidOutLine({
  spanMin: -5, spanMax: 5,
  lineCoordAtRow: (row) => startZ - row * rowStep,
  getMaxWidth: (slot) => slot.spanSize * LAYOUT_PX_PER_WORLD,
  onLine: ({ slot, glyphs }) => {
    // set InstancedMesh matrices from slot + glyphs
  },
})`}</pre>
        </div>

        <p className="landing__lead">
          That's the entire API. Forget spatial indexing, noise functions, and custom packing loops.
          Semantic token weighting, line-breaking, row seeding, stagger, and slot clipping are all
          handled by the driver.
        </p>

        <h2 className="landing__section-title">The real payoff is gameplay-driven density</h2>
        <p className="landing__lead">
          The <code className="landing__code-inline">getMaxWidth</code> callback receives the current slot
          on every frame. Return a smaller number and fewer glyphs fit, so the surface visibly thins out.
          Return zero and the slot is empty. This is how fish scales reorganize around wounds and grass
          collapses around disturbances, with no separate damage texture or compute pass.
        </p>

        <div className="landing__code-block">
          <pre className="landing__pre">{`getMaxWidth: (slot) => {
  const damage = this.getDamageAt(slot.spanCenter, slot.lineCoord)
  return slot.spanSize * LAYOUT_PX_PER_WORLD * (1 - damage)
},`}</pre>
        </div>

        <p className="landing__lead">
          In a traditional scatter pipeline, making density respond to gameplay is a non-trivial
          engineering task. Here it's just one multiplication inside one callback.
        </p>

        <ul className="landing__features" aria-label="Engine properties">
          <li>
            <strong>One driver, every surface type</strong>
            <span>
              Grass, fish scales, rock fields, coral, ornament. All share{' '}
              <code>SurfaceLayoutDriver</code> and <code>forEachLaidOutLine</code>. You only write the
              semantic palette and the per-token matrix placement.
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
            <strong>Plain TypeScript and Three.js WebGPU</strong>
            <span>
              No React Three Fiber in the render path. The core ideas are portable to tools, editors,
              and non-React game runtimes.
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}

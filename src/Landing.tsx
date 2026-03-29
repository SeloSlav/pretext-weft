type LandingProps = {
  onEnterEditor: () => void
}

export function Landing({ onEnterEditor }: LandingProps) {
  return (
    <div className="landing">
      <div className="landing__inner">
        <p className="landing__eyebrow">Surface layout engine · WebGPU playground</p>
        <h1 className="landing__title">
          Layout, not scatter, on <span className="landing__title-accent">geometry</span>
        </h1>
        <p className="landing__lead">
          Pretext Weft is a prototype for authored surface decoration in games. Instead of spraying meshes,
          decals, or textures across a model, it turns bands and paths on a surface into changing line
          widths, feeds those widths into Pretext, and places the chosen units back onto geometry with plain
          TypeScript and Three.js WebGPU.
        </p>
        <p className="landing__lead">
          The bet is that text-layout ideas can become a new runtime primitive for web games: inscriptions,
          ornament, scales, symbols, or modular skin that reflows deterministically when a creature deforms,
          armor opens, or gameplay creates damage and obstacles.
        </p>

        <div className="landing__actions">
          <button type="button" className="btn btn--primary" onClick={onEnterEditor}>
            Open engine playground
          </button>
        </div>

        <ul className="landing__features" aria-label="What you get">
          <li>
            <strong>Pretext as the layout core</strong>
            <span>
              Measure once, cache segment widths, then reuse deterministic line breaking against surface-derived
              widths instead of rebuilding ad hoc packing logic for every effect.
            </span>
          </li>
          <li>
            <strong>Surface-aware width fields</strong>
            <span>
              Geometry, wounds, vents, and obstacles become width constraints. The surface behaves like a page
              whose available line width changes across space.
            </span>
          </li>
          <li>
            <strong>Plain TypeScript runtime</strong>
            <span>
              The playground UI uses React, but the actual demo renderer no longer depends on React Three
              Fiber. The scene is plain Three.js, WebGPU, and imperative runtime code so the engine ideas can
              travel beyond React.
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}

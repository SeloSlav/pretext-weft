type LandingProps = {
  onEnterEditor: () => void
}

export function Landing({ onEnterEditor }: LandingProps) {
  return (
    <div className="landing">
      <div className="landing__inner">
        <p className="landing__eyebrow">Surface layout engine</p>
        <h1 className="landing__title">
          A new mental model for <span className="landing__title-accent">browser game surfaces</span>
        </h1>
        <p className="landing__lead">
          Pretext Weft is an engine/editor prototype for browser games built with Three.js and WebGPU. The idea
          is to stop thinking about surface detail as scatter, decals, or noise and start thinking about it as
          deterministic layout that runs on geometry.
        </p>
        <p className="landing__lead">
          Pretext provides the measurement and line-breaking core. This project turns geometry, wounds,
          footsteps, seams, and obstacles into changing width fields, then uses those widths to lay out units
          back onto the surface. The result is authored detail that can reflow when gameplay changes the world.
        </p>
        <p className="landing__lead">
          The demos are examples of that engine direction: fish scales that reorganize around damage, grass
          that collapses and repacks around a disturbance, and eventually other surface systems that share the
          same layout model. The runtime is plain TypeScript and Three.js WebGPU.
        </p>

        <div className="landing__actions">
          <button type="button" className="btn btn--primary" onClick={onEnterEditor}>
            Open engine playground
          </button>
        </div>

        <ul className="landing__features" aria-label="What you get">
          <li>
            <strong>Pretext as an engine primitive</strong>
            <span>
              Instead of inventing custom packing logic for every effect, the engine reuses Pretext for
              measurement and deterministic layout, then maps that output onto 3D surfaces.
            </span>
          </li>
          <li>
            <strong>Multiple demos, one layout model</strong>
            <span>
              The goal is not a single flashy scene. It is a reusable editor/runtime idea that can drive skin,
              vegetation, ornament, symbols, and other ordered surface systems in browser games.
            </span>
          </li>
          <li>
            <strong>Plain TypeScript runtime for Three.js</strong>
            <span>
              The runtime is imperative Three.js WebGPU with no React Three Fiber in the render path, which
              keeps the core ideas portable to tools, editors, and non-React game runtimes.
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}

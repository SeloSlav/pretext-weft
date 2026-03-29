import { useEffect, useMemo, useRef, useState } from 'react'
import { PlaygroundRuntime } from './playground/PlaygroundRuntime'
import { DEFAULT_RIBBON_PARAMS, DEFAULT_TORUS_PARAMS } from './playground/types'
import { SAMPLE_LIST, type SampleId } from './samples/sampleMeta'

export function Editor() {
  const [sampleId, setSampleId] = useState<SampleId>('torus-wound')
  const hostRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<PlaygroundRuntime | null>(null)
  const [runtimeState, setRuntimeState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [runtimeError, setRuntimeError] = useState<string | null>(null)

  const [woundHalfAngle, setWoundHalfAngle] = useState(DEFAULT_TORUS_PARAMS.woundHalfAngle)
  const [woundNarrow, setWoundNarrow] = useState(DEFAULT_TORUS_PARAMS.woundNarrow)
  const [deform, setDeform] = useState(DEFAULT_TORUS_PARAMS.deform)

  const [obstacleHalfWidth, setObstacleHalfWidth] = useState(DEFAULT_RIBBON_PARAMS.obstacleHalfWidth)
  const [ribbonNarrow, setRibbonNarrow] = useState(DEFAULT_RIBBON_PARAMS.obstacleNarrow)
  const [wave, setWave] = useState(DEFAULT_RIBBON_PARAMS.wave)

  const activeMeta = SAMPLE_LIST.find((s) => s.id === sampleId) ?? SAMPLE_LIST[0]!

  const woundDeg = useMemo(() => Math.round((woundHalfAngle * 180) / Math.PI), [woundHalfAngle])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const runtime = new PlaygroundRuntime(host)
    runtimeRef.current = runtime

    let cancelled = false

    runtime
      .initialize()
      .then(() => {
        if (cancelled) return
        setRuntimeState('ready')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setRuntimeState('error')
        setRuntimeError(error instanceof Error ? error.message : 'Failed to initialize WebGPU renderer.')
      })

    return () => {
      cancelled = true
      runtimeRef.current = null
      runtime.dispose()
    }
  }, [])

  useEffect(() => {
    runtimeRef.current?.setSample(sampleId)
  }, [sampleId])

  useEffect(() => {
    runtimeRef.current?.setTorusParams({ woundHalfAngle, woundNarrow, deform })
  }, [deform, woundHalfAngle, woundNarrow])

  useEffect(() => {
    runtimeRef.current?.setRibbonParams({ obstacleHalfWidth, obstacleNarrow: ribbonNarrow, wave })
  }, [obstacleHalfWidth, ribbonNarrow, wave])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <header className="sidebar-header">
          <h1>Engine playground</h1>
          <p className="tagline">Plain TypeScript + Three.js WebGPU runtime — orbit to inspect</p>
        </header>

        <nav className="sample-nav" aria-label="Samples">
          {SAMPLE_LIST.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`sample-nav__btn${sampleId === s.id ? ' sample-nav__btn--active' : ''}`}
              onClick={() => setSampleId(s.id)}
            >
              {s.title}
            </button>
          ))}
        </nav>

        <section className="sample-detail">
          <h2 className="sample-detail__title">{activeMeta.title}</h2>
          <p className="sample-detail__desc">{activeMeta.description}</p>

          {sampleId === 'torus-wound' && (
            <div className="sample-controls">
              <label className="control">
                <span>Wound half-angle ({woundDeg}°)</span>
                <input
                  type="range"
                  min={0.12}
                  max={1.2}
                  step={0.02}
                  value={woundHalfAngle}
                  onChange={(e) => setWoundHalfAngle(Number(e.target.value))}
                />
              </label>
              <label className="control">
                <span>Width inside wound ({Math.round(woundNarrow * 100)}%)</span>
                <input
                  type="range"
                  min={0.08}
                  max={1}
                  step={0.02}
                  value={woundNarrow}
                  onChange={(e) => setWoundNarrow(Number(e.target.value))}
                />
              </label>
              <label className="control">
                <span>Body deformation</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={deform}
                  onChange={(e) => setDeform(Number(e.target.value))}
                />
              </label>
            </div>
          )}

          {sampleId === 'plane-ribbon' && (
            <div className="sample-controls">
              <label className="control">
                <span>Obstacle half-width ({obstacleHalfWidth.toFixed(2)} world units)</span>
                <input
                  type="range"
                  min={0.2}
                  max={1.4}
                  step={0.05}
                  value={obstacleHalfWidth}
                  onChange={(e) => setObstacleHalfWidth(Number(e.target.value))}
                />
              </label>
              <label className="control">
                <span>Width inside obstacle ({Math.round(ribbonNarrow * 100)}%)</span>
                <input
                  type="range"
                  min={0.08}
                  max={1}
                  step={0.02}
                  value={ribbonNarrow}
                  onChange={(e) => setRibbonNarrow(Number(e.target.value))}
                />
              </label>
              <label className="control">
                <span>Surface wave</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={wave}
                  onChange={(e) => setWave(Number(e.target.value))}
                />
              </label>
            </div>
          )}
        </section>
      </aside>

      <main className="viewport">
        <div ref={hostRef} className="viewport-host" />
        {runtimeState !== 'ready' && (
          <div className="viewport-status" role="status">
            <strong>{runtimeState === 'loading' ? 'Starting WebGPU runtime...' : 'WebGPU unavailable'}</strong>
            <span>
              {runtimeState === 'loading'
                ? 'This playground now runs on plain TypeScript + Three.js instead of React Three Fiber.'
                : runtimeError ?? 'This playground requires a WebGPU-capable browser and adapter.'}
            </span>
          </div>
        )}
      </main>
    </div>
  )
}

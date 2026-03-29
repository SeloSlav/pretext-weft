import { Canvas } from '@react-three/fiber'
import { Environment, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { Suspense, useMemo, useState } from 'react'
import { TopologySkin } from './TopologySkin'
import { RibbonPlaneSkin } from './samples/RibbonPlaneSkin'
import { SAMPLE_LIST, type SampleId } from './samples/sampleMeta'

export default function App() {
  const [sampleId, setSampleId] = useState<SampleId>('torus-wound')

  const [woundHalfAngle, setWoundHalfAngle] = useState(0.55)
  const [woundNarrow, setWoundNarrow] = useState(0.22)
  const [deform, setDeform] = useState(1)

  const [obstacleHalfWidth, setObstacleHalfWidth] = useState(0.65)
  const [ribbonNarrow, setRibbonNarrow] = useState(0.2)
  const [wave, setWave] = useState(1)

  const activeMeta = SAMPLE_LIST.find((s) => s.id === sampleId) ?? SAMPLE_LIST[0]!

  const woundDeg = useMemo(() => Math.round((woundHalfAngle * 180) / Math.PI), [woundHalfAngle])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <header className="sidebar-header">
          <h1>Pretext Weft</h1>
          <p className="tagline">Typesetting on geometry — samples</p>
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
        <Canvas
          className="canvas"
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <PerspectiveCamera makeDefault position={[4.2, 2.4, 4.8]} fov={42} />
          <color attach="background" args={['#07090e']} />
          <ambientLight intensity={0.22} />
          <directionalLight position={[6, 8, 4]} intensity={1.35} />
          <directionalLight position={[-4, -2, -6]} intensity={0.35} color="#a8c4ff" />
          <Suspense fallback={null}>
            <Environment preset="city" />
          </Suspense>
          {sampleId === 'torus-wound' && (
            <TopologySkin woundHalfAngle={woundHalfAngle} woundNarrow={woundNarrow} deform={deform} />
          )}
          {sampleId === 'plane-ribbon' && (
            <RibbonPlaneSkin
              obstacleHalfWidth={obstacleHalfWidth}
              obstacleNarrow={ribbonNarrow}
              wave={wave}
            />
          )}
          <OrbitControls enableDamping dampingFactor={0.06} minDistance={1.8} maxDistance={16} />
        </Canvas>
      </main>
    </div>
  )
}

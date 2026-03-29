import { Canvas } from '@react-three/fiber'
import { Environment, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { Suspense, useMemo, useState } from 'react'
import { TopologySkin } from './TopologySkin'

export default function App() {
  const [woundHalfAngle, setWoundHalfAngle] = useState(0.55)
  const [woundNarrow, setWoundNarrow] = useState(0.22)
  const [deform, setDeform] = useState(1)

  const woundDeg = useMemo(() => Math.round((woundHalfAngle * 180) / Math.PI), [woundHalfAngle])

  return (
    <>
      <div className="hud">
        <h1>Pretext Weft</h1>
        <p>
          Contour bands on a deforming torus: each sector’s arc length becomes Pretext{' '}
          <code>layoutNextLine</code> width. A moving “wound” shrinks that width so the skin reflows
          like line layout around an obstacle — arithmetic only on the hot path after one{' '}
          <code>prepareWithSegments</code>.
        </p>
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
      <Canvas className="canvas" dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }}>
        <PerspectiveCamera makeDefault position={[4.2, 2.4, 4.8]} fov={42} />
        <color attach="background" args={['#07090e']} />
        <ambientLight intensity={0.22} />
        <directionalLight position={[6, 8, 4]} intensity={1.35} />
        <directionalLight position={[-4, -2, -6]} intensity={0.35} color="#a8c4ff" />
        <Suspense fallback={null}>
          <Environment preset="city" />
        </Suspense>
        <TopologySkin woundHalfAngle={woundHalfAngle} woundNarrow={woundNarrow} deform={deform} />
        <OrbitControls enableDamping dampingFactor={0.06} minDistance={2.2} maxDistance={14} />
      </Canvas>
    </>
  )
}

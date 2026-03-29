import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { layoutNextLine, type LayoutCursor } from '@chenglou/pretext'
import { getPreparedSkin, seedCursor } from '../skinText'
import { graphemesOf } from './graphemes'

const MAX_INSTANCES = 12_000
const NUM_BANDS = 16
const SECTORS = 52
const LAYOUT_PX_PER_WORLD = 36
const SURFACE_LIFT = 0.05
const X_MIN = -3.1
const X_MAX = 3.1

const tmpPos = new THREE.Vector3()
const tmpLook = new THREE.Vector3()
const dummy = new THREE.Object3D()

export type RibbonPlaneSkinProps = {
  /** World half-width of the low-width “gap” region (drifts along X). */
  obstacleHalfWidth: number
  /** Multiplier for layout width inside the obstacle (0–1). */
  obstacleNarrow: number
  /** Vertical wave amplitude on the ribbon surface. */
  wave: number
}

export function RibbonPlaneSkin({ obstacleHalfWidth, obstacleNarrow, wave }: RibbonPlaneSkinProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const prepared = useMemo(() => getPreparedSkin(), [])
  const bandCursors = useRef<LayoutCursor[]>([])

  useEffect(() => {
    bandCursors.current = Array.from({ length: NUM_BANDS }, (_, b) => seedCursor(prepared, b * 19 + 11))
  }, [prepared])

  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#c4a574',
        metalness: 0.75,
        roughness: 0.32,
        envMapIntensity: 1.05,
      }),
    [],
  )

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return

    if (bandCursors.current.length !== NUM_BANDS) {
      bandCursors.current = Array.from({ length: NUM_BANDS }, (_, b) => seedCursor(prepared, b * 19 + 11))
    }

    const t = state.clock.elapsedTime
    const obstacleCenter = Math.sin(t * 0.55) * 2.2

    let instanceIndex = 0
    const xSpan = X_MAX - X_MIN

    for (let b = 0; b < NUM_BANDS; b++) {
      const z = -1.45 + (b / (NUM_BANDS - 1)) * 2.9
      let cursor = bandCursors.current[b] ?? { segmentIndex: 0, graphemeIndex: 0 }

      for (let s = 0; s < SECTORS; s++) {
        const x0 = X_MIN + (s / SECTORS) * xSpan
        const x1 = X_MIN + ((s + 1) / SECTORS) * xSpan
        const xMid = (x0 + x1) * 0.5
        const arcWorld = x1 - x0
        let maxWidth = arcWorld * LAYOUT_PX_PER_WORLD
        if (Math.abs(xMid - obstacleCenter) < obstacleHalfWidth) {
          maxWidth *= obstacleNarrow
        }

        const minW = Math.max(8, maxWidth)
        let line = layoutNextLine(prepared, cursor, minW)
        if (line === null) {
          cursor = { segmentIndex: 0, graphemeIndex: 0 }
          line = layoutNextLine(prepared, cursor, minW)
        }
        if (line === null) {
          bandCursors.current[b] = cursor
          continue
        }
        cursor = line.end
        bandCursors.current[b] = cursor

        const glyphs = graphemesOf(line.text).filter((g) => !/^\s+$/.test(g))
        const n = glyphs.length
        if (n === 0) continue

        for (let k = 0; k < n; k++) {
          if (instanceIndex >= MAX_INSTANCES) break
          const t01 = (k + 0.5) / n
          const x = x0 + t01 * (x1 - x0)
          const yLift = wave * 0.12 * Math.sin(x * 1.4 + z * 2.1 + t * 0.8)

          tmpPos.set(x, SURFACE_LIFT + yLift, z)

          const g = glyphs[k]!
          const code = g.codePointAt(0) ?? 0
          const h = 0.04 + (code % 7) * 0.0035
          const w = 0.03 + ((code >> 3) % 5) * 0.003
          const d = 0.026 + ((code >> 5) % 4) * 0.0025

          dummy.position.copy(tmpPos)
          dummy.up.set(0, 1, 0)
          tmpLook.set(x + 1, tmpPos.y, z)
          dummy.lookAt(tmpLook)
          dummy.rotateZ(((code % 40) / 40 - 0.5) * 0.2)
          dummy.scale.set(w, h, d)
          dummy.updateMatrix()
          mesh.setMatrixAt(instanceIndex, dummy.matrix)
          instanceIndex++
        }
      }
    }

    mesh.count = instanceIndex
    mesh.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={meshRef} args={[geometry, material, MAX_INSTANCES]} frustumCulled={false} />
}

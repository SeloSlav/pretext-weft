import { layoutNextLine, type LayoutCursor, type PreparedTextWithSegments } from '@chenglou/pretext'
import * as THREE from 'three'
import { graphemesOf } from '../samples/graphemes'
import type { RibbonSampleParams } from './types'

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

export function createRibbonMesh(): THREE.InstancedMesh {
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const material = new THREE.MeshStandardMaterial({
    color: '#d8bf94',
    metalness: 0.2,
    roughness: 0.5,
    envMapIntensity: 0,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })

  const mesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES)
  mesh.frustumCulled = false
  return mesh
}

export function createRibbonBandSeeds(
  prepared: PreparedTextWithSegments,
  seedCursor: (preparedText: PreparedTextWithSegments, advance: number) => LayoutCursor,
): LayoutCursor[] {
  return Array.from({ length: NUM_BANDS }, (_, b) => seedCursor(prepared, b * 19 + 11))
}

export function updateRibbonMesh(
  mesh: THREE.InstancedMesh,
  prepared: PreparedTextWithSegments,
  bandSeeds: readonly LayoutCursor[],
  params: RibbonSampleParams,
  elapsedTime: number,
): void {
  const obstacleCenter = params.wave > 0 ? Math.sin(elapsedTime * 0.55) * 2.2 : 0
  const xSpan = X_MAX - X_MIN
  let instanceIndex = 0

  for (let b = 0; b < NUM_BANDS; b++) {
    const z = -1.45 + (b / (NUM_BANDS - 1)) * 2.9
    let cursor: LayoutCursor = bandSeeds[b] ? { ...bandSeeds[b] } : { segmentIndex: 0, graphemeIndex: 0 }

    for (let s = 0; s < SECTORS; s++) {
      const x0 = X_MIN + (s / SECTORS) * xSpan
      const x1 = X_MIN + ((s + 1) / SECTORS) * xSpan
      const xMid = (x0 + x1) * 0.5
      const arcWorld = x1 - x0
      let maxWidth = arcWorld * LAYOUT_PX_PER_WORLD
      if (Math.abs(xMid - obstacleCenter) < params.obstacleHalfWidth) {
        maxWidth *= params.obstacleNarrow
      }

      const minW = Math.max(8, maxWidth)
      let line = layoutNextLine(prepared, cursor, minW)
      if (line === null) {
        cursor = { segmentIndex: 0, graphemeIndex: 0 }
        line = layoutNextLine(prepared, cursor, minW)
      }
      if (line === null) continue

      cursor = line.end

      const glyphs = graphemesOf(line.text).filter((g) => !/^\s+$/.test(g))
      const n = glyphs.length
      if (n === 0) continue

      for (let k = 0; k < n; k++) {
        if (instanceIndex >= MAX_INSTANCES) break

        const t01 = (k + 0.5) / n
        const x = x0 + t01 * (x1 - x0)
        const yLift = params.wave * 0.12 * Math.sin(x * 1.4 + z * 2.1 + elapsedTime * 0.38)

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
}

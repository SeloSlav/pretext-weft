import { layoutNextLine, type LayoutCursor, type PreparedTextWithSegments } from '@chenglou/pretext'
import * as THREE from 'three'
import { graphemesOf } from '../samples/graphemes'
import type { TorusSampleParams } from './types'

const MAX_INSTANCES = 14_000
const NUM_BANDS = 14
const SECTORS = 56
const LAYOUT_PX_PER_WORLD = 38
const SURFACE_LIFT = 0.07

const tmpPos = new THREE.Vector3()
const tmpTanU = new THREE.Vector3()
const tmpNorm = new THREE.Vector3()
const tmpLook = new THREE.Vector3()
const dummy = new THREE.Object3D()

function angularDistance(a: number, b: number): number {
  let d = Math.abs(a - b) % (Math.PI * 2)
  if (d > Math.PI) d = Math.PI * 2 - d
  return d
}

function torusFrame(
  R: number,
  r: number,
  u: number,
  v: number,
  pos: THREE.Vector3,
  tangentAlongU: THREE.Vector3,
  normal: THREE.Vector3,
): void {
  const cv = Math.cos(v)
  const su = Math.sin(u)
  const cu = Math.cos(u)
  const sv = Math.sin(v)
  const big = R + r * cv
  const dux = -big * su
  const duy = big * cu
  const duz = 0
  const dvx = -r * sv * cu
  const dvy = -r * sv * su
  const dvz = r * cv
  pos.set(big * cu, big * su, r * sv)
  normal.set(duy * dvz - duz * dvy, duz * dvx - dux * dvz, dux * dvy - duy * dvx).normalize()
  tangentAlongU.set(dux, duy, duz).normalize()
}

export function createTorusMesh(): THREE.InstancedMesh {
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const material = new THREE.MeshStandardMaterial({
    color: '#a7b6c4',
    metalness: 0.22,
    roughness: 0.52,
    envMapIntensity: 0,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })

  const mesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES)
  mesh.frustumCulled = false
  return mesh
}

export function createTorusBandSeeds(
  prepared: PreparedTextWithSegments,
  seedCursor: (preparedText: PreparedTextWithSegments, advance: number) => LayoutCursor,
): LayoutCursor[] {
  return Array.from({ length: NUM_BANDS }, (_, b) => seedCursor(prepared, b * 23 + 3))
}

export function updateTorusMesh(
  mesh: THREE.InstancedMesh,
  prepared: PreparedTextWithSegments,
  bandSeeds: readonly LayoutCursor[],
  params: TorusSampleParams,
  elapsedTime: number,
): void {
  const baseR = 1.55
  const baser = 0.52
  const woundCenter = params.deform > 0 ? elapsedTime * 0.35 : 0
  const R = baseR + params.deform * 0.22 * Math.sin(elapsedTime * 0.7 + 0.3)
  const r = baser + params.deform * 0.12 * Math.sin(elapsedTime * 1.1 + 1.7)

  let instanceIndex = 0

  for (let b = 0; b < NUM_BANDS; b++) {
    const v = -Math.PI * 0.72 + (b / (NUM_BANDS - 1)) * Math.PI * 1.44
    let cursor: LayoutCursor = bandSeeds[b] ? { ...bandSeeds[b] } : { segmentIndex: 0, graphemeIndex: 0 }

    for (let s = 0; s < SECTORS; s++) {
      const u0 = (s / SECTORS) * Math.PI * 2
      const u1 = ((s + 1) / SECTORS) * Math.PI * 2
      const midU = (u0 + u1) * 0.5
      const arcWorld = (R + r * Math.cos(v)) * (u1 - u0)
      let maxWidth = arcWorld * LAYOUT_PX_PER_WORLD
      if (angularDistance(midU, woundCenter) < params.woundHalfAngle) {
        maxWidth *= params.woundNarrow
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
        const u = u0 + t01 * (u1 - u0)
        torusFrame(R, r, u, v, tmpPos, tmpTanU, tmpNorm)
        tmpPos.addScaledVector(tmpNorm, SURFACE_LIFT)

        const g = glyphs[k]!
        const code = g.codePointAt(0) ?? 0
        const h = 0.045 + (code % 7) * 0.004
        const w = 0.032 + ((code >> 3) % 5) * 0.0035
        const d = 0.028 + ((code >> 5) % 4) * 0.003

        dummy.position.copy(tmpPos)
        dummy.up.copy(tmpNorm)
        tmpLook.copy(tmpPos).add(tmpTanU)
        dummy.lookAt(tmpLook)
        dummy.rotateX(((code % 50) / 50 - 0.5) * 0.25)
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

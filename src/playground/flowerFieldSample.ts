import * as THREE from 'three'
import type { PreparedSurfaceSource, ResolvedSurfaceGlyph } from '../skinText'
import type { FlowerTokenId, FlowerTokenMeta } from './flowerSurfaceText'
import { PLAYGROUND_BOUNDS } from './playgroundWorld'
import { SurfaceLayoutDriver, type SurfaceLayoutSlot } from './surfaceLayoutCore'
import type { SeedCursorFactory } from './types'

// Flowers are sparse accents — far fewer than grass blades.
const ROWS = 14
const SECTORS = 18
const MAX_FLOWERS = 1_200
const FIELD_WIDTH = PLAYGROUND_BOUNDS.maxX - PLAYGROUND_BOUNDS.minX
const FIELD_DEPTH = PLAYGROUND_BOUNDS.maxZ - PLAYGROUND_BOUNDS.minZ
// Narrow layout width → very few glyphs per slot → natural sparse scatter.
const BASE_LAYOUT_PX_PER_WORLD = 4.8

const tmpColor = new THREE.Color()
const dummyStalk = new THREE.Object3D()
const dummyHead = new THREE.Object3D()

// ─── shared hash utilities ────────────────────────────────────────────────────

function uhash(n: number): number {
  n = (n ^ 61) ^ (n >>> 16)
  n = Math.imul(n, 0x45d9f3b)
  n ^= n >>> 4
  n = Math.imul(n, 0xd3833e2d)
  n ^= n >>> 15
  return (n >>> 0) / 4294967296
}

function glyphHash(a: number, b: number, c = 0): number {
  return uhash(a ^ Math.imul(b, 0x9e3779b9) ^ Math.imul(c, 0x85ebca6b))
}

function lineSignature(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967296
}

// Two-octave value noise — same approach as grass/rocks, no sine periodicity.
function organicField(x: number, z: number): number {
  const cx = Math.floor(x * 0.25)
  const cz = Math.floor(z * 0.25)
  const fx = x * 0.25 - cx
  const fz = z * 0.25 - cz
  const ux = fx * fx * (3 - 2 * fx)
  const uz = fz * fz * (3 - 2 * fz)
  const v00 = uhash(cx * 1619 + cz * 31337)
  const v10 = uhash((cx + 1) * 1619 + cz * 31337)
  const v01 = uhash(cx * 1619 + (cz + 1) * 31337)
  const v11 = uhash((cx + 1) * 1619 + (cz + 1) * 31337)
  return THREE.MathUtils.clamp(
    v00 + ux * (v10 - v00) + uz * (v01 - v00) + ux * uz * (v00 - v10 - v01 + v11),
    0, 1,
  )
}

// ─── per-token flower identity ────────────────────────────────────────────────

function flowerHeadColor(identity: number, noise: number, meta: FlowerTokenMeta): THREE.Color {
  const light = 0.4 + noise * 0.15 + uhash(identity + 13) * 0.05
  return tmpColor.setHSL(meta.hue, 0.85, light).clone()
}

function flowerStalkColor(identity: number, meta: FlowerTokenMeta): THREE.Color {
  const t = uhash(identity * 1234567)
  return tmpColor.setHSL(meta.stalkHue + t * 0.03, 0.8 + t * 0.2, 0.22 + t * 0.1).clone()
}

// Height and head size vary by token — dense blooms are taller, airy blooms shorter.
function flowerHeight(identity: number, meta: FlowerTokenMeta): number {
  return 0.55 + uhash(identity * 987654) * 0.7 + meta.heightBias
}

function flowerHeadRadius(identity: number, meta: FlowerTokenMeta): number {
  return 0.08 + uhash(identity * 3456789) * 0.12 + meta.bloomBias
}

// ─── geometries ──────────────────────────────────────────────────────────────

function makeStalkGeometry(): THREE.BufferGeometry {
  // Thin cylinder, unit height — scaled per-instance.
  return new THREE.CylinderGeometry(0.018, 0.028, 1.0, 5, 1)
}

function makeHeadGeometry(): THREE.BufferGeometry {
  // Flat disc, double-sided — represents the petal cluster face-on.
  // Low segment count keeps it readable as a primitive.
  return new THREE.CircleGeometry(1.0, 7)
}

// ─── sample class ─────────────────────────────────────────────────────────────

export class FlowerFieldSample {
  readonly group = new THREE.Group()

  private readonly stalkGeometry = makeStalkGeometry()
  private readonly headGeometry = makeHeadGeometry()

  private readonly stalkMaterial = new THREE.MeshStandardMaterial({
    roughness: 0.8,
    metalness: 0,
    side: THREE.DoubleSide,
  })
  private readonly headMaterial = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide,
    roughness: 0.6,
    metalness: 0.1,
  })

  private readonly stalkMesh = new THREE.InstancedMesh(
    this.stalkGeometry,
    this.stalkMaterial,
    MAX_FLOWERS,
  )
  private readonly headMesh = new THREE.InstancedMesh(
    this.headGeometry,
    this.headMaterial,
    MAX_FLOWERS,
  )

  private readonly layoutDriver: SurfaceLayoutDriver<FlowerTokenId, FlowerTokenMeta>
  private layoutDensity = 0

  constructor(surface: PreparedSurfaceSource<FlowerTokenId, FlowerTokenMeta>, seedCursor: SeedCursorFactory) {
    this.layoutDriver = new SurfaceLayoutDriver({
      surface,
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 11 + 2,
      seedCursor,
      staggerFactor: 0.55,
      minSpanFactor: 0.35,
    })

    this.stalkMesh.frustumCulled = false
    this.headMesh.frustumCulled = false
    this.stalkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.headMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

    this.group.add(this.stalkMesh)
    this.group.add(this.headMesh)
  }

  setLayoutDensity(density: number): void {
    this.layoutDensity = density
  }

  // Called every frame after grass has updated (so ground height is current).
  update(
    elapsedTime: number,
    getGroundHeight: (x: number, z: number) => number,
    getDisturbance: (x: number, z: number) => number,
  ): void {
    this.updateFlowers(elapsedTime, getGroundHeight, getDisturbance)
  }

  dispose(): void {
    this.stalkGeometry.dispose()
    this.headGeometry.dispose()
    this.stalkMaterial.dispose()
    this.headMaterial.dispose()
  }

  private updateFlowers(
    elapsedTime: number,
    getGroundHeight: (x: number, z: number) => number,
    getDisturbance: (x: number, z: number) => number,
  ): void {
    const rowStep = FIELD_DEPTH / (ROWS + 1.1)
    const backZ = FIELD_DEPTH * 0.48
    let idx = 0

    this.layoutDriver.forEachLaidOutLine({
      spanMin: -FIELD_WIDTH * 0.5,
      spanMax: FIELD_WIDTH * 0.5,
      lineCoordAtRow: (row) => backZ - row * rowStep,
      getMaxWidth: (slot) => slot.spanSize * BASE_LAYOUT_PX_PER_WORLD * this.layoutDensity,
      onLine: ({ slot, resolvedGlyphs, tokenLineKey }) => {
        idx = this.projectLine(slot, resolvedGlyphs, tokenLineKey, rowStep, elapsedTime, getGroundHeight, getDisturbance, idx)
      },
    })

    this.stalkMesh.count = idx
    this.headMesh.count = idx
    this.stalkMesh.instanceMatrix.needsUpdate = true
    this.headMesh.instanceMatrix.needsUpdate = true
    if (this.stalkMesh.instanceColor) this.stalkMesh.instanceColor.needsUpdate = true
    if (this.headMesh.instanceColor) this.headMesh.instanceColor.needsUpdate = true
  }

  private projectLine(
    slot: SurfaceLayoutSlot,
    resolvedGlyphs: readonly ResolvedSurfaceGlyph<FlowerTokenId, FlowerTokenMeta>[],
    tokenLineKey: string,
    rowStep: number,
    elapsedTime: number,
    getGroundHeight: (x: number, z: number) => number,
    getDisturbance: (x: number, z: number) => number,
    idx: number,
  ): number {
    const n = resolvedGlyphs.length
    const lineSeed = lineSignature(tokenLineKey)
    const lineLateralShift = (lineSeed - 0.5) * slot.sectorStep * 0.24
    const lineDepthShift = (lineSeed - 0.5) * rowStep * 0.16

    for (let k = 0; k < n; k++) {
      if (idx >= MAX_FLOWERS) break

      const token = resolvedGlyphs[k]!
      const identity = token.ordinal + 1
      const { meta } = token

      // Independent hash channels — no correlated banding between axes.
      const hashLat = glyphHash(identity, slot.row, k)
      const hashDep = glyphHash(identity + 1, slot.sector, k ^ 0xcd)
      const hashOrg = glyphHash(identity + 2, slot.row ^ slot.sector, k + 23)

      const t01 = THREE.MathUtils.clamp((k + hashLat * 0.88 + 0.06) / (n + 0.1), 0.02, 0.98)
      const x =
        slot.spanStart +
        t01 * slot.spanSize +
        lineLateralShift +
        (hashLat - 0.5) * slot.sectorStep * 0.44
      const zJitter = (hashDep - 0.5) * rowStep * 0.55 + lineDepthShift
      const z = slot.lineCoord + zJitter

      const noise = organicField(x + hashOrg * 0.3, z + hashOrg * 0.25)
      const groundY = getGroundHeight(x, z)
      const disturbance = getDisturbance(x, z)

      const height = flowerHeight(identity, meta) * (1 - disturbance * 0.75)
      const headR = flowerHeadRadius(identity, meta)

      // Wind: slow sway, phase-offset per flower so they don't all move together.
      const phase = hashOrg * Math.PI * 2
      const gust =
        Math.sin(elapsedTime * 1.2 + x * 0.44 + z * 0.28 + phase) * 0.6 +
        Math.sin(elapsedTime * 2.1 + x * 0.9 - z * 0.5 + phase * 1.3) * 0.3
      const windBend = gust * 0.22 + disturbance * 1.1
      const windYaw = Math.atan2(x * 0.1 + noise, z * 0.1 + noise) + gust * 0.18

      // Stalk: unit-height cylinder scaled to flower height, bent by wind.
      dummyStalk.position.set(x, groundY + height * 0.5, z)
      dummyStalk.rotation.set(0, windYaw, 0)
      dummyStalk.rotateZ(windBend * 0.5)
      dummyStalk.scale.set(1, height, 1)
      dummyStalk.updateMatrix()
      this.stalkMesh.setMatrixAt(idx, dummyStalk.matrix)
      this.stalkMesh.setColorAt(idx, flowerStalkColor(identity, meta))

      // Head: flat disc at the top of the stalk, tilted to face slightly upward
      // and swayed by the same wind angle as the stalk tip.
      const tipX = x + Math.sin(windYaw) * Math.sin(windBend * 0.5) * height
      const tipZ = z + Math.cos(windYaw) * Math.sin(windBend * 0.5) * height
      const tipY = groundY + height * Math.cos(windBend * 0.5)

      dummyHead.position.set(tipX, tipY, tipZ)
      // Face the head mostly upward, tilted by wind and a per-flower organic tilt.
      dummyHead.rotation.set(
        Math.PI * 0.5 + windBend * 0.4 + (noise - 0.5) * 0.3,
        windYaw + hashOrg * Math.PI,
        0,
      )
      dummyHead.scale.setScalar(headR * (0.8 + noise * 0.4))
      dummyHead.updateMatrix()
      this.headMesh.setMatrixAt(idx, dummyHead.matrix)
      this.headMesh.setColorAt(idx, flowerHeadColor(identity, noise, meta))

      idx++
    }

    return idx
  }
}

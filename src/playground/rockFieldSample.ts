import type { PreparedTextWithSegments } from '@chenglou/pretext'
import * as THREE from 'three'
import { PLAYGROUND_BOUNDS } from './playgroundWorld'
import { SurfaceLayoutDriver, type SurfaceLayoutSlot } from './surfaceLayoutCore'
import type { RockFieldParams, SeedCursorFactory } from './types'

// Sparse grid — rocks are infrequent, so fewer rows/sectors than grass.
const ROWS = 18
const SECTORS = 22
const MAX_INSTANCES = 2_400
const FIELD_WIDTH = PLAYGROUND_BOUNDS.maxX - PLAYGROUND_BOUNDS.minX
const FIELD_DEPTH = PLAYGROUND_BOUNDS.maxZ - PLAYGROUND_BOUNDS.minZ
// Base layout width — multiplied by layoutDensity param at runtime.
const BASE_LAYOUT_PX_PER_WORLD = 6.5

const tmpColor = new THREE.Color()
const dummy = new THREE.Object3D()

// Same integer hash as grass — avalanches all bits, no periodicity.
function uhash(n: number): number {
  n = (n ^ 61) ^ (n >>> 16)
  n = Math.imul(n, 0x45d9f3b)
  n ^= n >>> 4
  n = Math.imul(n, 0xd3833e2d)
  n ^= n >>> 15
  return (n >>> 0) / 4294967296
}

function glyphHash(a: number, b: number, c = 0, d = 0): number {
  return uhash(a ^ Math.imul(b, 0x9e3779b9) ^ Math.imul(c, 0x85ebca6b) ^ Math.imul(d, 0xc2b2ae35))
}

function lineSignature(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967296
}

// Two-octave value noise using the same hash grid — no sine waves, no periodicity.
function organicField(x: number, z: number): number {
  const cx = Math.floor(x * 0.22)
  const cz = Math.floor(z * 0.22)
  const fx = (x * 0.22) - cx
  const fz = (z * 0.22) - cz
  const ux = fx * fx * (3 - 2 * fx)
  const uz = fz * fz * (3 - 2 * fz)
  const v00 = uhash(cx * 1619 + cz * 31337)
  const v10 = uhash((cx + 1) * 1619 + cz * 31337)
  const v01 = uhash(cx * 1619 + (cz + 1) * 31337)
  const v11 = uhash((cx + 1) * 1619 + (cz + 1) * 31337)
  const coarse = v00 + ux * (v10 - v00) + uz * (v01 - v00) + ux * uz * (v00 - v10 - v01 + v11)

  const cx2 = Math.floor(x * 0.7)
  const cz2 = Math.floor(z * 0.7)
  const fx2 = (x * 0.7) - cx2
  const fz2 = (z * 0.7) - cz2
  const ux2 = fx2 * fx2 * (3 - 2 * fx2)
  const uz2 = fz2 * fz2 * (3 - 2 * fz2)
  const w00 = uhash(cx2 * 7919 + cz2 * 104729)
  const w10 = uhash((cx2 + 1) * 7919 + cz2 * 104729)
  const w01 = uhash(cx2 * 7919 + (cz2 + 1) * 104729)
  const w11 = uhash((cx2 + 1) * 7919 + (cz2 + 1) * 104729)
  const fine = w00 + ux2 * (w10 - w00) + uz2 * (w01 - w00) + ux2 * uz2 * (w00 - w10 - w01 + w11)

  return THREE.MathUtils.clamp(coarse * 0.6 + fine * 0.4, 0, 1)
}

// Each glyph gets a stable size identity from its code point.
// Heavier/filled glyphs (⬛ ◼ ◆) map to larger rocks; lighter ones (▫ △) are pebbles.
function glyphSizeIdentity(code: number): number {
  return 0.55 + (((code * 2246822519) >>> 0) / 4294967296) * 0.9
}

// Per-glyph colour identity across grey, slate, and warm-brown stone tones.
function glyphStoneColor(code: number, noise: number): THREE.Color {
  const t = ((code * 2654435761) >>> 0) / 4294967296
  // Hue: 0 = warm brown, 0.55 = slate blue-grey, 0.08 = sandy
  const hue = t < 0.4 ? 0.06 + t * 0.05 : 0.55 + (t - 0.4) * 0.08
  const sat = 0.08 + t * 0.14 + noise * 0.06
  const light = 0.28 + noise * 0.22 + t * 0.08
  return tmpColor.setHSL(hue, sat, light).clone()
}

function makeRockGeometry(): THREE.BufferGeometry {
  // More faceted, irregular rock shape.
  return new THREE.DodecahedronGeometry(0.5, 0)
}

export class RockFieldSample {
  readonly group = new THREE.Group()

  private readonly rockGeometry = makeRockGeometry()
  private readonly rockMaterial = new THREE.MeshStandardMaterial({
    roughness: 0.95,
    metalness: 0.05,
  })
  private readonly rockMesh = new THREE.InstancedMesh(
    this.rockGeometry,
    this.rockMaterial,
    MAX_INSTANCES,
  )
  private readonly layoutDriver: SurfaceLayoutDriver
  private params: RockFieldParams

  constructor(
    prepared: PreparedTextWithSegments,
    seedCursor: SeedCursorFactory,
    initialParams: RockFieldParams,
  ) {
    this.params = { ...initialParams }
    this.layoutDriver = new SurfaceLayoutDriver({
      prepared,
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 7 + 3,
      seedCursor,
      staggerFactor: 0.6,
      minSpanFactor: 0.4,
    })

    this.rockMesh.frustumCulled = false
    // Rocks follow terrain deformations every frame, so matrices are dynamic.
    this.rockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.group.add(this.rockMesh)
  }

  setParams(params: Partial<RockFieldParams>): void {
    this.params = { ...this.params, ...params }
  }

  // Called every frame after the ground geometry has been updated for this tick.
  // getGroundHeight must reflect the current deformed terrain (including disturbances).
  update(getGroundHeight: (x: number, z: number) => number): void {
    this.updateRocks(getGroundHeight)
  }

  dispose(): void {
    this.rockGeometry.dispose()
    this.rockMaterial.dispose()
  }

  private getSlotMaxWidth(slot: SurfaceLayoutSlot): number {
    return slot.spanSize * BASE_LAYOUT_PX_PER_WORLD * this.params.layoutDensity
  }

  private updateRocks(getGroundHeight: (x: number, z: number) => number): void {
    const rowStep = FIELD_DEPTH / (ROWS + 1.1)
    const backZ = FIELD_DEPTH * 0.48
    let instanceIndex = 0

    this.layoutDriver.forEachLaidOutLine({
      spanMin: -FIELD_WIDTH * 0.5,
      spanMax: FIELD_WIDTH * 0.5,
      lineCoordAtRow: (row) => backZ - row * rowStep,
      getMaxWidth: (slot) => this.getSlotMaxWidth(slot),
      onLine: ({ slot, glyphs, lineText }) => {
        instanceIndex = this.projectLine(slot, glyphs, lineText, rowStep, getGroundHeight, instanceIndex)
      },
    })

    this.rockMesh.count = instanceIndex
    this.rockMesh.instanceMatrix.needsUpdate = true
    if (this.rockMesh.instanceColor) {
      this.rockMesh.instanceColor.needsUpdate = true
    }
  }

  private projectLine(
    slot: SurfaceLayoutSlot,
    glyphs: readonly string[],
    lineText: string,
    rowStep: number,
    getGroundHeight: (x: number, z: number) => number,
    instanceIndex: number,
  ): number {
    const n = glyphs.length
    const lineSeed = lineSignature(lineText)
    const lineLateralShift = (lineSeed - 0.5) * slot.sectorStep * 0.22
    const lineDepthShift = (lineSeed - 0.5) * rowStep * 0.14

    for (let k = 0; k < n; k++) {
      if (instanceIndex >= MAX_INSTANCES) break

      const glyph = glyphs[k]!
      const code = glyph.codePointAt(0) ?? 0

      // Independent hash channels per rock — lateral and depth are uncorrelated.
      const hashLat = glyphHash(code, slot.row, k)
      const hashDep = glyphHash(code + 1, slot.sector, k ^ 0xab)
      const hashOrg = glyphHash(code + 2, slot.row ^ slot.sector, k + 17)

      // Hash-driven lateral position breaks the even t01 comb.
      const t01 = THREE.MathUtils.clamp((k + hashLat * 0.85 + 0.08) / (n + 0.1), 0.02, 0.98)
      const x =
        slot.spanStart +
        t01 * slot.spanSize +
        lineLateralShift +
        (hashLat - 0.5) * slot.sectorStep * 0.42
      // Per-rock depth jitter via its own hash channel — no shared line shift.
      const zJitter = (hashDep - 0.5) * rowStep * 0.58 + lineDepthShift
      const z = slot.lineCoord + zJitter
      const noise = organicField(x + hashOrg * 0.3, z + hashOrg * 0.2)

      const groundY = getGroundHeight(x, z)
      const sizeBase = glyphSizeIdentity(code)
      const size = sizeBase * (0.28 + noise * 0.38) * this.params.sizeScale
      // Slight random yaw so rocks don't all face the same way
      const yaw = lineSeed * Math.PI * 2 + k * 1.17 + noise * 0.9
      // Tilt slightly into the ground for a settled look
      const tiltX = (noise - 0.5) * 0.18
      const tiltZ = (Math.sin(code * 0.13 + lineSeed * 3.1) * 0.5) * 0.14

      dummy.position.set(x, groundY + size * 0.06, z)
      dummy.rotation.set(tiltX, yaw, tiltZ)
      dummy.scale.set(size, size * (0.55 + noise * 0.3), size * (0.82 + noise * 0.22))
      dummy.updateMatrix()
      this.rockMesh.setMatrixAt(instanceIndex, dummy.matrix)

      const color = glyphStoneColor(code, noise)
      this.rockMesh.setColorAt(instanceIndex, color)

      instanceIndex++
    }

    return instanceIndex
  }
}

import type { PreparedTextWithSegments } from '@chenglou/pretext'
import * as THREE from 'three'
import { PLAYGROUND_BOUNDS } from './playgroundWorld'
import { SurfaceLayoutDriver, type SurfaceLayoutSlot } from './surfaceLayoutCore'
import type { SeedCursorFactory } from './types'

// Sparse grid — rocks are infrequent, so fewer rows/sectors than grass.
const ROWS = 18
const SECTORS = 22
const MAX_INSTANCES = 2_400
const FIELD_WIDTH = PLAYGROUND_BOUNDS.maxX - PLAYGROUND_BOUNDS.minX
const FIELD_DEPTH = PLAYGROUND_BOUNDS.maxZ - PLAYGROUND_BOUNDS.minZ
// Rocks use a narrower layout width so fewer glyphs fit per slot — naturally sparse.
const LAYOUT_PX_PER_WORLD = 6.5

const tmpColor = new THREE.Color()
const dummy = new THREE.Object3D()

function fieldNoise(x: number, z: number): number {
  const a = Math.sin(x * 0.31 + z * 0.13)
  const b = Math.sin(x * 0.11 - z * 0.27 + 2.1)
  return THREE.MathUtils.clamp(0.5 + a * 0.28 + b * 0.22, 0, 1)
}

function lineSignature(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967296
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
  // Flat dodecahedron-ish disc — looks like a stone lying on the ground.
  // We use a low-poly cylinder (flat top/bottom) for a chunky faceted silhouette.
  return new THREE.CylinderGeometry(0.5, 0.42, 0.18, 7, 1)
}

export class RockFieldSample {
  readonly group = new THREE.Group()

  private readonly rockGeometry = makeRockGeometry()
  private readonly rockMaterial = new THREE.MeshPhysicalMaterial({
    roughness: 0.88,
    metalness: 0.02,
    clearcoat: 0.04,
    clearcoatRoughness: 0.9,
  })
  private readonly rockMesh = new THREE.InstancedMesh(
    this.rockGeometry,
    this.rockMaterial,
    MAX_INSTANCES,
  )
  private readonly layoutDriver: SurfaceLayoutDriver

  constructor(
    prepared: PreparedTextWithSegments,
    seedCursor: SeedCursorFactory,
  ) {
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
    return slot.spanSize * LAYOUT_PX_PER_WORLD
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

      // Scatter position within the slot, anchored to glyph index
      const t01 = (k + 0.5) / n
      const scatter = Math.sin(code * 0.091 + lineSeed * 7.3 + k * 1.4) * 0.5
      const x =
        slot.spanStart +
        t01 * slot.spanSize +
        lineLateralShift +
        scatter * slot.sectorStep * 0.18
      const noise = fieldNoise(x, slot.lineCoord)
      const zJitter = (noise - 0.5) * rowStep * 0.32 + lineDepthShift
      const z = slot.lineCoord + zJitter

      const groundY = getGroundHeight(x, z)
      const sizeBase = glyphSizeIdentity(code)
      const size = sizeBase * (0.28 + noise * 0.38)
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

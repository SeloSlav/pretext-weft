import * as THREE from 'three'
import type {
  PreparedSurfaceSource,
  ResolvedSurfaceGlyph,
  SeedCursorFactory,
  SurfaceLayoutSlot,
} from '../../core'
import { createWorldField, SurfaceLayoutDriver } from '../../core'
import { createSurfaceEffect, fieldLayout } from '../api'
import {
  getPreparedRockSurface,
  type RockTokenId,
  type RockTokenMeta,
} from './rockFieldSource'

export type RockFieldParams = {
  layoutDensity: number
  sizeScale: number
}

export const DEFAULT_ROCK_FIELD_PARAMS: RockFieldParams = {
  layoutDensity: 1.0,
  sizeScale: 1.0,
}

export type RockFieldBounds = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export type RockFieldPlacementMask = {
  bounds?: RockFieldBounds
  includeAtXZ?: (x: number, z: number) => boolean
}

const DEFAULT_ROCK_FIELD_BOUNDS: RockFieldBounds = {
  minX: -28,
  maxX: 28,
  minZ: -28,
  maxZ: 28,
}

const ROWS = 18
const SECTORS = 22
const MAX_INSTANCES = 2_400
const BASE_LAYOUT_PX_PER_WORLD = 6.5

const tmpColor = new THREE.Color()
const dummy = new THREE.Object3D()

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

const rockOrganicWorldField = createWorldField(463, {
  scale: 5.4,
  octaves: 4,
  roughness: 0.52,
  warpAmplitude: 1.15,
  warpScale: 4.6,
  ridge: 0.32,
  contrast: 1.12,
})

function rockSizeIdentity(identity: number, meta: RockTokenMeta): number {
  return 0.58 + uhash(identity * 2246822519) * 0.72 + meta.sizeBias
}

function rockStoneColor(identity: number, noise: number, meta: RockTokenMeta): THREE.Color {
  const t = uhash(identity * 2654435761)
  const hue = (t < 0.4 ? 0.06 + t * 0.05 : 0.55 + (t - 0.4) * 0.08) + meta.warmth
  const sat = 0.08 + t * 0.14 + noise * 0.06
  const light = 0.28 + noise * 0.22 + t * 0.08
  return tmpColor.setHSL(hue, sat, light)
}

function makeRockGeometry(): THREE.BufferGeometry {
  return new THREE.DodecahedronGeometry(0.5, 0)
}

export class RockFieldEffect {
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
  private readonly placementMask: Required<RockFieldPlacementMask>
  private readonly fieldWidth: number
  private readonly fieldDepth: number
  private readonly fieldCenterX: number
  private readonly fieldCenterZ: number
  private readonly layoutDriver: SurfaceLayoutDriver<RockTokenId, RockTokenMeta>
  private params: RockFieldParams

  constructor(
    surface: PreparedSurfaceSource<RockTokenId, RockTokenMeta>,
    seedCursor: SeedCursorFactory,
    initialParams: RockFieldParams,
    placementMask: RockFieldPlacementMask = {},
  ) {
    this.params = { ...initialParams }
    const bounds = placementMask.bounds ?? DEFAULT_ROCK_FIELD_BOUNDS
    this.fieldWidth = bounds.maxX - bounds.minX
    this.fieldDepth = bounds.maxZ - bounds.minZ
    this.fieldCenterX = (bounds.minX + bounds.maxX) * 0.5
    this.fieldCenterZ = (bounds.minZ + bounds.maxZ) * 0.5
    this.placementMask = {
      bounds,
      includeAtXZ: placementMask.includeAtXZ ?? (() => true),
    }
    this.layoutDriver = new SurfaceLayoutDriver({
      surface,
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 7 + 3,
      seedCursor,
      staggerFactor: 0.6,
      minSpanFactor: 0.4,
    })

    this.rockMesh.frustumCulled = false
    this.rockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.group.add(this.rockMesh)
  }

  setParams(params: Partial<RockFieldParams>): void {
    this.params = { ...this.params, ...params }
  }

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
    const rowStep = this.fieldDepth / (ROWS + 1.1)
    const backZ = this.fieldDepth * 0.48
    let instanceIndex = 0

    this.layoutDriver.forEachLaidOutLine({
      spanMin: -this.fieldWidth * 0.5,
      spanMax: this.fieldWidth * 0.5,
      lineCoordAtRow: (row) => backZ - row * rowStep,
      getMaxWidth: (slot) => this.getSlotMaxWidth(slot),
      onLine: ({ slot, resolvedGlyphs, tokenLineKey }) => {
        instanceIndex = this.projectLine(slot, resolvedGlyphs, tokenLineKey, rowStep, getGroundHeight, instanceIndex)
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
    resolvedGlyphs: readonly ResolvedSurfaceGlyph<RockTokenId, RockTokenMeta>[],
    tokenLineKey: string,
    rowStep: number,
    getGroundHeight: (x: number, z: number) => number,
    instanceIndex: number,
  ): number {
    const n = resolvedGlyphs.length
    const lineSeed = lineSignature(tokenLineKey)
    const lineLateralShift = (lineSeed - 0.5) * slot.sectorStep * 0.22
    const lineDepthShift = (lineSeed - 0.5) * rowStep * 0.14

    for (let k = 0; k < n; k++) {
      if (instanceIndex >= MAX_INSTANCES) break

      const token = resolvedGlyphs[k]!
      const identity = token.ordinal + 1
      const { meta } = token

      const hashLat = glyphHash(identity, slot.row, k)
      const hashDep = glyphHash(identity + 1, slot.sector, k ^ 0xab)
      const hashOrg = glyphHash(identity + 2, slot.row ^ slot.sector, k + 17)

      const t01 = THREE.MathUtils.clamp((k + hashLat * 0.85 + 0.08) / (n + 0.1), 0.02, 0.98)
      const x =
        this.fieldCenterX +
        slot.spanStart +
        t01 * slot.spanSize +
        lineLateralShift +
        (hashLat - 0.5) * slot.sectorStep * 0.42
      const zJitter = (hashDep - 0.5) * rowStep * 0.58 + lineDepthShift
      const z = this.fieldCenterZ + slot.lineCoord + zJitter
      if (!this.placementMask.includeAtXZ(x, z)) continue
      const noise = rockOrganicWorldField(x + hashOrg * 0.3, z + hashOrg * 0.2)

      const groundY = getGroundHeight(x, z)
      const sizeBase = rockSizeIdentity(identity, meta)
      const size = sizeBase * (0.28 + noise * 0.38) * this.params.sizeScale
      const yaw = lineSeed * Math.PI * 2 + k * 1.17 + noise * 0.9
      const tiltX = (noise - 0.5) * 0.18
      const tiltZ = Math.sin(identity * 0.13 + lineSeed * 3.1) * 0.5 * 0.14

      dummy.position.set(x, groundY + size * 0.06, z)
      dummy.rotation.set(tiltX, yaw, tiltZ)
      dummy.scale.set(size, size * (0.55 + noise * 0.3), size * (0.82 + noise * 0.22))
      dummy.updateMatrix()
      this.rockMesh.setMatrixAt(instanceIndex, dummy.matrix)
      this.rockMesh.setColorAt(instanceIndex, rockStoneColor(identity, noise, meta))

      instanceIndex++
    }

    return instanceIndex
  }
}

export type CreateRockFieldEffectOptions = {
  seedCursor: SeedCursorFactory
  surface?: PreparedSurfaceSource<RockTokenId, RockTokenMeta>
  initialParams?: RockFieldParams
  placementMask?: RockFieldPlacementMask
}

export function createRockFieldEffect({
  seedCursor,
  surface = getPreparedRockSurface(),
  initialParams = DEFAULT_ROCK_FIELD_PARAMS,
  placementMask,
}: CreateRockFieldEffectOptions): RockFieldEffect {
  const effect = createSurfaceEffect({
    id: 'rock-field',
    source: surface,
    layout: fieldLayout({
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 7 + 3,
      staggerFactor: 0.6,
      minSpanFactor: 0.4,
    }),
    seedCursor,
  })

  return new RockFieldEffect(effect.source, seedCursor, initialParams, placementMask)
}

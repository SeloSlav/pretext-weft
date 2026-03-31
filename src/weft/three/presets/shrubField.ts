import * as THREE from 'three'
import type {
  PreparedSurfaceSource,
  ResolvedSurfaceGlyph,
  SeedCursorFactory,
  SurfaceLayoutSlot,
} from '../../core'
import { createWorldField, SurfaceLayoutDriver } from '../../core'
import { createSurfaceEffect, fieldLayout } from '../api'
import { createBarkGrainTexture, warmBarkColor } from './barkShared'
import { makeShrubBranchedGeometries } from './branchedFoliageGeometry'
import {
  getPreparedShrubSurface,
  type ShrubTokenId,
  type ShrubTokenMeta,
} from './shrubFieldSource'

export type ShrubFieldParams = {
  layoutDensity: number
  sizeScale: number
  heightScale: number
}

export const DEFAULT_SHRUB_FIELD_PARAMS: ShrubFieldParams = {
  layoutDensity: 1,
  sizeScale: 2.25,
  heightScale: 3,
}

export type ShrubFieldBounds = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export type ShrubFieldPlacementMask = {
  bounds?: ShrubFieldBounds
  includeAtXZ?: (x: number, z: number) => boolean
}

const DEFAULT_SHRUB_FIELD_BOUNDS: ShrubFieldBounds = {
  minX: -28,
  maxX: 28,
  minZ: -28,
  maxZ: 28,
}

const ROWS = 22
const SECTORS = 28
const MAX_INSTANCES = 4_800
const BASE_LAYOUT_PX_PER_WORLD = 6.4

const tmpColor = new THREE.Color()
const tmpStemColor = new THREE.Color()
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

const shrubOrganicWorldField = createWorldField(1099, {
  scale: 6.2,
  octaves: 4,
  roughness: 0.58,
  warpAmplitude: 1.2,
  warpScale: 4.9,
  contrast: 1.1,
})

// warmth encodes season: spring ~ -0.18, summer ~ -0.06, autumn ~ +0.55, winter ~ -0.72
function shrubLeafColor(identity: number, noise: number, meta: ShrubTokenMeta): THREE.Color {
  const t = uhash(identity * 2654435761)
  const w = meta.warmth

  let hue: number, sat: number, light: number

  if (w >= 0.3) {
    // Autumn — vivid orange, some red/yellow variety
    hue = 0.07 + t * 0.06 + meta.spreadBias * 0.03
    sat = 0.84 + noise * 0.12 + meta.spreadBias * 0.04
    light = 0.48 + noise * 0.08 + t * 0.06
  } else if (w <= -0.5) {
    // Winter — near-white, icy pale
    hue = 0.57 + t * 0.05
    sat = 0.08 + noise * 0.06
    light = 0.74 + noise * 0.10 + t * 0.08
  } else if (w <= -0.1) {
    // Spring — bright yellow-green
    hue = 0.29 + t * 0.05 + meta.spreadBias * 0.02
    sat = 0.74 + noise * 0.14
    light = 0.48 + noise * 0.10 + t * 0.06
  } else {
    // Summer — deep rich green
    hue = 0.27 + t * 0.05 + meta.spreadBias * 0.02
    sat = 0.64 + noise * 0.14
    light = 0.34 + noise * 0.10 + t * 0.06
  }

  return tmpColor.setHSL(hue, sat, light)
}

const SHRUB_BRANCH_GEOMS = makeShrubBranchedGeometries()

export class ShrubFieldEffect {
  readonly group = new THREE.Group()

  private readonly woodGeometry = SHRUB_BRANCH_GEOMS.wood
  private readonly leafGeometry = SHRUB_BRANCH_GEOMS.leaves
  /** Same procedural grain as `treeField` trunks and `logField` logs (`createBarkGrainTexture`). */
  private readonly woodBarkTexture = createBarkGrainTexture()
  private readonly woodMaterial = new THREE.MeshLambertMaterial({
    map: this.woodBarkTexture,
    emissive: '#5c3a18',
    emissiveIntensity: 0.28,
  })
  /** Same shading model as `leafPileBand` ground leaves. */
  private readonly leafMaterial = new THREE.MeshStandardMaterial({
    roughness: 0.96,
    metalness: 0.02,
    side: THREE.DoubleSide,
  })
  private readonly woodMesh = new THREE.InstancedMesh(this.woodGeometry, this.woodMaterial, MAX_INSTANCES)
  private readonly leafMesh = new THREE.InstancedMesh(this.leafGeometry, this.leafMaterial, MAX_INSTANCES)
  private readonly placementMask: Required<ShrubFieldPlacementMask>
  private readonly fieldWidth: number
  private readonly fieldDepth: number
  private readonly fieldCenterX: number
  private readonly fieldCenterZ: number
  private layoutDriver: SurfaceLayoutDriver<ShrubTokenId, ShrubTokenMeta>
  private params: ShrubFieldParams

  constructor(
    surface: PreparedSurfaceSource<ShrubTokenId, ShrubTokenMeta>,
    seedCursor: SeedCursorFactory,
    initialParams: ShrubFieldParams,
    placementMask: ShrubFieldPlacementMask = {},
  ) {
    this.params = { ...initialParams }
    const bounds = placementMask.bounds ?? DEFAULT_SHRUB_FIELD_BOUNDS
    this.fieldWidth = bounds.maxX - bounds.minX
    this.fieldDepth = bounds.maxZ - bounds.minZ
    this.fieldCenterX = (bounds.minX + bounds.maxX) * 0.5
    this.fieldCenterZ = (bounds.minZ + bounds.maxZ) * 0.5
    this.placementMask = {
      bounds,
      includeAtXZ: placementMask.includeAtXZ ?? (() => true),
    }
    this.layoutDriver = this.createLayoutDriver(surface, seedCursor)

    this.woodMesh.frustumCulled = false
    this.leafMesh.frustumCulled = false
    this.woodMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    this.leafMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    this.group.add(this.woodMesh)
    this.group.add(this.leafMesh)
  }

  setParams(params: Partial<ShrubFieldParams>): void {
    this.params = { ...this.params, ...params }
  }

  setSurface(surface: PreparedSurfaceSource<ShrubTokenId, ShrubTokenMeta>, seedCursor: SeedCursorFactory): void {
    this.layoutDriver = this.createLayoutDriver(surface, seedCursor)
  }

  update(getGroundHeight: (x: number, z: number) => number): void {
    this.updateShrubs(getGroundHeight)
  }

  dispose(): void {
    this.woodBarkTexture.dispose()
    this.woodMaterial.dispose()
    this.leafMaterial.dispose()
  }

  private getSlotMaxWidth(slot: SurfaceLayoutSlot): number {
    return slot.spanSize * BASE_LAYOUT_PX_PER_WORLD * this.params.layoutDensity
  }

  private createLayoutDriver(
    surface: PreparedSurfaceSource<ShrubTokenId, ShrubTokenMeta>,
    seedCursor: SeedCursorFactory,
  ) {
    return new SurfaceLayoutDriver({
      surface,
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 7 + 3,
      seedCursor,
      staggerFactor: 0.58,
      minSpanFactor: 0.36,
    })
  }

  private updateShrubs(getGroundHeight: (x: number, z: number) => number): void {
    if (this.params.layoutDensity <= 0 || this.params.sizeScale <= 0 || this.params.heightScale <= 0) {
      this.woodMesh.count = 0
      this.leafMesh.count = 0
      this.woodMesh.instanceMatrix.needsUpdate = true
      this.leafMesh.instanceMatrix.needsUpdate = true
      return
    }

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

    this.woodMesh.count = instanceIndex
    this.leafMesh.count = instanceIndex
    this.woodMesh.instanceMatrix.needsUpdate = true
    this.leafMesh.instanceMatrix.needsUpdate = true
    if (this.woodMesh.instanceColor) {
      this.woodMesh.instanceColor.needsUpdate = true
    }
    if (this.leafMesh.instanceColor) {
      this.leafMesh.instanceColor.needsUpdate = true
    }
  }

  private projectLine(
    slot: SurfaceLayoutSlot,
    resolvedGlyphs: readonly ResolvedSurfaceGlyph<ShrubTokenId, ShrubTokenMeta>[],
    tokenLineKey: string,
    rowStep: number,
    getGroundHeight: (x: number, z: number) => number,
    instanceIndex: number,
  ): number {
    const n = resolvedGlyphs.length
    const lineSeed = lineSignature(tokenLineKey)
    const lineLateralShift = (lineSeed - 0.5) * slot.sectorStep * 0.24
    const lineDepthShift = (lineSeed - 0.5) * rowStep * 0.16

    for (let k = 0; k < n; k++) {
      if (instanceIndex >= MAX_INSTANCES) break

      const token = resolvedGlyphs[k]!
      const identity = token.ordinal + 1
      const { meta } = token
      const hashLat = glyphHash(identity, slot.row, k)
      const hashDep = glyphHash(identity + 1, slot.sector, k ^ 0xab)
      const hashOrg = glyphHash(identity + 2, slot.row ^ slot.sector, k + 17)
      const hashKeep = glyphHash(identity + 3, slot.row + slot.sector, k ^ 0x39)
      const hashShape = glyphHash(identity + 5, slot.sector + 7, k ^ 0x57)
      const hashVariety = glyphHash(identity + 11, slot.row, k ^ 0x21)

      const t01 = THREE.MathUtils.clamp((k + hashLat * 0.88 + 0.08) / (n + 0.08), 0.02, 0.98)
      const x =
        this.fieldCenterX +
        slot.spanStart +
        t01 * slot.spanSize +
        lineLateralShift +
        (hashLat - 0.5) * slot.sectorStep * (0.42 + meta.spreadBias * 0.18)
      const z =
        this.fieldCenterZ +
        slot.lineCoord +
        (hashDep - 0.5) * rowStep * 0.62 +
        lineDepthShift
      if (!this.placementMask.includeAtXZ(x, z)) continue

      const noise = shrubOrganicWorldField(x + hashOrg * 0.34, z + hashOrg * 0.28)
      const keepChance = THREE.MathUtils.clamp(0.46 + noise * 0.42 + meta.spreadBias * 0.18, 0.28, 0.98)
      if (hashKeep > keepChance) continue

      const groundY = getGroundHeight(x, z)
      /** Per-instance scale (~0.36–1) so `sizeScale` reads as a max; keeps readable small/large mix. */
      const sizeVariety = 0.36 + hashVariety * 0.64
      const baseSize =
        (0.52 + noise * 0.38 + meta.sizeBias * 0.2) * sizeVariety * this.params.sizeScale
      const canopyWidth = Math.max(0.3, baseSize * (1.02 + meta.spreadBias * 0.44 + hashShape * 0.34))
      const canopyHeight = Math.max(
        0.28,
        baseSize * (0.82 + meta.heightBias * 0.36 + noise * 0.3) * this.params.heightScale,
      )
      const yaw = lineSeed * Math.PI * 2 + k * 0.97 + noise * 1.15
      const leanX = (noise - 0.5) * 0.1
      const leanZ = (hashShape - 0.5) * 0.12

      dummy.position.set(x, groundY, z)
      dummy.rotation.set(leanX, yaw, leanZ)
      dummy.scale.set(
        canopyWidth,
        canopyHeight,
        canopyWidth * (0.92 + noise * 0.2 + hashShape * 0.08),
      )
      dummy.updateMatrix()
      this.woodMesh.setMatrixAt(instanceIndex, dummy.matrix)
      this.woodMesh.setColorAt(instanceIndex, warmBarkColor(identity, noise, meta.warmth, tmpStemColor))

      this.leafMesh.setMatrixAt(instanceIndex, dummy.matrix)
      this.leafMesh.setColorAt(instanceIndex, shrubLeafColor(identity, noise, meta))

      instanceIndex++
    }

    return instanceIndex
  }
}

export type CreateShrubFieldEffectOptions = {
  seedCursor: SeedCursorFactory
  surface?: PreparedSurfaceSource<ShrubTokenId, ShrubTokenMeta>
  initialParams?: ShrubFieldParams
  placementMask?: ShrubFieldPlacementMask
}

export function createShrubFieldEffect({
  seedCursor,
  surface = getPreparedShrubSurface(),
  initialParams = DEFAULT_SHRUB_FIELD_PARAMS,
  placementMask,
}: CreateShrubFieldEffectOptions): ShrubFieldEffect {
  const effect = createSurfaceEffect({
    id: 'shrub-field',
    source: surface,
    layout: fieldLayout({
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 7 + 3,
      staggerFactor: 0.58,
      minSpanFactor: 0.36,
    }),
    seedCursor,
  })

  return new ShrubFieldEffect(effect.source, seedCursor, initialParams, placementMask)
}

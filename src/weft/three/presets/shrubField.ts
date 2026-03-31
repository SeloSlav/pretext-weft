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
  layoutDensity: 1.05,
  sizeScale: 1.2,
  heightScale: 1.15,
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

function makeShrubStemGeometry(): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(0.22, 0.34, 1, 6, 1)
}

function makeShrubCanopyGeometry(): THREE.BufferGeometry {
  return new THREE.SphereGeometry(0.5, 6, 5)
}

function shrubLeafColor(identity: number, noise: number, meta: ShrubTokenMeta): THREE.Color {
  const t = uhash(identity * 2654435761)
  const hue = 0.26 + t * 0.05 + meta.warmth
  const seasonalFade = Math.max(0, -meta.warmth)
  const seasonalDryness = Math.max(0, meta.warmth)
  const sat = 0.36 + noise * 0.18 + meta.spreadBias * 0.05 + seasonalDryness * 0.36 - seasonalFade * 0.5
  const light = 0.18 + noise * 0.22 + t * 0.08 + seasonalDryness * 0.08 + seasonalFade * 0.2
  return tmpColor.setHSL(hue, sat, light)
}

function shrubStemColor(identity: number, noise: number): THREE.Color {
  const t = uhash(identity * 2246822519)
  return tmpStemColor.setHSL(0.085 + t * 0.015, 0.28 + noise * 0.08, 0.12 + t * 0.08)
}

export class ShrubFieldEffect {
  readonly group = new THREE.Group()

  private readonly stemGeometry = makeShrubStemGeometry()
  private readonly canopyGeometry = makeShrubCanopyGeometry()
  private readonly stemMaterial = new THREE.MeshLambertMaterial()
  private readonly canopyMaterial = new THREE.MeshLambertMaterial()
  private readonly stemMesh = new THREE.InstancedMesh(this.stemGeometry, this.stemMaterial, MAX_INSTANCES)
  private readonly canopyMesh = new THREE.InstancedMesh(this.canopyGeometry, this.canopyMaterial, MAX_INSTANCES)
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

    this.stemMesh.frustumCulled = false
    this.canopyMesh.frustumCulled = false
    this.stemMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    this.canopyMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    this.group.add(this.stemMesh)
    this.group.add(this.canopyMesh)
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
    this.stemGeometry.dispose()
    this.canopyGeometry.dispose()
    this.stemMaterial.dispose()
    this.canopyMaterial.dispose()
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
      this.stemMesh.count = 0
      this.canopyMesh.count = 0
      this.stemMesh.instanceMatrix.needsUpdate = true
      this.canopyMesh.instanceMatrix.needsUpdate = true
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

    this.stemMesh.count = instanceIndex
    this.canopyMesh.count = instanceIndex
    this.stemMesh.instanceMatrix.needsUpdate = true
    this.canopyMesh.instanceMatrix.needsUpdate = true
    if (this.stemMesh.instanceColor) {
      this.stemMesh.instanceColor.needsUpdate = true
    }
    if (this.canopyMesh.instanceColor) {
      this.canopyMesh.instanceColor.needsUpdate = true
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
      const baseSize = (0.56 + noise * 0.42 + meta.sizeBias * 0.24) * this.params.sizeScale
      const canopyWidth = Math.max(0.3, baseSize * (1.02 + meta.spreadBias * 0.44 + hashShape * 0.34))
      const canopyHeight = Math.max(
        0.28,
        baseSize * (0.82 + meta.heightBias * 0.36 + noise * 0.3) * this.params.heightScale,
      )
      const stemHeight = Math.max(0.08, canopyHeight * (0.18 + hashShape * 0.1))
      const stemWidth = Math.max(0.045, canopyWidth * 0.18)
      const yaw = lineSeed * Math.PI * 2 + k * 0.97 + noise * 1.15
      const leanX = (noise - 0.5) * 0.1
      const leanZ = (hashShape - 0.5) * 0.12

      dummy.position.set(x, groundY + stemHeight * 0.5, z)
      dummy.rotation.set(leanX, yaw, leanZ)
      dummy.scale.set(stemWidth, stemHeight, stemWidth * (0.82 + hashShape * 0.22))
      dummy.updateMatrix()
      this.stemMesh.setMatrixAt(instanceIndex, dummy.matrix)
      this.stemMesh.setColorAt(instanceIndex, shrubStemColor(identity, noise))

      dummy.position.set(x, groundY + stemHeight * 0.7 + canopyHeight * 0.08, z)
      dummy.rotation.set(leanX * 0.6, yaw + (hashShape - 0.5) * 0.18, leanZ * 0.5)
      dummy.scale.set(canopyWidth, canopyHeight, canopyWidth * (0.92 + noise * 0.2 + hashShape * 0.08))
      dummy.updateMatrix()
      this.canopyMesh.setMatrixAt(instanceIndex, dummy.matrix)
      this.canopyMesh.setColorAt(instanceIndex, shrubLeafColor(identity, noise, meta))

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

import * as THREE from 'three'
import type {
  PreparedSurfaceSource,
  ResolvedSurfaceGlyph,
  SeedCursorFactory,
  SurfaceLayoutSlot,
} from '../../core'
import { SurfaceLayoutDriver } from '../../core'
import { createSurfaceEffect, fieldLayout } from '../api'
import {
  getPreparedBandSurface,
  type BandTokenId,
  type BandTokenMeta,
} from './bandFieldSource'

export type BandFieldParams = {
  layoutDensity: number
  sizeScale: number
  bandWidth: number
  edgeSoftness: number
}

export const DEFAULT_BAND_FIELD_PARAMS: BandFieldParams = {
  layoutDensity: 1,
  sizeScale: 1,
  bandWidth: 4.2,
  edgeSoftness: 1.35,
}

export type BandFieldBounds = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export type BandFieldPlacementMask = {
  bounds?: BandFieldBounds
  includeAtXZ?: (x: number, z: number) => boolean
  /**
   * Signed distance from the ribbon centerline at a world-space sample.
   * Negative / positive choose sides of the band; magnitude controls falloff.
   */
  distanceToBandAtXZ?: (x: number, z: number) => number
}

const DEFAULT_BAND_FIELD_BOUNDS: BandFieldBounds = {
  minX: -28,
  maxX: 28,
  minZ: -28,
  maxZ: 28,
}

const ROWS = 20
const SECTORS = 28
const MAX_INSTANCES = 3_200
const BASE_LAYOUT_PX_PER_WORLD = 8

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

function smoothBandCoverage(distance: number, halfWidth: number, edgeSoftness: number): number {
  if (distance <= halfWidth) return 1
  if (edgeSoftness <= 1e-6) return 0
  return 1 - THREE.MathUtils.smoothstep(distance, halfWidth, halfWidth + edgeSoftness)
}

function makeBandGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(0.42, 1, 1, 1)
  geometry.translate(0, 0.5, 0)
  return geometry
}

function bandColor(identity: number, coverage: number, meta: BandTokenMeta): THREE.Color {
  const t = uhash(identity * 2654435761)
  const hue = 0.24 + (t - 0.5) * 0.07 + meta.hueShift
  const sat = 0.22 + coverage * 0.14 + t * 0.08
  const light = 0.3 + coverage * 0.12 + meta.lightShift
  return tmpColor.setHSL(hue, sat, light)
}

export class BandFieldEffect {
  readonly group = new THREE.Group()

  private readonly bandGeometry = makeBandGeometry()
  private readonly bandMaterial = new THREE.MeshStandardMaterial({
    roughness: 0.9,
    metalness: 0.04,
    side: THREE.DoubleSide,
  })
  private readonly bandMesh = new THREE.InstancedMesh(
    this.bandGeometry,
    this.bandMaterial,
    MAX_INSTANCES,
  )
  private readonly placementMask: Required<BandFieldPlacementMask>
  private readonly fieldWidth: number
  private readonly fieldDepth: number
  private readonly layoutDriver: SurfaceLayoutDriver<BandTokenId, BandTokenMeta>
  private params: BandFieldParams

  constructor(
    surface: PreparedSurfaceSource<BandTokenId, BandTokenMeta>,
    seedCursor: SeedCursorFactory,
    initialParams: BandFieldParams,
    placementMask: BandFieldPlacementMask = {},
  ) {
    this.params = { ...initialParams }
    const bounds = placementMask.bounds ?? DEFAULT_BAND_FIELD_BOUNDS
    this.fieldWidth = bounds.maxX - bounds.minX
    this.fieldDepth = bounds.maxZ - bounds.minZ
    this.placementMask = {
      bounds,
      includeAtXZ: placementMask.includeAtXZ ?? (() => true),
      distanceToBandAtXZ: placementMask.distanceToBandAtXZ ?? ((_, z) => z),
    }
    this.layoutDriver = new SurfaceLayoutDriver({
      surface,
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 9 + 5,
      seedCursor,
      staggerFactor: 0.55,
      minSpanFactor: 0.34,
    })

    this.bandMesh.frustumCulled = false
    this.bandMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.group.add(this.bandMesh)
  }

  setParams(params: Partial<BandFieldParams>): void {
    this.params = { ...this.params, ...params }
  }

  update(getGroundHeight: (x: number, z: number) => number): void {
    this.updateBand(getGroundHeight)
  }

  dispose(): void {
    this.bandGeometry.dispose()
    this.bandMaterial.dispose()
  }

  private getSlotMaxWidth(slot: SurfaceLayoutSlot): number {
    return slot.spanSize * BASE_LAYOUT_PX_PER_WORLD * this.params.layoutDensity
  }

  private updateBand(getGroundHeight: (x: number, z: number) => number): void {
    const rowStep = this.fieldDepth / (ROWS + 1)
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

    this.bandMesh.count = instanceIndex
    this.bandMesh.instanceMatrix.needsUpdate = true
    if (this.bandMesh.instanceColor) {
      this.bandMesh.instanceColor.needsUpdate = true
    }
  }

  private projectLine(
    slot: SurfaceLayoutSlot,
    resolvedGlyphs: readonly ResolvedSurfaceGlyph<BandTokenId, BandTokenMeta>[],
    tokenLineKey: string,
    rowStep: number,
    getGroundHeight: (x: number, z: number) => number,
    instanceIndex: number,
  ): number {
    const n = resolvedGlyphs.length
    const lineSeed = lineSignature(tokenLineKey)
    const lineLateralShift = (lineSeed - 0.5) * slot.sectorStep * 0.28
    const lineDepthShift = (lineSeed - 0.5) * rowStep * 0.18
    const halfWidth = this.params.bandWidth * 0.5
    const edgeSoftness = Math.max(0.02, this.params.edgeSoftness)

    for (let k = 0; k < n; k++) {
      if (instanceIndex >= MAX_INSTANCES) break

      const token = resolvedGlyphs[k]!
      const identity = token.ordinal + 1
      const { meta } = token

      const hashLat = glyphHash(identity, slot.row, k)
      const hashDep = glyphHash(identity + 1, slot.sector, k ^ 0xab)
      const hashYaw = glyphHash(identity + 2, slot.row ^ slot.sector, k + 17)

      const t01 = THREE.MathUtils.clamp((k + hashLat * 0.85 + 0.08) / (n + 0.1), 0.02, 0.98)
      const x =
        slot.spanStart +
        t01 * slot.spanSize +
        lineLateralShift +
        (hashLat - 0.5) * slot.sectorStep * 0.46
      const z = slot.lineCoord + (hashDep - 0.5) * rowStep * 0.62 + lineDepthShift
      if (!this.placementMask.includeAtXZ(x, z)) continue

      const signedDistance = this.placementMask.distanceToBandAtXZ(x, z)
      const coverage = smoothBandCoverage(Math.abs(signedDistance), halfWidth, edgeSoftness)
      if (coverage <= 0.02 || glyphHash(identity + 5, slot.row, k ^ 0x55) > coverage) continue

      const groundY = getGroundHeight(x, z)
      const width = (0.14 + coverage * 0.18 + meta.widthBias) * this.params.sizeScale
      const height = (0.35 + coverage * 0.75 + meta.heightBias) * this.params.sizeScale
      const yaw = hashYaw * Math.PI * 2
      const tiltX = (hashDep - 0.5) * 0.34
      const tiltZ = (hashLat - 0.5) * 0.24

      dummy.position.set(x, groundY, z)
      dummy.rotation.set(tiltX, yaw, tiltZ)
      dummy.scale.set(width, height, 1)
      dummy.updateMatrix()
      this.bandMesh.setMatrixAt(instanceIndex, dummy.matrix)
      this.bandMesh.setColorAt(instanceIndex, bandColor(identity, coverage, meta))
      instanceIndex++
    }

    return instanceIndex
  }
}

export type CreateBandFieldEffectOptions = {
  seedCursor: SeedCursorFactory
  surface?: PreparedSurfaceSource<BandTokenId, BandTokenMeta>
  initialParams?: BandFieldParams
  placementMask?: BandFieldPlacementMask
}

export function createBandFieldEffect({
  seedCursor,
  surface = getPreparedBandSurface(),
  initialParams = DEFAULT_BAND_FIELD_PARAMS,
  placementMask,
}: CreateBandFieldEffectOptions): BandFieldEffect {
  const effect = createSurfaceEffect({
    id: 'band-field',
    source: surface,
    layout: fieldLayout({
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 9 + 5,
      staggerFactor: 0.55,
      minSpanFactor: 0.34,
    }),
    seedCursor,
  })

  return new BandFieldEffect(effect.source, seedCursor, initialParams, placementMask)
}

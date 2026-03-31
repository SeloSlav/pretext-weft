import * as THREE from 'three'
import type {
  PreparedSurfaceSource,
  ResolvedSurfaceGlyph,
  SeedCursorFactory,
  SurfaceLayoutSlot,
} from '../../core'
import { SurfaceLayoutDriver } from '../../core'
import { updateRecoveringImpacts } from '../../runtime'
import { createSurfaceEffect, fieldLayout } from '../api'
import {
  getPreparedFungusBandSurface,
  type BandTokenId,
  type BandTokenMeta,
} from './bandFieldSource'
import { createBurnRimInstancedAttribute, patchMeshStandardBurnNeonRim } from './burnNeonRim'

export type FungusSeamParams = {
  layoutDensity: number
  sizeScale: number
  bandWidth: number
  edgeSoftness: number
  recoveryRate: number
  burnRadius: number
  burnSpreadSpeed: number
  burnMaxRadius: number
}

export const DEFAULT_FUNGUS_SEAM_PARAMS: FungusSeamParams = {
  layoutDensity: 1,
  sizeScale: 1,
  bandWidth: 4.2,
  edgeSoftness: 1.35,
  recoveryRate: 0.08,
  burnRadius: 0.68,
  burnSpreadSpeed: 2.85,
  burnMaxRadius: 4.4,
}

export type FungusSeamBounds = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export type FungusSeamPlacementMask = {
  bounds?: FungusSeamBounds
  includeAtXZ?: (x: number, z: number) => boolean
  distanceToBandAtXZ?: (x: number, z: number) => number
}

export type FungusBurnOptions = {
  radiusScale?: number
  maxRadiusScale?: number
  strength?: number
  mergeRadius?: number
}

const DEFAULT_BOUNDS: FungusSeamBounds = {
  minX: -28,
  maxX: 28,
  minZ: -28,
  maxZ: 28,
}

const ROWS = 20
const SECTORS = 28
const MAX_INSTANCES = 3_200
const BASE_LAYOUT_PX_PER_WORLD = 8
const MAX_BURNS = 18

const tmpLocalPoint = new THREE.Vector3()
const tmpColor = new THREE.Color()
const tmpAshColor = new THREE.Color()
const tmpEmberColor = new THREE.Color()
const dummy = new THREE.Object3D()

type FungusBurn = {
  x: number
  z: number
  radius: number
  maxRadius: number
  strength: number
}

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

function makeFungusGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0.42, 0)
  shape.bezierCurveTo(0.34, 0.26, 0.16, 0.44, -0.02, 0.38)
  shape.bezierCurveTo(-0.18, 0.48, -0.42, 0.3, -0.46, 0.05)
  shape.bezierCurveTo(-0.54, -0.16, -0.32, -0.42, -0.04, -0.38)
  shape.bezierCurveTo(0.14, -0.48, 0.4, -0.24, 0.42, 0)
  return new THREE.ShapeGeometry(shape)
}

function fungusColor(
  identity: number,
  coverage: number,
  meta: BandTokenMeta,
  burn: number,
  front: number,
): THREE.Color {
  const t = uhash(identity * 2654435761)
  const hue = 0.08 + (t - 0.5) * 0.07 + meta.hueShift
  const sat = 0.2 + coverage * 0.16 + t * 0.08
  const light = 0.22 + coverage * 0.12 + meta.lightShift
  tmpColor.setHSL(hue, sat, light)
  if (burn > 0.001) {
    tmpAshColor.setRGB(0.055, 0.04, 0.035)
    tmpColor.lerp(tmpAshColor, burn * 0.94)
  }
  if (front > 0.001) {
    tmpEmberColor.setHSL(0.045, 0.98, 0.56)
    tmpColor.lerp(tmpEmberColor, front * 0.9)
  }
  /** WebGPU: rim shader may not run — saturate orange on burn. */
  const neon = THREE.MathUtils.clamp(burn * 0.55 + front * 0.88, 0, 1)
  if (neon > 0.03) {
    tmpEmberColor.setRGB(1, 0.35, 0.03)
    tmpColor.lerp(tmpEmberColor, neon * 0.4)
  }
  return tmpColor
}

export class FungusSeamEffect {
  readonly group = new THREE.Group()

  private readonly fungusGeometry = makeFungusGeometry()
  private readonly fungusMaterial = new THREE.MeshStandardMaterial({
    roughness: 0.92,
    metalness: 0.03,
    side: THREE.DoubleSide,
  })
  private readonly fungusMesh = new THREE.InstancedMesh(this.fungusGeometry, this.fungusMaterial, MAX_INSTANCES)
  private readonly fungusBurnRimAttr: THREE.InstancedBufferAttribute
  private readonly placementMask: Required<FungusSeamPlacementMask>
  private readonly fieldWidth: number
  private readonly fieldDepth: number
  private readonly fieldCenterX: number
  private readonly fieldCenterZ: number
  private readonly layoutDriver: SurfaceLayoutDriver<BandTokenId, BandTokenMeta>
  private readonly burns: FungusBurn[] = []
  private params: FungusSeamParams
  private lastElapsed = 0

  constructor(
    surface: PreparedSurfaceSource<BandTokenId, BandTokenMeta>,
    seedCursor: SeedCursorFactory,
    initialParams: FungusSeamParams,
    placementMask: FungusSeamPlacementMask = {},
  ) {
    this.params = { ...initialParams }
    const bounds = placementMask.bounds ?? DEFAULT_BOUNDS
    this.fieldWidth = bounds.maxX - bounds.minX
    this.fieldDepth = bounds.maxZ - bounds.minZ
    this.fieldCenterX = (bounds.minX + bounds.maxX) * 0.5
    this.fieldCenterZ = (bounds.minZ + bounds.maxZ) * 0.5
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

    this.fungusMesh.frustumCulled = false
    this.fungusMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.fungusBurnRimAttr = createBurnRimInstancedAttribute(MAX_INSTANCES)
    this.fungusGeometry.setAttribute('burnRim', this.fungusBurnRimAttr)
    patchMeshStandardBurnNeonRim(this.fungusMaterial, 'fungus-seam')
    this.group.add(this.fungusMesh)
  }

  setParams(params: Partial<FungusSeamParams>): void {
    this.params = { ...this.params, ...params }
    for (const burn of this.burns) {
      burn.maxRadius = this.params.burnMaxRadius
    }
  }

  addBurnFromWorldPoint(worldPoint: THREE.Vector3, options: FungusBurnOptions = {}): void {
    tmpLocalPoint.copy(worldPoint)
    this.group.worldToLocal(tmpLocalPoint)
    const x = THREE.MathUtils.clamp(
      tmpLocalPoint.x,
      this.fieldCenterX - this.fieldWidth * 0.48,
      this.fieldCenterX + this.fieldWidth * 0.48,
    )
    const z = THREE.MathUtils.clamp(
      tmpLocalPoint.z,
      this.fieldCenterZ - this.fieldDepth * 0.48,
      this.fieldCenterZ + this.fieldDepth * 0.48,
    )
    const radius = this.params.burnRadius * (options.radiusScale ?? 1)
    const maxRadius = this.params.burnMaxRadius * (options.maxRadiusScale ?? 1)
    const strength = THREE.MathUtils.clamp(options.strength ?? 1, 0.05, 1.4)
    const mergeRadius = options.mergeRadius ?? 0

    if (mergeRadius > 0) {
      const mergeRadiusSq = mergeRadius * mergeRadius
      for (const burn of this.burns) {
        const dx = burn.x - x
        const dz = burn.z - z
        if (dx * dx + dz * dz > mergeRadiusSq) continue
        burn.x = THREE.MathUtils.lerp(burn.x, x, 0.35)
        burn.z = THREE.MathUtils.lerp(burn.z, z, 0.35)
        burn.radius = Math.max(burn.radius, radius)
        burn.maxRadius = Math.max(burn.maxRadius, maxRadius)
        burn.strength = Math.min(1.35, Math.max(burn.strength, strength))
        return
      }
    }

    this.burns.unshift({ x, z, radius, maxRadius, strength })
    if (this.burns.length > MAX_BURNS) {
      this.burns.length = MAX_BURNS
    }
  }

  clearBurns(): void {
    this.burns.length = 0
  }

  hasBurns(): boolean {
    return this.burns.length > 0
  }

  update(elapsedTime: number, getGroundHeight: (x: number, z: number) => number): void {
    const delta = this.lastElapsed === 0 ? 0 : Math.min(0.05, Math.max(0, elapsedTime - this.lastElapsed))
    this.lastElapsed = elapsedTime
    this.updateBurns(delta)
    this.updateFungus(getGroundHeight)
  }

  dispose(): void {
    this.fungusGeometry.dispose()
    this.fungusMaterial.dispose()
  }

  private updateBurns(delta: number): void {
    if (delta > 0) {
      for (const burn of this.burns) {
        const growth = this.params.burnSpreadSpeed * delta * (0.6 + burn.strength * 0.95)
        burn.radius = Math.min(burn.maxRadius, burn.radius + growth)
      }
    }
    updateRecoveringImpacts(this.burns, this.params.recoveryRate, delta, 0.02)
  }

  private getSlotMaxWidth(slot: SurfaceLayoutSlot): number {
    return slot.spanSize * BASE_LAYOUT_PX_PER_WORLD * this.params.layoutDensity
  }

  private burnFieldAt(x: number, z: number): { burn: number; front: number } {
    if (this.burns.length === 0) return { burn: 0, front: 0 }

    let burn = 0
    let front = 0
    for (const impact of this.burns) {
      const radius = Math.max(0.001, impact.radius)
      const distance = Math.hypot(x - impact.x, z - impact.z)
      if (distance > radius + 0.8) continue

      const localBurn =
        impact.strength * Math.pow(1 - THREE.MathUtils.smoothstep(distance, 0, radius), 0.55)
      burn = Math.max(burn, localBurn)

      const frontWidth = Math.max(0.22, radius * 0.34)
      const frontDistance = Math.abs(distance - radius)
      const localFront =
        impact.strength * Math.pow(1 - THREE.MathUtils.smoothstep(frontDistance, 0, frontWidth), 0.7)
      front = Math.max(front, localFront)
    }

    return {
      burn: THREE.MathUtils.clamp(burn, 0, 1),
      front: THREE.MathUtils.clamp(front, 0, 1),
    }
  }

  private updateFungus(getGroundHeight: (x: number, z: number) => number): void {
    if (
      this.params.layoutDensity <= 0 ||
      this.params.sizeScale <= 0 ||
      this.params.bandWidth <= 0
    ) {
      this.fungusMesh.count = 0
      this.fungusMesh.instanceMatrix.needsUpdate = true
      return
    }

    const rowStep = this.fieldDepth / (ROWS + 1)
    const backZ = this.fieldDepth * 0.48
    let instanceIndex = 0

    this.layoutDriver.forEachLaidOutLine({
      spanMin: -this.fieldWidth * 0.5,
      spanMax: this.fieldWidth * 0.5,
      lineCoordAtRow: (row) => backZ - row * rowStep,
      getMaxWidth: (slot) => this.getSlotMaxWidth(slot),
      onLine: ({ slot, resolvedGlyphs, tokenLineKey }) => {
        instanceIndex = this.projectLine(
          slot,
          resolvedGlyphs,
          tokenLineKey,
          rowStep,
          getGroundHeight,
          instanceIndex,
        )
      },
    })

    this.fungusMesh.count = instanceIndex
    this.fungusMesh.instanceMatrix.needsUpdate = true
    this.fungusBurnRimAttr.needsUpdate = true
    if (this.fungusMesh.instanceColor) {
      this.fungusMesh.instanceColor.needsUpdate = true
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
        this.fieldCenterX +
        slot.spanStart +
        t01 * slot.spanSize +
        lineLateralShift +
        (hashLat - 0.5) * slot.sectorStep * 0.46
      const z =
        this.fieldCenterZ +
        slot.lineCoord +
        (hashDep - 0.5) * rowStep * 0.62 +
        lineDepthShift
      if (!this.placementMask.includeAtXZ(x, z)) continue

      const signedDistance = this.placementMask.distanceToBandAtXZ(x, z)
      const coverage = smoothBandCoverage(Math.abs(signedDistance), halfWidth, edgeSoftness)
      if (coverage <= 0.02) continue

      const burnField = this.burnFieldAt(x, z)
      const remainingCoverage = coverage * (1 - burnField.burn * 0.995)
      if (remainingCoverage <= 0.09) continue
      /** Slight bias so wide bands stay visually dense at mid-coverage (forest seams). */
      const presenceGate = Math.min(1, remainingCoverage + 0.11)
      if (glyphHash(identity + 5, slot.row, k ^ 0x55) > presenceGate) continue

      const groundY = getGroundHeight(x, z)
      const yaw = hashYaw * Math.PI * 2
      const width = Math.max(
        0.03,
        (0.2 + coverage * 0.26 + meta.widthBias) *
          this.params.sizeScale *
          (1 - burnField.burn * 0.78 + burnField.front * 0.18),
      )
      const depth = Math.max(
        0.025,
        (0.16 + coverage * 0.18 + meta.heightBias * 0.18) *
          this.params.sizeScale *
          (1 - burnField.burn * 0.93 + burnField.front * 0.12),
      )
      const shrivel = burnField.burn * 0.62
      dummy.position.set(x, groundY + 0.028 + depth * (0.015 - shrivel * 0.024 + burnField.front * 0.012), z)
      dummy.rotation.set(
        -Math.PI / 2 + (hashDep - 0.5) * 0.14 + burnField.burn * 0.62 - burnField.front * 0.12,
        yaw,
        (hashLat - 0.5) * 0.08 + burnField.burn * 0.28,
      )
      dummy.scale.set(width, depth, 1)
      dummy.updateMatrix()
      this.fungusMesh.setMatrixAt(instanceIndex, dummy.matrix)
      this.fungusMesh.setColorAt(
        instanceIndex,
        fungusColor(identity, coverage, meta, burnField.burn, burnField.front),
      )
      const fungusBurnRim = THREE.MathUtils.clamp(
        burnField.burn * 0.9 + burnField.front * 0.5,
        0,
        1,
      )
      this.fungusBurnRimAttr.setX(instanceIndex, fungusBurnRim)
      instanceIndex++
    }

    return instanceIndex
  }
}

export type CreateFungusSeamEffectOptions = {
  seedCursor: SeedCursorFactory
  surface?: PreparedSurfaceSource<BandTokenId, BandTokenMeta>
  initialParams?: FungusSeamParams
  placementMask?: FungusSeamPlacementMask
}

export function createFungusSeamEffect({
  seedCursor,
  surface = getPreparedFungusBandSurface(),
  initialParams = DEFAULT_FUNGUS_SEAM_PARAMS,
  placementMask,
}: CreateFungusSeamEffectOptions): FungusSeamEffect {
  const effect = createSurfaceEffect({
    id: 'fungus-seam',
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

  return new FungusSeamEffect(effect.source, seedCursor, initialParams, placementMask)
}

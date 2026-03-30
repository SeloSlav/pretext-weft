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
  buildLeafPileSeasonSurface,
  type LeafPileSeason,
  type LeafPileTokenId,
  type LeafPileTokenMeta,
} from './leafPileBandSource'

export type LeafPileBandParams = {
  layoutDensity: number
  sizeScale: number
  bandWidth: number
  edgeSoftness: number
  season: LeafPileSeason
  disturbanceRadius: number
  disturbanceStrength: number
  displacementDistance: number
}

export const DEFAULT_LEAF_PILE_BAND_PARAMS: LeafPileBandParams = {
  layoutDensity: 1.15,
  sizeScale: 1.24,
  bandWidth: 3.35,
  edgeSoftness: 1.35,
  season: 'autumn',
  disturbanceRadius: 1.45,
  disturbanceStrength: 1.45,
  displacementDistance: 1.05,
}

export type LeafPileBandBounds = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export type LeafPileBandPlacementMask = {
  bounds?: LeafPileBandBounds
  includeAtXZ?: (x: number, z: number) => boolean
  distanceToBandAtXZ?: (x: number, z: number) => number
}

const DEFAULT_BOUNDS: LeafPileBandBounds = {
  minX: -28,
  maxX: 28,
  minZ: -28,
  maxZ: 28,
}

const ROWS = 22
const SECTORS = 30
const MAX_INSTANCES = 8_000
const BASE_LAYOUT_PX_PER_WORLD = 9
const MAX_ACTIVE_DISTURBANCES = 40
const tmpLocalPoint = new THREE.Vector3()

const tmpColor = new THREE.Color()
const dummy = new THREE.Object3D()

const SEASON_STYLE: Record<
  LeafPileSeason,
  {
    baseHue: number
    saturation: number
    lightness: number
    densityScale: number
    presence: number
    widthScale: number
    lengthScale: number
    lift: number
    leavesPerClump: number
    spread: number
  }
> = {
  spring: {
    baseHue: 0.27,
    saturation: 0.44,
    lightness: 0.34,
    densityScale: 0.86,
    presence: 0.82,
    widthScale: 0.96,
    lengthScale: 0.92,
    lift: 0.8,
    leavesPerClump: 6,
    spread: 0.96,
  },
  summer: {
    baseHue: 0.23,
    saturation: 0.38,
    lightness: 0.28,
    densityScale: 0.92,
    presence: 0.76,
    widthScale: 1,
    lengthScale: 0.96,
    lift: 0.72,
    leavesPerClump: 7,
    spread: 1,
  },
  autumn: {
    baseHue: 0.09,
    saturation: 0.58,
    lightness: 0.37,
    densityScale: 1.14,
    presence: 1,
    widthScale: 1.12,
    lengthScale: 1.08,
    lift: 1.08,
    leavesPerClump: 10,
    spread: 1.28,
  },
  winter: {
    baseHue: 0.085,
    saturation: 0.2,
    lightness: 0.25,
    densityScale: 0.7,
    presence: 0.62,
    widthScale: 0.84,
    lengthScale: 0.78,
    lift: 0.6,
    leavesPerClump: 5,
    spread: 0.82,
  },
}

type Disturbance = {
  x: number
  z: number
  radius: number
  strength: number
  displacement: number
}

export type LeafPileDisturbanceOptions = {
  radiusScale?: number
  strength?: number
  displacementScale?: number
  mergeRadius?: number
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

function makeLeafGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0.56)
  shape.bezierCurveTo(0.19, 0.46, 0.38, 0.18, 0.3, -0.04)
  shape.bezierCurveTo(0.22, -0.27, 0.08, -0.48, 0, -0.58)
  shape.bezierCurveTo(-0.08, -0.47, -0.24, -0.26, -0.3, -0.02)
  shape.bezierCurveTo(-0.38, 0.22, -0.18, 0.47, 0, 0.56)
  return new THREE.ShapeGeometry(shape)
}

function leafColor(
  identity: number,
  coverage: number,
  meta: LeafPileTokenMeta,
  season: LeafPileSeason,
): THREE.Color {
  const seasonStyle = SEASON_STYLE[season]
  const t = uhash(identity * 2654435761)
  const hue = seasonStyle.baseHue + (t - 0.5) * 0.06 + meta.hueShift
  const sat = seasonStyle.saturation + coverage * 0.16 + t * 0.08
  const light = seasonStyle.lightness + coverage * 0.12 + meta.lightShift
  return tmpColor.setHSL(hue, sat, light)
}

export class LeafPileBandEffect {
  readonly group = new THREE.Group()

  private readonly leafGeometry = makeLeafGeometry()
  private readonly leafMaterial = new THREE.MeshStandardMaterial({
    roughness: 0.96,
    metalness: 0.02,
    side: THREE.DoubleSide,
  })
  private readonly leafMesh = new THREE.InstancedMesh(this.leafGeometry, this.leafMaterial, MAX_INSTANCES)
  private readonly placementMask: Required<LeafPileBandPlacementMask>
  private readonly fieldWidth: number
  private readonly fieldDepth: number
  private readonly fieldCenterX: number
  private readonly fieldCenterZ: number
  private readonly seedCursor: SeedCursorFactory
  private layoutDriver: SurfaceLayoutDriver<LeafPileTokenId, LeafPileTokenMeta>
  private params: LeafPileBandParams
  private usesCustomSurface: boolean
  private readonly disturbances: Disturbance[] = []

  constructor(
    surface: PreparedSurfaceSource<LeafPileTokenId, LeafPileTokenMeta>,
    seedCursor: SeedCursorFactory,
    initialParams: LeafPileBandParams,
    placementMask: LeafPileBandPlacementMask = {},
    usesCustomSurface = false,
  ) {
    this.params = { ...initialParams }
    this.seedCursor = seedCursor
    this.usesCustomSurface = usesCustomSurface
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
    this.layoutDriver = this.createLayoutDriver(surface)

    this.leafMesh.frustumCulled = false
    this.leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.group.add(this.leafMesh)
  }

  setParams(params: Partial<LeafPileBandParams>): void {
    const prevSeason = this.params.season
    this.params = { ...this.params, ...params }
    if (this.params.season !== prevSeason && !this.usesCustomSurface) {
      this.layoutDriver = this.createLayoutDriver(buildLeafPileSeasonSurface(this.params.season))
    }
  }

  setSurface(surface: PreparedSurfaceSource<LeafPileTokenId, LeafPileTokenMeta>): void {
    this.usesCustomSurface = true
    this.layoutDriver = this.createLayoutDriver(surface)
  }

  clearDisturbances(): void {
    this.disturbances.length = 0
  }

  addDisturbanceFromWorldPoint(
    worldPoint: THREE.Vector3,
    options: LeafPileDisturbanceOptions = {},
  ): void {
    tmpLocalPoint.copy(worldPoint)
    this.group.worldToLocal(tmpLocalPoint)
    const x = THREE.MathUtils.clamp(tmpLocalPoint.x, -this.fieldWidth * 0.48, this.fieldWidth * 0.48)
    const z = THREE.MathUtils.clamp(tmpLocalPoint.z, -this.fieldDepth * 0.48, this.fieldDepth * 0.48)
    const radius = this.params.disturbanceRadius * (options.radiusScale ?? 1)
    const strength = this.params.disturbanceStrength * (options.strength ?? 1)
    const displacement = this.params.displacementDistance * (options.displacementScale ?? 1)
    const mergeRadius = options.mergeRadius ?? 0

    if (mergeRadius > 0) {
      const mergeRadiusSq = mergeRadius * mergeRadius
      for (const disturbance of this.disturbances) {
        const dx = disturbance.x - x
        const dz = disturbance.z - z
        if (dx * dx + dz * dz > mergeRadiusSq) continue
        disturbance.x = THREE.MathUtils.lerp(disturbance.x, x, 0.35)
        disturbance.z = THREE.MathUtils.lerp(disturbance.z, z, 0.35)
        disturbance.radius = Math.max(disturbance.radius, radius)
        disturbance.strength = Math.max(disturbance.strength, strength)
        disturbance.displacement = Math.max(disturbance.displacement, displacement)
        return
      }
    }

    this.disturbances.unshift({ x, z, radius, strength, displacement })
    if (this.disturbances.length > MAX_ACTIVE_DISTURBANCES) {
      this.disturbances.length = MAX_ACTIVE_DISTURBANCES
    }
  }

  update(_elapsedTime: number, getGroundHeight: (x: number, z: number) => number): void {
    if (
      this.params.layoutDensity <= 0 ||
      this.params.sizeScale <= 0 ||
      this.params.bandWidth <= 0
    ) {
      this.leafMesh.count = 0
      this.leafMesh.instanceMatrix.needsUpdate = true
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
        instanceIndex = this.projectLine(slot, resolvedGlyphs, tokenLineKey, rowStep, getGroundHeight, instanceIndex)
      },
    })

    this.leafMesh.count = instanceIndex
    this.leafMesh.instanceMatrix.needsUpdate = true
    if (this.leafMesh.instanceColor) {
      this.leafMesh.instanceColor.needsUpdate = true
    }
  }

  dispose(): void {
    this.leafGeometry.dispose()
    this.leafMaterial.dispose()
  }

  private createLayoutDriver(surface: PreparedSurfaceSource<LeafPileTokenId, LeafPileTokenMeta>) {
    return new SurfaceLayoutDriver({
      surface,
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 9 + 5,
      seedCursor: this.seedCursor,
      staggerFactor: 0.58,
      minSpanFactor: 0.3,
    })
  }

  private getSlotMaxWidth(slot: SurfaceLayoutSlot): number {
    return (
      slot.spanSize *
      BASE_LAYOUT_PX_PER_WORLD *
      this.params.layoutDensity *
      SEASON_STYLE[this.params.season].densityScale
    )
  }

  private getLeafDisplacement(x: number, z: number, fallbackAngle: number) {
    if (this.disturbances.length === 0) {
      return { offsetX: 0, offsetZ: 0, push: 0 }
    }

    let offsetX = 0
    let offsetZ = 0
    let strongestPush = 0
    for (const disturbance of this.disturbances) {
      const dx = x - disturbance.x
      const dz = z - disturbance.z
      const radius = Math.max(0.001, disturbance.radius)
      const distanceSq = dx * dx + dz * dz
      if (distanceSq > radius * radius) continue

      const distance = Math.sqrt(distanceSq)
      const falloff = 1 - THREE.MathUtils.smoothstep(distance, 0, radius)
      const push = disturbance.strength * falloff * falloff
      let dirX = 0
      let dirZ = 0
      if (distance > 1e-4) {
        dirX = dx / distance
        dirZ = dz / distance
      } else {
        dirX = Math.cos(fallbackAngle)
        dirZ = Math.sin(fallbackAngle)
      }
      offsetX += dirX * disturbance.displacement * push
      offsetZ += dirZ * disturbance.displacement * push
      strongestPush = Math.max(strongestPush, push)
    }

    const maxOffset = this.params.displacementDistance * 2.15
    const offsetLength = Math.hypot(offsetX, offsetZ)
    if (offsetLength > maxOffset) {
      const s = maxOffset / offsetLength
      offsetX *= s
      offsetZ *= s
    }
    return { offsetX, offsetZ, push: strongestPush }
  }

  private projectLine(
    slot: SurfaceLayoutSlot,
    resolvedGlyphs: readonly ResolvedSurfaceGlyph<LeafPileTokenId, LeafPileTokenMeta>[],
    tokenLineKey: string,
    rowStep: number,
    getGroundHeight: (x: number, z: number) => number,
    instanceIndex: number,
  ): number {
    const n = resolvedGlyphs.length
    const lineSeed = lineSignature(tokenLineKey)
    const lineLateralShift = (lineSeed - 0.5) * slot.sectorStep * 0.34
    const lineDepthShift = (lineSeed - 0.5) * rowStep * 0.22
    const halfWidth = this.params.bandWidth * 0.5
    const edgeSoftness = Math.max(0.02, this.params.edgeSoftness)
    const seasonStyle = SEASON_STYLE[this.params.season]

    for (let k = 0; k < n; k++) {
      if (instanceIndex >= MAX_INSTANCES) break

      const token = resolvedGlyphs[k]!
      const identity = token.ordinal + 1
      const { meta } = token

      const hashLat = glyphHash(identity, slot.row, k)
      const hashDep = glyphHash(identity + 1, slot.sector, k ^ 0xab)
      const hashYaw = glyphHash(identity + 2, slot.row ^ slot.sector, k + 17)

      const t01 = THREE.MathUtils.clamp((k + hashLat * 0.85 + 0.08) / (n + 0.1), 0.02, 0.98)
      const clumpX =
        this.fieldCenterX +
        slot.spanStart +
        t01 * slot.spanSize +
        lineLateralShift +
        (hashLat - 0.5) * slot.sectorStep * 0.56
      const clumpZ =
        this.fieldCenterZ +
        slot.lineCoord +
        (hashDep - 0.5) * rowStep * 0.72 +
        lineDepthShift
      if (!this.placementMask.includeAtXZ(clumpX, clumpZ)) continue

      const signedDistance = this.placementMask.distanceToBandAtXZ(clumpX, clumpZ)
      const coverage = smoothBandCoverage(Math.abs(signedDistance), halfWidth, edgeSoftness)
      if (coverage <= 0.02) continue
      if (glyphHash(identity + 5, slot.row, k ^ 0x55) > coverage * seasonStyle.presence) continue

      const leavesInClump = Math.min(
        14,
        Math.max(5, seasonStyle.leavesPerClump + Math.floor((coverage - 0.25) * 4 + hashYaw * 3)),
      )
      const spreadScale = seasonStyle.spread * 1.15

      for (let leafIndex = 0; leafIndex < leavesInClump; leafIndex++) {
        if (instanceIndex >= MAX_INSTANCES) break

        const leafHashA = glyphHash(identity + 7, leafIndex, slot.row, k)
        const leafHashB = glyphHash(identity + 9, leafIndex, slot.sector, k ^ 0x31)
        const leafHashC = glyphHash(identity + 11, leafIndex, slot.row ^ slot.sector, k ^ 0x57)
        const leafHashD = glyphHash(identity + 13, leafIndex, slot.sector + 3, k ^ 0x73)

        const radius =
          (0.04 + coverage * 0.1 + Math.max(-0.02, meta.widthBias) * 0.3) *
          this.params.sizeScale *
          spreadScale *
          (0.45 + leafHashB * 0.95)
        const angle = leafHashA * Math.PI * 2
        const baseLeafX = clumpX + Math.cos(angle) * radius
        const baseLeafZ = clumpZ + Math.sin(angle) * radius
        const displacement = this.getLeafDisplacement(baseLeafX, baseLeafZ, angle)
        const leafX = baseLeafX + displacement.offsetX
        const leafZ = baseLeafZ + displacement.offsetZ
        const groundY = getGroundHeight(leafX, leafZ)
        const pushAngle =
          displacement.push > 0.001 ? Math.atan2(displacement.offsetZ, displacement.offsetX) : angle
        const width = Math.max(
          0.06,
          (0.11 + coverage * 0.1 + meta.widthBias * 0.35) *
            this.params.sizeScale *
            seasonStyle.widthScale *
            (0.72 + leafHashC * 0.6),
        )
        const length = Math.max(
          0.08,
          (0.13 + coverage * 0.12 + meta.heightBias * 0.26) *
            this.params.sizeScale *
            seasonStyle.lengthScale *
            (0.84 + leafHashD * 0.44),
        )
        const stackLift =
          Math.max(0.004, 0.007 + coverage * 0.01 + meta.liftBias * 0.018) *
          seasonStyle.lift *
          (1 + leafIndex * 0.05)
        const pitch =
          -Math.PI / 2 + (leafHashB - 0.5) * 0.28 + meta.curlBias * 0.22 + displacement.push * 0.32
        const yaw = leafHashC * Math.PI * 2 + displacement.push * 0.28 + pushAngle * 0.22
        const roll = (leafHashD - 0.5) * 1.35 + meta.curlBias * 0.4 + displacement.push * 0.38

        dummy.position.set(leafX, groundY + stackLift, leafZ)
        dummy.rotation.set(pitch, yaw, roll)
        dummy.scale.set(width, length, 1)
        dummy.updateMatrix()
        this.leafMesh.setMatrixAt(instanceIndex, dummy.matrix)
        this.leafMesh.setColorAt(
          instanceIndex,
          leafColor(identity + leafIndex * 17, coverage, meta, this.params.season),
        )
        instanceIndex++
      }
    }

    return instanceIndex
  }
}

export type CreateLeafPileBandEffectOptions = {
  seedCursor: SeedCursorFactory
  surface?: PreparedSurfaceSource<LeafPileTokenId, LeafPileTokenMeta>
  initialParams?: LeafPileBandParams
  placementMask?: LeafPileBandPlacementMask
}

export function createLeafPileBandEffect({
  seedCursor,
  surface,
  initialParams = DEFAULT_LEAF_PILE_BAND_PARAMS,
  placementMask,
}: CreateLeafPileBandEffectOptions): LeafPileBandEffect {
  const resolvedSurface = surface ?? buildLeafPileSeasonSurface(initialParams.season)
  const effect = createSurfaceEffect({
    id: 'leaf-pile-band',
    source: resolvedSurface,
    layout: fieldLayout({
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 9 + 5,
      staggerFactor: 0.58,
      minSpanFactor: 0.3,
    }),
    seedCursor,
  })

  return new LeafPileBandEffect(
    effect.source,
    seedCursor,
    initialParams,
    placementMask,
    surface !== undefined,
  )
}

import * as THREE from 'three'
import type {
  PreparedSurfaceSource,
  ResolvedSurfaceGlyph,
  SeedCursorFactory,
  SurfaceLayoutSlot,
} from '../../core'
import { createWorldField, SurfaceLayoutDriver } from '../../core'
import { updateRecoveringImpacts } from '../../runtime'
import { createSurfaceEffect, fieldLayout } from '../api'
import {
  getPreparedNeedleLitterSurface,
  type NeedleLitterTokenId,
  type NeedleLitterTokenMeta,
} from './needleLitterFieldSource'

export type NeedleLitterFieldParams = {
  layoutDensity: number
  sizeScale: number
  recoveryRate: number
  burnRadius: number
  burnSpreadSpeed: number
  burnMaxRadius: number
}

export const DEFAULT_NEEDLE_LITTER_FIELD_PARAMS: NeedleLitterFieldParams = {
  layoutDensity: 1.05,
  sizeScale: 1,
  recoveryRate: 0.075,
  burnRadius: 0.52,
  burnSpreadSpeed: 2.1,
  burnMaxRadius: 3.2,
}

export type NeedleLitterFieldBounds = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export type NeedleLitterFieldPlacementMask = {
  bounds?: NeedleLitterFieldBounds
  includeAtXZ?: (x: number, z: number) => boolean
}

export type NeedleLitterBurnOptions = {
  radiusScale?: number
  maxRadiusScale?: number
  strength?: number
  mergeRadius?: number
}

type NeedleBurn = {
  x: number
  z: number
  radius: number
  maxRadius: number
  strength: number
}

const DEFAULT_NEEDLE_LITTER_FIELD_BOUNDS: NeedleLitterFieldBounds = {
  minX: -28,
  maxX: 28,
  minZ: -28,
  maxZ: 28,
}

const ROWS = 20
const SECTORS = 24
const MAX_INSTANCES = 4_800
const BASE_LAYOUT_PX_PER_WORLD = 8.2
const MAX_BURNS = 24
const tmpLocalPoint = new THREE.Vector3()

const tmpColor = new THREE.Color()
const tmpAshColor = new THREE.Color()
const tmpEmberColor = new THREE.Color()
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

const needleOrganicWorldField = createWorldField(1703, {
  scale: 5.8,
  octaves: 4,
  roughness: 0.6,
  warpAmplitude: 1.3,
  warpScale: 5.1,
  contrast: 1.06,
})

function makeNeedleGeometry(): THREE.BufferGeometry {
  // Needles are passive scenery, so keep their render path intentionally cheap.
  return new THREE.ConeGeometry(0.5, 1, 3, 1)
}

function needleColor(
  identity: number,
  noise: number,
  meta: NeedleLitterTokenMeta,
  burn: number,
  ember: number,
): THREE.Color {
  if (burn > 0.82) {
    return tmpAshColor.setHSL(0.08 + ember * 0.04, 0.05 + ember * 0.15, 0.1 + ember * 0.28)
  }
  if (ember > 0.04) {
    return tmpEmberColor.setHSL(0.06 + ember * 0.03, 0.78, 0.2 + ember * 0.26)
  }
  const t = uhash(identity * 2654435761)
  const hue = 0.09 + t * 0.035 + meta.warmth
  const sat = 0.3 + noise * 0.12 + meta.coneBias * 0.08
  const light = 0.16 + noise * 0.12 + t * 0.06
  return tmpColor.setHSL(hue, sat, light)
}

export class NeedleLitterFieldEffect {
  readonly group = new THREE.Group()

  private readonly needleGeometry = makeNeedleGeometry()
  private readonly needleMaterial = new THREE.MeshLambertMaterial()
  private readonly needleMesh = new THREE.InstancedMesh(
    this.needleGeometry,
    this.needleMaterial,
    MAX_INSTANCES,
  )
  private readonly placementMask: Required<NeedleLitterFieldPlacementMask>
  private readonly fieldWidth: number
  private readonly fieldDepth: number
  private readonly fieldCenterX: number
  private readonly fieldCenterZ: number
  private readonly layoutDriver: SurfaceLayoutDriver<NeedleLitterTokenId, NeedleLitterTokenMeta>
  private readonly burns: NeedleBurn[] = []
  private params: NeedleLitterFieldParams
  private lastElapsed = 0

  constructor(
    surface: PreparedSurfaceSource<NeedleLitterTokenId, NeedleLitterTokenMeta>,
    seedCursor: SeedCursorFactory,
    initialParams: NeedleLitterFieldParams,
    placementMask: NeedleLitterFieldPlacementMask = {},
  ) {
    this.params = { ...initialParams }
    const bounds = placementMask.bounds ?? DEFAULT_NEEDLE_LITTER_FIELD_BOUNDS
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
      advanceForRow: (row) => row * 6 + 3,
      seedCursor,
      staggerFactor: 0.6,
      minSpanFactor: 0.38,
    })

    this.needleMesh.frustumCulled = false
    this.needleMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    this.group.add(this.needleMesh)
  }

  setParams(params: Partial<NeedleLitterFieldParams>): void {
    this.params = { ...this.params, ...params }
    for (const burn of this.burns) {
      burn.maxRadius = this.params.burnMaxRadius
    }
  }

  addBurnFromWorldPoint(worldPoint: THREE.Vector3, options: NeedleLitterBurnOptions = {}): void {
    tmpLocalPoint.copy(worldPoint)
    this.group.worldToLocal(tmpLocalPoint)
    const x = THREE.MathUtils.clamp(tmpLocalPoint.x, -this.fieldWidth * 0.48, this.fieldWidth * 0.48)
    const z = THREE.MathUtils.clamp(tmpLocalPoint.z, -this.fieldDepth * 0.48, this.fieldDepth * 0.48)
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
    if (delta > 0) {
      for (const burn of this.burns) {
        const growth = this.params.burnSpreadSpeed * delta * (0.6 + burn.strength * 0.9)
        burn.radius = Math.min(burn.maxRadius, burn.radius + growth)
      }
      updateRecoveringImpacts(this.burns, this.params.recoveryRate, delta, 0.02)
    }
    this.updateNeedles(getGroundHeight)
  }

  dispose(): void {
    this.needleGeometry.dispose()
    this.needleMaterial.dispose()
  }

  private getSlotMaxWidth(slot: SurfaceLayoutSlot): number {
    return slot.spanSize * BASE_LAYOUT_PX_PER_WORLD * this.params.layoutDensity
  }

  private burnFieldAt(x: number, z: number): { burn: number; ember: number } {
    if (this.burns.length === 0) return { burn: 0, ember: 0 }

    let burn = 0
    let ember = 0
    for (const impact of this.burns) {
      const radius = Math.max(0.001, impact.radius)
      const distance = Math.hypot(x - impact.x, z - impact.z)
      if (distance > radius + 0.7) continue

      const localBurn =
        impact.strength * Math.pow(1 - THREE.MathUtils.smoothstep(distance, 0, radius), 0.55)
      burn = Math.max(burn, localBurn)

      const emberWidth = Math.max(0.18, radius * 0.28)
      const emberDistance = Math.abs(distance - radius)
      const localEmber =
        impact.strength * Math.pow(1 - THREE.MathUtils.smoothstep(emberDistance, 0, emberWidth), 0.72)
      ember = Math.max(ember, localEmber)
    }

    return {
      burn: THREE.MathUtils.clamp(burn, 0, 1),
      ember: THREE.MathUtils.clamp(ember, 0, 1),
    }
  }

  private updateNeedles(getGroundHeight: (x: number, z: number) => number): void {
    if (this.params.layoutDensity <= 0 || this.params.sizeScale <= 0) {
      this.needleMesh.count = 0
      this.needleMesh.instanceMatrix.needsUpdate = true
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

    this.needleMesh.count = instanceIndex
    this.needleMesh.instanceMatrix.needsUpdate = true
    if (this.needleMesh.instanceColor) {
      this.needleMesh.instanceColor.needsUpdate = true
    }
  }

  private projectLine(
    slot: SurfaceLayoutSlot,
    resolvedGlyphs: readonly ResolvedSurfaceGlyph<NeedleLitterTokenId, NeedleLitterTokenMeta>[],
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
      const hashKeep = glyphHash(identity + 5, slot.row, k ^ 0x55)

      const t01 = THREE.MathUtils.clamp((k + hashLat * 0.88 + 0.08) / (n + 0.08), 0.02, 0.98)
      const centerX =
        this.fieldCenterX +
        slot.spanStart +
        t01 * slot.spanSize +
        lineLateralShift +
        (hashLat - 0.5) * slot.sectorStep * 0.44
      const centerZ =
        this.fieldCenterZ +
        slot.lineCoord +
        (hashDep - 0.5) * rowStep * 0.66 +
        lineDepthShift
      if (!this.placementMask.includeAtXZ(centerX, centerZ)) continue

      const noise = needleOrganicWorldField(centerX + hashOrg * 0.3, centerZ + hashOrg * 0.22)
      const burnField = this.burnFieldAt(centerX, centerZ)
      const remainingCoverage = Math.max(0, (0.32 + noise * 0.86) * (1 - burnField.burn * 0.985))
      if (remainingCoverage <= 0.04 || hashKeep > remainingCoverage) continue

      const clumpCount = THREE.MathUtils.clamp(1 + Math.round(noise * 2 + meta.coneBias * 2), 1, 4)
      for (let j = 0; j < clumpCount; j++) {
        if (instanceIndex >= MAX_INSTANCES) break
        const pieceHash = glyphHash(identity + j * 17, slot.row ^ j, slot.sector, k)
        const pieceAngle = lineSeed * Math.PI * 2 + j * 1.37 + pieceHash * Math.PI * 2
        const pieceDistance = (0.03 + pieceHash * 0.22 + Math.max(0, meta.coneBias) * 0.08) * this.params.sizeScale
        const x = centerX + Math.cos(pieceAngle) * pieceDistance
        const z = centerZ + Math.sin(pieceAngle) * pieceDistance
        if (!this.placementMask.includeAtXZ(x, z)) continue

        const pieceBurn = this.burnFieldAt(x, z)
        const pieceCoverage = Math.max(0, remainingCoverage * (1 - pieceBurn.burn * 0.92 + pieceBurn.ember * 0.08))
        if (pieceCoverage <= 0.05) continue

        const groundY = getGroundHeight(x, z)
        const baseRadius =
          (0.035 + meta.sizeBias * 0.18 + Math.max(0, meta.coneBias) * 0.05 + noise * 0.018) *
          this.params.sizeScale
        const radius = Math.max(0.014, baseRadius * (1 - pieceBurn.burn * 0.58))
        const length = Math.max(
          radius * 2.8,
          (0.12 + Math.max(0, meta.coneBias) * 0.18 + noise * 0.08 + pieceHash * 0.06) *
            this.params.sizeScale *
            (1 - pieceBurn.burn * 0.72 + pieceBurn.ember * 0.08),
        )
        const yaw = pieceAngle + (pieceHash - 0.5) * 0.5
        const pitch = Math.PI * 0.5 + (meta.coneBias - 0.5) * 0.12 + (noise - 0.5) * 0.24
        const roll = (pieceHash - 0.5) * 0.3

        dummy.position.set(x, groundY + radius * 0.18, z)
        dummy.rotation.set(pitch, yaw, roll)
        dummy.scale.set(radius * (0.9 + pieceHash * 0.18), length, radius * (0.8 + pieceHash * 0.24))
        dummy.updateMatrix()
        this.needleMesh.setMatrixAt(instanceIndex, dummy.matrix)
        this.needleMesh.setColorAt(
          instanceIndex,
          needleColor(identity + j * 19, noise, meta, pieceBurn.burn, pieceBurn.ember),
        )
        instanceIndex++
      }
    }

    return instanceIndex
  }
}

export type CreateNeedleLitterFieldEffectOptions = {
  seedCursor: SeedCursorFactory
  surface?: PreparedSurfaceSource<NeedleLitterTokenId, NeedleLitterTokenMeta>
  initialParams?: NeedleLitterFieldParams
  placementMask?: NeedleLitterFieldPlacementMask
}

export function createNeedleLitterFieldEffect({
  seedCursor,
  surface = getPreparedNeedleLitterSurface(),
  initialParams = DEFAULT_NEEDLE_LITTER_FIELD_PARAMS,
  placementMask,
}: CreateNeedleLitterFieldEffectOptions): NeedleLitterFieldEffect {
  const effect = createSurfaceEffect({
    id: 'needle-litter-field',
    source: surface,
    layout: fieldLayout({
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 6 + 3,
      staggerFactor: 0.6,
      minSpanFactor: 0.38,
    }),
    seedCursor,
  })

  return new NeedleLitterFieldEffect(effect.source, seedCursor, initialParams, placementMask)
}

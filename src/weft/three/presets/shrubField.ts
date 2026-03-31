import * as THREE from 'three'
import type {
  PreparedSurfaceSource,
  ResolvedSurfaceGlyph,
  SeedCursorFactory,
  SurfaceLayoutSlot,
} from '../../core'
import { createWorldField, SurfaceLayoutDriver } from '../../core'
import { decayRecoveringStrength } from '../../runtime'
import { createSurfaceEffect, fieldLayout } from '../api'
import { createBarkGrainTexture, warmBarkColor } from './barkShared'
import { createBurnRimInstancedAttribute, patchMeshStandardBurnNeonRim } from './burnNeonRim'
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
  burnRadius: number
  burnSpreadSpeed: number
  burnMaxRadius: number
  recoveryRate: number
}

export const DEFAULT_SHRUB_FIELD_PARAMS: ShrubFieldParams = {
  layoutDensity: 1,
  sizeScale: 2.25,
  heightScale: 3,
  burnRadius: 0.62,
  burnSpreadSpeed: 2.1,
  burnMaxRadius: 3.6,
  recoveryRate: 0.07,
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
const MAX_BURNS = 18
const BASE_LAYOUT_PX_PER_WORLD = 6.4
const BURN_RECOVERY_DELAY = 0.42

const tmpColor = new THREE.Color()
const tmpStemColor = new THREE.Color()
const tmpAshColor = new THREE.Color()
const tmpEmberColor = new THREE.Color()
const tmpCrispOrange = new THREE.Color()
const tmpBurnFieldA = { burn: 0, front: 0 }
const ZERO_BURN_FIELD = { burn: 0, front: 0 }
const dummy = new THREE.Object3D()
type ShrubFoliageBurn = {
  instanceId: number
  radius: number
  maxRadius: number
  strength: number
  age: number
}

export type ShrubFoliageBurnOptions = {
  instanceId?: number
  radiusScale?: number
  maxRadiusScale?: number
  strength?: number
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

/** Leaf-pile-style ember / ash response on top of seasonal shrub foliage. */
function shrubFoliageBurnColor(
  identity: number,
  noise: number,
  meta: ShrubTokenMeta,
  burn: number,
  front: number,
): THREE.Color {
  if (burn > 0.82) {
    return tmpAshColor.setHSL(0.08 + front * 0.05, 0.06 + front * 0.14, 0.1 + front * 0.3)
  }
  if (front > 0.035) {
    tmpEmberColor.setHSL(0.052 + front * 0.022, 0.93, 0.16 + front * 0.3)
    tmpEmberColor.lerp(tmpCrispOrange.setRGB(1, 0.34, 0.03), THREE.MathUtils.clamp(front * 0.55 + burn * 0.25, 0, 0.75))
    return tmpEmberColor
  }
  shrubLeafColor(identity, noise, meta)
  if (burn > 0.04) {
    tmpCrispOrange.setRGB(1, 0.36, 0.02)
    tmpColor.lerp(tmpCrispOrange, THREE.MathUtils.clamp(burn * 0.42 + front * 0.2, 0, 0.65))
  }
  return tmpColor
}

const SHRUB_BRANCH_GEOMS = makeShrubBranchedGeometries()

export class ShrubFieldEffect {
  readonly group = new THREE.Group()
  readonly foliageInteractionMesh: THREE.InstancedMesh

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
  private readonly leafBurnRimAttr: THREE.InstancedBufferAttribute
  private readonly placementMask: Required<ShrubFieldPlacementMask>
  private readonly fieldWidth: number
  private readonly fieldDepth: number
  private readonly fieldCenterX: number
  private readonly fieldCenterZ: number
  private layoutDriver: SurfaceLayoutDriver<ShrubTokenId, ShrubTokenMeta>
  private params: ShrubFieldParams
  private readonly burns: ShrubFoliageBurn[] = []
  private lastElapsed = 0

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
    this.leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.foliageInteractionMesh = this.leafMesh
    this.leafBurnRimAttr = createBurnRimInstancedAttribute(MAX_INSTANCES)
    this.leafGeometry.setAttribute('burnRim', this.leafBurnRimAttr)
    patchMeshStandardBurnNeonRim(this.leafMaterial, 'shrub-leaf')
    this.group.add(this.woodMesh)
    this.group.add(this.leafMesh)
  }

  setParams(params: Partial<ShrubFieldParams>): void {
    this.params = { ...this.params, ...params }
    for (const burn of this.burns) {
      burn.maxRadius = this.params.burnMaxRadius
    }
  }

  setSurface(surface: PreparedSurfaceSource<ShrubTokenId, ShrubTokenMeta>, seedCursor: SeedCursorFactory): void {
    this.layoutDriver = this.createLayoutDriver(surface, seedCursor)
  }

  update(elapsedTime: number, getGroundHeight: (x: number, z: number) => number): void {
    const delta = this.lastElapsed === 0 ? 0 : Math.min(0.05, Math.max(0, elapsedTime - this.lastElapsed))
    this.lastElapsed = elapsedTime
    if (delta > 0) {
      for (let i = this.burns.length - 1; i >= 0; i--) {
        const burn = this.burns[i]!
        burn.age += delta
        const growth = this.params.burnSpreadSpeed * delta * (0.6 + burn.strength * 0.9)
        burn.radius = Math.min(burn.maxRadius, burn.radius + growth)
        const readyToRecover =
          burn.age >= BURN_RECOVERY_DELAY && burn.radius >= burn.maxRadius * 0.85
        if (!readyToRecover || this.params.recoveryRate <= 0) continue
        burn.strength = decayRecoveringStrength(burn.strength, this.params.recoveryRate, delta)
        if (burn.strength <= 0.02) {
          this.burns.splice(i, 1)
        }
      }
    }
    this.updateShrubs(getGroundHeight)
  }

  addBurnFromWorldPoint(worldPoint: THREE.Vector3, options: ShrubFoliageBurnOptions = {}): void {
    void worldPoint
    const instanceId = options.instanceId
    if (instanceId == null || instanceId < 0) return
    const radius = this.params.burnRadius * (options.radiusScale ?? 1)
    const maxRadius = this.params.burnMaxRadius * (options.maxRadiusScale ?? 1)
    const strength = THREE.MathUtils.clamp(options.strength ?? 1, 0.05, 1.4)
    for (const burn of this.burns) {
      if (burn.instanceId !== instanceId) continue
      burn.radius = Math.max(burn.radius, radius)
      burn.maxRadius = Math.max(burn.maxRadius, maxRadius)
      burn.strength = Math.min(1.35, Math.max(burn.strength, strength))
      return
    }

    this.burns.unshift({ instanceId, radius, maxRadius, strength, age: 0 })
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

  private burnFieldAt(instanceId: number, target: { burn: number; front: number }) {
    if (this.burns.length === 0) {
      target.burn = 0
      target.front = 0
      return target
    }

    let burn = 0
    let front = 0
    for (const impact of this.burns) {
      if (impact.instanceId !== instanceId) continue
      const radius = Math.max(0.001, impact.radius)
      const distance = 0
      if (distance > radius + 0.85) continue

      const localBurn =
        impact.strength * Math.pow(1 - THREE.MathUtils.smoothstep(distance, 0, radius), 0.55)
      burn = Math.max(burn, localBurn)

      const frontWidth = Math.max(0.22, radius * 0.32)
      const frontDistance = Math.abs(distance - radius)
      const localFront =
        impact.strength * Math.pow(1 - THREE.MathUtils.smoothstep(frontDistance, 0, frontWidth), 0.72)
      front = Math.max(front, localFront)
    }

    target.burn = THREE.MathUtils.clamp(burn, 0, 1)
    target.front = THREE.MathUtils.clamp(front, 0, 1)
    return target
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
    this.leafBurnRimAttr.needsUpdate = true
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
    const hasBurns = this.burns.length > 0

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
      const burnField = hasBurns ? this.burnFieldAt(instanceIndex, tmpBurnFieldA) : ZERO_BURN_FIELD
      /** Per-instance scale (~0.36–1) so `sizeScale` reads as a max; keeps readable small/large mix. */
      const sizeVariety = 0.36 + hashVariety * 0.64
      const baseSize =
        (0.52 + noise * 0.38 + meta.sizeBias * 0.2) * sizeVariety * this.params.sizeScale
      const canopyWidth = Math.max(
        0.3,
        baseSize * (1.02 + meta.spreadBias * 0.44 + hashShape * 0.34),
      )
      const canopyHeight = Math.max(
        0.28,
        baseSize * (0.82 + meta.heightBias * 0.36 + noise * 0.3) * this.params.heightScale,
      )
      const canopyDepth = canopyWidth * (0.92 + noise * 0.2 + hashShape * 0.08)
      const leafRemaining = THREE.MathUtils.clamp(
        Math.pow(1 - burnField.burn, 1.75) + burnField.front * 0.06,
        0,
        1,
      )
      const leafDropHash = glyphHash(identity + 19, slot.row ^ slot.sector, k ^ 0x6d)
      const leafVisible = leafDropHash <= leafRemaining
      const yaw = lineSeed * Math.PI * 2 + k * 0.97 + noise * 1.15
      const leanX = (noise - 0.5) * 0.1
      const leanZ = (hashShape - 0.5) * 0.12

      dummy.position.set(x, groundY, z)
      dummy.rotation.set(leanX, yaw, leanZ)
      dummy.scale.set(
        canopyWidth,
        canopyHeight,
        canopyDepth,
      )
      dummy.updateMatrix()
      this.woodMesh.setMatrixAt(instanceIndex, dummy.matrix)
      this.woodMesh.setColorAt(instanceIndex, warmBarkColor(identity, noise, meta.warmth, tmpStemColor))

      dummy.scale.set(
        leafVisible ? canopyWidth : 0,
        leafVisible ? canopyHeight : 0,
        leafVisible ? canopyDepth : 0,
      )
      dummy.updateMatrix()
      this.leafMesh.setMatrixAt(instanceIndex, dummy.matrix)
      this.leafMesh.setColorAt(
        instanceIndex,
        shrubFoliageBurnColor(identity, noise, meta, burnField.burn, burnField.front),
      )
      const leafBurnRim = THREE.MathUtils.clamp(
        (leafVisible ? burnField.burn * 0.9 : 0) + burnField.front * 0.45,
        0,
        1,
      )
      this.leafBurnRimAttr.setX(instanceIndex, leafBurnRim)

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

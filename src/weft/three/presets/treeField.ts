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
import { makeTreeCrownBranchedGeometries, TREE_CROWN_LOCAL_EXTENT_Y } from './branchedFoliageGeometry'
import {
  createTreeBarkSurfaceEffect,
  DEFAULT_TREE_BARK_SURFACE_PARAMS,
  type TreeBarkPlacement,
} from './treeBarkSurface'
import {
  getPreparedTreeSurface,
  type TreeTokenId,
  type TreeTokenMeta,
} from './treeFieldSource'

export type TreeFieldParams = {
  layoutDensity: number
  sizeScale: number
  heightScale: number
  crownScale: number
  trunkBurnRadius: number
  trunkBurnSpreadSpeed: number
  trunkBurnMaxRadius: number
  trunkBurnRecoveryRate: number
}

export const DEFAULT_TREE_FIELD_PARAMS: TreeFieldParams = {
  layoutDensity: 0.6,
  sizeScale: 1.25,
  heightScale: 1.3,
  crownScale: 1.2,
  trunkBurnRadius: 0.38,
  trunkBurnSpreadSpeed: 0.14,
  trunkBurnMaxRadius: 2.4,
  trunkBurnRecoveryRate: 0.014,
}

export type TreeFieldBounds = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export type TreeFieldPlacementMask = {
  bounds?: TreeFieldBounds
  includeAtXZ?: (x: number, z: number) => boolean
}

const DEFAULT_TREE_FIELD_BOUNDS: TreeFieldBounds = {
  minX: -28,
  maxX: 28,
  minZ: -28,
  maxZ: 28,
}

const ROWS = 20
const SECTORS = 24
const MAX_INSTANCES = 1_800
const BASE_LAYOUT_PX_PER_WORLD = 4.2

const tmpColor = new THREE.Color()
const tmpPlacementQuat = new THREE.Quaternion()
const tmpPlacementEuler = new THREE.Euler()
const tmpPlacementBasisX = new THREE.Vector3()
const tmpPlacementBasisY = new THREE.Vector3()
const tmpPlacementBasisZ = new THREE.Vector3()
const tmpHitLocal = new THREE.Vector3()
const dummy = new THREE.Object3D()

export type TreeTrunkBurnOptions = {
  radiusScale?: number
  maxRadiusScale?: number
  strength?: number
  mergeRadius?: number
  recoveryRate?: number
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

function ellipseCircumference(radiusX: number, radiusZ: number): number {
  const a = Math.max(radiusX, 0.0001)
  const b = Math.max(radiusZ, 0.0001)
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)))
}

const treeOrganicWorldField = createWorldField(1427, {
  scale: 8.4,
  octaves: 4,
  roughness: 0.52,
  warpAmplitude: 1.55,
  warpScale: 6.4,
  ridge: 0.14,
  contrast: 1.08,
})

function makeTrunkGeometry(): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 1, false)
}

// warmth encodes season: spring ~ -0.18, summer ~ -0.06, autumn ~ +0.55, winter ~ -0.72
function treeCrownColor(identity: number, noise: number, meta: TreeTokenMeta): THREE.Color {
  const t = uhash(identity * 2654435761)
  const w = meta.warmth

  let hue: number, sat: number, light: number

  if (w >= 0.3) {
    // Autumn — vivid orange, some red/yellow variety
    hue = 0.07 + t * 0.05 + meta.crownBias * 0.03
    sat = 0.82 + noise * 0.12 + meta.crownBias * 0.06
    light = 0.46 + noise * 0.08 + t * 0.06
  } else if (w <= -0.5) {
    // Winter — near-white, cold grey
    hue = 0.58 + t * 0.04
    sat = 0.06 + noise * 0.06
    light = 0.72 + noise * 0.10 + t * 0.08
  } else if (w <= -0.1) {
    // Spring — bright yellow-green
    hue = 0.28 + t * 0.05 + meta.crownBias * 0.02
    sat = 0.72 + noise * 0.14
    light = 0.46 + noise * 0.10 + t * 0.06
  } else {
    // Summer — deep rich green
    hue = 0.26 + t * 0.05 + meta.crownBias * 0.02
    sat = 0.62 + noise * 0.14
    light = 0.32 + noise * 0.10 + t * 0.06
  }

  return tmpColor.setHSL(hue, sat, light)
}

const TREE_CROWN_GEOMS = makeTreeCrownBranchedGeometries()

export class TreeFieldEffect {
  readonly group = new THREE.Group()
  readonly trunkInteractionMesh: THREE.InstancedMesh

  private readonly barkSurfaceEffect: ReturnType<typeof createTreeBarkSurfaceEffect>
  private readonly trunkBarkTexture = createBarkGrainTexture()
  private readonly trunkGeometry = makeTrunkGeometry()
  private readonly trunkMaterial = new THREE.MeshLambertMaterial({
    map: this.trunkBarkTexture,
    emissive: '#5c3a18',
    emissiveIntensity: 0.28,
  })
  private readonly trunkMesh: THREE.InstancedMesh
  private readonly crownWoodGeometry = TREE_CROWN_GEOMS.wood
  private readonly crownLeafGeometry = TREE_CROWN_GEOMS.leaves
  /** Same bark tile as trunk; small branch cylinders in the crown read as continuous wood. */
  private readonly crownWoodMaterial = new THREE.MeshLambertMaterial({
    map: this.trunkBarkTexture,
    emissive: '#5c3a18',
    emissiveIntensity: 0.28,
  })
  /** Same leaf silhouette + shading model as `shrubField` / `leafPileBand`. */
  private readonly crownLeafMaterial = new THREE.MeshStandardMaterial({
    roughness: 0.96,
    metalness: 0.02,
    side: THREE.DoubleSide,
  })
  private readonly crownWoodMesh: THREE.InstancedMesh
  private readonly crownLeafMesh: THREE.InstancedMesh
  private readonly placementMask: Required<TreeFieldPlacementMask>
  private readonly fieldWidth: number
  private readonly fieldDepth: number
  private readonly fieldCenterX: number
  private readonly fieldCenterZ: number
  private layoutDriver: SurfaceLayoutDriver<TreeTokenId, TreeTokenMeta>
  private placementsDirty = true
  private params: TreeFieldParams
  private readonly treePlacements: TreeBarkPlacement[] = []

  constructor(
    surface: PreparedSurfaceSource<TreeTokenId, TreeTokenMeta>,
    seedCursor: SeedCursorFactory,
    initialParams: TreeFieldParams,
    placementMask: TreeFieldPlacementMask = {},
  ) {
    this.params = { ...initialParams }
    const bounds = placementMask.bounds ?? DEFAULT_TREE_FIELD_BOUNDS
    this.fieldWidth = bounds.maxX - bounds.minX
    this.fieldDepth = bounds.maxZ - bounds.minZ
    this.fieldCenterX = (bounds.minX + bounds.maxX) * 0.5
    this.fieldCenterZ = (bounds.minZ + bounds.maxZ) * 0.5
    this.placementMask = {
      bounds,
      includeAtXZ: placementMask.includeAtXZ ?? (() => true),
    }
    this.layoutDriver = this.createLayoutDriver(surface, seedCursor)
    this.barkSurfaceEffect = createTreeBarkSurfaceEffect({
      seedCursor,
      initialParams: this.barkSurfaceParamsFromTreeParams(initialParams),
      showBarkMesh: false,
    })

    this.trunkMesh = new THREE.InstancedMesh(this.trunkGeometry, this.trunkMaterial, MAX_INSTANCES)
    this.trunkMesh.frustumCulled = false
    this.trunkMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    this.trunkInteractionMesh = this.trunkMesh
    this.crownWoodMesh = new THREE.InstancedMesh(this.crownWoodGeometry, this.crownWoodMaterial, MAX_INSTANCES)
    this.crownWoodMesh.frustumCulled = false
    this.crownWoodMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    this.crownLeafMesh = new THREE.InstancedMesh(this.crownLeafGeometry, this.crownLeafMaterial, MAX_INSTANCES)
    this.crownLeafMesh.frustumCulled = false
    this.crownLeafMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    this.group.add(this.trunkMesh)
    this.group.add(this.barkSurfaceEffect.group)
    this.group.add(this.crownWoodMesh)
    this.group.add(this.crownLeafMesh)
  }

  setParams(params: Partial<TreeFieldParams>): void {
    this.params = { ...this.params, ...params }
    this.barkSurfaceEffect.setParams(this.barkSurfaceParamsFromTreeParams(this.params))
    this.placementsDirty = true
  }

  setSurface(surface: PreparedSurfaceSource<TreeTokenId, TreeTokenMeta>, seedCursor: SeedCursorFactory): void {
    this.layoutDriver = this.createLayoutDriver(surface, seedCursor)
    this.placementsDirty = true
  }

  update(elapsedTime: number, getGroundHeight: (x: number, z: number) => number, rebuildPlacements = false): void {
    if (rebuildPlacements || this.placementsDirty) {
      this.updateTrees(getGroundHeight)
      this.barkSurfaceEffect.setPlacements(this.treePlacements)
      this.placementsDirty = false
    }
    this.barkSurfaceEffect.update(elapsedTime)
  }

  hasTrunkBurns(): boolean {
    return this.barkSurfaceEffect.hasWounds()
  }

  clearTrunkBurns(): void {
    this.barkSurfaceEffect.clearWounds()
  }

  addTrunkWoundFromRaycastHit(
    hit: THREE.Intersection<THREE.Object3D>,
    worldDirection: THREE.Vector3,
    options: TreeTrunkBurnOptions = {},
  ): boolean {
    const instanceId = hit.instanceId
    if (instanceId == null) return false
    const placement = this.treePlacements[instanceId]
    if (!placement || !hit.point) return false

    tmpHitLocal.copy(hit.point).sub(placement.center)
    const localX = tmpHitLocal.dot(placement.basisX)
    const localY = tmpHitLocal.dot(placement.basisY)
    const localZ = tmpHitLocal.dot(placement.basisZ)
    const theta = Math.atan2(localZ / Math.max(placement.radiusZ, 0.0001), localX / Math.max(placement.radiusX, 0.0001))
    const circumference = ellipseCircumference(placement.radiusX, placement.radiusZ)
    const u = (theta / (Math.PI * 2)) * circumference
    const v = THREE.MathUtils.clamp(localY, -placement.trunkHeight * 0.5, placement.trunkHeight * 0.5)

    this.barkSurfaceEffect.addWound(placement.key, u, v, {
      radiusScale: options.radiusScale,
      maxRadiusScale: options.maxRadiusScale,
      strength: options.strength,
      mergeRadius: options.mergeRadius,
      recoveryRate: options.recoveryRate,
      directionX: worldDirection.x,
      directionY: worldDirection.y,
      directionZ: worldDirection.z,
    })
    return true
  }

  dispose(): void {
    this.barkSurfaceEffect.dispose()
    this.trunkBarkTexture.dispose()
    this.trunkGeometry.dispose()
    this.trunkMaterial.dispose()
    this.crownWoodGeometry.dispose()
    this.crownLeafGeometry.dispose()
    this.crownWoodMaterial.dispose()
    this.crownLeafMaterial.dispose()
  }

  private getSlotMaxWidth(slot: SurfaceLayoutSlot): number {
    return slot.spanSize * BASE_LAYOUT_PX_PER_WORLD * this.params.layoutDensity
  }

  private createLayoutDriver(
    surface: PreparedSurfaceSource<TreeTokenId, TreeTokenMeta>,
    seedCursor: SeedCursorFactory,
  ) {
    return new SurfaceLayoutDriver({
      surface,
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 9 + 5,
      seedCursor,
      staggerFactor: 0.64,
      minSpanFactor: 0.42,
    })
  }

  private barkSurfaceParamsFromTreeParams(params: TreeFieldParams) {
    return {
      ...DEFAULT_TREE_BARK_SURFACE_PARAMS,
      woundRadius: params.trunkBurnRadius,
      woundSpreadSpeed: params.trunkBurnSpreadSpeed,
      woundMaxRadius: params.trunkBurnMaxRadius,
      recoveryRate: params.trunkBurnRecoveryRate,
    }
  }

  private updateTrees(getGroundHeight: (x: number, z: number) => number): void {
    if (
      this.params.layoutDensity <= 0 ||
      this.params.sizeScale <= 0 ||
      this.params.heightScale <= 0 ||
      this.params.crownScale <= 0
    ) {
      this.trunkMesh.count = 0
      this.trunkMesh.instanceMatrix.needsUpdate = true
      this.crownWoodMesh.count = 0
      this.crownLeafMesh.count = 0
      this.crownWoodMesh.instanceMatrix.needsUpdate = true
      this.crownLeafMesh.instanceMatrix.needsUpdate = true
      this.treePlacements.length = 0
      return
    }

    const rowStep = this.fieldDepth / (ROWS + 1.05)
    const backZ = this.fieldDepth * 0.48
    let instanceIndex = 0
    this.treePlacements.length = 0

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

    this.trunkMesh.count = instanceIndex
    this.trunkMesh.instanceMatrix.needsUpdate = true
    if (this.trunkMesh.instanceColor) {
      this.trunkMesh.instanceColor.needsUpdate = true
    }
    this.crownWoodMesh.count = instanceIndex
    this.crownLeafMesh.count = instanceIndex
    this.crownWoodMesh.instanceMatrix.needsUpdate = true
    this.crownLeafMesh.instanceMatrix.needsUpdate = true
    if (this.crownWoodMesh.instanceColor) {
      this.crownWoodMesh.instanceColor.needsUpdate = true
    }
    if (this.crownLeafMesh.instanceColor) {
      this.crownLeafMesh.instanceColor.needsUpdate = true
    }
  }

  private projectLine(
    slot: SurfaceLayoutSlot,
    resolvedGlyphs: readonly ResolvedSurfaceGlyph<TreeTokenId, TreeTokenMeta>[],
    tokenLineKey: string,
    rowStep: number,
    getGroundHeight: (x: number, z: number) => number,
    instanceIndex: number,
  ): number {
    const n = resolvedGlyphs.length
    const lineSeed = lineSignature(tokenLineKey)
    const lineLateralShift = (lineSeed - 0.5) * slot.sectorStep * 0.18
    const lineDepthShift = (lineSeed - 0.5) * rowStep * 0.12

    for (let k = 0; k < n; k++) {
      if (instanceIndex >= MAX_INSTANCES) break

      const token = resolvedGlyphs[k]!
      const identity = token.ordinal + 1
      const { meta } = token
      const hashLat = glyphHash(identity, slot.row, k)
      const hashDep = glyphHash(identity + 1, slot.sector, k ^ 0xab)
      const hashOrg = glyphHash(identity + 2, slot.row ^ slot.sector, k + 17)
      const hashKeep = glyphHash(identity + 3, slot.row + slot.sector, k ^ 0x11)
      const hashForm = glyphHash(identity + 5, slot.sector + 5, k ^ 0x57)

      const t01 = THREE.MathUtils.clamp((k + hashLat * 0.82 + 0.1) / (n + 0.12), 0.02, 0.98)
      const x =
        this.fieldCenterX +
        slot.spanStart +
        t01 * slot.spanSize +
        lineLateralShift +
        (hashLat - 0.5) * slot.sectorStep * 0.22
      const z =
        this.fieldCenterZ +
        slot.lineCoord +
        (hashDep - 0.5) * rowStep * 0.44 +
        lineDepthShift
      if (!this.placementMask.includeAtXZ(x, z)) continue

      const noise = treeOrganicWorldField(x + hashOrg * 0.24, z + hashOrg * 0.18)
      const keepChance = THREE.MathUtils.clamp(0.34 + noise * 0.42 + meta.crownBias * 0.14, 0.16, 0.86)
      if (hashKeep > keepChance) continue

      const groundY = getGroundHeight(x, z)
      const trunkHeight = Math.max(
        1.4,
        (2.8 + noise * 2.4 + meta.trunkBias * 1.8 + hashForm * 0.9) * this.params.sizeScale * this.params.heightScale,
      )
      const trunkRadius = Math.max(
        0.28,
        (0.36 + meta.trunkBias * 0.18 + noise * 0.12) * this.params.sizeScale,
      )
      const crownWidth = Math.max(
        0.9,
        trunkHeight * (0.42 + meta.spreadBias * 0.16 + noise * 0.08) * this.params.crownScale,
      )
      const crownHeight = Math.max(
        1.1,
        trunkHeight * (0.48 + meta.crownBias * 0.12 + noise * 0.08) * this.params.crownScale,
      )
      const yaw = lineSeed * Math.PI * 2 + k * 1.11 + noise * 0.8
      const leanX = (noise - 0.5) * 0.08
      const leanZ = (hashForm - 0.5) * 0.1
      const crownYaw = yaw + (hashForm - 0.5) * 0.22
      const rz = trunkRadius * (0.88 + hashForm * 0.2)

      const placement =
        this.treePlacements[instanceIndex] ??
        ({
          key: '',
          identity: 0,
          warmth: 0,
          noise: 0,
          center: new THREE.Vector3(),
          basisX: new THREE.Vector3(),
          basisY: new THREE.Vector3(),
          basisZ: new THREE.Vector3(),
          trunkHeight: 0,
          radiusX: 0,
          radiusZ: 0,
        } satisfies TreeBarkPlacement)
      this.treePlacements[instanceIndex] = placement
      placement.key = `${slot.row}:${slot.sector}:${tokenLineKey}:${k}`
      placement.identity = identity
      placement.warmth = meta.warmth
      placement.noise = noise
      placement.center.set(x, groundY + trunkHeight * 0.5, z)
      tmpPlacementEuler.set(leanX, yaw, leanZ)
      tmpPlacementQuat.setFromEuler(tmpPlacementEuler)
      tmpPlacementBasisX.set(1, 0, 0).applyQuaternion(tmpPlacementQuat)
      tmpPlacementBasisY.set(0, 1, 0).applyQuaternion(tmpPlacementQuat)
      tmpPlacementBasisZ.set(0, 0, 1).applyQuaternion(tmpPlacementQuat)
      placement.basisX.copy(tmpPlacementBasisX)
      placement.basisY.copy(tmpPlacementBasisY)
      placement.basisZ.copy(tmpPlacementBasisZ)
      placement.trunkHeight = trunkHeight
      placement.radiusX = trunkRadius
      placement.radiusZ = rz

      dummy.position.copy(placement.center)
      dummy.quaternion.copy(tmpPlacementQuat)
      dummy.scale.set(trunkRadius, trunkHeight, rz)
      dummy.updateMatrix()
      this.trunkMesh.setMatrixAt(instanceIndex, dummy.matrix)
      warmBarkColor(identity, noise, meta.warmth, tmpColor)
      this.trunkMesh.setColorAt(instanceIndex, tmpColor)

      const ex = TREE_CROWN_LOCAL_EXTENT_Y
      const crownZ = crownWidth * (0.94 + noise * 0.14 + hashForm * 0.08)
      dummy.position.set(x, groundY + trunkHeight, z)
      dummy.rotation.set(leanX * 0.45, crownYaw, leanZ * 0.4)
      dummy.scale.set(crownWidth / ex, crownHeight / ex, crownZ / ex)
      dummy.updateMatrix()
      this.crownWoodMesh.setMatrixAt(instanceIndex, dummy.matrix)
      this.crownWoodMesh.setColorAt(instanceIndex, warmBarkColor(identity, noise + 0.05, meta.warmth, tmpColor))
      this.crownLeafMesh.setMatrixAt(instanceIndex, dummy.matrix)
      this.crownLeafMesh.setColorAt(instanceIndex, treeCrownColor(identity, noise, meta))

      instanceIndex++
    }

    return instanceIndex
  }
}

export type CreateTreeFieldEffectOptions = {
  seedCursor: SeedCursorFactory
  surface?: PreparedSurfaceSource<TreeTokenId, TreeTokenMeta>
  initialParams?: TreeFieldParams
  placementMask?: TreeFieldPlacementMask
}

export function createTreeFieldEffect({
  seedCursor,
  surface = getPreparedTreeSurface(),
  initialParams = DEFAULT_TREE_FIELD_PARAMS,
  placementMask,
}: CreateTreeFieldEffectOptions): TreeFieldEffect {
  const effect = createSurfaceEffect({
    id: 'tree-field',
    source: surface,
    layout: fieldLayout({
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 9 + 5,
      staggerFactor: 0.64,
      minSpanFactor: 0.42,
    }),
    seedCursor,
  })

  return new TreeFieldEffect(effect.source, seedCursor, initialParams, placementMask)
}

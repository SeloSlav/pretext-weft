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
  getPreparedTreeSurface,
  type TreeTokenId,
  type TreeTokenMeta,
} from './treeFieldSource'

export type TreeFieldParams = {
  layoutDensity: number
  sizeScale: number
  heightScale: number
  crownScale: number
}

export const DEFAULT_TREE_FIELD_PARAMS: TreeFieldParams = {
  layoutDensity: 0.6,
  sizeScale: 1.25,
  heightScale: 1.3,
  crownScale: 1.2,
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
const tmpBarkColor = new THREE.Color()
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
  return new THREE.CylinderGeometry(0.32, 0.54, 1, 8, 1)
}

function makeCrownGeometry(): THREE.BufferGeometry {
  return new THREE.SphereGeometry(0.5, 7, 5)
}

function treeCrownColor(identity: number, noise: number, meta: TreeTokenMeta): THREE.Color {
  const t = uhash(identity * 2654435761)
  const hue = 0.24 + t * 0.06 + meta.warmth
  const seasonalFade = Math.max(0, -meta.warmth)
  const seasonalDryness = Math.max(0, meta.warmth)
  const sat = 0.32 + noise * 0.16 + meta.crownBias * 0.04 + seasonalDryness * 0.4 - seasonalFade * 0.52
  const light = 0.18 + noise * 0.16 + t * 0.08 + seasonalDryness * 0.08 + seasonalFade * 0.22
  return tmpColor.setHSL(hue, sat, light)
}

function treeBarkColor(identity: number, noise: number, meta: TreeTokenMeta): THREE.Color {
  const t = uhash(identity * 2246822519)
  return tmpBarkColor.setHSL(0.075 + meta.warmth * 0.18 + t * 0.01, 0.24 + noise * 0.06, 0.12 + t * 0.08)
}

export class TreeFieldEffect {
  readonly group = new THREE.Group()

  private readonly trunkGeometry = makeTrunkGeometry()
  private readonly crownGeometry = makeCrownGeometry()
  private readonly trunkMaterial = new THREE.MeshLambertMaterial()
  private readonly crownMaterial = new THREE.MeshLambertMaterial()
  private readonly trunkMesh = new THREE.InstancedMesh(this.trunkGeometry, this.trunkMaterial, MAX_INSTANCES)
  private readonly crownMesh = new THREE.InstancedMesh(this.crownGeometry, this.crownMaterial, MAX_INSTANCES)
  private readonly placementMask: Required<TreeFieldPlacementMask>
  private readonly fieldWidth: number
  private readonly fieldDepth: number
  private readonly fieldCenterX: number
  private readonly fieldCenterZ: number
  private layoutDriver: SurfaceLayoutDriver<TreeTokenId, TreeTokenMeta>
  private params: TreeFieldParams

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

    this.trunkMesh.frustumCulled = false
    this.crownMesh.frustumCulled = false
    this.trunkMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    this.crownMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    this.group.add(this.trunkMesh)
    this.group.add(this.crownMesh)
  }

  setParams(params: Partial<TreeFieldParams>): void {
    this.params = { ...this.params, ...params }
  }

  setSurface(surface: PreparedSurfaceSource<TreeTokenId, TreeTokenMeta>, seedCursor: SeedCursorFactory): void {
    this.layoutDriver = this.createLayoutDriver(surface, seedCursor)
  }

  update(getGroundHeight: (x: number, z: number) => number): void {
    this.updateTrees(getGroundHeight)
  }

  dispose(): void {
    this.trunkGeometry.dispose()
    this.crownGeometry.dispose()
    this.trunkMaterial.dispose()
    this.crownMaterial.dispose()
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

  private updateTrees(getGroundHeight: (x: number, z: number) => number): void {
    if (
      this.params.layoutDensity <= 0 ||
      this.params.sizeScale <= 0 ||
      this.params.heightScale <= 0 ||
      this.params.crownScale <= 0
    ) {
      this.trunkMesh.count = 0
      this.crownMesh.count = 0
      this.trunkMesh.instanceMatrix.needsUpdate = true
      this.crownMesh.instanceMatrix.needsUpdate = true
      return
    }

    const rowStep = this.fieldDepth / (ROWS + 1.05)
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

    this.trunkMesh.count = instanceIndex
    this.crownMesh.count = instanceIndex
    this.trunkMesh.instanceMatrix.needsUpdate = true
    this.crownMesh.instanceMatrix.needsUpdate = true
    if (this.trunkMesh.instanceColor) {
      this.trunkMesh.instanceColor.needsUpdate = true
    }
    if (this.crownMesh.instanceColor) {
      this.crownMesh.instanceColor.needsUpdate = true
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
      const crownColor = treeCrownColor(identity, noise, meta)
      const barkColor = treeBarkColor(identity, noise, meta)

      dummy.position.set(x, groundY + trunkHeight * 0.5, z)
      dummy.rotation.set(leanX, yaw, leanZ)
      dummy.scale.set(trunkRadius, trunkHeight, trunkRadius * (0.88 + hashForm * 0.2))
      dummy.updateMatrix()
      this.trunkMesh.setMatrixAt(instanceIndex, dummy.matrix)
      this.trunkMesh.setColorAt(instanceIndex, barkColor)

      dummy.position.set(x, groundY + trunkHeight * 0.78 + crownHeight * 0.24, z)
      dummy.rotation.set(leanX * 0.45, crownYaw, leanZ * 0.4)
      dummy.scale.set(crownWidth, crownHeight, crownWidth * (0.94 + noise * 0.14 + hashForm * 0.08))
      dummy.updateMatrix()
      this.crownMesh.setMatrixAt(instanceIndex, dummy.matrix)
      this.crownMesh.setColorAt(instanceIndex, crownColor)

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

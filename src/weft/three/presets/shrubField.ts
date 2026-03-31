import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
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

const _bA = new THREE.Vector3()
const _bB = new THREE.Vector3()
const _bMid = new THREE.Vector3()
const _bDir = new THREE.Vector3()
const _bAxis = new THREE.Vector3()
const _bQuat = new THREE.Quaternion()
const _bY = new THREE.Vector3(0, 1, 0)
const _bScale = new THREE.Vector3(1, 1, 1)
const _bMat = new THREE.Matrix4()
const _bUp = new THREE.Vector3(0, 1, 0)
const _forkAxis = new THREE.Vector3()

function disposeGeometryList(geoms: THREE.BufferGeometry[]): void {
  for (const g of geoms) g.dispose()
}

function pushCylinderBetween(
  out: THREE.BufferGeometry[],
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  r0: number,
  r1: number,
): void {
  _bA.set(ax, ay, az)
  _bB.set(bx, by, bz)
  _bMid.addVectors(_bA, _bB).multiplyScalar(0.5)
  const len = _bA.distanceTo(_bB)
  if (len < 1e-5) return
  const cyl = new THREE.CylinderGeometry(r0, r1, len, 5, 1)
  _bDir.subVectors(_bB, _bA).normalize()
  _bQuat.setFromUnitVectors(_bY, _bDir)
  _bMat.compose(_bMid, _bQuat, _bScale)
  cyl.applyMatrix4(_bMat)
  out.push(cyl)
}

function pushLeafPair(
  out: THREE.BufferGeometry[],
  cx: number,
  cy: number,
  cz: number,
  outward: THREE.Vector3,
  spread: number,
): void {
  const n = outward.clone().normalize()
  const base = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
  const w = 0.11 * spread
  const h = 0.15 * spread
  for (let i = 0; i < 2; i++) {
    const plane = new THREE.PlaneGeometry(w, h)
    const q = base.clone().multiply(
      new THREE.Quaternion().setFromAxisAngle(n, i * Math.PI * 0.5 + 0.18),
    )
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), q, new THREE.Vector3(1, 1, 1))
    plane.applyMatrix4(m)
    out.push(plane)
  }
}

/**
 * Procedural shrub silhouette: tapered trunk, radial primary branches, sub-branches, and crossed leaf quads at tips.
 * Local space: Y up, ground at y = 0, total extent ~1 unit tall for consistent scaling in the field.
 */
function makeShrubBranchedGeometries(): { wood: THREE.BufferGeometry; leaves: THREE.BufferGeometry } {
  const wood: THREE.BufferGeometry[] = []
  const leaves: THREE.BufferGeometry[] = []

  const trunkH = 0.2
  const trunkR0 = 0.11
  const trunkR1 = 0.072
  pushCylinderBetween(wood, 0, 0, 0, 0, trunkH, 0, trunkR0, trunkR1)

  const trunkTop = trunkH * 0.92
  const primaryN = 6
  const primaryLen = 0.36
  const primaryR0 = 0.048
  const primaryR1 = 0.028

  const primaryTips: THREE.Vector3[] = []

  for (let i = 0; i < primaryN; i++) {
    const theta = (i / primaryN) * Math.PI * 2 + 0.41
    const elev = 0.38 + Math.sin(i * 1.7 + 0.3) * 0.08
    const horiz = Math.cos(elev)
    _bDir.set(Math.cos(theta) * horiz, Math.sin(elev), Math.sin(theta) * horiz).normalize()

    const sx = _bDir.x * primaryLen * 0.06
    const sz = _bDir.z * primaryLen * 0.06
    const bx = sx + _bDir.x * primaryLen
    const by = trunkTop + _bDir.y * primaryLen
    const bz = sz + _bDir.z * primaryLen
    pushCylinderBetween(wood, sx, trunkTop, sz, bx, by, bz, primaryR0, primaryR1)
    primaryTips.push(new THREE.Vector3(bx, by, bz))

    _forkAxis.crossVectors(_bDir, _bUp)
    if (_forkAxis.lengthSq() < 1e-4) _forkAxis.set(1, 0, 0)
    else _forkAxis.normalize()

    for (let s = 0; s < 2; s++) {
      const fork = s === 0 ? 0.52 : -0.48
      const t = 0.58 + s * 0.12
      const ox = sx + _bDir.x * primaryLen * t
      const oy = trunkTop + _bDir.y * primaryLen * t
      const oz = sz + _bDir.z * primaryLen * t

      const subDir = _bDir.clone().applyAxisAngle(_forkAxis, fork + (s - 0.5) * 0.12).normalize()
      const subLen = primaryLen * (0.48 + (s === 0 ? 0.06 : 0))
      const subR0 = 0.026
      const subR1 = 0.014
      const ex = ox + subDir.x * subLen
      const ey = oy + subDir.y * subLen
      const ez = oz + subDir.z * subLen
      pushCylinderBetween(wood, ox, oy, oz, ex, ey, ez, subR0, subR1)

      _bAxis.crossVectors(subDir, _bUp)
      if (_bAxis.lengthSq() < 1e-5) _bAxis.set(1, 0, 0)
      else _bAxis.normalize()
      const twigDir = subDir.clone().applyAxisAngle(_bAxis, 0.35 + s * 0.1).normalize()
      const twLen = subLen * 0.42
      const tx = ex + twigDir.x * twLen * 0.35
      const ty = ey + twigDir.y * twLen * 0.35
      const tz = ez + twigDir.z * twLen * 0.35
      pushCylinderBetween(wood, ex, ey, ez, tx, ty, tz, subR1 * 0.9, subR1 * 0.45)

      const tip = new THREE.Vector3(tx, ty, tz)
      const out = tip.clone().normalize()
      pushLeafPair(leaves, tip.x, tip.y, tip.z, out, 0.95 + s * 0.08)

      const micro = twigDir.clone().multiplyScalar(0.14)
      pushLeafPair(leaves, ex + micro.x * 0.5, ey + micro.y * 0.5, ez + micro.z * 0.5, out, 0.72)
    }

    if (i % 2 === 0) {
      const mid = new THREE.Vector3(sx, trunkTop, sz).add(
        new THREE.Vector3(_bDir.x, _bDir.y, _bDir.z).multiplyScalar(primaryLen * 0.88),
      )
      const out = mid.clone().normalize()
      pushLeafPair(leaves, mid.x, mid.y, mid.z, out, 0.78)
    }
  }

  for (let i = 0; i < primaryN; i += 2) {
    const tip = primaryTips[i]!
    const out = tip.clone().normalize()
    pushLeafPair(leaves, tip.x, tip.y, tip.z, out, 0.88)
  }

  const mergedWood = mergeGeometries(wood)
  const mergedLeaves = mergeGeometries(leaves)
  disposeGeometryList(wood)
  disposeGeometryList(leaves)

  if (!mergedWood || !mergedLeaves) {
    mergedWood?.dispose()
    mergedLeaves?.dispose()
    return {
      wood: new THREE.CylinderGeometry(0.1, 0.12, 0.25, 5, 1),
      leaves: new THREE.PlaneGeometry(0.12, 0.12),
    }
  }

  mergedWood.computeVertexNormals()
  mergedLeaves.computeVertexNormals()
  return { wood: mergedWood, leaves: mergedLeaves }
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

function shrubLeafColor(identity: number, noise: number, meta: ShrubTokenMeta): THREE.Color {
  const t = uhash(identity * 2654435761)
  // Ghibli shrub foliage: bright warm greens, some variety into blue-green
  const hue = 0.27 + t * 0.06 + meta.warmth * 0.06
  const seasonalFade = Math.max(0, -meta.warmth)
  const seasonalDryness = Math.max(0, meta.warmth)
  const sat = 0.52 + noise * 0.2 + meta.spreadBias * 0.06 + seasonalDryness * 0.2 - seasonalFade * 0.28
  const light = 0.38 + noise * 0.18 + t * 0.08 + seasonalDryness * 0.05 + seasonalFade * 0.16
  return tmpColor.setHSL(hue, sat, light)
}

function shrubStemColor(identity: number, noise: number): THREE.Color {
  const t = uhash(identity * 2246822519)
  // Ghibli stems: warm olive-tan, clearly visible
  return tmpStemColor.setHSL(0.09 + t * 0.02, 0.34 + noise * 0.1, 0.40 + t * 0.12)
}

const SHRUB_BRANCH_GEOMS = makeShrubBranchedGeometries()

export class ShrubFieldEffect {
  readonly group = new THREE.Group()

  private readonly woodGeometry = SHRUB_BRANCH_GEOMS.wood
  private readonly leafGeometry = SHRUB_BRANCH_GEOMS.leaves
  private readonly woodMaterial = new THREE.MeshLambertMaterial({ emissive: '#4a2e0e', emissiveIntensity: 0.24 })
  private readonly leafMaterial = new THREE.MeshLambertMaterial({
    emissive: '#2a5a10',
    emissiveIntensity: 0.34,
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
      this.woodMesh.setColorAt(instanceIndex, shrubStemColor(identity, noise))

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

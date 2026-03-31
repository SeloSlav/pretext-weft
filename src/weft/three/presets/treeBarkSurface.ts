import * as THREE from 'three'
import type { PreparedSurfaceSource, ResolvedSurfaceGlyph, SeedCursorFactory, SurfaceLayoutSlot } from '../../core'
import { SurfaceLayoutDriver } from '../../core'
import { updateRecoveringImpacts } from '../../runtime'
import { createSurfaceEffect, recoverableDamage, wallLayout } from '../api'
import { createBarkGrainTexture, warmBarkColor } from './barkShared'
import { smoothPulse } from './sharedMath'
import {
  getPreparedTreeBarkSurface,
  type TreeBarkTokenId,
  type TreeBarkTokenMeta,
} from './treeBarkSurfaceSource'

const ROWS = 18
const SECTORS = 24
const MAX_BARK_INSTANCES = 36_000
const MAX_SCORCH_INSTANCES = 128
const HOLE_THRESHOLD = 0.5
const LAYOUT_PX_PER_WORLD = 30
const BASE_LIFT = 0.012
const MIN_ACTIVE_VISIBILITY = 0.02

const tmpColor = new THREE.Color()
const tmpCharcoal = new THREE.Color()
const tmpOrange = new THREE.Color()
const tmpPos = new THREE.Vector3()
const tmpTangent = new THREE.Vector3()
const tmpNormal = new THREE.Vector3()
const tmpBitangent = new THREE.Vector3()
const tmpQuatMat = new THREE.Matrix4()
const scorchPlaneNormal = new THREE.Vector3(0, 0, 1)
const dummy = new THREE.Object3D()

export type TreeBarkPlacement = {
  key: string
  identity: number
  warmth: number
  noise: number
  center: THREE.Vector3
  basisX: THREE.Vector3
  basisY: THREE.Vector3
  basisZ: THREE.Vector3
  trunkHeight: number
  radiusX: number
  radiusZ: number
}

export type TreeBarkSurfaceParams = {
  woundRadius: number
  woundNarrow: number
  woundDepth: number
  scaleLift: number
  recoveryRate: number
  woundSpreadSpeed: number
  woundMaxRadius: number
}

export const DEFAULT_TREE_BARK_SURFACE_PARAMS: TreeBarkSurfaceParams = {
  woundRadius: 0.16,
  woundNarrow: 0.26,
  woundDepth: 0.12,
  scaleLift: 0.16,
  recoveryRate: 0.014,
  woundSpreadSpeed: 0.035,
  woundMaxRadius: 0.42,
}

export type TreeBarkWoundOptions = {
  radiusScale?: number
  maxRadiusScale?: number
  strength?: number
  mergeRadius?: number
  recoveryRate?: number
  directionX?: number
  directionY?: number
  directionZ?: number
}

type BarkWound = {
  u: number
  v: number
  radius: number
  maxRadius: number
  strength: number
  recoveryRate?: number
  directionX: number
  directionY: number
  directionZ: number
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

function makeBarkChipGeometry(): THREE.BufferGeometry {
  const geom = new THREE.PlaneGeometry(1, 1, 1, 3)
  const pos = geom.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const y01 = y + 0.5
    const taper = 1 - Math.max(0, y01 - 0.18) * 0.14
    const curl = Math.sin(y01 * Math.PI) * 0.05
    pos.setXYZ(i, x * taper, y, curl)
  }
  pos.needsUpdate = true
  geom.computeVertexNormals()
  return geom
}

function createScorchTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas)
    fallback.colorSpace = THREE.SRGBColorSpace
    return fallback
  }

  const cx = size * 0.5
  const cy = size * 0.5
  const r = size * 0.48
  const burn = ctx.createRadialGradient(cx, cy, r * 0.08, cx, cy, r)
  burn.addColorStop(0, 'rgba(18,12,10,0.98)')
  burn.addColorStop(0.38, 'rgba(34,22,18,0.86)')
  burn.addColorStop(0.62, 'rgba(78,34,18,0.42)')
  burn.addColorStop(0.8, 'rgba(235,112,34,0.58)')
  burn.addColorStop(0.92, 'rgba(255,174,72,0.18)')
  burn.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = burn
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function ellipseCircumference(rx: number, rz: number): number {
  const a = Math.max(rx, rz)
  const b = Math.min(rx, rz)
  const h = ((a - b) * (a - b)) / ((a + b) * (a + b) + 1e-6)
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(Math.max(1e-6, 4 - 3 * h))))
}

function ellipseRadiusAt(theta: number, rx: number, rz: number): number {
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  return 1 / Math.sqrt((c * c) / Math.max(rx * rx, 1e-6) + (s * s) / Math.max(rz * rz, 1e-6))
}

function wrappedArcDelta(a: number, b: number, circumference: number): number {
  const delta = Math.abs(a - b)
  return Math.min(delta, Math.max(0, circumference - delta))
}

type BarkFieldSample = {
  damage: number
  hole: number
  offset: number
  scorch: number
  rim: number
}

export class TreeBarkSurfaceEffect {
  readonly group = new THREE.Group()

  private readonly barkTexture = createBarkGrainTexture()
  private readonly scorchTexture = createScorchTexture()
  private readonly barkGeometry = makeBarkChipGeometry()
  private readonly barkMaterial = new THREE.MeshLambertMaterial({
    map: this.barkTexture,
    emissive: '#5c3a18',
    emissiveIntensity: 0.28,
    side: THREE.DoubleSide,
  })
  private readonly barkMesh = new THREE.InstancedMesh(this.barkGeometry, this.barkMaterial, MAX_BARK_INSTANCES)
  private readonly scorchGeometry = new THREE.PlaneGeometry(1, 1)
  private readonly scorchMaterial = new THREE.MeshBasicMaterial({
    map: this.scorchTexture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
  private readonly scorchMesh = new THREE.InstancedMesh(this.scorchGeometry, this.scorchMaterial, MAX_SCORCH_INSTANCES)
  private layoutDriver: SurfaceLayoutDriver<TreeBarkTokenId, TreeBarkTokenMeta>
  private params: TreeBarkSurfaceParams
  private readonly woundsByTree = new Map<string, BarkWound[]>()
  private readonly placements = new Map<string, TreeBarkPlacement>()
  private lastElapsedTime = 0

  constructor(
    surface: PreparedSurfaceSource<TreeBarkTokenId, TreeBarkTokenMeta>,
    seedCursor: SeedCursorFactory,
    initialParams: TreeBarkSurfaceParams,
  ) {
    this.layoutDriver = this.createLayoutDriver(surface, seedCursor)
    this.params = { ...initialParams }
    this.barkMesh.frustumCulled = false
    this.barkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.scorchMesh.frustumCulled = false
    this.scorchMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.scorchMesh.renderOrder = 7
    this.group.add(this.barkMesh)
    this.group.add(this.scorchMesh)
  }

  setPlacements(placements: readonly TreeBarkPlacement[]): void {
    this.placements.clear()
    for (const placement of placements) {
      this.placements.set(placement.key, placement)
    }
  }

  setSurface(surface: PreparedSurfaceSource<TreeBarkTokenId, TreeBarkTokenMeta>, seedCursor: SeedCursorFactory): void {
    this.layoutDriver = this.createLayoutDriver(surface, seedCursor)
  }

  setParams(params: Partial<TreeBarkSurfaceParams>): void {
    this.params = { ...this.params, ...params }
  }

  hasWounds(): boolean {
    for (const wounds of this.woundsByTree.values()) {
      if (wounds.length > 0) return true
    }
    return false
  }

  clearWounds(): void {
    this.woundsByTree.clear()
    this.barkMesh.count = 0
    this.scorchMesh.count = 0
    this.barkMesh.instanceMatrix.needsUpdate = true
    this.scorchMesh.instanceMatrix.needsUpdate = true
  }

  addWound(
    treeKey: string,
    u: number,
    v: number,
    options: TreeBarkWoundOptions = {},
  ): void {
    const placement = this.placements.get(treeKey)
    if (!placement) return

    const wounds = this.woundsByTree.get(treeKey) ?? []
    const circumference = ellipseCircumference(placement.radiusX, placement.radiusZ)
    const trunkSpanCap = Math.min(circumference * 0.1, placement.trunkHeight * 0.09)
    const radius = Math.min(this.params.woundRadius * (options.radiusScale ?? 1), Math.max(0.06, trunkSpanCap))
    const maxRadius = Math.min(
      this.params.woundMaxRadius * (options.maxRadiusScale ?? 1),
      Math.max(radius * 1.15, Math.min(circumference * 0.14, placement.trunkHeight * 0.13)),
    )
    const strength = THREE.MathUtils.clamp(options.strength ?? 1, 0.05, 1.4)
    const mergeRadius = options.mergeRadius ?? 0
    const defaultRecovery = this.params.recoveryRate
    const incomingRecovery = options.recoveryRate !== undefined ? options.recoveryRate : defaultRecovery
    const dirLen = Math.hypot(options.directionX ?? 0, options.directionY ?? 0, options.directionZ ?? 0)
    const directionX = dirLen > 1e-6 ? -(options.directionX ?? 0) / dirLen : 0
    const directionY = dirLen > 1e-6 ? -(options.directionY ?? 0) / dirLen : 0
    const directionZ = dirLen > 1e-6 ? -(options.directionZ ?? 0) / dirLen : 1

    if (mergeRadius > 0) {
      const mergeRadiusSq = mergeRadius * mergeRadius
      for (const wound of wounds) {
        const du = wrappedArcDelta(u, wound.u, circumference)
        const dv = v - wound.v
        if (du * du + dv * dv > mergeRadiusSq) continue
        wound.u = THREE.MathUtils.lerp(wound.u, u, 0.22)
        wound.v = THREE.MathUtils.lerp(wound.v, v, 0.22)
        wound.radius = Math.max(wound.radius, radius)
        wound.maxRadius = Math.max(wound.maxRadius, maxRadius)
        wound.strength = Math.min(1.35, Math.max(wound.strength, strength))
        wound.directionX = THREE.MathUtils.lerp(wound.directionX, directionX, 0.25)
        wound.directionY = THREE.MathUtils.lerp(wound.directionY, directionY, 0.25)
        wound.directionZ = THREE.MathUtils.lerp(wound.directionZ, directionZ, 0.25)
        const rOld = wound.recoveryRate ?? defaultRecovery
        wound.recoveryRate = Math.min(rOld, incomingRecovery)
        this.woundsByTree.set(treeKey, wounds)
        return
      }
    }

    wounds.unshift({
      u,
      v,
      radius,
      maxRadius,
      strength,
      recoveryRate: options.recoveryRate,
      directionX,
      directionY,
      directionZ,
    })
    if (wounds.length > 12) {
      wounds.length = 12
    }
    this.woundsByTree.set(treeKey, wounds)
  }

  update(elapsedTime: number): void {
    const delta = this.lastElapsedTime === 0 ? 0 : Math.max(0, elapsedTime - this.lastElapsedTime)
    this.lastElapsedTime = elapsedTime
    this.updateWounds(delta)
    this.updateBark()
    this.updateScorchMarks()
  }

  dispose(): void {
    this.barkTexture.dispose()
    this.scorchTexture.dispose()
    this.barkGeometry.dispose()
    this.scorchGeometry.dispose()
    this.barkMaterial.dispose()
    this.scorchMaterial.dispose()
  }

  private createLayoutDriver(
    surface: PreparedSurfaceSource<TreeBarkTokenId, TreeBarkTokenMeta>,
    seedCursor: SeedCursorFactory,
  ): SurfaceLayoutDriver<TreeBarkTokenId, TreeBarkTokenMeta> {
    return new SurfaceLayoutDriver({
      surface,
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 13 + 7,
      seedCursor,
      staggerFactor: 0.5,
      minSpanFactor: 0.35,
    })
  }

  private updateWounds(delta: number): void {
    if (delta <= 0 || this.woundsByTree.size === 0) return
    for (const [key, wounds] of this.woundsByTree) {
      for (const wound of wounds) {
        const spreadMul = THREE.MathUtils.lerp(0.18, 1, Math.pow(wound.strength, 0.82))
        const growth = this.params.woundSpreadSpeed * delta * (0.25 + wound.strength * 0.35) * spreadMul
        wound.radius = Math.min(wound.maxRadius, wound.radius + growth)
      }
      updateRecoveringImpacts(wounds, this.params.recoveryRate, delta, 0.018)
      if (wounds.length === 0) {
        this.woundsByTree.delete(key)
      }
    }
  }

  private sampleField(
    placement: TreeBarkPlacement,
    wounds: readonly BarkWound[],
    u: number,
    v: number,
  ): BarkFieldSample {
    const circumference = ellipseCircumference(placement.radiusX, placement.radiusZ)
    let damage = 0
    let hole = 0
    let offset = 0
    let scorch = 0
    let rim = 0
    for (const wound of wounds) {
      const displayRadius = wound.radius * THREE.MathUtils.lerp(0.34, 1, Math.pow(Math.min(1, wound.strength), 0.5))
      const du = wrappedArcDelta(u, wound.u, circumference)
      const dv = (v - wound.v) * 1.14
      const normalized = Math.sqrt(du * du + dv * dv) / Math.max(0.0001, displayRadius)
      const localDamage = smoothPulse(normalized) * THREE.MathUtils.clamp(wound.strength, 0, 1)
      damage = Math.max(damage, localDamage)
      const presence = THREE.MathUtils.clamp(wound.strength, 0, 1)
      const holeRadius = displayRadius * THREE.MathUtils.lerp(1.22, 1.38, presence)
      const holeCut = Math.sqrt(du * du + dv * dv) <= holeRadius ? presence : 0
      hole = Math.max(hole, holeCut)
      const intensity = THREE.MathUtils.clamp((wound.strength - 0.85) * 1.2, 0, 1)
      const crater = localDamage
      offset += -crater * this.params.woundDepth * THREE.MathUtils.lerp(0.24, 0.42, intensity) * presence
      const ridgeT = THREE.MathUtils.clamp(1 - Math.abs(normalized - 0.92) / 0.22, 0, 1)
      offset += ridgeT * ridgeT * this.params.woundDepth * THREE.MathUtils.lerp(0.08, 0.14, intensity) * presence
      scorch = Math.max(scorch, localDamage)
      const frontDistance = Math.abs(Math.sqrt(du * du + dv * dv) - displayRadius)
      const frontWidth = Math.max(0.065, displayRadius * 0.095)
      const localFront =
        wound.strength * Math.pow(1 - THREE.MathUtils.smoothstep(frontDistance, 0, frontWidth), 2.75)
      rim = Math.max(rim, localFront)
    }
    return {
      damage: THREE.MathUtils.clamp(damage, 0, 1),
      hole: THREE.MathUtils.clamp(hole, 0, 1),
      offset,
      scorch: THREE.MathUtils.clamp(scorch, 0, 1),
      rim: THREE.MathUtils.clamp(rim, 0, 1),
    }
  }

  private updateBark(): void {
    let instanceIndex = 0
    for (const [key, wounds] of this.woundsByTree) {
      const placement = this.placements.get(key)
      if (!placement || wounds.length === 0) continue
      const circumference = ellipseCircumference(placement.radiusX, placement.radiusZ)
      const rowStep = placement.trunkHeight / (ROWS + 1.8)
      const topV = placement.trunkHeight * 0.5 - rowStep * 1.1

      this.layoutDriver.forEachLaidOutLine({
        spanMin: -circumference * 0.5,
        spanMax: circumference * 0.5,
        lineCoordAtRow: (row) => topV - row * rowStep,
        getMaxWidth: (slot) => slot.spanSize * LAYOUT_PX_PER_WORLD,
        onLine: ({ slot, resolvedGlyphs }) => {
          instanceIndex = this.projectLine(placement, wounds, slot, resolvedGlyphs, circumference, instanceIndex)
        },
      })
    }
    this.barkMesh.count = instanceIndex
    this.barkMesh.instanceMatrix.needsUpdate = true
    if (this.barkMesh.instanceColor) {
      this.barkMesh.instanceColor.needsUpdate = true
    }
  }

  private projectLine(
    placement: TreeBarkPlacement,
    wounds: readonly BarkWound[],
    slot: SurfaceLayoutSlot,
    resolvedGlyphs: readonly ResolvedSurfaceGlyph<TreeBarkTokenId, TreeBarkTokenMeta>[],
    circumference: number,
    instanceIndex: number,
  ): number {
    const n = resolvedGlyphs.length
    for (let k = 0; k < n; k++) {
      if (instanceIndex >= MAX_BARK_INSTANCES) break
      const token = resolvedGlyphs[k]!
      const identity = placement.identity * 131 + token.ordinal + 1
      const { meta } = token
      const t01 = (k + 0.5) / n
      const u = slot.spanStart + t01 * slot.spanSize
      const v = slot.lineCoord
      const field = this.sampleField(placement, wounds, u, v)
      const active = Math.max(field.damage, field.hole, field.scorch, field.rim)
      if (active < MIN_ACTIVE_VISIBILITY) continue
      if (field.hole >= HOLE_THRESHOLD) continue
      const localCoverage = THREE.MathUtils.lerp(1, this.params.woundNarrow, active)
      const hashPresence = glyphHash(identity, slot.row * 131 + slot.sector, k)
      if (hashPresence > localCoverage) continue

      const theta = (u / Math.max(circumference, 0.0001)) * Math.PI * 2
      const radiusAtTheta = ellipseRadiusAt(theta, placement.radiusX, placement.radiusZ)
      tmpNormal
        .copy(placement.basisX)
        .multiplyScalar(Math.cos(theta) / Math.max(placement.radiusX, 0.0001))
        .addScaledVector(placement.basisZ, Math.sin(theta) / Math.max(placement.radiusZ, 0.0001))
        .normalize()
      tmpTangent
        .copy(placement.basisX)
        .multiplyScalar(-placement.radiusX * Math.sin(theta))
        .addScaledVector(placement.basisZ, placement.radiusZ * Math.cos(theta))
        .normalize()
      tmpBitangent.copy(placement.basisY)

      const surfaceOffset = THREE.MathUtils.clamp(
        field.offset - BASE_LIFT - field.damage * this.params.scaleLift * 0.04,
        -Math.min(radiusAtTheta * 0.22, 0.08),
        0.004,
      )
      tmpPos
        .copy(placement.center)
        .addScaledVector(tmpBitangent, v)
        .addScaledVector(tmpNormal, Math.max(0.01, radiusAtTheta + surfaceOffset))

      tmpQuatMat.makeBasis(tmpTangent, tmpBitangent, tmpNormal)
      dummy.position.copy(tmpPos)
      dummy.quaternion.setFromRotationMatrix(tmpQuatMat)
      dummy.rotateX(0.04 + field.damage * 0.12)
      dummy.rotateZ((((identity % 17) / 17) - 0.5) * 0.08)
      dummy.scale.set(
        (0.035 + meta.widthBias * 0.45 + (identity % 5) * 0.003) * (1 - field.damage * 0.12),
        (0.11 + meta.heightBias * 0.5 + (identity % 7) * 0.007) * (1 - field.damage * 0.16),
        0.14 + meta.depthBias * 0.04 + field.damage * 0.04,
      )
      dummy.updateMatrix()
      this.barkMesh.setMatrixAt(instanceIndex, dummy.matrix)

      warmBarkColor(identity, placement.noise, placement.warmth, tmpColor)
      if (field.scorch > 0.002 || field.rim > 0.002) {
        tmpCharcoal.setHSL(0.07, 0.12, 0.1 + field.scorch * 0.09)
        tmpOrange.setHSL(0.052, 0.97, 0.52)
        const charMix = THREE.MathUtils.smoothstep(field.scorch, 0.1, 0.94) * 0.88
        tmpColor.lerp(tmpCharcoal, charMix)
        const ringBoost = Math.pow(field.rim, 0.34) * (0.82 + 0.18 * (1 - field.scorch))
        tmpColor.lerp(tmpOrange, ringBoost)
      }
      this.barkMesh.setColorAt(instanceIndex, tmpColor)
      instanceIndex++
    }
    return instanceIndex
  }

  private updateScorchMarks(): void {
    let instanceIndex = 0
    for (const [key, wounds] of this.woundsByTree) {
      const placement = this.placements.get(key)
      if (!placement) continue
      const circumference = ellipseCircumference(placement.radiusX, placement.radiusZ)
      for (const wound of wounds) {
        if (instanceIndex >= MAX_SCORCH_INSTANCES) break
        const theta = (wound.u / Math.max(circumference, 0.0001)) * Math.PI * 2
        const radiusAtTheta = ellipseRadiusAt(theta, placement.radiusX, placement.radiusZ)
        tmpNormal
          .copy(placement.basisX)
          .multiplyScalar(Math.cos(theta) / Math.max(placement.radiusX, 0.0001))
          .addScaledVector(placement.basisZ, Math.sin(theta) / Math.max(placement.radiusZ, 0.0001))
          .normalize()
        const s = THREE.MathUtils.clamp(wound.strength, 0, 1)
        const displayRadius = Math.max(0.06, wound.radius * THREE.MathUtils.lerp(0.34, 1, Math.pow(s, 0.5)))
        dummy.position
          .copy(placement.center)
          .addScaledVector(placement.basisY, wound.v)
          .addScaledVector(tmpNormal, Math.max(0.01, radiusAtTheta - 0.006))
        dummy.quaternion.setFromUnitVectors(scorchPlaneNormal, tmpNormal)
        dummy.scale.set(displayRadius * 0.95, displayRadius * 0.95, 1)
        dummy.updateMatrix()
        this.scorchMesh.setMatrixAt(instanceIndex, dummy.matrix)
        instanceIndex++
      }
    }
    this.scorchMesh.count = instanceIndex
    this.scorchMesh.instanceMatrix.needsUpdate = true
  }
}

export type CreateTreeBarkSurfaceEffectOptions = {
  seedCursor: SeedCursorFactory
  surface?: PreparedSurfaceSource<TreeBarkTokenId, TreeBarkTokenMeta>
  initialParams?: TreeBarkSurfaceParams
}

export function createTreeBarkSurfaceEffect({
  seedCursor,
  surface = getPreparedTreeBarkSurface(),
  initialParams = DEFAULT_TREE_BARK_SURFACE_PARAMS,
}: CreateTreeBarkSurfaceEffectOptions): TreeBarkSurfaceEffect {
  const effect = createSurfaceEffect({
    id: 'tree-bark-surface',
    source: surface,
    layout: wallLayout({
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 13 + 7,
      staggerFactor: 0.5,
      minSpanFactor: 0.35,
    }),
    behaviors: [
      recoverableDamage({
        radius: initialParams.woundRadius,
        recoveryRate: initialParams.recoveryRate,
        strength: 1,
      }),
    ],
    seedCursor,
  })

  return new TreeBarkSurfaceEffect(effect.source, seedCursor, initialParams)
}

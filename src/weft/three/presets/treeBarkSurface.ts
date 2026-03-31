import * as THREE from 'three'
import type { PreparedSurfaceSource, ResolvedSurfaceGlyph, SeedCursorFactory, SurfaceLayoutSlot } from '../../core'
import { SurfaceLayoutDriver } from '../../core'
import { decayRecoveringStrength } from '../../runtime'
import { createSurfaceEffect, recoverableDamage, wallLayout } from '../api'
import { createBarkGrainTexture, warmBarkColor } from './barkShared'
import { smoothPulse } from './sharedMath'
import {
  getPreparedTreeBarkSurface,
  type TreeBarkTokenId,
  type TreeBarkTokenMeta,
} from './treeBarkSurfaceSource'

const ROWS = 16
const SECTORS = 16
const MAX_BARK_INSTANCES = 70_000
const HOLE_THRESHOLD = 0.5
const LAYOUT_PX_PER_WORLD = 42
const BASE_SURFACE_SINK = 0.008

const tmpColor = new THREE.Color()
const tmpCharcoal = new THREE.Color()
const tmpOrange = new THREE.Color()
const tmpPos = new THREE.Vector3()
const tmpTangent = new THREE.Vector3()
const tmpNormal = new THREE.Vector3()
const tmpBitangent = new THREE.Vector3()
const tmpQuatMat = new THREE.Matrix4()
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
  rim: number
}

export class TreeBarkSurfaceEffect {
  readonly group = new THREE.Group()
  readonly interactionMesh: THREE.InstancedMesh

  private readonly barkTexture = createBarkGrainTexture()
  private readonly barkGeometry = makeBarkChipGeometry()
  private readonly barkMaterial = new THREE.MeshLambertMaterial({
    map: this.barkTexture,
    emissive: '#5c3a18',
    emissiveIntensity: 0.28,
    side: THREE.DoubleSide,
  })
  private readonly barkMesh = new THREE.InstancedMesh(this.barkGeometry, this.barkMaterial, MAX_BARK_INSTANCES)
  private layoutDriver: SurfaceLayoutDriver<TreeBarkTokenId, TreeBarkTokenMeta>
  private params: TreeBarkSurfaceParams
  private readonly showBarkMesh: boolean
  private readonly woundsByTree = new Map<string, BarkWound[]>()
  private readonly placements = new Map<string, TreeBarkPlacement>()
  private readonly barkInstanceTreeKeys: string[] = []
  private readonly barkInstanceUs: number[] = []
  private readonly barkInstanceVs: number[] = []
  private lastElapsedTime = 0
  private needsSurfaceRefresh = true

  constructor(
    surface: PreparedSurfaceSource<TreeBarkTokenId, TreeBarkTokenMeta>,
    seedCursor: SeedCursorFactory,
    initialParams: TreeBarkSurfaceParams,
    showBarkMesh: boolean,
  ) {
    this.layoutDriver = this.createLayoutDriver(surface, seedCursor)
    this.params = { ...initialParams }
    this.showBarkMesh = showBarkMesh
    this.interactionMesh = this.barkMesh
    this.barkMesh.frustumCulled = false
    this.barkMesh.visible = showBarkMesh
    this.barkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.group.add(this.barkMesh)
  }

  setPlacements(placements: readonly TreeBarkPlacement[]): void {
    this.placements.clear()
    for (const placement of placements) {
      this.placements.set(placement.key, placement)
    }
    for (const key of Array.from(this.woundsByTree.keys())) {
      if (!this.placements.has(key)) {
        this.woundsByTree.delete(key)
      }
    }
    this.needsSurfaceRefresh = true
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
    this.needsSurfaceRefresh = true
  }

  addWoundFromRaycastHit(
    hit: THREE.Intersection<THREE.Object3D>,
    worldDirection: THREE.Vector3,
    options: TreeBarkWoundOptions = {},
  ): boolean {
    const instanceId = hit.instanceId
    if (instanceId == null) return false
    const treeKey = this.barkInstanceTreeKeys[instanceId]
    const u = this.barkInstanceUs[instanceId]
    const v = this.barkInstanceVs[instanceId]
    if (treeKey == null || u == null || v == null) return false
    this.addWound(treeKey, u, v, {
      ...options,
      directionX: worldDirection.x,
      directionY: worldDirection.y,
      directionZ: worldDirection.z,
    })
    return true
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
    this.needsSurfaceRefresh = true
  }

  update(elapsedTime: number): void {
    const delta = this.lastElapsedTime === 0 ? 0 : Math.max(0, elapsedTime - this.lastElapsedTime)
    this.lastElapsedTime = elapsedTime
    this.updateWounds(delta)
    // Tree field uses `showBarkMesh: false` (cylinder trunks + raycast). Wounds are still simulated for
    // gameplay state, but rebuilding the hidden bark layout every frame while burns animate was pure CPU cost.
    if (!this.showBarkMesh) {
      return
    }
    const shouldRefreshBarkSurface = this.needsSurfaceRefresh || this.woundsByTree.size > 0
    if (shouldRefreshBarkSurface) {
      this.updateBark()
      this.needsSurfaceRefresh = false
    }
  }

  dispose(): void {
    this.barkTexture.dispose()
    this.barkGeometry.dispose()
    this.barkMaterial.dispose()
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
      staggerFactor: 0.42,
      minSpanFactor: 0.24,
    })
  }

  private updateWounds(delta: number): void {
    if (delta <= 0 || this.woundsByTree.size === 0) return
    let changed = false
    for (const [key, wounds] of this.woundsByTree) {
      for (const wound of wounds) {
        if (this.params.woundSpreadSpeed > 0) {
          const prevRadius = wound.radius
          const spreadMul = THREE.MathUtils.lerp(0.18, 1, Math.pow(wound.strength, 0.82))
          const growth = this.params.woundSpreadSpeed * delta * (0.25 + wound.strength * 0.35) * spreadMul
          wound.radius = Math.min(wound.maxRadius, wound.radius + growth)
          if (Math.abs(wound.radius - prevRadius) > 1e-6) changed = true
        }
      }
      for (let i = wounds.length - 1; i >= 0; i--) {
        const wound = wounds[i]!
        const recoveryRate = wound.recoveryRate ?? this.params.recoveryRate
        if (recoveryRate <= 0) continue
        const prevStrength = wound.strength
        wound.strength = decayRecoveringStrength(wound.strength, Math.max(0.001, recoveryRate), delta)
        if (Math.abs(wound.strength - prevStrength) > 1e-6) changed = true
        if (wound.strength <= 0.018) {
          wounds.splice(i, 1)
          changed = true
        }
      }
      if (wounds.length === 0) {
        this.woundsByTree.delete(key)
        changed = true
      }
    }
    if (changed) {
      this.needsSurfaceRefresh = true
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
      rim: THREE.MathUtils.clamp(rim, 0, 1),
    }
  }

  private updateBark(): void {
    let instanceIndex = 0
    this.barkInstanceTreeKeys.length = 0
    this.barkInstanceUs.length = 0
    this.barkInstanceVs.length = 0
    for (const placement of this.placements.values()) {
      const wounds = this.woundsByTree.get(placement.key) ?? []
      const circumference = ellipseCircumference(placement.radiusX, placement.radiusZ)
      const rowStep = placement.trunkHeight / (ROWS + 0.8)
      const topV = placement.trunkHeight * 0.5 - rowStep * 0.55

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
      if (field.hole >= HOLE_THRESHOLD) continue
      const localCoverage = THREE.MathUtils.lerp(1, this.params.woundNarrow, Math.max(field.damage, field.hole))
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
        field.offset - BASE_SURFACE_SINK,
        -Math.min(radiusAtTheta * 0.22, 0.08),
        -0.001,
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
        (0.22 + meta.widthBias * 0.18 + (identity % 5) * 0.005) * (1 - field.damage * 0.14),
        (0.42 + meta.heightBias * 0.18 + (identity % 7) * 0.012) * (1 - field.damage * 0.18),
        0.05 + meta.depthBias * 0.018 + field.damage * 0.024,
      )
      dummy.updateMatrix()
      this.barkMesh.setMatrixAt(instanceIndex, dummy.matrix)
      this.barkInstanceTreeKeys[instanceIndex] = placement.key
      this.barkInstanceUs[instanceIndex] = u
      this.barkInstanceVs[instanceIndex] = v

      warmBarkColor(identity, placement.noise, placement.warmth, tmpColor)
      if (field.damage > 0.002 || field.rim > 0.002) {
        tmpCharcoal.setHSL(0.07, 0.12, 0.1 + field.damage * 0.09)
        tmpOrange.setHSL(0.052, 0.97, 0.52)
        const charMix = THREE.MathUtils.smoothstep(field.damage, 0.1, 0.94) * 0.88
        tmpColor.lerp(tmpCharcoal, charMix)
        const ringBoost = Math.pow(field.rim, 0.34) * (0.82 + 0.18 * (1 - field.damage))
        tmpColor.lerp(tmpOrange, ringBoost)
      }
      this.barkMesh.setColorAt(instanceIndex, tmpColor)
      instanceIndex++
    }
    return instanceIndex
  }
}

export type CreateTreeBarkSurfaceEffectOptions = {
  seedCursor: SeedCursorFactory
  surface?: PreparedSurfaceSource<TreeBarkTokenId, TreeBarkTokenMeta>
  initialParams?: TreeBarkSurfaceParams
  showBarkMesh?: boolean
}

export function createTreeBarkSurfaceEffect({
  seedCursor,
  surface = getPreparedTreeBarkSurface(),
  initialParams = DEFAULT_TREE_BARK_SURFACE_PARAMS,
  showBarkMesh = true,
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

  return new TreeBarkSurfaceEffect(effect.source, seedCursor, initialParams, showBarkMesh)
}

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
  getPreparedRockSurface,
  type RockTokenId,
  type RockTokenMeta,
} from './rockFieldSource'

export type RockFieldParams = {
  layoutDensity: number
  sizeScale: number
}

export const DEFAULT_ROCK_FIELD_PARAMS: RockFieldParams = {
  layoutDensity: 1.0,
  sizeScale: 1.0,
}

/** Impulse / laser hit applied in world space; destruction is keyed by authored layout identity. */
export type RockFieldDestructOptions = {
  /** Voronoi-style fragment count per rock (clamped). */
  shardCount?: number
  /** Scales outward burst speed for shard particles. */
  burstScale?: number
}

export type RockFieldBounds = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export type RockFieldPlacementMask = {
  bounds?: RockFieldBounds
  includeAtXZ?: (x: number, z: number) => boolean
}

const DEFAULT_ROCK_FIELD_BOUNDS: RockFieldBounds = {
  minX: -28,
  maxX: 28,
  minZ: -28,
  maxZ: 28,
}

const ROWS = 18
const SECTORS = 22
const MAX_INSTANCES = 2_400
const MAX_SHARD_INSTANCES = 9_000
const DEFAULT_SHARDS_PER_ROCK = 12
const SHARD_GRAVITY = 22
const SHARD_DRAG = 0.988
const SHARD_MAX_AGE = 2.45
const BASE_LAYOUT_PX_PER_WORLD = 6.5

const tmpColor = new THREE.Color()
const dummy = new THREE.Object3D()
const tmpMatRock = new THREE.Matrix4()
const tmpMatInv = new THREE.Matrix4()
const tmpPos = new THREE.Vector3()
const tmpScale = new THREE.Vector3()
const tmpQuat = new THREE.Quaternion()
const tmpImpLocal = new THREE.Vector3()
const tmpSiteLocal = new THREE.Vector3()
const tmpDirLocal = new THREE.Vector3()
const tmpVelWorld = new THREE.Vector3()
const tmpAxis = new THREE.Vector3()
const tmpDeltaQuat = new THREE.Quaternion()
const shardSitesScratch: THREE.Vector3[] = []

function rockMotionKey(slot: SurfaceLayoutSlot, tokenLineKey: string, k: number): string {
  return `${slot.row}:${slot.sector}:${tokenLineKey}:${k}`
}

function keySeed(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

type RockShardParticle = {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  qx: number
  qy: number
  qz: number
  qw: number
  avx: number
  avy: number
  avz: number
  scale: number
  color: THREE.Color
  age: number
  maxAge: number
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

const rockOrganicWorldField = createWorldField(463, {
  scale: 5.4,
  octaves: 4,
  roughness: 0.52,
  warpAmplitude: 1.15,
  warpScale: 4.6,
  ridge: 0.32,
  contrast: 1.12,
})

function rockSizeIdentity(identity: number, meta: RockTokenMeta): number {
  return 0.58 + uhash(identity * 2246822519) * 0.72 + meta.sizeBias
}

function rockOutcropChance(meta: RockTokenMeta, noise: number): number {
  return THREE.MathUtils.clamp(0.03 + meta.outcropBias * 0.72 + noise * 0.14, 0.02, 0.72)
}

function rockStoneColor(identity: number, noise: number, meta: RockTokenMeta): THREE.Color {
  const t = uhash(identity * 2654435761)
  const hue = (t < 0.4 ? 0.06 + t * 0.05 : 0.55 + (t - 0.4) * 0.08) + meta.warmth
  const sat = 0.08 + t * 0.14 + noise * 0.06
  const light = 0.28 + noise * 0.22 + t * 0.08
  return tmpColor.setHSL(hue, sat, light)
}

function makeRockGeometry(): THREE.BufferGeometry {
  return new THREE.DodecahedronGeometry(0.5, 0)
}

function makeShardGeometry(): THREE.BufferGeometry {
  return new THREE.DodecahedronGeometry(0.14, 0)
}

export class RockFieldEffect {
  readonly group = new THREE.Group()

  /** Raycast target for gameplay hits; same instanced mesh as visible rocks. */
  readonly interactionMesh: THREE.InstancedMesh

  private readonly rockGeometry = makeRockGeometry()
  private readonly shardGeometry = makeShardGeometry()
  private readonly rockMaterial = new THREE.MeshStandardMaterial({
    roughness: 0.95,
    metalness: 0.05,
  })
  private readonly rockMesh = new THREE.InstancedMesh(
    this.rockGeometry,
    this.rockMaterial,
    MAX_INSTANCES,
  )
  private readonly shardMesh = new THREE.InstancedMesh(
    this.shardGeometry,
    this.rockMaterial,
    MAX_SHARD_INSTANCES,
  )
  private readonly placementMask: Required<RockFieldPlacementMask>
  private readonly fieldWidth: number
  private readonly fieldDepth: number
  private readonly fieldCenterX: number
  private readonly fieldCenterZ: number
  private readonly layoutDriver: SurfaceLayoutDriver<RockTokenId, RockTokenMeta>
  private readonly destroyedRockKeys = new Set<string>()
  private readonly shardParticles: RockShardParticle[] = []
  /** Filled each layout pass: instance index → stable authored rock key (for raycast → destroy). */
  private readonly instanceRockKeyAtIndex: string[] = new Array(MAX_INSTANCES)
  private params: RockFieldParams
  private lastElapsed = 0

  constructor(
    surface: PreparedSurfaceSource<RockTokenId, RockTokenMeta>,
    seedCursor: SeedCursorFactory,
    initialParams: RockFieldParams,
    placementMask: RockFieldPlacementMask = {},
  ) {
    this.params = { ...initialParams }
    const bounds = placementMask.bounds ?? DEFAULT_ROCK_FIELD_BOUNDS
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
      advanceForRow: (row) => row * 7 + 3,
      seedCursor,
      staggerFactor: 0.6,
      minSpanFactor: 0.4,
    })

    this.interactionMesh = this.rockMesh
    this.rockMesh.frustumCulled = false
    this.rockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.shardMesh.frustumCulled = false
    this.shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.group.add(this.rockMesh)
    this.group.add(this.shardMesh)
  }

  setParams(params: Partial<RockFieldParams>): void {
    this.params = { ...this.params, ...params }
  }

  clearDestruction(): void {
    this.destroyedRockKeys.clear()
    this.shardParticles.length = 0
    this.shardMesh.count = 0
  }

  hasActiveShards(): boolean {
    return this.shardParticles.length > 0
  }

  clearReactions(): void {
    this.clearDestruction()
  }

  hasReactions(): boolean {
    return this.hasActiveShards() || this.destroyedRockKeys.size > 0
  }

  /**
   * Destroy the rock instance hit by a raycast. Uses `intersection.instanceId` mapped to the last
   * layout pass (same frame ordering as other clutter presets).
   */
  destroyFromRaycastHit(
    intersection: THREE.Intersection,
    rayDirectionWorld?: THREE.Vector3,
    options: RockFieldDestructOptions = {},
  ): boolean {
    if (intersection.object !== this.rockMesh) return false
    const instanceId = intersection.instanceId
    if (instanceId === undefined || instanceId < 0) return false
    const key = this.instanceRockKeyAtIndex[instanceId]
    if (!key || this.destroyedRockKeys.has(key)) return false

    this.rockMesh.getMatrixAt(instanceId, tmpMatRock)
    tmpMatRock.premultiply(this.rockMesh.matrixWorld)

    let c = tmpColor.set(0x888888)
    if (this.rockMesh.instanceColor) {
      this.rockMesh.getColorAt(instanceId, c)
    }

    this.destroyedRockKeys.add(key)
    this.spawnVoronoiShards(
      tmpMatRock,
      intersection.point,
      c,
      keySeed(key),
      options,
      rayDirectionWorld,
    )
    return true
  }

  update(elapsedTime: number, getGroundHeight: (x: number, z: number) => number): void {
    const delta = this.lastElapsed === 0 ? 0 : Math.min(0.05, Math.max(0, elapsedTime - this.lastElapsed))
    this.lastElapsed = elapsedTime
    this.updateRocks(getGroundHeight)
    this.integrateShards(delta, getGroundHeight)
  }

  dispose(): void {
    this.rockGeometry.dispose()
    this.shardGeometry.dispose()
    this.rockMaterial.dispose()
  }

  private getSlotMaxWidth(slot: SurfaceLayoutSlot): number {
    return slot.spanSize * BASE_LAYOUT_PX_PER_WORLD * this.params.layoutDensity
  }

  private updateRocks(getGroundHeight: (x: number, z: number) => number): void {
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

    this.rockMesh.count = instanceIndex
    this.rockMesh.instanceMatrix.needsUpdate = true
    if (this.rockMesh.instanceColor) {
      this.rockMesh.instanceColor.needsUpdate = true
    }
  }

  private spawnVoronoiShards(
    rockWorldMatrix: THREE.Matrix4,
    worldImpact: THREE.Vector3,
    baseColor: THREE.Color,
    seed: number,
    options: RockFieldDestructOptions,
    rayDirectionWorld: THREE.Vector3 | undefined,
  ): void {
    const shardCount = THREE.MathUtils.clamp(
      Math.floor(options.shardCount ?? DEFAULT_SHARDS_PER_ROCK),
      4,
      24,
    )
    const burstScale = THREE.MathUtils.clamp(options.burstScale ?? 1, 0.35, 2.2)

    tmpMatInv.copy(rockWorldMatrix).invert()
    tmpImpLocal.copy(worldImpact).applyMatrix4(tmpMatInv)

    rockWorldMatrix.decompose(tmpPos, tmpQuat, tmpScale)
    const avgScale = (tmpScale.x + tmpScale.y + tmpScale.z) / 3

    while (shardSitesScratch.length < shardCount) {
      shardSitesScratch.push(new THREE.Vector3())
    }
    for (let i = 0; i < shardCount; i++) {
      const u = uhash(seed + i * 0x9e3779b9)
      const v = uhash(seed + i * 0x85ebca6b)
      const y = 1 - 2 * u
      const r = Math.sqrt(Math.max(0, 1 - y * y))
      const theta = 2 * Math.PI * v
      const spread = 0.38 + uhash(seed + i * 2654435761) * 0.58
      const site = shardSitesScratch[i]!
      site.set(
        Math.cos(theta) * r * 0.55 * spread,
        y * 0.42 * spread + (uhash(seed + i * 2246822519) - 0.5) * 0.22,
        Math.sin(theta) * r * 0.55 * spread,
      )
    }

    const needRoom = shardCount
    if (this.shardParticles.length + needRoom > MAX_SHARD_INSTANCES) {
      const overflow = this.shardParticles.length + needRoom - MAX_SHARD_INSTANCES
      if (overflow > 0) {
        this.shardParticles.splice(0, overflow)
      }
    }

    for (let i = 0; i < shardCount; i++) {
      if (this.shardParticles.length >= MAX_SHARD_INSTANCES) break

      const siteLocal = shardSitesScratch[i]!
      tmpDirLocal.copy(siteLocal).sub(tmpImpLocal)
      if (tmpDirLocal.lengthSq() < 1e-8) {
        tmpDirLocal.copy(siteLocal)
        if (tmpDirLocal.lengthSq() < 1e-8) {
          tmpDirLocal.set(
            uhash(seed + i * 31) - 0.5,
            uhash(seed + i * 47) - 0.2,
            uhash(seed + i * 61) - 0.5,
          )
        }
      }
      tmpDirLocal.normalize()

      const jitter = 0.18 + uhash(seed + i * 1013) * 0.55
      tmpVelWorld
        .copy(tmpDirLocal)
        .transformDirection(rockWorldMatrix)
        .multiplyScalar((5.2 + uhash(seed + i * 7919) * 7.8) * burstScale * jitter)

      tmpVelWorld.y += 2.4 * burstScale * uhash(seed + i * 499)

      if (rayDirectionWorld) {
        const rx = rayDirectionWorld.x
        const rz = rayDirectionWorld.z
        const rl = Math.hypot(rx, rz)
        if (rl > 1e-5) {
          tmpVelWorld.x += (rx / rl) * 3.2 * burstScale
          tmpVelWorld.z += (rz / rl) * 3.2 * burstScale
        }
        tmpVelWorld.y += Math.abs(rayDirectionWorld.y) * 2.6 * burstScale
      }

      tmpSiteLocal.copy(siteLocal).applyMatrix4(rockWorldMatrix)

      const avScale = (9 + uhash(seed + i * 104729) * 11) * burstScale
      const p: RockShardParticle = {
        x: tmpSiteLocal.x,
        y: tmpSiteLocal.y,
        z: tmpSiteLocal.z,
        vx: tmpVelWorld.x,
        vy: tmpVelWorld.y,
        vz: tmpVelWorld.z,
        qx: tmpQuat.x,
        qy: tmpQuat.y,
        qz: tmpQuat.z,
        qw: tmpQuat.w,
        avx: (uhash(seed + i * 193) - 0.5) * avScale,
        avy: (uhash(seed + i * 389) - 0.5) * avScale,
        avz: (uhash(seed + i * 677) - 0.5) * avScale,
        scale: avgScale * (0.22 + uhash(seed + i * 911) * 0.38),
        color: baseColor.clone(),
        age: 0,
        maxAge: SHARD_MAX_AGE * (0.82 + uhash(seed + i * 503) * 0.36),
      }
      this.shardParticles.push(p)
    }
  }

  private integrateShards(delta: number, getGroundHeight: (x: number, z: number) => number): void {
    if (this.shardParticles.length === 0) {
      this.shardMesh.count = 0
      return
    }

    const d = delta > 0 ? delta : 0
    let write = 0
    for (let r = 0; r < this.shardParticles.length; r++) {
      const s = this.shardParticles[r]!
      s.age += d
      if (s.age >= s.maxAge) continue

      s.vy -= SHARD_GRAVITY * d
      s.vx *= SHARD_DRAG
      s.vy *= SHARD_DRAG
      s.vz *= SHARD_DRAG
      s.x += s.vx * d
      s.y += s.vy * d
      s.z += s.vz * d

      const avLen = Math.hypot(s.avx, s.avy, s.avz)
      if (avLen > 1e-5 && d > 0) {
        tmpAxis.set(s.avx, s.avy, s.avz).multiplyScalar(1 / avLen)
        tmpDeltaQuat.setFromAxisAngle(tmpAxis, avLen * d)
        tmpQuat.set(s.qx, s.qy, s.qz, s.qw)
        tmpQuat.multiply(tmpDeltaQuat)
        tmpQuat.normalize()
        s.qx = tmpQuat.x
        s.qy = tmpQuat.y
        s.qz = tmpQuat.z
        s.qw = tmpQuat.w
      }

      const gy = getGroundHeight(s.x, s.z)
      const half = s.scale * 0.12
      if (s.y < gy + half) {
        s.y = gy + half
        s.vy *= -0.22
        s.vx *= 0.72
        s.vz *= 0.72
        s.avy *= 0.82
        s.avx *= 0.82
        s.avz *= 0.82
      }

      if (write !== r) {
        this.shardParticles[write] = s
      }
      write++
    }
    this.shardParticles.length = write

    const n = this.shardParticles.length
    this.shardMesh.count = n
    for (let i = 0; i < n; i++) {
      const s = this.shardParticles[i]!
      dummy.position.set(s.x, s.y, s.z)
      dummy.quaternion.set(s.qx, s.qy, s.qz, s.qw)
      const fade = 1 - s.age / s.maxAge
      dummy.scale.setScalar(s.scale * (0.88 + 0.12 * fade))
      dummy.updateMatrix()
      this.shardMesh.setMatrixAt(i, dummy.matrix)
      this.shardMesh.setColorAt(i, s.color)
    }
    this.shardMesh.instanceMatrix.needsUpdate = true
    if (this.shardMesh.instanceColor) {
      this.shardMesh.instanceColor.needsUpdate = true
    }
  }

  private projectLine(
    slot: SurfaceLayoutSlot,
    resolvedGlyphs: readonly ResolvedSurfaceGlyph<RockTokenId, RockTokenMeta>[],
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

      const rockKey = rockMotionKey(slot, tokenLineKey, k)
      if (this.destroyedRockKeys.has(rockKey)) continue

      const hashLat = glyphHash(identity, slot.row, k)
      const hashDep = glyphHash(identity + 1, slot.sector, k ^ 0xab)
      const hashOrg = glyphHash(identity + 2, slot.row ^ slot.sector, k + 17)
      const hashTier = glyphHash(identity + 3, slot.row + slot.sector, k ^ 0x13)
      const hashProfile = glyphHash(identity + 5, slot.sector + 7, k ^ 0x39)
      const hashHero = glyphHash(identity + 7, slot.row ^ 0x31, k ^ 0x57)

      const t01 = THREE.MathUtils.clamp((k + hashLat * 0.85 + 0.08) / (n + 0.1), 0.02, 0.98)
      const x =
        this.fieldCenterX +
        slot.spanStart +
        t01 * slot.spanSize +
        lineLateralShift +
        (hashLat - 0.5) * slot.sectorStep * 0.42
      const zJitter = (hashDep - 0.5) * rowStep * 0.58 + lineDepthShift
      const z = this.fieldCenterZ + slot.lineCoord + zJitter
      if (!this.placementMask.includeAtXZ(x, z)) continue
      const noise = rockOrganicWorldField(x + hashOrg * 0.3, z + hashOrg * 0.2)

      const groundY = getGroundHeight(x, z)
      const sizeBase = rockSizeIdentity(identity, meta)
      const tierScale = THREE.MathUtils.lerp(0.72, 1.48, hashTier)
      const heroScale = hashHero > 0.9 ? THREE.MathUtils.lerp(1.18, 1.72, hashProfile) : 1
      const size = sizeBase * tierScale * heroScale * (0.24 + noise * 0.44) * this.params.sizeScale
      const isOutcrop = hashProfile < rockOutcropChance(meta, noise)
      const widthScale = isOutcrop
        ? THREE.MathUtils.clamp(0.44 + hashTier * 0.22 - meta.slendernessBias * 0.12, 0.38, 0.82)
        : THREE.MathUtils.clamp(0.72 + hashTier * 0.34 - meta.slendernessBias * 0.1, 0.58, 1.18)
      const depthScale = isOutcrop
        ? THREE.MathUtils.clamp(0.48 + noise * 0.24 + (0.5 - hashTier) * 0.1, 0.4, 0.9)
        : THREE.MathUtils.clamp(0.74 + noise * 0.28 + meta.slendernessBias * 0.08, 0.6, 1.18)
      const heightScale = isOutcrop
        ? THREE.MathUtils.clamp(1.28 + meta.heightBias * 0.95 + noise * 0.38 + heroScale * 0.12, 1.02, 2.35)
        : THREE.MathUtils.clamp(0.48 + noise * 0.3 + meta.heightBias * 0.35 + hashProfile * 0.16, 0.38, 1.08)
      const yaw = lineSeed * Math.PI * 2 + k * 1.17 + noise * 0.9
      const tiltX = (noise - 0.5) * (isOutcrop ? 0.1 : 0.18)
      const tiltZ = Math.sin(identity * 0.13 + lineSeed * 3.1) * 0.5 * (isOutcrop ? 0.08 : 0.14)
      const height = size * heightScale

      dummy.position.set(x, groundY + height * (isOutcrop ? 0.24 : 0.14), z)
      dummy.rotation.set(tiltX, yaw, tiltZ)
      dummy.scale.set(size * widthScale, height, size * depthScale)
      dummy.updateMatrix()
      this.rockMesh.setMatrixAt(instanceIndex, dummy.matrix)
      this.rockMesh.setColorAt(instanceIndex, rockStoneColor(identity, noise, meta))
      this.instanceRockKeyAtIndex[instanceIndex] = rockKey

      instanceIndex++
    }

    return instanceIndex
  }
}

export type CreateRockFieldEffectOptions = {
  seedCursor: SeedCursorFactory
  surface?: PreparedSurfaceSource<RockTokenId, RockTokenMeta>
  initialParams?: RockFieldParams
  placementMask?: RockFieldPlacementMask
}

export function createRockFieldEffect({
  seedCursor,
  surface = getPreparedRockSurface(),
  initialParams = DEFAULT_ROCK_FIELD_PARAMS,
  placementMask,
}: CreateRockFieldEffectOptions): RockFieldEffect {
  const effect = createSurfaceEffect({
    id: 'rock-field',
    source: surface,
    layout: fieldLayout({
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 7 + 3,
      staggerFactor: 0.6,
      minSpanFactor: 0.4,
    }),
    seedCursor,
  })

  return new RockFieldEffect(effect.source, seedCursor, initialParams, placementMask)
}

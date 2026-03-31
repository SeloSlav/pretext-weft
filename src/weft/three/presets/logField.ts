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
  getPreparedLogSurface,
  type LogTokenId,
  type LogTokenMeta,
} from './logFieldSource'

export type LogFieldParams = {
  layoutDensity: number
  sizeScale: number
  lengthScale: number
}

export const DEFAULT_LOG_FIELD_PARAMS: LogFieldParams = {
  layoutDensity: 0.42,
  sizeScale: 1,
  lengthScale: 1,
}

export type LogFieldBounds = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export type LogFieldPlacementMask = {
  bounds?: LogFieldBounds
  includeAtXZ?: (x: number, z: number) => boolean
}

export type LogFieldImpulseOptions = {
  radiusScale?: number
  strength?: number
  mergeRadius?: number
  directionX?: number
  directionZ?: number
  tangentialStrength?: number
  spin?: number
}

const DEFAULT_LOG_FIELD_BOUNDS: LogFieldBounds = {
  minX: -28,
  maxX: 28,
  minZ: -28,
  maxZ: 28,
}

const ROWS = 14
const SECTORS = 16
const MAX_INSTANCES = 280
const BASE_LAYOUT_PX_PER_WORLD = 5.4
const LOG_DRAG = 2.2
const LOG_SPIN_DRAG = 2.8
const LOG_MAX_SPEED = 6.2
const LOG_MAX_ANGULAR_SPEED = 4.6
const tmpLongAxis = new THREE.Vector3()
const tmpBaseQuat = new THREE.Quaternion()
const tmpSpinQuat = new THREE.Quaternion()
const worldUp = new THREE.Vector3(0, 1, 0)
const tmpLocalPoint = new THREE.Vector3()

const tmpColor = new THREE.Color()
const dummy = new THREE.Object3D()

type LogMotionState = {
  offsetX: number
  offsetZ: number
  velocityX: number
  velocityZ: number
  yaw: number
  yawVelocity: number
  roll: number
  rollVelocity: number
}

type PendingLogImpulse = {
  x: number
  z: number
  radius: number
  strength: number
  directionX: number
  directionZ: number
  tangentialStrength: number
  spin: number
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

function logMotionKeyPrefix(slot: SurfaceLayoutSlot, tokenLineKey: string): string {
  return `${slot.row}:${slot.sector}:${tokenLineKey}`
}

const logOrganicWorldField = createWorldField(977, {
  scale: 9.4,
  octaves: 4,
  roughness: 0.52,
  warpAmplitude: 1.8,
  warpScale: 7.2,
  ridge: 0.18,
  contrast: 1.08,
})

function logColor(identity: number, noise: number, meta: LogTokenMeta): THREE.Color {
  const t = uhash(identity * 2654435761)
  const hue = 0.068 + t * 0.038 + meta.warmth
  const sat = 0.34 + noise * 0.12 + t * 0.08
  const light = 0.2 + noise * 0.18 + t * 0.05
  return tmpColor.setHSL(hue, sat, light)
}

function makeLogGeometry(): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(0.5, 0.58, 1, 10, 1, false)
}

export class LogFieldEffect {
  readonly group = new THREE.Group()

  private readonly logGeometry = makeLogGeometry()
  private readonly logMaterial = new THREE.MeshStandardMaterial({
    roughness: 0.97,
    metalness: 0.02,
  })
  private readonly logMesh = new THREE.InstancedMesh(this.logGeometry, this.logMaterial, MAX_INSTANCES)
  private readonly placementMask: Required<LogFieldPlacementMask>
  private readonly fieldWidth: number
  private readonly fieldDepth: number
  private readonly fieldCenterX: number
  private readonly fieldCenterZ: number
  private readonly layoutDriver: SurfaceLayoutDriver<LogTokenId, LogTokenMeta>
  private readonly motionStates = new Map<string, LogMotionState>()
  private readonly pendingImpulses: PendingLogImpulse[] = []
  private params: LogFieldParams
  private lastElapsed = 0

  constructor(
    surface: PreparedSurfaceSource<LogTokenId, LogTokenMeta>,
    seedCursor: SeedCursorFactory,
    initialParams: LogFieldParams,
    placementMask: LogFieldPlacementMask = {},
  ) {
    this.params = { ...initialParams }
    const bounds = placementMask.bounds ?? DEFAULT_LOG_FIELD_BOUNDS
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
      advanceForRow: (row) => row * 6 + 2,
      seedCursor,
      staggerFactor: 0.62,
      minSpanFactor: 0.42,
    })

    this.logMesh.frustumCulled = false
    this.logMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.group.add(this.logMesh)
  }

  setParams(params: Partial<LogFieldParams>): void {
    this.params = { ...this.params, ...params }
  }

  clearMotion(): void {
    this.motionStates.clear()
    this.pendingImpulses.length = 0
  }

  hasMotion(): boolean {
    return this.pendingImpulses.length > 0 || this.motionStates.size > 0
  }

  addMotionFromWorldPoint(worldPoint: THREE.Vector3, options: LogFieldImpulseOptions = {}): void {
    tmpLocalPoint.copy(worldPoint)
    this.group.worldToLocal(tmpLocalPoint)
    const x = tmpLocalPoint.x
    const z = tmpLocalPoint.z
    const directionLength = Math.hypot(options.directionX ?? 0, options.directionZ ?? 0)
    this.pendingImpulses.push({
      radius: 1.85 * (options.radiusScale ?? 1),
      strength: THREE.MathUtils.clamp(options.strength ?? 1, 0.05, 2.8),
      x,
      z,
      directionX: directionLength > 1e-6 ? (options.directionX ?? 0) / directionLength : 1,
      directionZ: directionLength > 1e-6 ? (options.directionZ ?? 0) / directionLength : 0,
      tangentialStrength: options.tangentialStrength ?? 0.3,
      spin: options.spin ?? 0.56,
    })
  }

  clearReactions(): void {
    this.clearMotion()
  }

  hasReactions(): boolean {
    return this.hasMotion()
  }

  addImpulseFromWorldPoint(worldPoint: THREE.Vector3, options: LogFieldImpulseOptions = {}): void {
    this.addMotionFromWorldPoint(worldPoint, options)
  }

  update(elapsedTime: number, getGroundHeight: (x: number, z: number) => number): void {
    const delta = this.lastElapsed === 0 ? 0 : Math.min(0.05, Math.max(0, elapsedTime - this.lastElapsed))
    this.lastElapsed = elapsedTime
    const rowStep = this.fieldDepth / (ROWS + 1)
    const backZ = this.fieldDepth * 0.48
    let instanceIndex = 0
    const visitedKeys = new Set<string>()

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
          delta,
          visitedKeys,
        )
      },
    })

    for (const key of this.motionStates.keys()) {
      if (!visitedKeys.has(key)) {
        this.motionStates.delete(key)
      }
    }
    this.pendingImpulses.length = 0

    this.logMesh.count = instanceIndex
    this.logMesh.instanceMatrix.needsUpdate = true
    if (this.logMesh.instanceColor) {
      this.logMesh.instanceColor.needsUpdate = true
    }
  }

  dispose(): void {
    this.logGeometry.dispose()
    this.logMaterial.dispose()
  }

  private getSlotMaxWidth(slot: SurfaceLayoutSlot): number {
    return slot.spanSize * BASE_LAYOUT_PX_PER_WORLD * this.params.layoutDensity
  }

  private getMotionState(key: string): LogMotionState {
    let state = this.motionStates.get(key)
    if (!state) {
      state = {
        offsetX: 0,
        offsetZ: 0,
        velocityX: 0,
        velocityZ: 0,
        yaw: 0,
        yawVelocity: 0,
        roll: 0,
        rollVelocity: 0,
      }
      this.motionStates.set(key, state)
    }
    return state
  }

  private applyMotionState(state: LogMotionState, baseX: number, baseZ: number, delta: number): void {
    const currentX = baseX + state.offsetX
    const currentZ = baseZ + state.offsetZ
    for (const impulse of this.pendingImpulses) {
      const dx = currentX - impulse.x
      const dz = currentZ - impulse.z
      const distance = Math.hypot(dx, dz)
      if (distance > impulse.radius) continue
      const falloff = 1 - THREE.MathUtils.smoothstep(distance, 0, impulse.radius)
      const push = impulse.strength * falloff * falloff
      const tangentX = -impulse.directionZ
      const tangentZ = impulse.directionX
      const side = impulse.directionX * dz - impulse.directionZ * dx >= 0 ? 1 : -1
      state.velocityX += impulse.directionX * push * 0.95 + tangentX * push * impulse.tangentialStrength * 0.35
      state.velocityZ += impulse.directionZ * push * 0.95 + tangentZ * push * impulse.tangentialStrength * 0.35
      state.rollVelocity += side * push * (impulse.spin * 0.28 + impulse.tangentialStrength * 0.08)
      state.yawVelocity += (impulse.directionX * dz - impulse.directionZ * dx) * push * 0.028
    }

    if (delta <= 0) return
    const drag = Math.exp(-LOG_DRAG * delta)
    const spinDrag = Math.exp(-LOG_SPIN_DRAG * delta)
    const speed = Math.hypot(state.velocityX, state.velocityZ)
    if (speed > LOG_MAX_SPEED) {
      const s = LOG_MAX_SPEED / speed
      state.velocityX *= s
      state.velocityZ *= s
    }
    state.velocityX *= drag
    state.velocityZ *= drag
    state.offsetX += state.velocityX * delta
    state.offsetZ += state.velocityZ * delta
    state.rollVelocity = THREE.MathUtils.clamp(state.rollVelocity * spinDrag, -LOG_MAX_ANGULAR_SPEED, LOG_MAX_ANGULAR_SPEED)
    state.yawVelocity = THREE.MathUtils.clamp(state.yawVelocity * spinDrag, -LOG_MAX_ANGULAR_SPEED * 0.55, LOG_MAX_ANGULAR_SPEED * 0.55)
    state.roll += state.rollVelocity * delta
    state.yaw += state.yawVelocity * delta
  }

  private motionInactive(state: LogMotionState): boolean {
    return (
      Math.abs(state.offsetX) < 0.01 &&
      Math.abs(state.offsetZ) < 0.01 &&
      Math.abs(state.velocityX) < 0.01 &&
      Math.abs(state.velocityZ) < 0.01 &&
      Math.abs(state.roll) < 0.01 &&
      Math.abs(state.rollVelocity) < 0.01 &&
      Math.abs(state.yaw) < 0.01 &&
      Math.abs(state.yawVelocity) < 0.01
    )
  }

  private projectLine(
    slot: SurfaceLayoutSlot,
    resolvedGlyphs: readonly ResolvedSurfaceGlyph<LogTokenId, LogTokenMeta>[],
    tokenLineKey: string,
    rowStep: number,
    getGroundHeight: (x: number, z: number) => number,
    instanceIndex: number,
    delta: number,
    visitedKeys: Set<string>,
  ): number {
    const n = resolvedGlyphs.length
    const lineSeed = lineSignature(tokenLineKey)
    const motionKeyPrefix = logMotionKeyPrefix(slot, tokenLineKey)
    const lineLateralShift = (lineSeed - 0.5) * slot.sectorStep * 0.22
    const lineDepthShift = (lineSeed - 0.5) * rowStep * 0.16

    for (let k = 0; k < n; k++) {
      if (instanceIndex >= MAX_INSTANCES) break

      const token = resolvedGlyphs[k]!
      const identity = token.ordinal + 1
      const { meta } = token

      const hashLat = glyphHash(identity, slot.row, k)
      const hashDep = glyphHash(identity + 1, slot.sector, k ^ 0xab)
      const hashOrg = glyphHash(identity + 2, slot.row ^ slot.sector, k + 17)
      const hashRadius = glyphHash(identity + 3, slot.row + 5, k ^ 0x15)
      const hashLength = glyphHash(identity + 5, slot.sector + 7, k ^ 0x37)
      const hashCross = glyphHash(identity + 7, slot.row ^ slot.sector, k ^ 0x59)
      const hashHero = glyphHash(identity + 9, slot.row + slot.sector, k ^ 0x7d)

      const t01 = THREE.MathUtils.clamp((k + hashLat * 0.85 + 0.08) / (n + 0.1), 0.04, 0.96)
      const x =
        this.fieldCenterX +
        slot.spanStart +
        t01 * slot.spanSize +
        lineLateralShift +
        (hashLat - 0.5) * slot.sectorStep * 0.38
      const z = this.fieldCenterZ + slot.lineCoord + (hashDep - 0.5) * rowStep * 0.6 + lineDepthShift
      if (!this.placementMask.includeAtXZ(x, z)) continue

      const noise = logOrganicWorldField(x + hashOrg * 0.28, z + hashOrg * 0.24)
      const keepChance = THREE.MathUtils.lerp(0.34, 0.86, noise)
      if (glyphHash(identity + 11, slot.row, k ^ 0x55) > keepChance) continue

      const motionKey = `${motionKeyPrefix}:${k}`
      const state = this.getMotionState(motionKey)
      this.applyMotionState(state, x, z, delta)
      visitedKeys.add(motionKey)
      if (this.motionInactive(state)) {
        this.motionStates.delete(motionKey)
      }

      const movedX = x + state.offsetX
      const movedZ = z + state.offsetZ
      const groundY = getGroundHeight(movedX, movedZ)
      const radiusTier = THREE.MathUtils.lerp(0.74, 1.56, hashRadius)
      const lengthTier = THREE.MathUtils.lerp(0.72, 1.62, hashLength)
      const heroScale = hashHero > 0.86 ? THREE.MathUtils.lerp(1.12, 1.52, hashCross) : 1
      const radius = Math.max(
        0.08,
        (0.15 + meta.radiusBias + noise * 0.09) * this.params.sizeScale * radiusTier * heroScale,
      )
      const length = Math.max(
        radius * 2.6,
        (1.02 + meta.lengthBias + noise * 1.02) *
          this.params.sizeScale *
          this.params.lengthScale *
          lengthTier *
          heroScale,
      )
      const yaw = lineSeed * Math.PI * 2 + k * 1.07 + noise * 1.2
      const planarSpeed = Math.hypot(state.velocityX, state.velocityZ)
      const axisYaw = yaw + state.yaw
      const roll = state.roll + (hashDep - 0.5) * 0.04
      const crossRadius = radius * THREE.MathUtils.lerp(0.7, 1.18, hashCross)
      const liftRadius = Math.max(radius, crossRadius)

      tmpLongAxis.set(Math.cos(axisYaw), 0, Math.sin(axisYaw)).normalize()
      tmpBaseQuat.setFromUnitVectors(worldUp, tmpLongAxis)
      tmpSpinQuat.setFromAxisAngle(tmpLongAxis, roll + planarSpeed * 0.015)
      dummy.position.set(movedX, groundY + liftRadius * THREE.MathUtils.lerp(0.42, 0.56, hashRadius), movedZ)
      dummy.quaternion.copy(tmpBaseQuat).multiply(tmpSpinQuat)
      dummy.scale.set(radius, length, crossRadius * (0.84 + noise * 0.18))
      dummy.updateMatrix()
      this.logMesh.setMatrixAt(instanceIndex, dummy.matrix)
      this.logMesh.setColorAt(instanceIndex, logColor(identity, noise, meta))
      instanceIndex++
    }

    return instanceIndex
  }
}

export type CreateLogFieldEffectOptions = {
  seedCursor: SeedCursorFactory
  surface?: PreparedSurfaceSource<LogTokenId, LogTokenMeta>
  initialParams?: LogFieldParams
  placementMask?: LogFieldPlacementMask
}

export function createLogFieldEffect({
  seedCursor,
  surface = getPreparedLogSurface(),
  initialParams = DEFAULT_LOG_FIELD_PARAMS,
  placementMask,
}: CreateLogFieldEffectOptions): LogFieldEffect {
  const effect = createSurfaceEffect({
    id: 'log-field',
    source: surface,
    layout: fieldLayout({
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 6 + 2,
      staggerFactor: 0.62,
      minSpanFactor: 0.42,
    }),
    seedCursor,
  })

  return new LogFieldEffect(effect.source, seedCursor, initialParams, placementMask)
}

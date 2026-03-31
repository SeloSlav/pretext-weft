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
import { createBarkGrainTexture, warmBarkColor } from './barkShared'

export type LogFieldParams = {
  layoutDensity: number
  sizeScale: number
  lengthScale: number
  downhillDrift: number
}

export const DEFAULT_LOG_FIELD_PARAMS: LogFieldParams = {
  layoutDensity: 0.42,
  sizeScale: 1,
  lengthScale: 1,
  downhillDrift: 0.9,
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
const LOG_SLOPE_SAMPLE_DISTANCE = 0.72
const LOG_SLOPE_THRESHOLD = 0.018
const LOG_SLOPE_RESPONSE_MAX = 0.14
const LOG_SLOPE_ACCEL = 5.4
const tmpLongAxis = new THREE.Vector3()
const tmpGroundNormal = new THREE.Vector3()
const tmpBasisX = new THREE.Vector3()
const tmpBasisY = new THREE.Vector3()
const tmpBasisZ = new THREE.Vector3()
const tmpRadialOffset = new THREE.Vector3()
const worldDown = new THREE.Vector3(0, -1, 0)
const tmpBaseQuat = new THREE.Quaternion()
const tmpSpinQuat = new THREE.Quaternion()
const worldUp = new THREE.Vector3(0, 1, 0)
const tmpLocalPoint = new THREE.Vector3()
const tmpLogColor = new THREE.Color()

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

/** Keep in sync with `makeLogGeometry` radial args; hull refinement and support use this. */
const LOG_CYLINDER_LOCAL_RADIUS_MAX = 0.58
const LOG_CYLINDER_HALF_HEIGHT = 0.5

function makeLogGeometry(): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(0.5, LOG_CYLINDER_LOCAL_RADIUS_MAX, 1, 10, 1, false)
}

/**
 * Grayscale grain only — hue/sat come from `warmBarkColor` × trunk-matching Lambert, same as tree trunks.
 */
function createLogBarkTexture(): THREE.CanvasTexture {
  return createBarkGrainTexture()
}

export class LogFieldEffect {
  readonly group = new THREE.Group()

  private readonly logBarkTexture = createLogBarkTexture()
  private readonly logGeometry = makeLogGeometry()
  private readonly logMaterial = new THREE.MeshLambertMaterial({
    map: this.logBarkTexture,
    emissive: '#5c3a18',
    emissiveIntensity: 0.28,
  })
  private readonly logMesh = new THREE.InstancedMesh(this.logGeometry, this.logMaterial, MAX_INSTANCES)
  private readonly placementMask: Required<LogFieldPlacementMask>
  private readonly fieldWidth: number
  private readonly fieldDepth: number
  private readonly fieldCenterX: number
  private readonly fieldCenterZ: number
  private layoutDriver: SurfaceLayoutDriver<LogTokenId, LogTokenMeta>
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
    this.layoutDriver = this.createLayoutDriver(surface, seedCursor)

    this.logMesh.frustumCulled = false
    this.logMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.group.add(this.logMesh)
  }

  setParams(params: Partial<LogFieldParams>): void {
    this.params = { ...this.params, ...params }
  }

  setSurface(surface: PreparedSurfaceSource<LogTokenId, LogTokenMeta>, seedCursor: SeedCursorFactory): void {
    this.layoutDriver = this.createLayoutDriver(surface, seedCursor)
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

  update(
    elapsedTime: number,
    getGroundHeight: (x: number, z: number) => number,
  ): void {
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
    this.logBarkTexture.dispose()
    this.logGeometry.dispose()
    this.logMaterial.dispose()
  }

  private getSlotMaxWidth(slot: SurfaceLayoutSlot): number {
    return slot.spanSize * BASE_LAYOUT_PX_PER_WORLD * this.params.layoutDensity
  }

  private createLayoutDriver(
    surface: PreparedSurfaceSource<LogTokenId, LogTokenMeta>,
    seedCursor: SeedCursorFactory,
  ): SurfaceLayoutDriver<LogTokenId, LogTokenMeta> {
    return new SurfaceLayoutDriver({
      surface,
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 6 + 2,
      seedCursor,
      staggerFactor: 0.62,
      minSpanFactor: 0.42,
    })
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

  private shouldActivateMotionAt(x: number, z: number): boolean {
    for (const impulse of this.pendingImpulses) {
      const dx = x - impulse.x
      const dz = z - impulse.z
      if (dx * dx + dz * dz <= impulse.radius * impulse.radius) return true
    }
    return false
  }

  private applyMotionState(
    state: LogMotionState,
    baseX: number,
    baseZ: number,
    delta: number,
    getGroundHeight: (x: number, z: number) => number,
    applyImpulses = true,
  ): void {
    const currentX = baseX + state.offsetX
    const currentZ = baseZ + state.offsetZ
    let receivedImpulse = false
    if (applyImpulses) {
      for (const impulse of this.pendingImpulses) {
        const dx = currentX - impulse.x
        const dz = currentZ - impulse.z
        const distance = Math.hypot(dx, dz)
        if (distance > impulse.radius) continue
        receivedImpulse = true
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
    }

    if (delta <= 0) return
    const wasActive =
      Math.abs(state.offsetX) > 0.002 ||
      Math.abs(state.offsetZ) > 0.002 ||
      Math.abs(state.velocityX) > 0.002 ||
      Math.abs(state.velocityZ) > 0.002 ||
      Math.abs(state.rollVelocity) > 0.002 ||
      Math.abs(state.yawVelocity) > 0.002
    const downhill = this.sampleDownhillVector(currentX, currentZ, getGroundHeight)
    if ((receivedImpulse || wasActive) && downhill.slope > LOG_SLOPE_THRESHOLD && this.params.downhillDrift > 1e-6) {
      const slope01 = THREE.MathUtils.clamp(
        (downhill.slope - LOG_SLOPE_THRESHOLD) / (LOG_SLOPE_RESPONSE_MAX - LOG_SLOPE_THRESHOLD),
        0,
        1,
      )
      const carry = this.params.downhillDrift * slope01 * LOG_SLOPE_ACCEL * delta
      state.velocityX += downhill.dirX * carry
      state.velocityZ += downhill.dirZ * carry
      state.rollVelocity += downhill.dirX * 0.08 * slope01 + downhill.dirZ * 0.06 * slope01
    }
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

  private sampleDownhillVector(
    x: number,
    z: number,
    getGroundHeight: (x: number, z: number) => number,
  ): { dirX: number; dirZ: number; slope: number } {
    const sample = LOG_SLOPE_SAMPLE_DISTANCE
    const gradX = (getGroundHeight(x + sample, z) - getGroundHeight(x - sample, z)) / (sample * 2)
    const gradZ = (getGroundHeight(x, z + sample) - getGroundHeight(x, z - sample)) / (sample * 2)
    const slope = Math.hypot(gradX, gradZ)
    if (slope <= 1e-6) {
      return { dirX: 0, dirZ: 0, slope: 0 }
    }
    return {
      dirX: -gradX / slope,
      dirZ: -gradZ / slope,
      slope,
    }
  }

  private sampleGroundNormal(
    x: number,
    z: number,
    getGroundHeight: (x: number, z: number) => number,
  ): THREE.Vector3 {
    const sample = LOG_SLOPE_SAMPLE_DISTANCE
    const gradX = (getGroundHeight(x + sample, z) - getGroundHeight(x - sample, z)) / (sample * 2)
    const gradZ = (getGroundHeight(x, z + sample) - getGroundHeight(x, z - sample)) / (sample * 2)
    return tmpGroundNormal.set(-gradX, 1, -gradZ).normalize()
  }

  private computeSupportedCenterY(
    centerX: number,
    centerZ: number,
    orientation: THREE.Quaternion,
    radiusX: number,
    halfLength: number,
    radiusZ: number,
    getGroundHeight: (x: number, z: number) => number,
  ): number {
    tmpBasisX.set(1, 0, 0).applyQuaternion(orientation).normalize()
    tmpBasisY.set(0, 1, 0).applyQuaternion(orientation).normalize()
    tmpBasisZ.set(0, 0, 1).applyQuaternion(orientation).normalize()

    const downX = worldDown.dot(tmpBasisX)
    const downZ = worldDown.dot(tmpBasisZ)
    const radialDenom = Math.hypot(radiusX * downX, radiusZ * downZ)
    if (radialDenom <= 1e-6) {
      tmpRadialOffset.copy(tmpBasisZ).multiplyScalar(-radiusZ)
    } else {
      tmpRadialOffset
        .copy(tmpBasisX)
        .multiplyScalar((-radiusX * radiusX * downX) / radialDenom)
        .addScaledVector(tmpBasisZ, (-radiusZ * radiusZ * downZ) / radialDenom)
    }

    let supportY = getGroundHeight(centerX + tmpRadialOffset.x, centerZ + tmpRadialOffset.z) - tmpRadialOffset.y
    const axisSteps = [-1, -0.66, -0.33, 0, 0.33, 0.66, 1]
    for (const step of axisSteps) {
      const axisOffset = halfLength * step
      const sampleX = centerX + tmpRadialOffset.x + tmpBasisY.x * axisOffset
      const sampleZ = centerZ + tmpRadialOffset.z + tmpBasisY.z * axisOffset
      const sampleOffsetY = tmpRadialOffset.y + tmpBasisY.y * axisOffset
      supportY = Math.max(supportY, getGroundHeight(sampleX, sampleZ) - sampleOffsetY)
    }
    return supportY + 0.01
  }

  /**
   * Lifts center Y so rim samples of the scaled cylinder (same mapping as InstancedMesh: scale then quaternion)
   * sit on or above terrain. Analytical `computeSupportedCenterY` misses rolled/tapered contact on ridges.
   */
  private refineLogCenterYAgainstTerrain(
    centerX: number,
    centerZ: number,
    centerY: number,
    quat: THREE.Quaternion,
    radiusScale: number,
    lengthScale: number,
    depthScale: number,
    getGroundHeight: (x: number, z: number) => number,
  ): number {
    const lr = LOG_CYLINDER_LOCAL_RADIUS_MAX
    let y = centerY
    const seg = 10
    for (const ly of [-0.5, -0.25, 0, 0.25, 0.5] as const) {
      for (let i = 0; i < seg; i++) {
        const ang = (i / seg) * Math.PI * 2
        const c = Math.cos(ang)
        const s = Math.sin(ang)
        tmpLocalPoint.set(lr * c * radiusScale, ly * lengthScale, lr * s * depthScale)
        tmpLocalPoint.applyQuaternion(quat)
        y = Math.max(y, getGroundHeight(centerX + tmpLocalPoint.x, centerZ + tmpLocalPoint.z) - tmpLocalPoint.y)
      }
    }
    return y + 0.008
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
      let movedX = x
      let movedZ = z
      let motionVelocityX = 0
      let motionVelocityZ = 0
      let motionYaw = 0
      let motionRoll = 0
      const state = this.motionStates.get(motionKey)
      if (state || this.shouldActivateMotionAt(x, z)) {
        const ensuredState = state ?? this.getMotionState(motionKey)
        const dt = delta
        const nStep = dt > 0.001 ? Math.max(1, Math.min(3, Math.ceil(dt / 0.017))) : 1
        const h = dt / nStep
        for (let si = 0; si < nStep; si++) {
          this.applyMotionState(ensuredState, x, z, h, getGroundHeight, si === 0)
        }
        if (this.motionInactive(ensuredState)) {
          this.motionStates.delete(motionKey)
        } else {
          visitedKeys.add(motionKey)
          movedX = x + ensuredState.offsetX
          movedZ = z + ensuredState.offsetZ
          motionVelocityX = ensuredState.velocityX
          motionVelocityZ = ensuredState.velocityZ
          motionYaw = ensuredState.yaw
          motionRoll = ensuredState.roll
        }
      }
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
      const planarSpeed = Math.hypot(motionVelocityX, motionVelocityZ)
      const roll = motionRoll + (hashDep - 0.5) * 0.04
      const crossRadius = radius * THREE.MathUtils.lerp(0.7, 1.18, hashCross)
      const depthScale = crossRadius * (0.84 + noise * 0.18)
      const supportNormal = this.sampleGroundNormal(movedX, movedZ, getGroundHeight)
      tmpLongAxis.set(Math.cos(yaw + motionYaw), 0, Math.sin(yaw + motionYaw))
      tmpLongAxis.addScaledVector(supportNormal, -tmpLongAxis.dot(supportNormal))
      if (tmpLongAxis.lengthSq() <= 1e-6) {
        tmpLongAxis.set(Math.cos(yaw + motionYaw), 0, Math.sin(yaw + motionYaw))
      }
      tmpLongAxis.normalize()
      tmpBaseQuat.setFromUnitVectors(worldUp, tmpLongAxis)
      tmpSpinQuat.setFromAxisAngle(tmpLongAxis, roll + planarSpeed * 0.015)
      dummy.quaternion.copy(tmpBaseQuat).multiply(tmpSpinQuat)
      const worldSemiX = radius * LOG_CYLINDER_LOCAL_RADIUS_MAX
      const worldSemiZ = depthScale * LOG_CYLINDER_LOCAL_RADIUS_MAX
      const worldHalfLen = length * LOG_CYLINDER_HALF_HEIGHT
      let centerY = this.computeSupportedCenterY(
        movedX,
        movedZ,
        dummy.quaternion,
        worldSemiX,
        worldHalfLen,
        worldSemiZ,
        getGroundHeight,
      )
      centerY = this.refineLogCenterYAgainstTerrain(
        movedX,
        movedZ,
        centerY,
        dummy.quaternion,
        radius,
        length,
        depthScale,
        getGroundHeight,
      )
      dummy.position.set(movedX, centerY, movedZ)
      dummy.scale.set(radius, length, depthScale)
      dummy.updateMatrix()
      this.logMesh.setMatrixAt(instanceIndex, dummy.matrix)
      warmBarkColor(identity, noise, meta.warmth, tmpLogColor)
      this.logMesh.setColorAt(instanceIndex, tmpLogColor)
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

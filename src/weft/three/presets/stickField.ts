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
  getPreparedStickSurface,
  type StickTokenId,
  type StickTokenMeta,
} from './stickFieldSource'

export type StickFieldParams = {
  layoutDensity: number
  sizeScale: number
  lengthScale: number
  disturbanceRadius: number
  disturbanceStrength: number
  displacementDistance: number
  downhillDrift: number
}

export const DEFAULT_STICK_FIELD_PARAMS: StickFieldParams = {
  layoutDensity: 0.5,
  sizeScale: 2,
  lengthScale: 2.2,
  disturbanceRadius: 1.15,
  disturbanceStrength: 1.2,
  displacementDistance: 0.62,
  downhillDrift: 0.34,
}

export type StickFieldBounds = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export type StickFieldPlacementMask = {
  bounds?: StickFieldBounds
  includeAtXZ?: (x: number, z: number) => boolean
}

export type StickFieldDisturbanceOptions = {
  radiusScale?: number
  strength?: number
  displacementScale?: number
  mergeRadius?: number
  directionX?: number
  directionZ?: number
  tangentialStrength?: number
  spin?: number
}

const DEFAULT_STICK_FIELD_BOUNDS: StickFieldBounds = {
  minX: -28,
  maxX: 28,
  minZ: -28,
  maxZ: 28,
}

const ROWS = 17
const SECTORS = 19
const MAX_INSTANCES = 5_600
const BASE_LAYOUT_PX_PER_WORLD = 7
const STICK_DRAG = 3.4
const STICK_TWIST_DRAG = 4.4
const STICK_MAX_SPEED = 5.4
const STICK_SLOPE_SAMPLE_DISTANCE = 0.42
const STICK_SLOPE_THRESHOLD = 0.02
const STICK_SLOPE_RESPONSE_MAX = 0.16
const STICK_SLOPE_ACCEL = 2.6
const STICK_SLOPE_DRIFT_DURATION = 0.9
/** Must match `CylinderGeometry` radial argument in `makeStickGeometry` (world semi-axis = this × mesh scale). */
const STICK_CYLINDER_LOCAL_RADIUS = 0.5
const tmpLocalPoint = new THREE.Vector3()
const tmpStickAxis = new THREE.Vector3()
const tmpStickCorner = new THREE.Vector3()
const tmpStickNormal = new THREE.Vector3()
const tmpStickBasisX = new THREE.Vector3()
const tmpStickBasisY = new THREE.Vector3()
const tmpStickBasisZ = new THREE.Vector3()
const tmpStickRadialOffset = new THREE.Vector3()
const tmpStickQuat = new THREE.Quaternion()
const tmpStickSpinQuat = new THREE.Quaternion()
const worldUp = new THREE.Vector3(0, 1, 0)
const worldDown = new THREE.Vector3(0, -1, 0)

const tmpColor = new THREE.Color()
const dummy = new THREE.Object3D()

type StickTwigState = {
  offsetX: number
  offsetZ: number
  velocityX: number
  velocityZ: number
  twist: number
  twistVelocity: number
  downhillTimeRemaining: number
}

type PendingStickImpulse = {
  x: number
  z: number
  radius: number
  strength: number
  directionX: number
  directionZ: number
  tangentialStrength: number
  spin: number
}

type StickPlacement = {
  key: string
  instanceIndex: number
  x: number
  z: number
  radius: number
  length: number
  depthRadius: number
  pieceAngle: number
  pieceHash: number
  noise: number
  baseMatrix: THREE.Matrix4
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

function stickMotionKeyPrefix(slot: SurfaceLayoutSlot, tokenLineKey: string): string {
  return `${slot.row}:${slot.sector}:${tokenLineKey}`
}

const stickOrganicWorldField = createWorldField(1289, {
  scale: 6.8,
  octaves: 2,
  roughness: 0.58,
  warpAmplitude: 0,
  ridge: 0.08,
  contrast: 1.04,
})

function stickColor(identity: number, noise: number, meta: StickTokenMeta): THREE.Color {
  const t = uhash(identity * 2654435761)
  const hue = 0.07 + t * 0.04 + meta.warmth
  const sat = 0.22 + noise * 0.1 + t * 0.06
  const light = 0.17 + noise * 0.14 + t * 0.06
  return tmpColor.setHSL(hue, sat, light)
}

function makeStickGeometry(): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, false)
}

export class StickFieldEffect {
  readonly group = new THREE.Group()

  private readonly stickGeometry = makeStickGeometry()
  private readonly stickMaterial = new THREE.MeshStandardMaterial({
    roughness: 0.98,
    metalness: 0.01,
  })
  private readonly stickMesh = new THREE.InstancedMesh(this.stickGeometry, this.stickMaterial, MAX_INSTANCES)
  private readonly placementMask: Required<StickFieldPlacementMask>
  private readonly fieldWidth: number
  private readonly fieldDepth: number
  private readonly fieldCenterX: number
  private readonly fieldCenterZ: number
  private readonly layoutDriver: SurfaceLayoutDriver<StickTokenId, StickTokenMeta>
  private placementsDirty = true
  private readonly placements: StickPlacement[] = []
  private readonly placementByKey = new Map<string, StickPlacement>()
  private readonly twigStates = new Map<string, StickTwigState>()
  private readonly pendingImpulses: PendingStickImpulse[] = []
  private params: StickFieldParams
  private lastElapsed = 0

  constructor(
    surface: PreparedSurfaceSource<StickTokenId, StickTokenMeta>,
    seedCursor: SeedCursorFactory,
    initialParams: StickFieldParams,
    placementMask: StickFieldPlacementMask = {},
  ) {
    this.params = { ...initialParams }
    const bounds = placementMask.bounds ?? DEFAULT_STICK_FIELD_BOUNDS
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
      advanceForRow: (row) => row * 5 + 1,
      seedCursor,
      staggerFactor: 0.6,
      minSpanFactor: 0.4,
    })

    this.stickMesh.frustumCulled = false
    this.stickMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.group.add(this.stickMesh)
  }

  setParams(params: Partial<StickFieldParams>): void {
    this.params = { ...this.params, ...params }
    this.placementsDirty = true
  }

  clearMotion(): void {
    this.twigStates.clear()
    this.pendingImpulses.length = 0
    this.placementsDirty = true
  }

  hasMotion(): boolean {
    return this.pendingImpulses.length > 0 || this.twigStates.size > 0
  }

  clearDisturbances(): void {
    this.clearMotion()
  }

  hasDisturbances(): boolean {
    return this.hasMotion()
  }

  addMotionFromWorldPoint(
    worldPoint: THREE.Vector3,
    options: StickFieldDisturbanceOptions = {},
  ): void {
    tmpLocalPoint.copy(worldPoint)
    this.group.worldToLocal(tmpLocalPoint)
    const x = tmpLocalPoint.x
    const z = tmpLocalPoint.z
    const directionLength = Math.hypot(options.directionX ?? 0, options.directionZ ?? 0)
    this.pendingImpulses.push({
      radius: this.params.disturbanceRadius * (options.radiusScale ?? 1),
      strength: this.params.disturbanceStrength * (options.strength ?? 1),
      x,
      z,
      directionX: directionLength > 1e-6 ? (options.directionX ?? 0) / directionLength : 1,
      directionZ: directionLength > 1e-6 ? (options.directionZ ?? 0) / directionLength : 0,
      tangentialStrength: options.tangentialStrength ?? 0.28,
      spin: options.spin ?? 0.18,
    })
  }

  addDisturbanceFromWorldPoint(
    worldPoint: THREE.Vector3,
    options: StickFieldDisturbanceOptions = {},
  ): void {
    this.addMotionFromWorldPoint(worldPoint, options)
  }

  update(
    elapsedTime: number,
    getGroundHeight: (x: number, z: number) => number,
  ): void {
    const delta = this.lastElapsed === 0 ? 0 : Math.min(0.05, Math.max(0, elapsedTime - this.lastElapsed))
    this.lastElapsed = elapsedTime
    if (this.placementsDirty) {
      this.rebuildPlacements(getGroundHeight)
      this.placementsDirty = false
    }
    if (this.pendingImpulses.length === 0 && this.twigStates.size === 0) {
      return
    }
    this.activateMotionNearPendingImpulses()
    this.updateActivePlacements(delta, getGroundHeight)
    this.pendingImpulses.length = 0
  }

  private rebuildPlacements(getGroundHeight: (x: number, z: number) => number): void {
    if (this.params.layoutDensity <= 0 || this.params.sizeScale <= 0 || this.params.lengthScale <= 0) {
      this.placements.length = 0
      this.placementByKey.clear()
      this.twigStates.clear()
      this.stickMesh.count = 0
      this.stickMesh.instanceMatrix.needsUpdate = true
      return
    }

    const rowStep = this.fieldDepth / (ROWS + 1.05)
    const backZ = this.fieldDepth * 0.48
    let instanceIndex = 0
    this.placements.length = 0
    this.placementByKey.clear()

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
          0,
          undefined,
        )
      },
    })

    this.stickMesh.count = instanceIndex
    this.stickMesh.instanceMatrix.needsUpdate = true
    if (this.stickMesh.instanceColor) {
      this.stickMesh.instanceColor.needsUpdate = true
    }
  }

  dispose(): void {
    this.stickGeometry.dispose()
    this.stickMaterial.dispose()
  }

  private getSlotMaxWidth(slot: SurfaceLayoutSlot): number {
    return slot.spanSize * BASE_LAYOUT_PX_PER_WORLD * this.params.layoutDensity
  }

  private getTwigState(key: string): StickTwigState {
    let state = this.twigStates.get(key)
    if (!state) {
      state = {
        offsetX: 0,
        offsetZ: 0,
        velocityX: 0,
        velocityZ: 0,
        twist: 0,
        twistVelocity: 0,
        downhillTimeRemaining: 0,
      }
      this.twigStates.set(key, state)
    }
    return state
  }

  private shouldActivateMotionAt(x: number, z: number): boolean {
    if (this.pendingImpulses.length === 0) return false
    for (const impulse of this.pendingImpulses) {
      const dx = x - impulse.x
      const dz = z - impulse.z
      if (dx * dx + dz * dz <= impulse.radius * impulse.radius) return true
    }
    return false
  }

  private applyTwigState(
    state: StickTwigState,
    baseX: number,
    baseZ: number,
    delta: number,
    pieceBias: number,
    getGroundHeight: (x: number, z: number) => number,
    applyImpulses = true,
  ): void {
    const currentX = baseX + state.offsetX
    const currentZ = baseZ + state.offsetZ
    const pieceSign = pieceBias >= 0 ? 1 : -1
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
        const forwardScale = 0.72 + Math.abs(pieceBias) * 0.38
        const tangentScale = impulse.tangentialStrength * (0.24 + Math.abs(pieceBias) * 0.72) * pieceSign
        state.velocityX += impulse.directionX * push * forwardScale + tangentX * push * tangentScale
        state.velocityZ += impulse.directionZ * push * forwardScale + tangentZ * push * tangentScale
        state.twistVelocity += push * pieceSign * (impulse.spin * 0.24 + impulse.tangentialStrength * 0.18)
      }
    }

    if (delta <= 0) return
    if (receivedImpulse) {
      state.downhillTimeRemaining = STICK_SLOPE_DRIFT_DURATION
    }
    const wasActive =
      Math.abs(state.offsetX) > 0.002 ||
      Math.abs(state.offsetZ) > 0.002 ||
      Math.abs(state.velocityX) > 0.002 ||
      Math.abs(state.velocityZ) > 0.002 ||
      Math.abs(state.twistVelocity) > 0.002
    const downhill = this.sampleDownhillVector(currentX, currentZ, getGroundHeight)
    if (
      wasActive &&
      state.downhillTimeRemaining > 0 &&
      downhill.slope > STICK_SLOPE_THRESHOLD &&
      this.params.downhillDrift > 1e-6
    ) {
      const slope01 = THREE.MathUtils.clamp(
        (downhill.slope - STICK_SLOPE_THRESHOLD) / (STICK_SLOPE_RESPONSE_MAX - STICK_SLOPE_THRESHOLD),
        0,
        1,
      )
      const carry = this.params.downhillDrift * slope01 * STICK_SLOPE_ACCEL * delta
      state.velocityX += downhill.dirX * carry
      state.velocityZ += downhill.dirZ * carry
      state.twistVelocity += (pieceSign * 0.04 + downhill.dirX * 0.02 - downhill.dirZ * 0.02) * slope01
    }
    state.downhillTimeRemaining = Math.max(0, state.downhillTimeRemaining - delta)
    const drag = Math.exp(-STICK_DRAG * delta)
    const twistDrag = Math.exp(-STICK_TWIST_DRAG * delta)
    const speed = Math.hypot(state.velocityX, state.velocityZ)
    if (speed > STICK_MAX_SPEED) {
      const s = STICK_MAX_SPEED / speed
      state.velocityX *= s
      state.velocityZ *= s
    }
    state.velocityX *= drag
    state.velocityZ *= drag
    state.offsetX += state.velocityX * delta
    state.offsetZ += state.velocityZ * delta
    state.twistVelocity *= twistDrag
    state.twist += state.twistVelocity * delta
  }

  private sampleDownhillVector(
    x: number,
    z: number,
    getGroundHeight: (x: number, z: number) => number,
  ): { dirX: number; dirZ: number; slope: number } {
    const sample = STICK_SLOPE_SAMPLE_DISTANCE
    const h0 = getGroundHeight(x, z)
    const gradX = (getGroundHeight(x + sample, z) - h0) / sample
    const gradZ = (getGroundHeight(x, z + sample) - h0) / sample
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
    const sample = STICK_SLOPE_SAMPLE_DISTANCE
    const h0 = getGroundHeight(x, z)
    const gradX = (getGroundHeight(x + sample, z) - h0) / sample
    const gradZ = (getGroundHeight(x, z + sample) - h0) / sample
    return tmpStickNormal.set(-gradX, 1, -gradZ).normalize()
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
    tmpStickBasisX.set(1, 0, 0).applyQuaternion(orientation).normalize()
    tmpStickBasisY.set(0, 1, 0).applyQuaternion(orientation).normalize()
    tmpStickBasisZ.set(0, 0, 1).applyQuaternion(orientation).normalize()

    const downX = worldDown.dot(tmpStickBasisX)
    const downZ = worldDown.dot(tmpStickBasisZ)
    const radialDenom = Math.hypot(radiusX * downX, radiusZ * downZ)
    if (radialDenom <= 1e-6) {
      tmpStickRadialOffset.copy(tmpStickBasisZ).multiplyScalar(-radiusZ)
    } else {
      tmpStickRadialOffset
        .copy(tmpStickBasisX)
        .multiplyScalar((-radiusX * radiusX * downX) / radialDenom)
        .addScaledVector(tmpStickBasisZ, (-radiusZ * radiusZ * downZ) / radialDenom)
    }

    let supportY =
      getGroundHeight(centerX + tmpStickRadialOffset.x, centerZ + tmpStickRadialOffset.z) - tmpStickRadialOffset.y
    const axisSteps = [-1, 0, 1]
    for (const step of axisSteps) {
      const axisOffset = halfLength * step
      const sampleX = centerX + tmpStickRadialOffset.x + tmpStickBasisY.x * axisOffset
      const sampleZ = centerZ + tmpStickRadialOffset.z + tmpStickBasisY.z * axisOffset
      const sampleOffsetY = tmpStickRadialOffset.y + tmpStickBasisY.y * axisOffset
      supportY = Math.max(supportY, getGroundHeight(sampleX, sampleZ) - sampleOffsetY)
    }
    return supportY + 0.01
  }

  /**
   * Lifts mesh center Y so every sampled surface point sits on or above `getGroundHeight`.
   * Uses the same local→world mapping as InstancedMesh (scale then quaternion; position added after).
   */
  private refineStickCenterYAgainstTerrain(
    centerX: number,
    centerZ: number,
    centerY: number,
    quat: THREE.Quaternion,
    radiusScale: number,
    lengthScale: number,
    depthScale: number,
    getGroundHeight: (x: number, z: number) => number,
  ): number {
    const lr = STICK_CYLINDER_LOCAL_RADIUS
    let y = centerY
    const seg = 6
    for (const ly of [-0.5, 0.5] as const) {
      for (let i = 0; i < seg; i++) {
        const ang = (i / seg) * Math.PI * 2
        const c = Math.cos(ang)
        const s = Math.sin(ang)
        tmpStickCorner.set(lr * c * radiusScale, ly * lengthScale, lr * s * depthScale)
        tmpStickCorner.applyQuaternion(quat)
        y = Math.max(
          y,
          getGroundHeight(centerX + tmpStickCorner.x, centerZ + tmpStickCorner.z) - tmpStickCorner.y,
        )
      }
    }
    return y + 0.008
  }

  private twigInactive(state: StickTwigState): boolean {
    return (
      Math.abs(state.offsetX) < 0.01 &&
      Math.abs(state.offsetZ) < 0.01 &&
      Math.abs(state.velocityX) < 0.01 &&
      Math.abs(state.velocityZ) < 0.01 &&
      Math.abs(state.twist) < 0.01 &&
      Math.abs(state.twistVelocity) < 0.01
    )
  }

  private activateMotionNearPendingImpulses(): void {
    if (this.pendingImpulses.length === 0) return
    for (const placement of this.placements) {
      if (this.shouldActivateMotionAt(placement.x, placement.z)) {
        this.getTwigState(placement.key)
      }
    }
  }

  private updateActivePlacements(
    delta: number,
    getGroundHeight: (x: number, z: number) => number,
  ): void {
    if (this.twigStates.size === 0) return
    let touchedMatrix = false
    for (const [twigKey, state] of this.twigStates) {
      const placement = this.placementByKey.get(twigKey)
      if (!placement) {
        this.twigStates.delete(twigKey)
        continue
      }
      const dt = delta
      const nStep = dt > 0.001 ? Math.max(1, Math.min(3, Math.ceil(dt / 0.017))) : 1
      const h = dt / nStep
      for (let si = 0; si < nStep; si++) {
        this.applyTwigState(state, placement.x, placement.z, h, placement.pieceHash - 0.5, getGroundHeight, si === 0)
      }
      touchedMatrix = true
      if (this.twigInactive(state)) {
        this.twigStates.delete(twigKey)
        this.stickMesh.setMatrixAt(placement.instanceIndex, placement.baseMatrix)
        continue
      }
      const x = placement.x + state.offsetX
      const z = placement.z + state.offsetZ
      const speed = Math.hypot(state.velocityX, state.velocityZ)
      const yaw = placement.pieceAngle + state.twist * (0.18 + placement.pieceHash * 0.36)
      const roll = (placement.pieceHash - 0.5) * 0.24 + state.twist * (0.08 + placement.pieceHash * 0.16)
      this.sampleGroundNormal(x, z, getGroundHeight)
      tmpStickAxis.set(Math.cos(yaw), 0, Math.sin(yaw))
      tmpStickAxis.addScaledVector(tmpStickNormal, -tmpStickAxis.dot(tmpStickNormal))
      if (tmpStickAxis.lengthSq() <= 1e-6) {
        tmpStickAxis.set(Math.cos(yaw), 0, Math.sin(yaw))
      }
      tmpStickAxis.normalize()
      tmpStickQuat.setFromUnitVectors(worldUp, tmpStickAxis)
      tmpStickSpinQuat.setFromAxisAngle(
        tmpStickAxis,
        roll + (placement.noise - 0.5) * 0.16 + speed * (0.04 + placement.pieceHash * 0.06),
      )
      dummy.quaternion.copy(tmpStickQuat).multiply(tmpStickSpinQuat)
      const worldSemiX = placement.radius * STICK_CYLINDER_LOCAL_RADIUS
      const worldSemiZ = placement.depthRadius * STICK_CYLINDER_LOCAL_RADIUS
      const worldHalfLen = placement.length * STICK_CYLINDER_LOCAL_RADIUS
      let centerY = this.computeSupportedCenterY(
        x,
        z,
        dummy.quaternion,
        worldSemiX,
        worldHalfLen,
        worldSemiZ,
        getGroundHeight,
      )
      centerY = this.refineStickCenterYAgainstTerrain(
        x,
        z,
        centerY,
        dummy.quaternion,
        placement.radius,
        placement.length,
        placement.depthRadius,
        getGroundHeight,
      )
      dummy.position.set(x, centerY, z)
      dummy.scale.set(placement.radius, placement.length, placement.depthRadius)
      dummy.updateMatrix()
      this.stickMesh.setMatrixAt(placement.instanceIndex, dummy.matrix)
    }
    if (touchedMatrix) {
      this.stickMesh.instanceMatrix.needsUpdate = true
    }
  }

  private projectLine(
    slot: SurfaceLayoutSlot,
    resolvedGlyphs: readonly ResolvedSurfaceGlyph<StickTokenId, StickTokenMeta>[],
    tokenLineKey: string,
    rowStep: number,
    getGroundHeight: (x: number, z: number) => number,
    instanceIndex: number,
    delta: number,
    visitedKeys?: Set<string>,
  ): number {
    const n = resolvedGlyphs.length
    const lineSeed = lineSignature(tokenLineKey)
    const motionKeyPrefix = stickMotionKeyPrefix(slot, tokenLineKey)
    const lineLateralShift = (lineSeed - 0.5) * slot.sectorStep * 0.26
    const lineDepthShift = (lineSeed - 0.5) * rowStep * 0.18

    for (let k = 0; k < n; k++) {
      if (instanceIndex >= MAX_INSTANCES) break

      const token = resolvedGlyphs[k]!
      const identity = token.ordinal + 1
      const { meta } = token

      const hashLat = glyphHash(identity, slot.row, k)
      const hashDep = glyphHash(identity + 1, slot.sector, k ^ 0xab)
      const hashOrg = glyphHash(identity + 2, slot.row ^ slot.sector, k + 17)
      const hashKeep = glyphHash(identity + 7, slot.row, k ^ 0x39)

      const t01 = THREE.MathUtils.clamp((k + hashLat * 0.92 + 0.06) / (n + 0.04), 0.02, 0.98)
      const baseX =
        this.fieldCenterX +
        slot.spanStart +
        t01 * slot.spanSize +
        lineLateralShift +
        (hashLat - 0.5) * slot.sectorStep * (0.34 + meta.spreadBias * 0.28)
      const baseZ = this.fieldCenterZ + slot.lineCoord + (hashDep - 0.5) * rowStep * 0.78 + lineDepthShift
      if (!this.placementMask.includeAtXZ(baseX, baseZ)) continue

      const noise = stickOrganicWorldField(baseX + hashOrg * 0.36, baseZ + hashOrg * 0.28)
      const keepChance = THREE.MathUtils.lerp(0.26, 0.92, noise) + meta.spreadBias * 0.14
      if (hashKeep > keepChance) continue

      const bundleAngle = lineSeed * Math.PI * 2 + k * 0.92 + noise * 2.1
      const bundleRadius =
        (0.18 + noise * 0.12 + Math.max(0, meta.spreadBias) * 0.14) *
        this.params.sizeScale
      const bundleCount = THREE.MathUtils.clamp(3 + Math.round(noise * 3 + meta.spreadBias * 4), 3, 7)

      for (let j = 0; j < bundleCount; j++) {
        if (instanceIndex >= MAX_INSTANCES) break

        const pieceHash = glyphHash(identity + j * 13, slot.row ^ j, slot.sector, k)
        const pieceAngle = bundleAngle + j * (Math.PI * 2 / bundleCount) + (pieceHash - 0.5) * 0.7
        const pieceDistance = bundleRadius * (0.15 + pieceHash * 0.95)
        const basePieceX = baseX + Math.cos(pieceAngle) * pieceDistance
        const basePieceZ = baseZ + Math.sin(pieceAngle) * pieceDistance
        const twigKey = `${motionKeyPrefix}:${k}:${j}`
        let x = basePieceX
        let z = basePieceZ
        let motionVelocityX = 0
        let motionVelocityZ = 0
        let motionTwist = 0
        let twigMotionActive = false
        const state = this.twigStates.get(twigKey)
        if (state || this.shouldActivateMotionAt(basePieceX, basePieceZ)) {
          const ensuredState = state ?? this.getTwigState(twigKey)
          const dt = delta
          const nStep = dt > 0.001 ? Math.max(1, Math.min(3, Math.ceil(dt / 0.017))) : 1
          const h = dt / nStep
          for (let si = 0; si < nStep; si++) {
            this.applyTwigState(ensuredState, basePieceX, basePieceZ, h, pieceHash - 0.5, getGroundHeight, si === 0)
          }
          if (this.twigInactive(ensuredState)) {
            this.twigStates.delete(twigKey)
          } else {
            visitedKeys?.add(twigKey)
            twigMotionActive = true
            x = basePieceX + ensuredState.offsetX
            z = basePieceZ + ensuredState.offsetZ
            motionVelocityX = ensuredState.velocityX
            motionVelocityZ = ensuredState.velocityZ
            motionTwist = ensuredState.twist
          }
        }
        if (!this.placementMask.includeAtXZ(x, z)) continue

        const radius = Math.max(
          0.012,
          (0.024 + meta.radiusBias * 0.12 + noise * 0.014 + pieceHash * 0.008) * this.params.sizeScale,
        )
        const length = Math.max(
          radius * 5.5,
          (0.18 + meta.lengthBias * 0.44 + noise * 0.16 + pieceHash * 0.08) *
            this.params.sizeScale *
            this.params.lengthScale,
        )
        const speed = Math.hypot(motionVelocityX, motionVelocityZ)
        const yaw = pieceAngle + motionTwist * (0.18 + pieceHash * 0.36)
        const roll = (pieceHash - 0.5) * 0.24 + motionTwist * (0.08 + pieceHash * 0.16)
        const depthRadius = radius * (0.7 + noise * 0.24 + pieceHash * 0.06)
        this.sampleGroundNormal(x, z, getGroundHeight)
        tmpStickAxis.set(Math.cos(yaw), 0, Math.sin(yaw))
        tmpStickAxis.addScaledVector(tmpStickNormal, -tmpStickAxis.dot(tmpStickNormal))
        if (tmpStickAxis.lengthSq() <= 1e-6) {
          tmpStickAxis.set(Math.cos(yaw), 0, Math.sin(yaw))
        }
        tmpStickAxis.normalize()
        tmpStickQuat.setFromUnitVectors(worldUp, tmpStickAxis)
        tmpStickSpinQuat.setFromAxisAngle(tmpStickAxis, roll + (noise - 0.5) * 0.16 + speed * (0.04 + pieceHash * 0.06))
        dummy.quaternion.copy(tmpStickQuat).multiply(tmpStickSpinQuat)
        const worldSemiX = radius * STICK_CYLINDER_LOCAL_RADIUS
        const worldSemiZ = depthRadius * STICK_CYLINDER_LOCAL_RADIUS
        const worldHalfLen = length * STICK_CYLINDER_LOCAL_RADIUS
        let centerY = this.computeSupportedCenterY(
          x,
          z,
          dummy.quaternion,
          worldSemiX,
          worldHalfLen,
          worldSemiZ,
          getGroundHeight,
        )
        if (twigMotionActive) {
          centerY = this.refineStickCenterYAgainstTerrain(
            x,
            z,
            centerY,
            dummy.quaternion,
            radius,
            length,
            depthRadius,
            getGroundHeight,
          )
        }
        dummy.position.set(x, centerY, z)
        dummy.scale.set(radius, length, depthRadius)
        dummy.updateMatrix()
        this.stickMesh.setMatrixAt(instanceIndex, dummy.matrix)
        this.stickMesh.setColorAt(instanceIndex, stickColor(identity + j * 17, noise, meta))
        const placement =
          this.placements[instanceIndex] ??
          ({
            key: '',
            instanceIndex: 0,
            x: 0,
            z: 0,
            radius: 0,
            length: 0,
            depthRadius: 0,
            pieceAngle: 0,
            pieceHash: 0,
            noise: 0,
            baseMatrix: new THREE.Matrix4(),
          } satisfies StickPlacement)
        placement.key = twigKey
        placement.instanceIndex = instanceIndex
        placement.x = basePieceX
        placement.z = basePieceZ
        placement.radius = radius
        placement.length = length
        placement.depthRadius = depthRadius
        placement.pieceAngle = pieceAngle
        placement.pieceHash = pieceHash
        placement.noise = noise
        placement.baseMatrix.copy(dummy.matrix)
        this.placements[instanceIndex] = placement
        this.placementByKey.set(twigKey, placement)
        instanceIndex++
      }
    }

    return instanceIndex
  }
}

export type CreateStickFieldEffectOptions = {
  seedCursor: SeedCursorFactory
  surface?: PreparedSurfaceSource<StickTokenId, StickTokenMeta>
  initialParams?: StickFieldParams
  placementMask?: StickFieldPlacementMask
}

export function createStickFieldEffect({
  seedCursor,
  surface = getPreparedStickSurface(),
  initialParams = DEFAULT_STICK_FIELD_PARAMS,
  placementMask,
}: CreateStickFieldEffectOptions): StickFieldEffect {
  const effect = createSurfaceEffect({
    id: 'stick-field',
    source: surface,
    layout: fieldLayout({
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 5 + 1,
      staggerFactor: 0.6,
      minSpanFactor: 0.4,
    }),
    seedCursor,
  })

  return new StickFieldEffect(effect.source, seedCursor, initialParams, placementMask)
}

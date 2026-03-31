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
}

export const DEFAULT_STICK_FIELD_PARAMS: StickFieldParams = {
  layoutDensity: 0.8,
  sizeScale: 1,
  lengthScale: 1,
  disturbanceRadius: 1.15,
  disturbanceStrength: 1.2,
  displacementDistance: 0.62,
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
const tmpLocalPoint = new THREE.Vector3()

const tmpColor = new THREE.Color()
const dummy = new THREE.Object3D()

type StickTwigState = {
  offsetX: number
  offsetZ: number
  velocityX: number
  velocityZ: number
  twist: number
  twistVelocity: number
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
  octaves: 4,
  roughness: 0.58,
  warpAmplitude: 1.4,
  warpScale: 5.8,
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
  }

  clearMotion(): void {
    this.twigStates.clear()
    this.pendingImpulses.length = 0
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

  update(elapsedTime: number, getGroundHeight: (x: number, z: number) => number): void {
    const delta = this.lastElapsed === 0 ? 0 : Math.min(0.05, Math.max(0, elapsedTime - this.lastElapsed))
    this.lastElapsed = elapsedTime
    if (this.params.layoutDensity <= 0 || this.params.sizeScale <= 0 || this.params.lengthScale <= 0) {
      this.stickMesh.count = 0
      this.stickMesh.instanceMatrix.needsUpdate = true
      return
    }

    const rowStep = this.fieldDepth / (ROWS + 1.05)
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

    for (const key of this.twigStates.keys()) {
      if (!visitedKeys.has(key)) {
        this.twigStates.delete(key)
      }
    }
    this.pendingImpulses.length = 0

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
      }
      this.twigStates.set(key, state)
    }
    return state
  }

  private applyTwigState(
    state: StickTwigState,
    baseX: number,
    baseZ: number,
    delta: number,
    pieceBias: number,
  ): void {
    const currentX = baseX + state.offsetX
    const currentZ = baseZ + state.offsetZ
    const pieceSign = pieceBias >= 0 ? 1 : -1
    for (const impulse of this.pendingImpulses) {
      const dx = currentX - impulse.x
      const dz = currentZ - impulse.z
      const distance = Math.hypot(dx, dz)
      if (distance > impulse.radius) continue
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

    if (delta <= 0) return
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

  private projectLine(
    slot: SurfaceLayoutSlot,
    resolvedGlyphs: readonly ResolvedSurfaceGlyph<StickTokenId, StickTokenMeta>[],
    tokenLineKey: string,
    rowStep: number,
    getGroundHeight: (x: number, z: number) => number,
    instanceIndex: number,
    delta: number,
    visitedKeys: Set<string>,
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
        const state = this.getTwigState(twigKey)
        this.applyTwigState(state, basePieceX, basePieceZ, delta, pieceHash - 0.5)
        visitedKeys.add(twigKey)
        if (this.twigInactive(state)) {
          this.twigStates.delete(twigKey)
        }

        const x = basePieceX + state.offsetX
        const z = basePieceZ + state.offsetZ
        if (!this.placementMask.includeAtXZ(x, z)) continue

        const groundY = getGroundHeight(x, z)
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
        const speed = Math.hypot(state.velocityX, state.velocityZ)
        const yaw = pieceAngle + state.twist * (0.18 + pieceHash * 0.36)
        const pitch = Math.PI * 0.5 + (noise - 0.5) * 0.18 + speed * (0.04 + pieceHash * 0.06)
        const roll = (pieceHash - 0.5) * 0.24 + state.twist * (0.08 + pieceHash * 0.16)

        dummy.position.set(x, groundY + radius * 0.2, z)
        dummy.rotation.set(pitch, yaw, roll)
        dummy.scale.set(radius, length, radius * (0.7 + noise * 0.24 + pieceHash * 0.06))
        dummy.updateMatrix()
        this.stickMesh.setMatrixAt(instanceIndex, dummy.matrix)
        this.stickMesh.setColorAt(instanceIndex, stickColor(identity + j * 17, noise, meta))
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

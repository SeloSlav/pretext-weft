import * as THREE from 'three'
import type {
  PreparedSurfaceSource,
  SeedCursorFactory,
  SurfaceLayoutSlot,
} from '../../core'
import { createWorldField, SurfaceLayoutDriver } from '../../core'
import { decayRecoveringStrength } from '../../runtime'
import {
  createSurfaceEffect,
  fieldLayout,
  recoverableDamage,
} from '../api'
import { smoothPulse } from './sharedMath'
import {
  buildGrassStateSurface,
  type GrassTokenId,
  type GrassTokenMeta,
} from './grassFieldSource'

export type GrassFieldParams = {
  disturbanceRadius: number
  disturbanceStrength: number
  trampleDepth: number
  wind: number
  recoveryRate: number
  state: number
  colorSeason?: 'spring' | 'summer' | 'autumn' | 'winter' | null
  layoutDensity: number
  bladeWidthScale: number
  bladeHeightScale: number
}

export const DEFAULT_GRASS_FIELD_PARAMS: GrassFieldParams = {
  disturbanceRadius: 1.15,
  disturbanceStrength: 0.78,
  trampleDepth: 0.68,
  wind: 0.62,
  recoveryRate: 0.8,
  state: 0,
  colorSeason: null,
  layoutDensity: 8,
  bladeWidthScale: 1,
  bladeHeightScale: 1,
}

export type GrassFieldBounds = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export type GrassFieldPlacementMask = {
  bounds?: GrassFieldBounds
  excludeAtXZ?: (x: number, z: number) => boolean
  coverageMultiplierAtXZ?: (x: number, z: number) => number
}

const DEFAULT_GRASS_FIELD_BOUNDS: GrassFieldBounds = {
  minX: -28,
  maxX: 28,
  minZ: -28,
  maxZ: 28,
}

const ROWS = 52
const SECTORS = 68
const BLADES_PER_SLOT = 2
const MAX_INSTANCES = 72_000
const LAYOUT_PX_PER_WORLD = 16
const DISTURBANCE_RADIUS_MULTIPLIER = 2.35
const MAX_ACTIVE_DISTURBANCES = 72

const tmpPos = new THREE.Vector3()
const tmpColor = new THREE.Color()
const tmpSeasonColorA = new THREE.Color()
const tmpSeasonColorB = new THREE.Color()
const tmpLocalPoint = new THREE.Vector3()
const dummy = new THREE.Object3D()

const STATE_BLADE_BASE = [
  new THREE.Color('#4d9e36'),
  new THREE.Color('#c7a43a'),
  new THREE.Color('#5c2a77'),
  new THREE.Color('#756f63'),
] as const
const STATE_BLADE_TIP = [
  new THREE.Color('#b9f27f'),
  new THREE.Color('#efd277'),
  new THREE.Color('#b374ff'),
  new THREE.Color('#aca59a'),
] as const
const STATE_GROUND_TINT = [
  new THREE.Color('#7ca655'),
  new THREE.Color('#9a7d44'),
  new THREE.Color('#55316d'),
  new THREE.Color('#8a8175'),
] as const
const STATE_GROUND_BASE = [
  new THREE.Color('#7fa154'),
  new THREE.Color('#8b6f31'),
  new THREE.Color('#6b3f84'),
  new THREE.Color('#93897b'),
] as const
const STATE_GROUND_DARK = [
  new THREE.Color('#566d3d'),
  new THREE.Color('#5f4623'),
  new THREE.Color('#412154'),
  new THREE.Color('#645d54'),
] as const
const SEASON_BLADE_TINT = {
  spring: new THREE.Color('#8fc96b'),
  summer: new THREE.Color('#5f8f3d'),
  autumn: new THREE.Color('#c08a46'),
  winter: new THREE.Color('#d9dedf'),
} as const
const SEASON_GROUND_TINT = {
  spring: new THREE.Color('#7ea35f'),
  summer: new THREE.Color('#5f7444'),
  autumn: new THREE.Color('#9b7046'),
  winter: new THREE.Color('#bdc5c9'),
} as const
const SEASON_GROUND_BASE = {
  spring: new THREE.Color('#90ad73'),
  summer: new THREE.Color('#67794e'),
  autumn: new THREE.Color('#a57b55'),
  winter: new THREE.Color('#d5dadc'),
} as const
const SEASON_GROUND_DARK = {
  spring: new THREE.Color('#62744e'),
  summer: new THREE.Color('#48553a'),
  autumn: new THREE.Color('#74563e'),
  winter: new THREE.Color('#99a1a5'),
} as const
const STATE_LAYOUT_DENSITY = [1.2, 0.88, 0.95, 0.58] as const
const STATE_PRESENCE = [1, 0.92, 0.82, 0.62] as const
const STATE_HEIGHT = [1.18, 0.92, 1.02, 0.62] as const
const STATE_WIDTH = [1.06, 1.22, 0.94, 0.72] as const
const STATE_BEND = [1.05, 0.82, 1.45, 0.48] as const
const STATE_LEAN = [0.02, 0.12, 0.28, 0.1] as const
const STATE_DISTURBANCE_LIFT = [1, 0.9, 1.05, 0.75] as const

type Disturbance = {
  x: number
  z: number
  radius: number
  strength: number
  deformGround: boolean
  recoveryRate?: number
}

type CachedBladeInstance = {
  x: number
  z: number
  baseY: number
  baseWidth: number
  baseHeight: number
  baseRotateX: number
  baseBendDirection: number
  windPhaseA: number
  windPhaseB: number
  coverageMultiplier: number
  hashPresence: number
  baseColorR: number
  baseColorG: number
  baseColorB: number
}

export type GrassDisturbanceOptions = {
  radiusScale?: number
  strength?: number
  deformGround?: boolean
  recoveryRate?: number
  mergeRadius?: number
}

/** Chunky stem, soft mid, long tapered tip — reads closer to hand-painted / Ghibli grass cards. */
function makeBladeGeometry(): THREE.BufferGeometry {
  const bladeHeight = 0.79
  const baseHalfWidth = 0.19
  const geometry = new THREE.PlaneGeometry(baseHalfWidth * 2, bladeHeight, 4, 18)
  const position = geometry.attributes.position
  const halfH = bladeHeight * 0.5
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const y01 = THREE.MathUtils.clamp((y + halfH) / bladeHeight, 0, 1)
    let widthScale: number
    if (y01 < 0.24) {
      widthScale = 1
    } else {
      const u = (y01 - 0.24) / 0.76
      widthScale = 0.045 + 0.955 * Math.pow(1 - u, 1.92)
    }
    const ribbon = Math.sin(y01 * Math.PI * 1.05) * 0.022 * (1 - y01 * 0.85)
    position.setXYZ(i, x * widthScale + ribbon, y, 0)
  }
  position.needsUpdate = true
  geometry.translate(0, halfH - 0.065, 0)
  return geometry
}

function createGroundTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 1024
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas)
    fallback.colorSpace = THREE.SRGBColorSpace
    return fallback
  }

  ctx.fillStyle = '#5f8744'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (let i = 0; i < 16000; i++) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    const radius = 1.2 + Math.random() * 7.5
    const alpha = 0.05 + Math.random() * 0.12
    const hue = 78 + Math.random() * 16
    const sat = 28 + Math.random() * 28
    const light = 22 + Math.random() * 10
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < 5200; i++) {
    ctx.strokeStyle = `hsla(${86 + Math.random() * 14}, ${24 + Math.random() * 18}%, ${18 + Math.random() * 9}%, ${0.06 + Math.random() * 0.1})`
    ctx.lineWidth = 0.7 + Math.random() * 2.1
    ctx.beginPath()
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    ctx.moveTo(x, y)
    ctx.lineTo(x + (Math.random() - 0.5) * 56, y + (Math.random() - 0.5) * 80)
    ctx.stroke()
  }

  for (let i = 0; i < 900; i++) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    const radius = 18 + Math.random() * 60
    const alpha = 0.04 + Math.random() * 0.08
    ctx.fillStyle = `hsla(${88 + Math.random() * 18}, ${16 + Math.random() * 14}%, ${30 + Math.random() * 10}%, ${alpha})`
    ctx.beginPath()
    ctx.ellipse(x, y, radius, radius * (0.45 + Math.random() * 0.5), Math.random() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < 90; i++) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    const radius = 46 + Math.random() * 120
    const alpha = 0.08 + Math.random() * 0.1
    const broadPatch = ctx.createRadialGradient(x, y, radius * 0.1, x, y, radius)
    broadPatch.addColorStop(0, `rgba(124, 164, 74, ${alpha})`)
    broadPatch.addColorStop(0.55, `rgba(90, 125, 54, ${alpha * 0.82})`)
    broadPatch.addColorStop(1, 'rgba(90, 125, 54, 0)')
    ctx.fillStyle = broadPatch
    ctx.beginPath()
    ctx.ellipse(x, y, radius, radius * (0.5 + Math.random() * 0.28), Math.random() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < 360; i++) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    const radius = 3 + Math.random() * 10
    const alpha = 0.03 + Math.random() * 0.06
    ctx.fillStyle = `hsla(${102 + Math.random() * 14}, 20%, ${58 + Math.random() * 8}%, ${alpha})`
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < 110; i++) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    const radius = 56 + Math.random() * 90
    const alpha = 0.05 + Math.random() * 0.08
    const grassPatch = ctx.createRadialGradient(x, y, radius * 0.16, x, y, radius)
    grassPatch.addColorStop(0, `rgba(92, 128, 58, ${alpha})`)
    grassPatch.addColorStop(0.55, `rgba(124, 162, 78, ${alpha * 0.82})`)
    grassPatch.addColorStop(1, 'rgba(124, 162, 78, 0)')
    ctx.fillStyle = grassPatch
    ctx.beginPath()
    ctx.ellipse(x, y, radius, radius * (0.55 + Math.random() * 0.3), Math.random() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < 36; i++) {
    const y = Math.random() * canvas.height
    const thickness = 18 + Math.random() * 40
    const alpha = 0.03 + Math.random() * 0.05
    const band = ctx.createLinearGradient(0, y - thickness, 0, y + thickness)
    band.addColorStop(0, 'rgba(0,0,0,0)')
    band.addColorStop(0.5, `rgba(68, 97, 43, ${alpha})`)
    band.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = band
    ctx.fillRect(0, y - thickness, canvas.width, thickness * 2)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(4.8, 4.8)
  texture.needsUpdate = true
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
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
  return (hash >>> 0) / 4294967295
}

function glyphScatter(code: number, lineSeed: number, index: number): number {
  const waveA = Math.sin(code * 0.073 + lineSeed * 6.1 + index * 1.7)
  const waveB = Math.sin(code * 0.031 + lineSeed * 11.3 + index * 0.83)
  return THREE.MathUtils.clamp(waveA * 0.7 + waveB * 0.3, -1, 1)
}

const grassOrganicWorldField = createWorldField(271, {
  scale: 6.2,
  octaves: 4,
  roughness: 0.58,
  warpAmplitude: 1.7,
  warpScale: 5.4,
  contrast: 1.18,
})

export class GrassFieldEffect {
  readonly group = new THREE.Group()
  readonly interactionMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>

  private readonly bladeGeometry = makeBladeGeometry()
  private readonly bladeMaterial = new THREE.MeshStandardMaterial({
    color: '#c9f288',
    emissive: '#3d5a28',
    emissiveIntensity: 0.09,
    side: THREE.DoubleSide,
    roughness: 0.52,
    metalness: 0,
  })
  private readonly bladeMesh = new THREE.InstancedMesh(this.bladeGeometry, this.bladeMaterial, MAX_INSTANCES)
  private readonly groundTexture = createGroundTexture()
  private readonly placementMask: Required<GrassFieldPlacementMask>
  private readonly fieldWidth: number
  private readonly fieldDepth: number
  private readonly groundGeometry: THREE.PlaneGeometry
  private readonly groundMaterial = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    map: this.groundTexture,
    side: THREE.DoubleSide,
  })
  private readonly interactionMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  private readonly groundSurfaceMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  private readonly baseGroundPositions: Float32Array
  private readonly seedCursor: SeedCursorFactory
  private layoutDriver: SurfaceLayoutDriver<GrassTokenId, GrassTokenMeta>
  private readonly disturbances: Disturbance[] = []
  private readonly cachedBlades: CachedBladeInstance[] = []
  private lastElapsedTime = 0
  private bladeCacheDirty = true
  private baseBladeColorsDirty = true
  private params: GrassFieldParams

  constructor(
    surface: PreparedSurfaceSource<GrassTokenId, GrassTokenMeta>,
    seedCursor: SeedCursorFactory,
    initialParams: GrassFieldParams,
    placementMask: GrassFieldPlacementMask = {},
  ) {
    this.params = { ...initialParams }
    this.seedCursor = seedCursor
    const bounds = placementMask.bounds ?? DEFAULT_GRASS_FIELD_BOUNDS
    this.fieldWidth = bounds.maxX - bounds.minX
    this.fieldDepth = bounds.maxZ - bounds.minZ
    this.placementMask = {
      bounds,
      excludeAtXZ: placementMask.excludeAtXZ ?? (() => false),
      coverageMultiplierAtXZ: placementMask.coverageMultiplierAtXZ ?? (() => 1),
    }
    this.groundGeometry = new THREE.PlaneGeometry(this.fieldWidth, this.fieldDepth, 40, 32)
    this.groundSurfaceMesh = new THREE.Mesh(this.groundGeometry, this.groundMaterial)
    this.baseGroundPositions = Float32Array.from(this.groundGeometry.attributes.position.array as ArrayLike<number>)
    this.layoutDriver = this.createLayoutDriver(surface)

    this.bladeMesh.frustumCulled = false
    this.bladeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.interactionMesh = new THREE.Mesh(this.groundGeometry, this.interactionMaterial)
    this.interactionMesh.rotation.x = -Math.PI / 2
    this.groundSurfaceMesh.rotation.x = -Math.PI / 2
    /** Below road quads so asphalt fully occludes the green ground texture on the cross. */
    this.groundSurfaceMesh.position.y = -0.055
    this.groundSurfaceMesh.renderOrder = -1
    this.groundMaterial.color.copy(this.groundTintColor())

    this.updateGround()
    this.group.add(this.groundSurfaceMesh)
    this.group.add(this.interactionMesh)
    this.group.add(this.bladeMesh)
  }

  setParams(params: Partial<GrassFieldParams>): void {
    const prevStateIndex = this.stateIndex()
    const prevLayoutDensity = this.params.layoutDensity
    const prevColorSeason = this.params.colorSeason ?? null
    this.params = { ...this.params, ...params }
    if (
      this.stateIndex() !== prevStateIndex ||
      this.params.layoutDensity !== prevLayoutDensity ||
      (this.params.colorSeason ?? null) !== prevColorSeason
    ) {
      this.bladeCacheDirty = true
    }
    this.groundMaterial.color.copy(this.groundTintColor())
    for (const disturbance of this.disturbances) {
      disturbance.radius = this.params.disturbanceRadius * DISTURBANCE_RADIUS_MULTIPLIER
    }
  }

  setSurface(surface: PreparedSurfaceSource<GrassTokenId, GrassTokenMeta>): void {
    this.layoutDriver = this.createLayoutDriver(surface)
    this.bladeCacheDirty = true
  }

  clearDisturbances(): void {
    this.disturbances.length = 0
    this.baseBladeColorsDirty = true
  }

  hasDisturbances(): boolean {
    return this.disturbances.length > 0
  }

  addDisturbanceFromWorldPoint(worldPoint: THREE.Vector3, options: GrassDisturbanceOptions = {}): void {
    tmpLocalPoint.copy(worldPoint)
    this.group.worldToLocal(tmpLocalPoint)
    const x = THREE.MathUtils.clamp(tmpLocalPoint.x, -this.fieldWidth * 0.46, this.fieldWidth * 0.46)
    const z = THREE.MathUtils.clamp(tmpLocalPoint.z, -this.fieldDepth * 0.46, this.fieldDepth * 0.46)
    const radius = this.params.disturbanceRadius * DISTURBANCE_RADIUS_MULTIPLIER * (options.radiusScale ?? 1)
    const strength = options.strength ?? 1
    const deformGround = options.deformGround ?? true
    const recoveryRate = options.recoveryRate
    const mergeRadius = options.mergeRadius ?? 0

    if (mergeRadius > 0) {
      const mergeRadiusSq = mergeRadius * mergeRadius
      for (const disturbance of this.disturbances) {
        if (disturbance.deformGround !== deformGround) continue
        if ((disturbance.recoveryRate ?? null) !== (recoveryRate ?? null)) continue
        const dx = disturbance.x - x
        const dz = disturbance.z - z
        if (dx * dx + dz * dz > mergeRadiusSq) continue
        disturbance.x = THREE.MathUtils.lerp(disturbance.x, x, 0.35)
        disturbance.z = THREE.MathUtils.lerp(disturbance.z, z, 0.35)
        disturbance.radius = Math.max(disturbance.radius, radius)
        disturbance.strength = Math.max(disturbance.strength, strength)
        return
      }
    }

    this.disturbances.unshift({
      x,
      z,
      radius,
      strength,
      deformGround,
      recoveryRate,
    })
    if (this.disturbances.length > MAX_ACTIVE_DISTURBANCES) {
      this.disturbances.length = MAX_ACTIVE_DISTURBANCES
    }
  }

  getDisturbanceAtWorld(x: number, z: number): number {
    tmpLocalPoint.set(x, 0, z)
    this.group.worldToLocal(tmpLocalPoint)
    return this.disturbanceAt(tmpLocalPoint.x, tmpLocalPoint.z)
  }

  getGroundHeightAtWorld(x: number, z: number): number {
    tmpLocalPoint.set(x, 0, z)
    this.group.worldToLocal(tmpLocalPoint)
    tmpLocalPoint.set(tmpLocalPoint.x, this.baseGroundY(tmpLocalPoint.x, tmpLocalPoint.z), tmpLocalPoint.z)
    this.group.localToWorld(tmpLocalPoint)
    return tmpLocalPoint.y
  }

  getWalkHeightAtWorld(x: number, z: number): number {
    tmpLocalPoint.set(x, 0, z)
    this.group.worldToLocal(tmpLocalPoint)
    tmpLocalPoint.set(tmpLocalPoint.x, this.baseGroundY(tmpLocalPoint.x, tmpLocalPoint.z), tmpLocalPoint.z)
    this.group.localToWorld(tmpLocalPoint)
    return tmpLocalPoint.y
  }

  update(elapsedTime: number): void {
    const delta = this.lastElapsedTime === 0 ? 0 : Math.max(0, elapsedTime - this.lastElapsedTime)
    this.lastElapsedTime = elapsedTime
    this.updateDisturbances(delta)
    this.updateBlades(elapsedTime)
  }

  dispose(): void {
    this.bladeGeometry.dispose()
    this.bladeMaterial.dispose()
    this.groundTexture.dispose()
    this.groundGeometry.dispose()
    this.groundMaterial.dispose()
    this.interactionMaterial.dispose()
  }

  private disturbanceAt(x: number, z: number): number {
    return this.disturbanceAndBend(x, z).disturbance
  }

  /** Single pass over disturbances: scalar field + strongest direction for blade bend. */
  private disturbanceAndBend(x: number, z: number): {
    disturbance: number
    awayX: number
    awayZ: number
  } {
    if (this.disturbances.length === 0) {
      return { disturbance: 0, awayX: 0, awayZ: 1 }
    }
    let disturbance = 0
    let awayX = 0
    let awayZ = 1
    let strongest = 0
    for (const hit of this.disturbances) {
      const dx = x - hit.x
      const dz = z - hit.z
      const n = Math.sqrt(dx * dx + dz * dz) / Math.max(hit.radius, 0.0001)
      const sp = smoothPulse(n)
      disturbance = Math.max(disturbance, Math.pow(sp, 0.45) * hit.strength)
      const influence = sp * hit.strength
      if (influence > strongest) {
        strongest = influence
        awayX = dx
        awayZ = dz
      }
    }
    return {
      disturbance: THREE.MathUtils.clamp(disturbance, 0, 1),
      awayX,
      awayZ,
    }
  }

  private updateDisturbances(delta: number): void {
    if (delta <= 0 || this.disturbances.length === 0) return
    for (let i = this.disturbances.length - 1; i >= 0; i--) {
      const d = this.disturbances[i]!
      const rate = d.recoveryRate ?? this.params.recoveryRate
      d.strength = decayRecoveringStrength(d.strength, rate, delta)
      if (d.strength <= 0.015) this.disturbances.splice(i, 1)
    }
  }

  private baseGroundY(x: number, z: number): number {
    return 0.12 * Math.sin(x * 0.22) * Math.cos(z * 0.18) + 0.03 * Math.sin((x + z) * 0.65)
  }

  private stateIndex(): number {
    return THREE.MathUtils.clamp(Math.round(this.params.state), 0, STATE_BLADE_BASE.length - 1)
  }

  private tintColor(
    base: THREE.Color,
    seasonPalette: Record<'spring' | 'summer' | 'autumn' | 'winter', THREE.Color>,
    amount: number,
    target: THREE.Color = tmpSeasonColorA,
  ): THREE.Color {
    target.copy(base)
    const season = this.params.colorSeason
    if (!season) return target
    return target.lerp(seasonPalette[season], amount)
  }

  private groundTintColor(): THREE.Color {
    return this.tintColor(STATE_GROUND_TINT[this.stateIndex()]!, SEASON_GROUND_TINT, 0.72)
  }

  private createLayoutDriver(surface: PreparedSurfaceSource<GrassTokenId, GrassTokenMeta>) {
    return new SurfaceLayoutDriver({
      surface,
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 13 + 5,
      seedCursor: this.seedCursor,
      staggerFactor: 0.45,
      minSpanFactor: 0.33,
    })
  }

  private updateGround(): void {
    const position = this.groundGeometry.attributes.position
    for (let i = 0; i < position.count; i++) {
      const x = this.baseGroundPositions[i * 3]
      const yPlane = this.baseGroundPositions[i * 3 + 1]
      const h = this.baseGroundY(x, -yPlane)
      position.setXYZ(i, x, yPlane, h)
    }
    position.needsUpdate = true
  }

  private updateBlades(elapsedTime: number): void {
    if (this.bladeCacheDirty) {
      this.rebuildBladeCache()
    }

    const hasDisturbances = this.disturbances.length > 0
    const stateIndex = this.stateIndex()
    const statePresence = STATE_PRESENCE[stateIndex]!
    const disturbedPresence = Math.max(0.02, statePresence * (1 - this.params.disturbanceStrength * 0.98))
    const stateBend = STATE_BEND[stateIndex]!
    const stateLean = STATE_LEAN[stateIndex]!
    const disturbanceLift = STATE_DISTURBANCE_LIFT[stateIndex]!
    const bladeWidthScale = Math.max(0.01, this.params.bladeWidthScale)
    const bladeHeightScale = Math.max(0.01, this.params.bladeHeightScale)
    const disturbanceBounds = hasDisturbances ? this.activeDisturbanceBounds() : null
    const gustTimeA = elapsedTime * 1.55
    const gustTimeB = elapsedTime * 2.8
    if (!hasDisturbances && this.baseBladeColorsDirty) {
      this.applyBaseBladeColors()
    }

    let instanceIndex = 0
    for (let i = 0; i < this.cachedBlades.length; i++) {
      const blade = this.cachedBlades[i]!
      let localDisturbance = 0
      let awayX = 0
      let awayZ = 1
      if (
        disturbanceBounds &&
        blade.x >= disturbanceBounds.minX &&
        blade.x <= disturbanceBounds.maxX &&
        blade.z >= disturbanceBounds.minZ &&
        blade.z <= disturbanceBounds.maxZ
      ) {
        const disturbance = this.disturbanceAndBend(blade.x, blade.z)
        localDisturbance = disturbance.disturbance
        awayX = disturbance.awayX
        awayZ = disturbance.awayZ
        const localCoverage = THREE.MathUtils.lerp(statePresence, disturbedPresence, localDisturbance) * blade.coverageMultiplier
        if (blade.hashPresence > localCoverage) continue
      }

      const gust =
        Math.sin(gustTimeA + blade.windPhaseA) +
        0.55 * Math.sin(gustTimeB + blade.windPhaseB)
      const windYaw = gust * this.params.wind * 0.14
      const windBend = (0.24 + Math.abs(gust) * 0.18) * this.params.wind
      const trampleBend = localDisturbance * 1.15 * disturbanceLift

      tmpPos.set(
        blade.x + awayX * localDisturbance * 0.22,
        blade.baseY + 0.16 + localDisturbance * 0.05,
        blade.z + awayZ * localDisturbance * 0.22,
      )
      dummy.position.copy(tmpPos)
      dummy.rotation.set(0, Math.atan2(awayX, awayZ) + blade.baseBendDirection + windYaw, 0)
      dummy.rotateX(blade.baseRotateX)
      dummy.rotateZ(((windBend + trampleBend) * Math.sign(awayX || 1) + stateLean) * stateBend)
      dummy.scale.set(
        blade.baseWidth * bladeWidthScale * (1 - localDisturbance * 0.42),
        Math.max(blade.baseHeight * bladeHeightScale * (1 - localDisturbance * 0.88), 0.18 * bladeHeightScale),
        1,
      )
      dummy.updateMatrix()
      this.bladeMesh.setMatrixAt(instanceIndex, dummy.matrix)

      if (hasDisturbances) {
        tmpColor.setRGB(blade.baseColorR, blade.baseColorG, blade.baseColorB)
        tmpColor.lerp(this.tintColor(STATE_GROUND_BASE[stateIndex]!, SEASON_GROUND_BASE, 0.52), localDisturbance * 0.06)
        tmpColor.lerp(this.tintColor(STATE_GROUND_DARK[stateIndex]!, SEASON_GROUND_DARK, 0.58), localDisturbance * 0.28)
        this.bladeMesh.setColorAt(instanceIndex, tmpColor)
      }

      instanceIndex++
    }

    this.bladeMesh.count = instanceIndex
    this.bladeMesh.instanceMatrix.needsUpdate = true
    if (hasDisturbances && this.bladeMesh.instanceColor) {
      this.bladeMesh.instanceColor.needsUpdate = true
      this.baseBladeColorsDirty = true
    }
  }

  private activeDisturbanceBounds():
    | {
        minX: number
        maxX: number
        minZ: number
        maxZ: number
      }
    | null {
    if (this.disturbances.length === 0) return null

    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const disturbance of this.disturbances) {
      const radius = Math.max(0.001, disturbance.radius)
      minX = Math.min(minX, disturbance.x - radius)
      maxX = Math.max(maxX, disturbance.x + radius)
      minZ = Math.min(minZ, disturbance.z - radius)
      maxZ = Math.max(maxZ, disturbance.z + radius)
    }
    return { minX, maxX, minZ, maxZ }
  }

  private rebuildBladeCache(): void {
    this.cachedBlades.length = 0
    const rowStep = this.fieldDepth / (ROWS + 1.1)
    const backZ = this.fieldDepth * 0.48
    const stateIndex = this.stateIndex()
    const statePresence = STATE_PRESENCE[stateIndex]!
    const stateHeight = STATE_HEIGHT[stateIndex]!
    const stateWidth = STATE_WIDTH[stateIndex]!
    const stateBend = STATE_BEND[stateIndex]!
    const bladeBaseColor = this.tintColor(STATE_BLADE_BASE[stateIndex]!, SEASON_BLADE_TINT, 0.22, tmpSeasonColorA)
    const bladeTipColor = this.tintColor(STATE_BLADE_TIP[stateIndex]!, SEASON_BLADE_TINT, 0.44, tmpSeasonColorB)

    this.layoutDriver.forEachLaidOutLine({
      spanMin: -this.fieldWidth * 0.5,
      spanMax: this.fieldWidth * 0.5,
      lineCoordAtRow: (row) => backZ - row * rowStep,
      getMaxWidth: (slot) => this.getSlotMaxWidth(slot),
      onLine: ({ slot, resolvedGlyphs, tokenLineKey }) => {
        const n = resolvedGlyphs.length
        const lineSeed = lineSignature(tokenLineKey)
        const lineLateralShift = (lineSeed - 0.5) * slot.sectorStep * 0.28
        const lineDepthShift = (lineSeed - 0.5) * rowStep * 0.18
        const lineClusterStrength = 0.035 + lineSeed * 0.05

        for (let k = 0; k < n; k++) {
          if (this.cachedBlades.length >= MAX_INSTANCES) break
          const token = resolvedGlyphs[k]!
          const identity = token.ordinal + 1
          const { meta } = token
          for (let blade = 0; blade < BLADES_PER_SLOT; blade++) {
            if (this.cachedBlades.length >= MAX_INSTANCES) break

            const weftScatter = glyphScatter(identity, lineSeed, k * BLADES_PER_SLOT + blade)
            const hashLat = glyphHash(identity, slot.row, k, blade)
            const hashDep = glyphHash(identity + 1, slot.sector, k, blade ^ 0xff)
            const hashOrganic = glyphHash(identity + 2, slot.row ^ slot.sector, k + blade * 31)
            const hashPresence = glyphHash(identity + 3, slot.row * 131 + slot.sector, k, blade * 17 + 7)

            const t01 = THREE.MathUtils.clamp(
              (k + hashLat * 0.9 + 0.05) / (n + 0.1) + weftScatter * lineClusterStrength,
              0.02,
              0.98,
            )
            const x =
              slot.spanStart +
              t01 * slot.spanSize +
              lineLateralShift +
              (hashLat - 0.5) * slot.sectorStep * 0.38 +
              weftScatter * slot.sectorStep * 0.11
            const localZ =
              slot.lineCoord +
              lineDepthShift +
              (hashDep - 0.5) * rowStep * 0.52 +
              weftScatter * rowStep * 0.12
            if (this.placementMask.excludeAtXZ(x, localZ)) continue

            const coverageMultiplier = this.placementMask.coverageMultiplierAtXZ(x, localZ)
            if (hashPresence > statePresence * coverageMultiplier) continue

            const organicNoise = grassOrganicWorldField(x + hashOrganic * 0.4, localZ + hashOrganic * 0.3)
            const tipFade = blade * 0.055
            const stateBrightness = THREE.MathUtils.clamp(
              0.18 + organicNoise * 0.64 + meta.lightShift + tipFade,
              0,
              1,
            )
            tmpColor.copy(bladeBaseColor)
            tmpColor.lerp(bladeTipColor, stateBrightness)

            this.cachedBlades.push({
              x,
              z: localZ,
              baseY: this.baseGroundY(x, localZ),
              baseWidth: (0.072 + meta.widthBias + (identity % 5) * 0.008 + organicNoise * 0.015 + blade * 0.006) * stateWidth,
              baseHeight:
                (0.88 + meta.heightBias + (identity % 7) * 0.08 + organicNoise * 0.14 + blade * 0.07) *
                0.5 *
                stateHeight,
              baseRotateX: (organicNoise - 0.5) * 0.12 * stateBend,
              baseBendDirection: (organicNoise - 0.5) * 0.35,
              windPhaseA: x * 0.52 + localZ * 0.34,
              windPhaseB: x * 1.1 - localZ * 0.62,
              coverageMultiplier,
              hashPresence,
              baseColorR: tmpColor.r,
              baseColorG: tmpColor.g,
              baseColorB: tmpColor.b,
            })
          }
        }
      },
    })

    this.bladeCacheDirty = false
    this.baseBladeColorsDirty = true
  }

  private applyBaseBladeColors(): void {
    for (let i = 0; i < this.cachedBlades.length; i++) {
      const blade = this.cachedBlades[i]!
      tmpColor.setRGB(blade.baseColorR, blade.baseColorG, blade.baseColorB)
      this.bladeMesh.setColorAt(i, tmpColor)
    }
    if (this.bladeMesh.instanceColor) {
      this.bladeMesh.instanceColor.needsUpdate = true
    }
    this.baseBladeColorsDirty = false
  }

  private getSlotMaxWidth(slot: SurfaceLayoutSlot): number {
    return slot.spanSize * LAYOUT_PX_PER_WORLD * this.params.layoutDensity * STATE_LAYOUT_DENSITY[this.stateIndex()]
  }

}

export type CreateGrassEffectOptions = {
  seedCursor: SeedCursorFactory
  surface?: PreparedSurfaceSource<GrassTokenId, GrassTokenMeta>
  initialParams?: GrassFieldParams
  placementMask?: GrassFieldPlacementMask
}

export function createGrassEffect({
  seedCursor,
  surface = buildGrassStateSurface(DEFAULT_GRASS_FIELD_PARAMS.state),
  initialParams = DEFAULT_GRASS_FIELD_PARAMS,
  placementMask,
}: CreateGrassEffectOptions): GrassFieldEffect {
  const effect = createSurfaceEffect({
    id: 'grass-field',
    source: surface,
    layout: fieldLayout({
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 13 + 5,
      staggerFactor: 0.45,
      minSpanFactor: 0.33,
    }),
    behaviors: [
      recoverableDamage({
        radius: initialParams.disturbanceRadius * DISTURBANCE_RADIUS_MULTIPLIER,
        recoveryRate: initialParams.recoveryRate,
        strength: initialParams.disturbanceStrength,
      }),
    ],
    seedCursor,
  })

  return new GrassFieldEffect(effect.source, seedCursor, initialParams, placementMask)
}
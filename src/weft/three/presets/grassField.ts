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
import type { TerrainHeightSampler } from '../terrainRelief'
import { smoothPulse } from './sharedMath'
import {
  buildGrassStateSurface,
  type GrassTokenId,
  type GrassTokenMeta,
} from './grassFieldSource'
import {
  shouldVisitSlotForViewCull,
  type PresetLayoutViewCull,
  type PresetLayoutViewCullFrustumContext,
} from './presetLayoutCull'
import { BURN_NEON_RIM_COLOR_FRAGMENT, createBurnRimInstancedAttribute } from './burnNeonRim'

export type GrassFieldParams = {
  disturbanceRadius: number
  disturbanceStrength: number
  trampleDepth: number
  wind: number
  recoveryRate: number
  /** Expanding ring burns (local XZ), same model as leaf litter. */
  burnRadius: number
  burnSpreadSpeed: number
  burnMaxRadius: number
  /** How fast burn intensity fades when a burn has no per-shot `recoveryRate`. Lower = slower dissolve / later regrowth. */
  burnRecoveryRate: number
  state: number
  colorSeason?: 'spring' | 'summer' | 'autumn' | 'winter' | null
  layoutDensity: number
  bladeWidthScale: number
  bladeHeightScale: number
}

export const DEFAULT_GRASS_FIELD_PARAMS: GrassFieldParams = {
  disturbanceRadius: 2.0,
  disturbanceStrength: 0.78,
  trampleDepth: 0.68,
  wind: 0.58,
  recoveryRate: 0.8,
  burnRadius: 0.62,
  burnSpreadSpeed: 0.24,
  burnMaxRadius: 5.2,
  burnRecoveryRate: 0.0042,
  state: 0,
  colorSeason: null,
  /** High default; playground quality still scales density. Editor slider max allows pushing further. */
  layoutDensity: 200,
  /** Wider billboards so clumps read as small leaf rosettes, not hair-thin blades. */
  bladeWidthScale: 1.42,
  /** ~⅓ of the previous default visual height (taller mesh was 1.08×2.9; shorter leaf mesh uses this scale). */
  bladeHeightScale: 1.12,
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
/** Multiple instanced ribbons per layout glyph, placed in a tight disk = leaf clumps. */
const BLADES_PER_SLOT = 6
const MAX_INSTANCES = 280_000
/** World units; buckets blades for camera / effect–zone iteration when view culling is on. */
const BLADE_CELL_SIZE = 5.75
const LAYOUT_PX_PER_WORLD = 16
const DISTURBANCE_RADIUS_MULTIPLIER = 3.8
const MAX_ACTIVE_DISTURBANCES = 72
const MAX_GRASS_BURNS = 22
/** Depth bias for overlapping instanced blades (same plane / tight clumps). */
const GRASS_BLADE_POLYGON_OFFSET_FACTOR = 2.5
const GRASS_BLADE_POLYGON_OFFSET_UNITS = 2

const tmpPos = new THREE.Vector3()
const tmpColor = new THREE.Color()
const tmpSeasonColorA = new THREE.Color()
const tmpSeasonColorB = new THREE.Color()
const tmpLocalPoint = new THREE.Vector3()
const tmpGrassBurnField = { burn: 0, front: 0, cull: 0 }
const tmpCrispOrange = new THREE.Color()
const tmpCharcoal = new THREE.Color()
const ZERO_GRASS_BURN_FIELD = { burn: 0, front: 0, cull: 0 }
const dummy = new THREE.Object3D()

const STATE_BLADE_BASE = [
  new THREE.Color('#3a7a20'),
  new THREE.Color('#a07a18'),
  new THREE.Color('#3d1660'),
  new THREE.Color('#4e4840'),
] as const
const STATE_BLADE_TIP = [
  new THREE.Color('#b8e870'),
  new THREE.Color('#ffe080'),
  new THREE.Color('#d080ff'),
  new THREE.Color('#ccc5b8'),
] as const
const STATE_GROUND_TINT = [
  new THREE.Color('#6aaa48'),
  new THREE.Color('#9a7d44'),
  new THREE.Color('#55316d'),
  new THREE.Color('#8a8175'),
] as const
const STATE_GROUND_BASE = [
  new THREE.Color('#5a9840'),
  new THREE.Color('#8b6f31'),
  new THREE.Color('#6b3f84'),
  new THREE.Color('#93897b'),
] as const
const STATE_GROUND_DARK = [
  new THREE.Color('#3d6630'),
  new THREE.Color('#5f4623'),
  new THREE.Color('#412154'),
  new THREE.Color('#645d54'),
] as const
const SEASON_BLADE_TINT = {
  spring: new THREE.Color('#a8e858'),
  summer: new THREE.Color('#4e8228'),
  autumn: new THREE.Color('#d09030'),
  winter: new THREE.Color('#e8eef0'),
} as const
const SEASON_GROUND_TINT = {
  spring: new THREE.Color('#88c860'),
  summer: new THREE.Color('#578845'),
  autumn: new THREE.Color('#9b7046'),
  winter: new THREE.Color('#bdc5c9'),
} as const
const SEASON_GROUND_BASE = {
  spring: new THREE.Color('#8ab868'),
  summer: new THREE.Color('#5e7a44'),
  autumn: new THREE.Color('#a57b55'),
  winter: new THREE.Color('#d5dadc'),
} as const
const SEASON_GROUND_DARK = {
  spring: new THREE.Color('#5a7040'),
  summer: new THREE.Color('#425c32'),
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
  /** Target position the rendered x/z interpolates toward each frame. */
  targetX: number
  targetZ: number
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

export type GrassBurnOptions = {
  radiusScale?: number
  maxRadiusScale?: number
  strength?: number
  mergeRadius?: number
  /**
   * Strength decay rate for this burn (same units as `burnRecoveryRate`). Lower = longer linger.
   * Laser shots should pass a small value; omit to use `GrassFieldParams.burnRecoveryRate`.
   */
  recoveryRate?: number
}

type GrassBurn = {
  x: number
  z: number
  radius: number
  maxRadius: number
  strength: number
  /** When set, overrides `params.burnRecoveryRate` for this burn only. */
  recoveryRate?: number
}

/** Curved wide ribbon: short leaf-like silhouette (dense clumps use several per glyph). */
function makeBladeGeometry(): THREE.BufferGeometry {
  const bladeHeight = 0.92
  const bladeWidth = 0.44
  const baseY = -0.048
  const geometry = new THREE.PlaneGeometry(bladeWidth, bladeHeight, 1, 6)
  const position = geometry.attributes.position
  const halfH = bladeHeight * 0.5

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const y01 = THREE.MathUtils.clamp((y + halfH) / bladeHeight, 0, 1)
    const edge = x / (bladeWidth * 0.5)
    const taper = THREE.MathUtils.lerp(1, 0.06, Math.pow(y01, 1.05))
    const ribbon = Math.sin(y01 * Math.PI * 1.02) * 0.028 * (1 - y01 * 0.65)
    const curl = Math.pow(y01, 1.45) * 0.052
    const lean = Math.pow(y01, 1.75) * 0.048
    position.setXYZ(
      i,
      x * taper + ribbon,
      y + baseY,
      curl + edge * edge * lean,
    )
  }

  position.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

function bladeCellKey(x: number, z: number): number {
  const ix = Math.floor(x / BLADE_CELL_SIZE)
  const iz = Math.floor(z / BLADE_CELL_SIZE)
  return ix * 100_042_069 + iz
}

function addGrassCellKeysInDisc(
  cx: number,
  cz: number,
  radius: number,
  padding: number,
  out: Set<number>,
  frustum: THREE.Frustum | null,
  grassGroup: THREE.Group,
  tmpBox: THREE.Box3,
): void {
  const cellPad = Math.max(0, padding) + BLADE_CELL_SIZE * 0.35
  const r = Math.max(0.001, radius + cellPad)
  const minIx = Math.floor((cx - r) / BLADE_CELL_SIZE)
  const maxIx = Math.floor((cx + r) / BLADE_CELL_SIZE)
  const minIz = Math.floor((cz - r) / BLADE_CELL_SIZE)
  const maxIz = Math.floor((cz + r) / BLADE_CELL_SIZE)
  const rSq = r * r
  for (let ix = minIx; ix <= maxIx; ix++) {
    const x0 = ix * BLADE_CELL_SIZE
    const x1 = x0 + BLADE_CELL_SIZE
    for (let iz = minIz; iz <= maxIz; iz++) {
      const z0 = iz * BLADE_CELL_SIZE
      const z1 = z0 + BLADE_CELL_SIZE
      const px = THREE.MathUtils.clamp(cx, x0, x1)
      const pz = THREE.MathUtils.clamp(cz, z0, z1)
      const dx = cx - px
      const dz = cz - pz
      if (dx * dx + dz * dz > rSq) continue
      if (frustum) {
        tmpBox.min.set(x0 - cellPad, -2.5, z0 - cellPad)
        tmpBox.max.set(x1 + cellPad, 16, z1 + cellPad)
        tmpBox.applyMatrix4(grassGroup.matrixWorld)
        if (!frustum.intersectsBox(tmpBox)) continue
      }
      out.add(ix * 100_042_069 + iz)
    }
  }
}

function addGrassCellKeysInAabb(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  pad: number,
  out: Set<number>,
): void {
  const minIx = Math.floor((minX - pad) / BLADE_CELL_SIZE)
  const maxIx = Math.floor((maxX + pad) / BLADE_CELL_SIZE)
  const minIz = Math.floor((minZ - pad) / BLADE_CELL_SIZE)
  const maxIz = Math.floor((maxZ + pad) / BLADE_CELL_SIZE)
  for (let ix = minIx; ix <= maxIx; ix++) {
    for (let iz = minIz; iz <= maxIz; iz++) {
      out.add(ix * 100_042_069 + iz)
    }
  }
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

  const width = canvas.width
  const height = canvas.height
  // Seeded deterministic random for stable texture across reloads
  let seed = 0x9e3779b9
  const rand = () => {
    seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5
    return (seed >>> 0) / 0xffffffff
  }
  const randRange = (min: number, max: number) => min + rand() * (max - min)

  // Forest floor base — warm mid-tone soil, brown-green
  ctx.fillStyle = '#4a3f28'
  ctx.fillRect(0, 0, width, height)

  // Large soil-tone variation blobs — earthy browns and olive
  for (let i = 0; i < 60; i++) {
    const x = rand() * width
    const y = rand() * height
    const rx = randRange(80, 220)
    const ry = rx * randRange(0.4, 0.85)
    const alpha = randRange(0.10, 0.22)
    const patch = ctx.createRadialGradient(x, y, rx * 0.08, x, y, rx)
    const hue = randRange(28, 72)
    const sat = randRange(22, 42)
    const light = randRange(28, 44)
    patch.addColorStop(0, `hsla(${hue}, ${sat}%, ${light + 8}%, ${alpha})`)
    patch.addColorStop(0.5, `hsla(${hue}, ${sat}%, ${light}%, ${alpha * 0.6})`)
    patch.addColorStop(1, `hsla(${hue}, ${sat}%, ${light}%, 0)`)
    ctx.fillStyle = patch
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, rand() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  // Moss patches — soft green blobs
  for (let i = 0; i < 45; i++) {
    const x = rand() * width
    const y = rand() * height
    const rx = randRange(30, 120)
    const ry = rx * randRange(0.5, 0.9)
    const alpha = randRange(0.12, 0.28)
    const patch = ctx.createRadialGradient(x, y, rx * 0.1, x, y, rx)
    const hue = randRange(72, 100)
    const sat = randRange(28, 48)
    const light = randRange(30, 46)
    patch.addColorStop(0, `hsla(${hue}, ${sat}%, ${light + 6}%, ${alpha})`)
    patch.addColorStop(0.6, `hsla(${hue}, ${sat}%, ${light}%, ${alpha * 0.5})`)
    patch.addColorStop(1, `hsla(${hue}, ${sat}%, ${light}%, 0)`)
    ctx.fillStyle = patch
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, rand() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  // Leaf litter — small irregular warm-brown ellipses scattered densely
  for (let i = 0; i < 3200; i++) {
    const x = rand() * width
    const y = rand() * height
    const rx = randRange(4, 18)
    const ry = rx * randRange(0.25, 0.55)
    const alpha = randRange(0.12, 0.30)
    const hue = randRange(22, 48)
    const sat = randRange(30, 55)
    const light = randRange(32, 52)
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, rand() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  // Decomposed leaf fragments — tiny warm specks
  for (let i = 0; i < 8000; i++) {
    const x = rand() * width
    const y = rand() * height
    const r = randRange(1.2, 3.8)
    const alpha = randRange(0.08, 0.20)
    const hue = randRange(20, 55)
    const sat = randRange(24, 48)
    const light = randRange(28, 48)
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Dark soil pores / micro-texture — very small dark dots
  for (let i = 0; i < 6000; i++) {
    const x = rand() * width
    const y = rand() * height
    const r = randRange(0.5, 1.8)
    const alpha = randRange(0.04, 0.10)
    ctx.fillStyle = `hsla(${randRange(20, 40)}, 15%, 12%, ${alpha})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Bright moss highlights — tiny bright green-yellow dots
  for (let i = 0; i < 2200; i++) {
    const x = rand() * width
    const y = rand() * height
    const r = randRange(0.8, 2.4)
    const alpha = randRange(0.06, 0.14)
    ctx.fillStyle = `hsla(${randRange(78, 105)}, ${randRange(35, 55)}%, ${randRange(40, 56)}%, ${alpha})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Curved leaf veins / organic fibres — gentle arcs, NOT straight crosshatch lines
  for (let i = 0; i < 1800; i++) {
    const x = rand() * width
    const y = rand() * height
    const len = randRange(6, 22)
    const startAngle = rand() * Math.PI * 2
    const sweep = randRange(0.3, 1.1) * (rand() > 0.5 ? 1 : -1)
    const r = len / Math.abs(sweep)
    const alpha = randRange(0.04, 0.09)
    const hue = randRange(25, 55)
    ctx.strokeStyle = `hsla(${hue}, ${randRange(22, 40)}%, ${randRange(30, 46)}%, ${alpha})`
    ctx.lineWidth = randRange(0.4, 1.0)
    ctx.beginPath()
    ctx.arc(x + Math.cos(startAngle + Math.PI / 2) * r, y + Math.sin(startAngle + Math.PI / 2) * r, r, startAngle - Math.PI / 2, startAngle - Math.PI / 2 + sweep)
    ctx.stroke()
  }

  // Broad dark humus zones — large very-low-alpha dark blobs for depth variation
  for (let i = 0; i < 30; i++) {
    const x = rand() * width
    const y = rand() * height
    const rx = randRange(60, 180)
    const ry = rx * randRange(0.4, 0.75)
    const alpha = randRange(0.04, 0.09)
    const patch = ctx.createRadialGradient(x, y, rx * 0.05, x, y, rx)
    patch.addColorStop(0, `rgba(12, 10, 6, ${alpha})`)
    patch.addColorStop(1, 'rgba(12, 10, 6, 0)')
    ctx.fillStyle = patch
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, rand() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(6.0, 6.0)
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
  octaves: 2,
  roughness: 0.58,
  warpAmplitude: 0,
  contrast: 1.18,
})

export class GrassFieldEffect {
  readonly group = new THREE.Group()
  readonly interactionMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>

  private readonly bladeGeometry = makeBladeGeometry()
  private readonly bladeMaterial = new THREE.MeshStandardMaterial({
    color: '#d3f48d',
    emissive: '#35580f',
    emissiveIntensity: 0.22,
    side: THREE.DoubleSide,
    /** Fully diffuse: avoids view-dependent IBL/specular shimmer on the sun-facing side. */
    roughness: 1,
    metalness: 0,
    /** Playground sets `scene.environment` (sky); grass billboards should not mirror it. */
    envMapIntensity: 0,
    polygonOffset: true,
    polygonOffsetFactor: GRASS_BLADE_POLYGON_OFFSET_FACTOR,
    polygonOffsetUnits: GRASS_BLADE_POLYGON_OFFSET_UNITS,
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
  private readonly burns: GrassBurn[] = []
  private readonly cachedBlades: CachedBladeInstance[] = []
  /** Blade indices per spatial cell (`bladeCellKey`); rebuilt with the blade cache. */
  private readonly bladeCellBuckets = new Map<number, number[]>()
  private readonly activeCellKeysScratch = new Set<number>()
  private bladeWindPhaseAttr!: THREE.InstancedBufferAttribute
  private readonly bladeBurnRimAttr: THREE.InstancedBufferAttribute
  private readonly bladeShaderUniforms: Record<string, THREE.IUniform<number>> = {
    uGrassWindTime: { value: 0 },
    uGrassWindStrength: { value: 0 },
    uGrassGpuWind: { value: 1 },
  }
  private terrainRelief: TerrainHeightSampler | null
  private lastElapsedTime = 0
  private bladeCacheDirty = true
  private baseBladeColorsDirty = true
  private frameLayoutViewCull: PresetLayoutViewCull | null = null
  private prevHadLayoutViewCull: boolean | null = null
  private readonly tmpViewCullBox = new THREE.Box3()
  private params: GrassFieldParams

  constructor(
    surface: PreparedSurfaceSource<GrassTokenId, GrassTokenMeta>,
    seedCursor: SeedCursorFactory,
    initialParams: GrassFieldParams,
    placementMask: GrassFieldPlacementMask = {},
    terrainRelief: TerrainHeightSampler | null = null,
  ) {
    this.params = { ...initialParams }
    this.seedCursor = seedCursor
    this.terrainRelief = terrainRelief
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

    const windPhaseData = new Float32Array(MAX_INSTANCES * 2)
    this.bladeWindPhaseAttr = new THREE.InstancedBufferAttribute(windPhaseData, 2)
    this.bladeGeometry.setAttribute('windPhase', this.bladeWindPhaseAttr)
    this.bladeBurnRimAttr = createBurnRimInstancedAttribute(MAX_INSTANCES)
    this.bladeGeometry.setAttribute('burnRim', this.bladeBurnRimAttr)
    this.patchGrassBladeMaterial()
  }

  private patchGrassBladeMaterial(): void {
    this.bladeMaterial.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.bladeShaderUniforms)

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
attribute vec2 windPhase;
attribute float burnRim;
varying float vGrassHeight;
varying float vGrassEdge;
varying float vBurnRim;
`,
      )

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vBurnRim = burnRim;
vGrassHeight = uv.y;
vGrassEdge = abs( uv.x - 0.5 ) * 2.0;
{
  float gGpu = uGrassGpuWind;
  vec2 wp = windPhase;
  float gust = sin( uGrassWindTime * 1.55 + wp.x ) + 0.55 * sin( uGrassWindTime * 2.8 + wp.y );
  float tip = smoothstep( 0.14, 1.0, uv.y );
  float edgeSigned = uv.x - 0.5;
  float windMask = pow( smoothstep( 0.0, 0.38, uv.y ), 2.85 );
  float sway = gust * uGrassWindStrength * 0.15 * windMask * gGpu;
  float bendAmt = ( 0.26 + abs( gust ) * 0.2 ) * uGrassWindStrength * windMask * gGpu;
  transformed.x += edgeSigned * tip * 0.035;
  transformed.z += tip * 0.04 + edgeSigned * edgeSigned * tip * 0.05;
  transformed.x += sway;
  transformed.z += bendAmt * 0.62;
}
`,
      )

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
varying float vGrassHeight;
varying float vGrassEdge;
varying float vBurnRim;
`,
      )

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  float bladeAo = mix( 0.4, 1.0, smoothstep( 0.0, 0.52, vGrassHeight ) );
  float edgeShade = mix( 0.9, 1.0, 1.0 - smoothstep( 0.3, 1.0, vGrassEdge ) );
  float tipLift = mix( 0.94, 1.06, smoothstep( 0.42, 1.0, vGrassHeight ) );
  diffuseColor.rgb *= bladeAo * edgeShade * tipLift;
}
`,
      )

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance *= mix( 0.34, 1.0, smoothstep( 0.0, 0.48, vGrassHeight ) );
${BURN_NEON_RIM_COLOR_FRAGMENT}`,
      )
    }
    this.bladeMaterial.customProgramCacheKey = () => 'grass-blade-wind-ao-v8-burn-neon-no-env'
    this.bladeMaterial.needsUpdate = true
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

  setTerrainRelief(terrainRelief: TerrainHeightSampler | null): void {
    this.terrainRelief = terrainRelief
    this.refreshTerrain()
  }

  clearDisturbances(): void {
    this.disturbances.length = 0
    this.baseBladeColorsDirty = true
  }

  clearBurns(): void {
    this.burns.length = 0
    this.baseBladeColorsDirty = true
  }

  hasDisturbances(): boolean {
    return this.disturbances.length > 0
  }

  hasBurns(): boolean {
    return this.burns.length > 0
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
        const dx = disturbance.targetX - x
        const dz = disturbance.targetZ - z
        if (dx * dx + dz * dz > mergeRadiusSq) continue
        disturbance.targetX = x
        disturbance.targetZ = z
        disturbance.radius = Math.max(disturbance.radius, radius)
        disturbance.strength = Math.max(disturbance.strength, strength)
        return
      }
    }

    this.disturbances.unshift({
      x,
      z,
      targetX: x,
      targetZ: z,
      radius,
      strength,
      deformGround,
      recoveryRate,
    })
    if (this.disturbances.length > MAX_ACTIVE_DISTURBANCES) {
      this.disturbances.length = MAX_ACTIVE_DISTURBANCES
    }
  }

  addBurnFromWorldPoint(worldPoint: THREE.Vector3, options: GrassBurnOptions = {}): void {
    tmpLocalPoint.copy(worldPoint)
    this.group.worldToLocal(tmpLocalPoint)
    const x = THREE.MathUtils.clamp(tmpLocalPoint.x, -this.fieldWidth * 0.46, this.fieldWidth * 0.46)
    const z = THREE.MathUtils.clamp(tmpLocalPoint.z, -this.fieldDepth * 0.46, this.fieldDepth * 0.46)
    const radius = this.params.burnRadius * (options.radiusScale ?? 1)
    const maxRadius = this.params.burnMaxRadius * (options.maxRadiusScale ?? 1)
    const strength = THREE.MathUtils.clamp(options.strength ?? 1, 0.05, 1.4)
    const mergeRadius = options.mergeRadius ?? 0
    const defaultBurnRecovery = this.params.burnRecoveryRate
    const incomingRecovery =
      options.recoveryRate !== undefined ? options.recoveryRate : defaultBurnRecovery

    if (mergeRadius > 0) {
      const mergeRadiusSq = mergeRadius * mergeRadius
      for (const burn of this.burns) {
        const dx = burn.x - x
        const dz = burn.z - z
        if (dx * dx + dz * dz > mergeRadiusSq) continue
        burn.x = THREE.MathUtils.lerp(burn.x, x, 0.35)
        burn.z = THREE.MathUtils.lerp(burn.z, z, 0.35)
        burn.radius = Math.max(burn.radius, radius)
        burn.maxRadius = Math.max(burn.maxRadius, maxRadius)
        burn.strength = Math.min(1.35, Math.max(burn.strength, strength))
        const rOld = burn.recoveryRate ?? defaultBurnRecovery
        burn.recoveryRate = Math.min(rOld, incomingRecovery)
        this.baseBladeColorsDirty = true
        return
      }
    }

    this.burns.unshift({
      x,
      z,
      radius,
      maxRadius,
      strength,
      recoveryRate: options.recoveryRate !== undefined ? options.recoveryRate : undefined,
    })
    if (this.burns.length > MAX_GRASS_BURNS) {
      this.burns.length = MAX_GRASS_BURNS
    }
    this.baseBladeColorsDirty = true
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

  update(elapsedTime: number, layoutViewCull?: PresetLayoutViewCull | null): void {
    const hasCull = layoutViewCull != null
    if (this.prevHadLayoutViewCull !== hasCull) {
      this.bladeCacheDirty = true
      this.prevHadLayoutViewCull = hasCull
    }
    this.frameLayoutViewCull = layoutViewCull ?? null
    const delta = this.lastElapsedTime === 0 ? 0 : Math.max(0, elapsedTime - this.lastElapsedTime)
    this.lastElapsedTime = elapsedTime
    this.updateBurns(delta)
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

  /** Charred body + crisp front + presence cull in one pass over active burns. */
  private burnFieldAt(
    x: number,
    z: number,
    target: { burn: number; front: number; cull: number },
  ): { burn: number; front: number; cull: number } {
    if (this.burns.length === 0) {
      target.burn = 0
      target.front = 0
      target.cull = 0
      return target
    }

    let burn = 0
    let front = 0
    let cull = 0
    for (const impact of this.burns) {
      const physicalR = Math.max(0.001, impact.radius)
      const s = THREE.MathUtils.clamp(impact.strength, 0, 1)
      /** Contracting disk while strength fades — reads as slow dissolve, not a pop. */
      const displayRadius = physicalR * THREE.MathUtils.lerp(0.34, 1, Math.pow(s, 0.5))
      const distance = Math.hypot(x - impact.x, z - impact.z)
      if (distance > displayRadius + 0.55) continue

      const localBurn =
        impact.strength * Math.pow(1 - THREE.MathUtils.smoothstep(distance, 0, displayRadius), 0.58)
      burn = Math.max(burn, localBurn)

      const frontWidth = Math.max(0.065, displayRadius * 0.095)
      const frontDistance = Math.abs(distance - displayRadius)
      const localFront =
        impact.strength * Math.pow(1 - THREE.MathUtils.smoothstep(frontDistance, 0, frontWidth), 2.75)
      front = Math.max(front, localFront)

      const coreFalloff = 1 - THREE.MathUtils.smoothstep(distance, 0, displayRadius)
      const coreCull = impact.strength * Math.pow(Math.max(0, coreFalloff), 0.28)
      const frontCull = localFront * 0.98

      cull = Math.max(cull, Math.max(coreCull, frontCull))
    }
    target.burn = THREE.MathUtils.clamp(burn, 0, 1)
    target.front = THREE.MathUtils.clamp(front, 0, 1)
    target.cull = THREE.MathUtils.clamp(cull, 0, 1)
    return target
  }

  private applyGrassBurnToBladeColor(color: THREE.Color, burn: number, front: number): void {
    const edge = Math.pow(front, 0.34)
    tmpCrispOrange.setHSL(0.052, 0.97, 0.52)
    tmpCharcoal.setHSL(0.07, 0.12, 0.1 + burn * 0.09)
    const charMix = THREE.MathUtils.smoothstep(burn, 0.1, 0.94) * 0.9
    color.lerp(tmpCharcoal, charMix)
    const ringBoost = edge * (0.88 + 0.12 * (1 - burn))
    color.lerp(tmpCrispOrange, ringBoost)
    /** WebGPURenderer does not run `onBeforeCompile`; keep neon in base color so burns read everywhere. */
    const neon = THREE.MathUtils.clamp(burn * 0.5 + front * 0.92, 0, 1)
    if (neon > 0.03) {
      tmpCrispOrange.setRGB(1, 0.36, 0.02)
      color.lerp(tmpCrispOrange, neon * 0.42)
    }
  }

  private updateBurns(delta: number): void {
    if (delta <= 0 || this.burns.length === 0) return
    const removeThreshold = 0.018
    for (const burn of this.burns) {
      const spreadMul = THREE.MathUtils.lerp(0.12, 1, Math.pow(burn.strength, 0.82))
      const growth =
        this.params.burnSpreadSpeed * delta * (0.45 + burn.strength * 0.55) * spreadMul
      burn.radius = Math.min(burn.maxRadius, burn.radius + growth)
    }
    for (let i = this.burns.length - 1; i >= 0; i--) {
      const burn = this.burns[i]!
      const rate = burn.recoveryRate ?? this.params.burnRecoveryRate
      if (rate > 0) {
        burn.strength = decayRecoveringStrength(burn.strength, Math.max(1e-7, rate), delta)
      }
      if (burn.strength <= removeThreshold) {
        this.burns.splice(i, 1)
      }
    }
    if (this.burns.length === 0) {
      this.baseBladeColorsDirty = true
    }
  }

  private updateDisturbances(delta: number): void {
    if (delta <= 0 || this.disturbances.length === 0) return
    // How quickly the rendered position chases the target — higher = snappier.
    const followSpeed = 6.5
    const t = 1 - Math.exp(-followSpeed * delta)
    for (let i = this.disturbances.length - 1; i >= 0; i--) {
      const d = this.disturbances[i]!
      d.x = THREE.MathUtils.lerp(d.x, d.targetX, t)
      d.z = THREE.MathUtils.lerp(d.z, d.targetZ, t)
      const rate = d.recoveryRate ?? this.params.recoveryRate
      d.strength = decayRecoveringStrength(d.strength, rate, delta)
      if (d.strength <= 0.015) this.disturbances.splice(i, 1)
    }
  }

  private baseGroundY(x: number, z: number): number {
    const baseUndulation = 0.12 * Math.sin(x * 0.22) * Math.cos(z * 0.18) + 0.03 * Math.sin((x + z) * 0.65)
    const relief = this.terrainRelief?.sampleHeightAtXZ(x, z) ?? 0
    return baseUndulation + relief
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

  private refreshTerrain(): void {
    this.updateGround()
    this.groundGeometry.computeBoundingBox()
    this.groundGeometry.computeBoundingSphere()
    this.bladeCacheDirty = true
  }

  private updateBlades(elapsedTime: number): void {
    if (this.bladeCacheDirty) {
      this.rebuildBladeCache()
    }

    const hasDisturbances = this.disturbances.length > 0
    const hasBurns = this.burns.length > 0
    const needsDynamicBladeColor = hasDisturbances || hasBurns
    this.bladeShaderUniforms.uGrassWindTime.value = elapsedTime
    this.bladeShaderUniforms.uGrassWindStrength.value = this.params.wind
    /** Wind sway is vertex-only (anchored base); CPU no longer rotates the whole blade for wind. */
    this.bladeShaderUniforms.uGrassGpuWind.value = 1

    const stateIndex = this.stateIndex()
    const statePresence = STATE_PRESENCE[stateIndex]!
    const disturbedPresence = Math.max(0.02, statePresence * (1 - this.params.disturbanceStrength * 0.98))
    const stateBend = STATE_BEND[stateIndex]!
    const stateLean = STATE_LEAN[stateIndex]!
    const disturbanceLift = STATE_DISTURBANCE_LIFT[stateIndex]!
    const bladeWidthScale = Math.max(0.01, this.params.bladeWidthScale)
    const bladeHeightScale = Math.max(0.01, this.params.bladeHeightScale)
    const disturbanceBounds = hasDisturbances ? this.activeDisturbanceBounds() : null
    const burnBounds = hasBurns ? this.activeBurnBounds() : null
    const effectBounds = GrassFieldEffect.mergeXZBounds(disturbanceBounds, burnBounds)
    const cull = this.frameLayoutViewCull
    /** Must match `addGrassCellKeysInDisc` (radius + padding + cell pad). Raw `cull.radius` caused edge pop. */
    const grassCullPad = cull ? (cull.padding ?? 0) + BLADE_CELL_SIZE * 0.35 : 0
    const effectiveCullR = cull ? cull.radius + grassCullPad : 0
    const cullRsq = cull ? effectiveCullR * effectiveCullR : 0
    let camLX = 0
    let camLZ = 0
    if (cull) {
      tmpLocalPoint.copy(cull.cameraWorld)
      this.group.worldToLocal(tmpLocalPoint)
      camLX = tmpLocalPoint.x
      camLZ = tmpLocalPoint.z
    }

    let activeCellKeys: Set<number> | null = null
    if (cull && this.bladeCellBuckets.size > 0) {
      /**
       * Per-frame buckets: disc only. This is intentionally conservative so nearby camera nudges
       * do not churn the visible fringe every frame; exact per-blade rejection at the same edge
       * read as shimmer, and bucket-level cull is already tight enough for this dense cover.
       */
      activeCellKeys = this.activeCellKeysScratch
      activeCellKeys.clear()
      addGrassCellKeysInDisc(
        camLX,
        camLZ,
        cull.radius,
        cull.padding ?? 0,
        activeCellKeys,
        null,
        this.group,
        this.tmpViewCullBox,
      )
      if (effectBounds) {
        addGrassCellKeysInAabb(
          effectBounds.minX,
          effectBounds.maxX,
          effectBounds.minZ,
          effectBounds.maxZ,
          2.5,
          activeCellKeys,
        )
      }
    }

    const windArr = this.bladeWindPhaseAttr.array as Float32Array
    let instanceIndex = 0

    const processBlade = (i: number): void => {
      const blade = this.cachedBlades[i]!
      if (cull && !activeCellKeys) {
        const dx = blade.x - camLX
        const dz = blade.z - camLZ
        if (dx * dx + dz * dz > cullRsq) {
          if (!effectBounds) return
          const pad = 2.5
          if (
            blade.x < effectBounds.minX - pad ||
            blade.x > effectBounds.maxX + pad ||
            blade.z < effectBounds.minZ - pad ||
            blade.z > effectBounds.maxZ + pad
          ) {
            return
          }
        }
      }
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
        if (blade.hashPresence > localCoverage) return
      }

      const burnField = hasBurns ? this.burnFieldAt(blade.x, blade.z, tmpGrassBurnField) : ZERO_GRASS_BURN_FIELD

      /** Presence gate (stronger than visual burn): bare patch matches shot footprint, then regrows as strength fades. */
      if (hasBurns) {
        /** Game shots cap strength below 1; boost so the bare patch still clears almost all blades. */
        const burnCullStrength = THREE.MathUtils.clamp(0.05 + burnField.cull * 1.06, 0, 1)
        if (burnCullStrength > 0.004) {
          const burnPresenceLimit =
            THREE.MathUtils.lerp(statePresence, 0, burnCullStrength) * blade.coverageMultiplier
          if (blade.hashPresence > burnPresenceLimit) return
        }
      }

      /** Charred blades keep most of their height: laser trample + burn shrink stacked invisibly. */
      const burnTrampleShield = THREE.MathUtils.clamp(
        burnField.burn * 0.62 + burnField.front * 1.4,
        0,
        1,
      )
      const visDisturbance =
        localDisturbance * THREE.MathUtils.lerp(1, 0.14, burnTrampleShield)

      const trampleBend = visDisturbance * 1.15 * disturbanceLift

      const burnWidthMul = 1 - burnField.burn * 0.38 + burnField.front * 0.1
      /** Strong burn can nearly flatten blades; floor keeps a stub so instances stay valid. */
      const burnHeightMul = Math.max(0.06, 1 - burnField.burn * 0.62 + burnField.front * 0.34)

      tmpPos.set(
        blade.x + awayX * visDisturbance * 0.22,
        blade.baseY + 0.16 + visDisturbance * 0.05,
        blade.z + awayZ * visDisturbance * 0.22,
      )
      dummy.position.copy(tmpPos)
      dummy.rotation.set(0, Math.atan2(awayX, awayZ) + blade.baseBendDirection, 0)
      dummy.rotateX(blade.baseRotateX)
      dummy.rotateZ((trampleBend * Math.sign(awayX || 1) + stateLean) * stateBend)
      dummy.scale.set(
        blade.baseWidth * bladeWidthScale * (1 - visDisturbance * 0.42) * burnWidthMul,
        Math.max(blade.baseHeight * bladeHeightScale * (1 - visDisturbance * 0.88), 0.18 * bladeHeightScale) *
          burnHeightMul,
        1,
      )
      dummy.updateMatrix()
      this.bladeMesh.setMatrixAt(instanceIndex, dummy.matrix)

      windArr[instanceIndex * 2] = blade.windPhaseA
      windArr[instanceIndex * 2 + 1] = blade.windPhaseB

      const burnRim01 = hasBurns
        ? THREE.MathUtils.clamp(burnField.burn * 0.92 + burnField.front * 0.42, 0, 1)
        : 0
      this.bladeBurnRimAttr.setX(instanceIndex, burnRim01)

      if (needsDynamicBladeColor) {
        tmpColor.setRGB(blade.baseColorR, blade.baseColorG, blade.baseColorB)
        if (localDisturbance > 0) {
          tmpColor.lerp(this.tintColor(STATE_GROUND_BASE[stateIndex]!, SEASON_GROUND_BASE, 0.52), localDisturbance * 0.06)
          tmpColor.lerp(this.tintColor(STATE_GROUND_DARK[stateIndex]!, SEASON_GROUND_DARK, 0.58), localDisturbance * 0.28)
        }
        if (burnField.burn > 0.002 || burnField.front > 0.002) {
          this.applyGrassBurnToBladeColor(tmpColor, burnField.burn, burnField.front)
        }
        this.bladeMesh.setColorAt(instanceIndex, tmpColor)
      } else if (this.baseBladeColorsDirty || cull) {
        /** `cull` remaps instance indices every frame; refresh static colors whenever the visible set is camera-relative. */
        tmpColor.setRGB(blade.baseColorR, blade.baseColorG, blade.baseColorB)
        this.bladeMesh.setColorAt(instanceIndex, tmpColor)
      }

      instanceIndex++
    }

    if (activeCellKeys) {
      for (const key of activeCellKeys) {
        const bucket = this.bladeCellBuckets.get(key)
        if (!bucket) continue
        for (let b = 0; b < bucket.length; b++) {
          processBlade(bucket[b]!)
        }
      }
    } else {
      for (let i = 0; i < this.cachedBlades.length; i++) {
        processBlade(i)
      }
    }

    this.bladeMesh.count = instanceIndex
    this.bladeMesh.instanceMatrix.needsUpdate = true
    this.bladeWindPhaseAttr.needsUpdate = true
    this.bladeBurnRimAttr.needsUpdate = true
    if (needsDynamicBladeColor && this.bladeMesh.instanceColor) {
      this.bladeMesh.instanceColor.needsUpdate = true
      this.baseBladeColorsDirty = true
    }
    if (!needsDynamicBladeColor && this.bladeMesh.instanceColor && (this.baseBladeColorsDirty || cull)) {
      this.bladeMesh.instanceColor.needsUpdate = true
      if (!cull) this.baseBladeColorsDirty = false
    }
  }

  private static mergeXZBounds(
    a: { minX: number; maxX: number; minZ: number; maxZ: number } | null,
    b: { minX: number; maxX: number; minZ: number; maxZ: number } | null,
  ): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
    if (!a && !b) return null
    if (!a) return b
    if (!b) return a
    return {
      minX: Math.min(a.minX, b.minX),
      maxX: Math.max(a.maxX, b.maxX),
      minZ: Math.min(a.minZ, b.minZ),
      maxZ: Math.max(a.maxZ, b.maxZ),
    }
  }

  private activeBurnBounds():
    | {
        minX: number
        maxX: number
        minZ: number
        maxZ: number
      }
    | null {
    if (this.burns.length === 0) return null

    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const burn of this.burns) {
      const radius = Math.max(0.001, burn.radius)
      minX = Math.min(minX, burn.x - radius)
      maxX = Math.max(maxX, burn.x + radius)
      minZ = Math.min(minZ, burn.z - radius)
      maxZ = Math.max(maxZ, burn.z + radius)
    }
    return { minX, maxX, minZ, maxZ }
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
    this.bladeCellBuckets.clear()
    const rowStep = this.fieldDepth / (ROWS + 1.1)
    const backZ = this.fieldDepth * 0.48
    const stateIndex = this.stateIndex()
    const statePresence = STATE_PRESENCE[stateIndex]!
    const stateHeight = STATE_HEIGHT[stateIndex]!
    const stateWidth = STATE_WIDTH[stateIndex]!
    const stateBend = STATE_BEND[stateIndex]!
    const bladeBaseColor = this.tintColor(STATE_BLADE_BASE[stateIndex]!, SEASON_BLADE_TINT, 0.22, tmpSeasonColorA)
    const bladeTipColor = this.tintColor(STATE_BLADE_TIP[stateIndex]!, SEASON_BLADE_TINT, 0.44, tmpSeasonColorB)

    const frustumCtx: PresetLayoutViewCullFrustumContext | undefined = this.frameLayoutViewCull
      ? { group: this.group, tmpBox: this.tmpViewCullBox, rowThickness: rowStep * 0.55 }
      : undefined

    if (this.frameLayoutViewCull?.frustum) {
      this.group.updateMatrixWorld(true)
    }

    this.layoutDriver.forEachLaidOutLine({
      spanMin: -this.fieldWidth * 0.5,
      spanMax: this.fieldWidth * 0.5,
      lineCoordAtRow: (row) => backZ - row * rowStep,
      getMaxWidth: (slot) => this.getSlotMaxWidth(slot),
      shouldVisitSlot: this.frameLayoutViewCull
        ? (slot) => shouldVisitSlotForViewCull(slot, 0, 0, this.frameLayoutViewCull!, frustumCtx)
        : undefined,
      onLine: ({ slot, resolvedGlyphs, tokenLineKey }) => {
        const n = resolvedGlyphs.length
        const lineSeed = lineSignature(tokenLineKey)
        const lineLateralShift = (lineSeed - 0.5) * slot.sectorStep * 0.28
        const lineDepthShift = (lineSeed - 0.5) * rowStep * 0.18
        const lineClusterStrength = 0.014 + lineSeed * 0.022

        for (let k = 0; k < n; k++) {
          if (this.cachedBlades.length >= MAX_INSTANCES) break
          const token = resolvedGlyphs[k]!
          const identity = token.ordinal + 1
          const { meta } = token

          const weftScatter = glyphScatter(identity, lineSeed, k)
          const hashLat0 = glyphHash(identity, slot.row, k, 0)
          const hashDep0 = glyphHash(identity + 1, slot.sector, k, 0)
          const hashPresenceGlyph = glyphHash(identity + 3, slot.row * 131 + slot.sector, k, 41)

          const t01 = THREE.MathUtils.clamp(
            (k + hashLat0 * 0.9 + 0.05) / (n + 0.1) + weftScatter * lineClusterStrength,
            0.02,
            0.98,
          )
          const clumpX =
            slot.spanStart +
            t01 * slot.spanSize +
            lineLateralShift +
            (hashLat0 - 0.5) * slot.sectorStep * 0.38 +
            weftScatter * slot.sectorStep * 0.11
          const clumpZ =
            slot.lineCoord +
            lineDepthShift +
            (hashDep0 - 0.5) * rowStep * 0.52 +
            weftScatter * rowStep * 0.12

          const coverageMultiplier = this.placementMask.coverageMultiplierAtXZ(clumpX, clumpZ)
          if (hashPresenceGlyph > statePresence * coverageMultiplier) continue
          if (this.placementMask.excludeAtXZ(clumpX, clumpZ)) continue

          const clumpRBase = slot.sectorStep * (0.1 + hashLat0 * 0.07) + rowStep * 0.04

          for (let blade = 0; blade < BLADES_PER_SLOT; blade++) {
            if (this.cachedBlades.length >= MAX_INSTANCES) break

            const hashLat = glyphHash(identity, slot.row, k, blade + 1)
            const hashDep = glyphHash(identity + 1, slot.sector, k, blade ^ 0xff)
            const hashOrganic = glyphHash(identity + 2, slot.row ^ slot.sector, k + blade * 31)

            const disk = Math.sqrt(hashDep)
            const angle =
              (blade / BLADES_PER_SLOT) * Math.PI * 2 +
              hashLat * 1.55 +
              glyphHash(identity + 5, k, blade, slot.sector) * 0.85
            const rad = disk * clumpRBase * (0.55 + hashOrganic * 0.45)
            const x = clumpX + Math.cos(angle) * rad
            const localZ = clumpZ + Math.sin(angle) * rad

            if (this.placementMask.excludeAtXZ(x, localZ)) continue

            const coverageMul = this.placementMask.coverageMultiplierAtXZ(x, localZ)
            if (hashPresenceGlyph > statePresence * coverageMul) continue

            const organicNoise = grassOrganicWorldField(x + hashOrganic * 0.4, localZ + hashOrganic * 0.3)
            const tipFade = blade * 0.07
            const stateBrightness = THREE.MathUtils.clamp(
              0.06 + organicNoise * 0.78 + meta.lightShift + tipFade,
              0,
              1,
            )
            tmpColor.copy(bladeBaseColor)
            tmpColor.lerp(bladeTipColor, Math.pow(stateBrightness, 0.82))

            this.cachedBlades.push({
              x,
              z: localZ,
              baseY: this.baseGroundY(x, localZ),
              baseWidth: (0.062 + meta.widthBias + (identity % 5) * 0.006 + organicNoise * 0.014 + blade * 0.003) * stateWidth,
              baseHeight:
                (0.82 + meta.heightBias + (identity % 7) * 0.07 + organicNoise * 0.12 + blade * 0.04) *
                0.58 *
                stateHeight,
              baseRotateX: (organicNoise - 0.5) * 0.14 * stateBend + (blade - BLADES_PER_SLOT * 0.5) * 0.018,
              baseBendDirection:
                (organicNoise - 0.5) * 0.38 + angle * 0.12 + (hashLat - 0.5) * 0.45,
              windPhaseA: x * 0.52 + localZ * 0.34,
              windPhaseB: x * 1.1 - localZ * 0.62,
              coverageMultiplier: coverageMul,
              hashPresence: hashPresenceGlyph,
              baseColorR: tmpColor.r,
              baseColorG: tmpColor.g,
              baseColorB: tmpColor.b,
            })
            const bladeIndex = this.cachedBlades.length - 1
            const ck = bladeCellKey(x, localZ)
            let bucket = this.bladeCellBuckets.get(ck)
            if (!bucket) {
              bucket = []
              this.bladeCellBuckets.set(ck, bucket)
            }
            bucket.push(bladeIndex)
          }
        }
      },
    })

    this.bladeCacheDirty = false
    this.baseBladeColorsDirty = true
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
  terrainRelief?: TerrainHeightSampler | null
}

export function createGrassEffect({
  seedCursor,
  surface = buildGrassStateSurface(DEFAULT_GRASS_FIELD_PARAMS.state),
  initialParams = DEFAULT_GRASS_FIELD_PARAMS,
  placementMask,
  terrainRelief = null,
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

  return new GrassFieldEffect(effect.source, seedCursor, initialParams, placementMask, terrainRelief)
}
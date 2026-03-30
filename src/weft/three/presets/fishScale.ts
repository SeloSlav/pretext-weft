import * as THREE from 'three'
import type {
  PreparedSurfaceSource,
  ResolvedSurfaceGlyph,
  SeedCursorFactory,
  SurfaceLayoutSlot,
} from '../../core'
import { SurfaceLayoutDriver } from '../../core'
import { updateRecoveringImpacts } from '../../runtime'
import { createSurfaceEffect, recoverableDamage, wallLayout } from '../api'
import { smoothPulse } from './sharedMath'
import {
  getPreparedShellSurface,
  type FishTokenId,
  type FishTokenMeta,
} from './fishScaleSource'

export type ShellSurfaceAppearance = 'fish' | 'shutter' | 'ivy' | 'glass' | 'glassBulb'
export type ShellSurfaceSubtype = ShellSurfaceAppearance

export type ShellSurfaceParams = {
  woundRadius: number
  woundNarrow: number
  woundDepth: number
  scaleLift: number
  surfaceFlex: number
  recoveryRate: number
}

export const DEFAULT_SHELL_SURFACE_PARAMS: ShellSurfaceParams = {
  woundRadius: 0.68,
  woundNarrow: 0.26,
  woundDepth: 0.72,
  scaleLift: 0.55,
  surfaceFlex: 0.28,
  recoveryRate: 0.8,
}

export const FISH_SCALE_PATCH_WIDTH = 5.8
export const FISH_SCALE_PATCH_HEIGHT = 4.4

const ROWS = 16
const SECTORS = 28
const MAX_INSTANCES = 9_000
const PATCH_WIDTH = FISH_SCALE_PATCH_WIDTH
const PATCH_HEIGHT = FISH_SCALE_PATCH_HEIGHT
const FACADE_VISUAL_HOLE_THRESHOLD = 0.5
const LAYOUT_PX_PER_WORLD = 33
const BASE_SCALE_LIFT = 0.055
const WOUND_MERGE_RADIUS = 0.46
const WOUND_MAX_STRENGTH = 2.1
const GLASS_GLOBE_RADIUS = 2.5
const GLASS_POLAR_MARGIN = 0.16
const GLASS_PANE_CELL_X = 1.35
const GLASS_PANE_CELL_Y = 1.2

const tmpPos = new THREE.Vector3()
const tmpPosX0 = new THREE.Vector3()
const tmpPosX1 = new THREE.Vector3()
const tmpPosY0 = new THREE.Vector3()
const tmpPosY1 = new THREE.Vector3()
const tmpTangentX = new THREE.Vector3()
const tmpTangentY = new THREE.Vector3()
const tmpNormal = new THREE.Vector3()
const tmpMatrix = new THREE.Matrix4()
const tmpColor = new THREE.Color()
const tmpLocalPoint = new THREE.Vector3()
const tmpLocalDirection = new THREE.Vector3()
const tmpWorldMatrix = new THREE.Matrix4()
const dummy = new THREE.Object3D()
const DAMAGE_TINT_FISH = new THREE.Color('#3f332f')
const DAMAGE_TINT_IVY = new THREE.Color('#2a1810')
const DAMAGE_TINT_GLASS = new THREE.Color('#24313b')

type Wound = {
  x: number
  y: number
  strength: number
  side: 1 | -1
}

type SurfaceFrame = {
  position: THREE.Vector3
  tangentX: THREE.Vector3
  tangentY: THREE.Vector3
  normal: THREE.Vector3
}

type BreachHoleUniforms = {
  uFishInvWorldMatrix: { value: THREE.Matrix4 }
  uWoundCount: { value: number }
  uWoundXY: { value: Float32Array }
  uWoundRadius: { value: Float32Array }
  uWoundStrength: { value: Float32Array }
  uPatchHalfW: { value: number }
  uPatchHalfH: { value: number }
  uHoleThreshold: { value: number }
}

function uhash(n: number): number {
  n = (n ^ 61) ^ (n >>> 16)
  n = Math.imul(n, 0x45d9f3b)
  n ^= n >>> 4
  n = Math.imul(n, 0xd3833e2d)
  n ^= n >>> 15
  return (n >>> 0) / 4294967296
}

function glyphHash(a: number, b: number, c = 0): number {
  return uhash(a ^ Math.imul(b, 0x9e3779b9) ^ Math.imul(c, 0x85ebca6b))
}

function createScaleGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0.58)
  shape.bezierCurveTo(-0.28, 0.52, -0.44, 0.18, -0.28, -0.08)
  shape.quadraticCurveTo(-0.1, -0.5, 0, -0.76)
  shape.quadraticCurveTo(0.1, -0.5, 0.28, -0.08)
  shape.bezierCurveTo(0.44, 0.18, 0.28, 0.52, 0, 0.58)

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelThickness: 0.045,
    bevelSize: 0.04,
    curveSegments: 18,
  })

  geometry.center()
  geometry.rotateX(Math.PI)
  geometry.computeVertexNormals()
  return geometry
}

function createGlassShardGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(-0.58, 0.34)
  shape.lineTo(-0.18, 0.72)
  shape.lineTo(0.14, 0.58)
  shape.lineTo(0.46, 0.26)
  shape.lineTo(0.62, -0.08)
  shape.lineTo(0.18, -0.72)
  shape.lineTo(-0.08, -0.52)
  shape.lineTo(-0.54, -0.18)
  shape.closePath()

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelThickness: 0.012,
    bevelSize: 0.018,
    curveSegments: 1,
  })

  geometry.center()
  geometry.rotateX(Math.PI)
  geometry.computeVertexNormals()
  return geometry
}

function createGlyphGeometry(appearance: ShellSurfaceAppearance): THREE.ExtrudeGeometry {
  return appearance === 'glass' || appearance === 'glassBulb'
    ? createGlassShardGeometry()
    : createScaleGeometry()
}

function createScaleMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#c8dde8',
    emissive: '#334455',
    emissiveIntensity: 0.4,
    roughness: 0.28,
    metalness: 0.55,
  })
}

function createPatchMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#4a6070',
    emissive: '#1a2a35',
    emissiveIntensity: 0.3,
    roughness: 0.7,
    metalness: 0.2,
    side: THREE.DoubleSide,
  })
}

export class ShellSurfaceEffect {
  readonly group = new THREE.Group()
  readonly interactionMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>

  private readonly scaleMesh: THREE.InstancedMesh
  private readonly scaleGeometry: THREE.ExtrudeGeometry
  private readonly scaleMaterial = createScaleMaterial()
  private readonly patchGeometry = new THREE.PlaneGeometry(PATCH_WIDTH, PATCH_HEIGHT, 44, 32)
  private readonly patchMaterial = createPatchMaterial()
  private readonly breachHoleUniforms: BreachHoleUniforms = {
    uFishInvWorldMatrix: { value: new THREE.Matrix4() },
    uWoundCount: { value: 0 },
    uWoundXY: { value: new Float32Array(16) },
    uWoundRadius: { value: new Float32Array(8) },
    uWoundStrength: { value: new Float32Array(8) },
    uPatchHalfW: { value: PATCH_WIDTH * 0.5 },
    uPatchHalfH: { value: PATCH_HEIGHT * 0.5 },
    uHoleThreshold: { value: FACADE_VISUAL_HOLE_THRESHOLD },
  }
  private readonly basePatchPositions = Float32Array.from(this.patchGeometry.attributes.position.array as ArrayLike<number>)
  private readonly layoutDriver: SurfaceLayoutDriver<FishTokenId, FishTokenMeta>
  private readonly wounds: Wound[] = []
  private lastElapsedTime = 0
  private patchUpdateAccumulator = 1
  private patchNormalAccumulator = 1
  private needsGeometryRefresh = true
  private frozenElapsedTime = 0
  private params: ShellSurfaceParams
  private readonly appearance: ShellSurfaceAppearance

  constructor(
    surface: PreparedSurfaceSource<FishTokenId, FishTokenMeta>,
    seedCursor: SeedCursorFactory,
    initialParams: ShellSurfaceParams,
    appearance: ShellSurfaceAppearance = 'fish',
  ) {
    this.params = { ...initialParams }
    this.appearance = appearance
    this.scaleGeometry = createGlyphGeometry(appearance)
    this.layoutDriver = new SurfaceLayoutDriver({
      surface,
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 17 + 9,
      seedCursor,
      staggerFactor: 0.5,
      minSpanFactor: 0.35,
    })

    this.scaleMesh = new THREE.InstancedMesh(this.scaleGeometry, this.scaleMaterial, MAX_INSTANCES)
    this.scaleMesh.frustumCulled = false

    this.applyAppearanceMaterials()
    this.applyBreachHoleShaders()

    this.interactionMesh = new THREE.Mesh(this.patchGeometry, this.patchMaterial)
    this.interactionMesh.renderOrder = -1

    this.group.add(this.interactionMesh)
    this.group.add(this.scaleMesh)
  }

  setParams(params: Partial<ShellSurfaceParams>): void {
    this.params = { ...this.params, ...params }
    this.needsGeometryRefresh = true
  }

  clearWounds(): void {
    this.wounds.length = 0
    this.needsGeometryRefresh = true
  }

  /** True when there are active wounds (for runtime update throttling). */
  hasWounds(): boolean {
    return this.wounds.length > 0
  }

  /**
   * Normalized aggregate wound strength (0 = intact, 1 = at or past `breakThreshold`).
   * Useful for gameplay tied to recoverable shell-surface damage (e.g. lamp outage while glass heals).
   */
  getWoundLoad01(breakThreshold = 4): number {
    if (breakThreshold <= 0) return 0
    let sum = 0
    for (const w of this.wounds) {
      sum += THREE.MathUtils.clamp(w.strength, 0, 1)
    }
    return THREE.MathUtils.clamp(sum / breakThreshold, 0, 1)
  }

  /**
   * Local wound damage at a world point projected onto the shell-surface patch (0 = intact, 1 = fully damaged).
   * Matches the same (x,y) parameterization as `addWoundFromWorldPoint` and the internal `damageAt` field.
   */
  getSurfaceDamage01AtWorldPoint(worldPoint: THREE.Vector3): number {
    tmpLocalPoint.copy(worldPoint)
    this.group.worldToLocal(tmpLocalPoint)
    if (this.isSphericalGlassSurface()) {
      const { x, y } = this.glassParamsFromLocalPoint(tmpLocalPoint)
      return this.damageAt(x, y)
    }
    // Flat patch lies in local XY; drop depth so interior-side world points map to the same (x,y) as a front hit.
    tmpLocalPoint.z = 0
    const x = THREE.MathUtils.clamp(tmpLocalPoint.x, -PATCH_WIDTH * 0.5, PATCH_WIDTH * 0.5)
    const y = THREE.MathUtils.clamp(tmpLocalPoint.y, -PATCH_HEIGHT * 0.5, PATCH_HEIGHT * 0.5)
    return this.damageAt(x, y)
  }

  /**
   * Wounds in patch space for shell/mesh shaders that need the exact same hole mask as the facade effect.
   */
  getWoundCircles(max = 8): { x: number; y: number; radius: number; strength: number }[] {
    if (this.isSphericalGlassSurface()) return []
    const out: { x: number; y: number; radius: number; strength: number }[] = []
    for (const w of this.wounds) {
      if (w.strength < 0.06) continue
      out.push({
        x: w.x,
        y: w.y,
        radius: this.woundRadiusFor(w),
        strength: w.strength,
      })
      if (out.length >= max) break
    }
    return out
  }

  /** Compatibility alias for older app integrations using the original playground-specific name. */
  getWoundsForBreachingShader(max = 8): { x: number; y: number; radius: number; strength: number }[] {
    return this.getWoundCircles(max)
  }

  addWoundFromWorldPoint(worldPoint: THREE.Vector3, worldDirection: THREE.Vector3): void {
    tmpLocalPoint.copy(worldPoint)
    this.group.worldToLocal(tmpLocalPoint)

    const { x, y } = this.isSphericalGlassSurface()
      ? this.glassParamsFromLocalPoint(tmpLocalPoint)
      : {
          x: THREE.MathUtils.clamp(tmpLocalPoint.x, -PATCH_WIDTH * 0.5, PATCH_WIDTH * 0.5),
          y: THREE.MathUtils.clamp(tmpLocalPoint.y, -PATCH_HEIGHT * 0.5, PATCH_HEIGHT * 0.5),
        }
    const side = this.isSphericalGlassSurface() ? 1 : this.impactSideFromWorldDirection(worldDirection)
    const mergeIndex = this.findNearbyWoundIndex(x, y, side)

    if (mergeIndex >= 0) {
      const wound = this.wounds[mergeIndex]!
      wound.x = THREE.MathUtils.lerp(wound.x, x, 0.22)
      wound.y = THREE.MathUtils.lerp(wound.y, y, 0.22)
      wound.strength = Math.min(WOUND_MAX_STRENGTH, wound.strength + 0.32)
      this.wounds.splice(mergeIndex, 1)
      this.wounds.unshift(wound)
    } else {
      this.wounds.unshift({ x, y, strength: 1, side })
    }
    this.needsGeometryRefresh = true
  }

  update(elapsedTime: number): void {
    const delta = this.lastElapsedTime === 0 ? 0 : Math.max(0, elapsedTime - this.lastElapsedTime)
    this.lastElapsedTime = elapsedTime
    const hadWounds = this.wounds.length > 0
    this.updateWounds(delta)
    const hasWounds = this.wounds.length > 0
    if (hadWounds || hasWounds) {
      this.needsGeometryRefresh = true
    }
    const useIdleAnimation = !this.isStaticWhenIntact() || hasWounds
    if (!useIdleAnimation && !this.needsGeometryRefresh) return
    const sampleElapsed = useIdleAnimation ? elapsedTime : hadWounds ? elapsedTime : this.frozenElapsedTime
    this.patchUpdateAccumulator += delta
    this.patchNormalAccumulator += delta
    if (!useIdleAnimation || this.patchUpdateAccumulator >= 1 / 30) {
      this.updatePatch(sampleElapsed, !useIdleAnimation || this.patchNormalAccumulator >= 1 / 12)
      this.patchUpdateAccumulator = 0
      if (this.patchNormalAccumulator >= 1 / 12) this.patchNormalAccumulator = 0
    }
    this.updateScales(sampleElapsed)
    this.updateBreachHoleUniforms()
    if (!useIdleAnimation) {
      this.frozenElapsedTime = sampleElapsed
    }
    this.needsGeometryRefresh = false
  }

  private applyAppearanceMaterials(): void {
    if (this.appearance === 'shutter') {
      this.patchMaterial.transparent = true
      this.patchMaterial.opacity = 0
      this.patchMaterial.depthWrite = false
      this.patchMaterial.colorWrite = false
      this.scaleMaterial.side = THREE.DoubleSide
      this.scaleMaterial.color.set('#9aa8b8')
      this.scaleMaterial.emissive.set('#223040')
      this.scaleMaterial.emissiveIntensity = 0.35
      this.scaleMaterial.metalness = 0.62
      this.scaleMaterial.roughness = 0.38
      this.patchMaterial.color.set('#3d4a5c')
      this.patchMaterial.emissive.set('#121a24')
      this.patchMaterial.emissiveIntensity = 0.22
    } else if (this.appearance === 'ivy') {
      this.patchMaterial.transparent = true
      this.patchMaterial.opacity = 0
      this.patchMaterial.depthWrite = false
      this.patchMaterial.colorWrite = false
      this.scaleMaterial.side = THREE.DoubleSide
      this.scaleMaterial.color.set('#4a8f52')
      this.scaleMaterial.emissive.set('#1a3020')
      this.scaleMaterial.emissiveIntensity = 0.18
      this.scaleMaterial.metalness = 0.12
      this.scaleMaterial.roughness = 0.62
      this.patchMaterial.color.set('#2d4a32')
      this.patchMaterial.emissive.set('#0f1a12')
      this.patchMaterial.emissiveIntensity = 0.12
    } else if (this.appearance === 'glass' || this.appearance === 'glassBulb') {
      this.scaleMaterial.color.set('#f2fbff')
      this.scaleMaterial.emissive.set('#101822')
      this.scaleMaterial.emissiveIntensity = 0.06
      this.scaleMaterial.metalness = 0.02
      this.scaleMaterial.roughness = 0.12
      // Same backing on every window: semi-transparent cool gray so destroyed regions read consistently
      // (matches the lighter-facade look everywhere).
      this.patchMaterial.color.set('#d7ebf4')
      this.patchMaterial.emissive.set('#09121a')
      this.patchMaterial.emissiveIntensity = 0.03
      this.patchMaterial.roughness = 0.08
      this.patchMaterial.metalness = 0.01
      this.patchMaterial.transparent = true
      this.patchMaterial.depthWrite = false
      this.patchMaterial.opacity = this.appearance === 'glass' ? 0.34 : 0.42
    }
  }

  private isStaticWhenIntact(): boolean {
    return this.appearance === 'glass' || this.appearance === 'glassBulb'
  }

  private applyBreachHoleShaders(): void {
    if (this.appearance !== 'shutter' && this.appearance !== 'ivy') return

    const patchMaterialForBreach = (material: THREE.MeshStandardMaterial): void => {
      material.side = THREE.DoubleSide
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, this.breachHoleUniforms)

        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          `#include <common>
      varying vec3 vWorldPosBreach;
      `,
        )
        shader.vertexShader = shader.vertexShader.replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
      vWorldPosBreach = worldPosition.xyz;
      `,
        )

        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>
      uniform mat4 uFishInvWorldMatrix;
      uniform int uWoundCount;
      uniform float uWoundXY[ 16 ];
      uniform float uWoundRadius[ 8 ];
      uniform float uWoundStrength[ 8 ];
      uniform float uPatchHalfW;
      uniform float uPatchHalfH;
      uniform float uHoleThreshold;
      varying vec3 vWorldPosBreach;

      float breachHoleAt( vec2 pointXY ) {
        float hole = 0.0;
        for ( int i = 0; i < 8; i ++ ) {
          if ( i >= uWoundCount ) break;
          vec2 woundXY = vec2( uWoundXY[ i * 2 ], uWoundXY[ i * 2 + 1 ] );
          float strength = uWoundStrength[ i ];
          float presence = clamp( strength, 0.0, 1.0 );
          float radius = max( 0.0001, uWoundRadius[ i ] * mix( 1.22, 1.38, presence ) );
          vec2 delta = vec2( pointXY.x - woundXY.x, ( pointXY.y - woundXY.y ) * 1.14 );
          float normalized = length( delta ) / radius;
          float cut = normalized <= 1.0 ? presence : 0.0;
          hole = max( hole, cut );
        }
        return clamp( hole, 0.0, 1.0 );
      }
      `,
        )

        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
      {
        vec4 localPoint = uFishInvWorldMatrix * vec4( vWorldPosBreach, 1.0 );
        vec2 pointXY = vec2(
          clamp( localPoint.x, -uPatchHalfW, uPatchHalfW ),
          clamp( localPoint.y, -uPatchHalfH, uPatchHalfH )
        );
        if ( abs( localPoint.x ) <= uPatchHalfW && abs( localPoint.y ) <= uPatchHalfH ) {
          float hole = breachHoleAt( pointXY );
          if ( hole >= uHoleThreshold ) discard;
        }
      }
      `,
        )
      }
      material.customProgramCacheKey = () => `fish-breach-hole-v2-${this.appearance}`
      material.needsUpdate = true
    }

    patchMaterialForBreach(this.patchMaterial)
    patchMaterialForBreach(this.scaleMaterial)
  }

  private updateBreachHoleUniforms(): void {
    if (this.appearance !== 'shutter' && this.appearance !== 'ivy') return

    this.group.updateMatrixWorld(true)
    this.breachHoleUniforms.uFishInvWorldMatrix.value.copy(this.group.matrixWorld).invert()

    const wounds = this.getWoundCircles(8)
    this.breachHoleUniforms.uWoundCount.value = wounds.length
    this.breachHoleUniforms.uWoundXY.value.fill(0)
    this.breachHoleUniforms.uWoundRadius.value.fill(0)
    this.breachHoleUniforms.uWoundStrength.value.fill(0)

    for (let i = 0; i < wounds.length; i++) {
      const wound = wounds[i]!
      this.breachHoleUniforms.uWoundXY.value[i * 2] = wound.x
      this.breachHoleUniforms.uWoundXY.value[i * 2 + 1] = wound.y
      this.breachHoleUniforms.uWoundRadius.value[i] = wound.radius
      this.breachHoleUniforms.uWoundStrength.value[i] = wound.strength
    }
  }

  dispose(): void {
    this.scaleGeometry.dispose()
    this.scaleMaterial.dispose()
    this.patchGeometry.dispose()
    this.patchMaterial.dispose()
  }

  private damageAt(x: number, y: number): number {
    let damage = 0

    for (const wound of this.wounds) {
      const dx = this.paramDeltaX(x, wound.x)
      const dy = (y - wound.y) * 1.14
      const normalized = Math.sqrt(dx * dx + dy * dy) / Math.max(0.0001, this.woundRadiusFor(wound))
      const woundStrength = THREE.MathUtils.lerp(1, 1.2, this.woundIntensity01(wound))
      damage = Math.max(damage, smoothPulse(normalized) * woundStrength * this.woundPresence01(wound))
    }

    return THREE.MathUtils.clamp(damage, 0, 1)
  }

  private visualHole01At(x: number, y: number): number {
    if (this.appearance !== 'shutter' && this.appearance !== 'ivy') return 0

    let hole = 0
    for (const wound of this.wounds) {
      const dx = this.paramDeltaX(x, wound.x)
      const dy = (y - wound.y) * 1.14
      const presence = this.woundPresence01(wound)
      const radius = Math.max(0.0001, this.woundRadiusFor(wound) * THREE.MathUtils.lerp(1.22, 1.38, presence))
      const normalized = Math.sqrt(dx * dx + dy * dy) / radius
      const cut = normalized <= 1 ? presence : 0
      hole = Math.max(hole, cut)
    }

    return THREE.MathUtils.clamp(hole, 0, 1)
  }

  private impactSideFromWorldDirection(worldDirection: THREE.Vector3): 1 | -1 {
    tmpWorldMatrix.copy(this.group.matrixWorld).invert()
    tmpLocalDirection.copy(worldDirection).transformDirection(tmpWorldMatrix)
    return tmpLocalDirection.z <= 0 ? 1 : -1
  }

  private findNearbyWoundIndex(x: number, y: number, side: 1 | -1): number {
    const mergeRadius = this.params.woundRadius * WOUND_MERGE_RADIUS
    const mergeRadiusSq = mergeRadius * mergeRadius

    for (let i = 0; i < this.wounds.length; i++) {
      const wound = this.wounds[i]!
      if (!this.isSphericalGlassSurface() && wound.side !== side) continue
      const dx = this.paramDeltaX(x, wound.x)
      const dy = y - wound.y
      if (dx * dx + dy * dy <= mergeRadiusSq) {
        return i
      }
    }

    return -1
  }

  private woundIntensity01(wound: Wound): number {
    return THREE.MathUtils.clamp((wound.strength - 1) / (WOUND_MAX_STRENGTH - 1), 0, 1)
  }

  private woundPresence01(wound: Wound): number {
    return THREE.MathUtils.clamp(wound.strength, 0, 1)
  }

  private woundRadiusFor(wound: Wound): number {
    return (
      this.params.woundRadius *
      THREE.MathUtils.lerp(0.72, 1, this.woundPresence01(wound)) *
      THREE.MathUtils.lerp(1, 1.18, this.woundIntensity01(wound))
    )
  }

  private updateWounds(delta: number): void {
    updateRecoveringImpacts(this.wounds, this.params.recoveryRate, delta)
  }

  private isSphericalGlassSurface(): boolean {
    return this.appearance === 'glassBulb'
  }

  private paramDeltaX(a: number, b: number): number {
    const dx = a - b
    if (!this.isSphericalGlassSurface()) return dx
    const wrapped = ((dx + PATCH_WIDTH * 0.5) % PATCH_WIDTH + PATCH_WIDTH) % PATCH_WIDTH - PATCH_WIDTH * 0.5
    return wrapped
  }
  private glassPaneWarp(x: number, y: number): number {
    const gx = (x + PATCH_WIDTH * 0.5) * GLASS_PANE_CELL_X
    const gy = (y + PATCH_HEIGHT * 0.5) * GLASS_PANE_CELL_Y
    const cellX = Math.floor(gx)
    const cellY = Math.floor(gy)
    let nearest = Number.POSITIVE_INFINITY
    let second = Number.POSITIVE_INFINITY

    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const cx = cellX + ox
        const cy = cellY + oy
        const px = cx + 0.18 + uhash(cx * 92821 + cy * 68917 + 17) * 0.64
        const py = cy + 0.18 + uhash(cx * 12553 + cy * 45307 + 29) * 0.64
        const dx = gx - px
        const dy = gy - py
        const d = dx * dx + dy * dy
        if (d < nearest) {
          second = nearest
          nearest = d
        } else if (d < second) {
          second = d
        }
      }
    }

    const nearestDist = Math.sqrt(nearest)
    const secondDist = Math.sqrt(second)
    const edge = THREE.MathUtils.clamp((secondDist - nearestDist) * 3.2, 0, 1)
    const seam = 1 - edge
    const centerGlow = Math.max(0, 1 - nearestDist * 1.7)
    return centerGlow * 0.05 - seam * 0.09
  }


  private glassAnglesFromParams(x: number, y: number): { theta: number; phi: number } {
    const xNorm = THREE.MathUtils.clamp(x / (PATCH_WIDTH * 0.5), -1, 1)
    const yNorm = THREE.MathUtils.clamp(y / (PATCH_HEIGHT * 0.5), -1, 1)
    const theta = xNorm * Math.PI
    const tY = yNorm * 0.5 + 0.5
    const phi = THREE.MathUtils.lerp(Math.PI - GLASS_POLAR_MARGIN, GLASS_POLAR_MARGIN, tY)
    return { theta, phi }
  }

  private glassParamsFromLocalPoint(localPoint: THREE.Vector3): { x: number; y: number } {
    const dir = tmpLocalDirection.copy(localPoint).normalize()
    const theta = Math.atan2(dir.x, dir.z)
    const phi = Math.acos(THREE.MathUtils.clamp(dir.y, -1, 1))
    const x = THREE.MathUtils.clamp((theta / Math.PI) * (PATCH_WIDTH * 0.5), -PATCH_WIDTH * 0.5, PATCH_WIDTH * 0.5)
    const tY = THREE.MathUtils.clamp(
      (Math.PI - GLASS_POLAR_MARGIN - phi) / (Math.PI - GLASS_POLAR_MARGIN * 2),
      0,
      1,
    )
    const y = (tY * 2 - 1) * (PATCH_HEIGHT * 0.5)
    return { x, y }
  }

  private surfaceZ(x: number, y: number, elapsedTime: number): number {
    if (this.appearance === 'glass') {
      return this.glassPaneZ(x, y, elapsedTime)
    }

    const xNorm = x / (PATCH_WIDTH * 0.5)
    const yNorm = y / (PATCH_HEIGHT * 0.5)
    const baseBulge = 0.34 * Math.cos(xNorm * Math.PI * 0.5) - 0.06 * yNorm * yNorm
    const sway =
      this.params.surfaceFlex *
      (0.05 * Math.sin(elapsedTime * 0.55 + x * 0.9) + 0.03 * Math.cos(elapsedTime * 0.35 + y * 1.1))

    let woundOffset = 0

    for (const wound of this.wounds) {
      const dx = x - wound.x
      const dy = (y - wound.y) * 1.18
      const dist = Math.sqrt(dx * dx + dy * dy)
      const radius = Math.max(0.0001, this.woundRadiusFor(wound))
      const n = dist / radius
      if (n >= 1.25) continue

      const crater = smoothPulse(Math.min(n, 1))
      const intensity = this.woundIntensity01(wound)
      const presence = this.woundPresence01(wound)
      const woundSide = wound.side
      woundOffset +=
        woundSide *
        (-crater * this.params.woundDepth * THREE.MathUtils.lerp(0.34, 0.54, intensity) * presence)

      const ridgeT = THREE.MathUtils.clamp(1 - Math.abs(n - 0.92) / 0.22, 0, 1)
      woundOffset +=
        woundSide *
        (ridgeT * ridgeT * this.params.woundDepth * THREE.MathUtils.lerp(0.1, 0.16, intensity) * presence)
    }

    return baseBulge + sway + woundOffset
  }

  private glassPaneZ(x: number, y: number, elapsedTime: number): number {
    const paneWarp = this.glassPaneWarp(x, y) * (0.75 + this.params.surfaceFlex * 0.85)
    const sway =
      this.params.surfaceFlex *
      (0.014 * Math.sin(elapsedTime * 0.7 + x * 1.1) + 0.01 * Math.cos(elapsedTime * 0.45 + y * 1.35))

    let woundOffset = 0
    for (const wound of this.wounds) {
      const dx = x - wound.x
      const dy = (y - wound.y) * 1.16
      const dist = Math.sqrt(dx * dx + dy * dy)
      const radius = Math.max(0.0001, this.woundRadiusFor(wound))
      const n = dist / radius
      if (n >= 1.22) continue

      const crater = smoothPulse(Math.min(n, 1))
      const intensity = this.woundIntensity01(wound)
      const presence = this.woundPresence01(wound)
      woundOffset += -crater * this.params.woundDepth * THREE.MathUtils.lerp(0.18, 0.32, intensity) * presence

      const ridgeT = THREE.MathUtils.clamp(1 - Math.abs(n - 0.9) / 0.2, 0, 1)
      woundOffset += ridgeT * ridgeT * this.params.woundDepth * THREE.MathUtils.lerp(0.03, 0.07, intensity) * presence
    }

    return paneWarp + sway + woundOffset
  }

  private glassRadius(x: number, y: number, elapsedTime: number): number {
    const sway =
      this.params.surfaceFlex *
      (0.018 * Math.sin(elapsedTime * 0.8 + x * 1.15) + 0.012 * Math.cos(elapsedTime * 0.5 + y * 1.35))

    let woundOffset = 0
    for (const wound of this.wounds) {
      const dx = this.paramDeltaX(x, wound.x)
      const dy = (y - wound.y) * 1.14
      const dist = Math.sqrt(dx * dx + dy * dy)
      const radius = Math.max(0.0001, this.woundRadiusFor(wound))
      const n = dist / radius
      if (n >= 1.25) continue

      const crater = smoothPulse(Math.min(n, 1))
      const intensity = this.woundIntensity01(wound)
      const presence = this.woundPresence01(wound)
      woundOffset += -crater * this.params.woundDepth * THREE.MathUtils.lerp(0.12, 0.2, intensity) * presence

      const ridgeT = THREE.MathUtils.clamp(1 - Math.abs(n - 0.92) / 0.22, 0, 1)
      woundOffset += ridgeT * ridgeT * this.params.woundDepth * THREE.MathUtils.lerp(0.03, 0.06, intensity) * presence
    }

    return GLASS_GLOBE_RADIUS + sway + woundOffset
  }

  private sampleSurfacePosition(target: THREE.Vector3, x: number, y: number, elapsedTime: number): THREE.Vector3 {
    if (!this.isSphericalGlassSurface()) {
      return target.set(x, y, this.surfaceZ(x, y, elapsedTime))
    }

    const { theta, phi } = this.glassAnglesFromParams(x, y)
    const radius = this.glassRadius(x, y, elapsedTime)
    const sinPhi = Math.sin(phi)
    return target.set(
      Math.sin(theta) * sinPhi * radius,
      Math.cos(phi) * radius,
      Math.cos(theta) * sinPhi * radius,
    )
  }

  private sampleSurface(x: number, y: number, elapsedTime: number): SurfaceFrame {
    const eps = 0.02

    this.sampleSurfacePosition(tmpPos, x, y, elapsedTime)
    this.sampleSurfacePosition(tmpPosX0, x - eps, y, elapsedTime)
    this.sampleSurfacePosition(tmpPosX1, x + eps, y, elapsedTime)
    this.sampleSurfacePosition(tmpPosY0, x, y - eps, elapsedTime)
    this.sampleSurfacePosition(tmpPosY1, x, y + eps, elapsedTime)

    tmpTangentX.copy(tmpPosX1).sub(tmpPosX0).normalize()
    if (this.isSphericalGlassSurface()) {
      tmpNormal.copy(tmpPos).normalize()
      tmpTangentY.crossVectors(tmpNormal, tmpTangentX).normalize()
    } else {
      tmpTangentY.copy(tmpPosY1).sub(tmpPosY0).normalize()
      tmpNormal.crossVectors(tmpTangentX, tmpTangentY).normalize()
    }

    return {
      position: tmpPos,
      tangentX: tmpTangentX,
      tangentY: tmpTangentY,
      normal: tmpNormal,
    }
  }

  private updatePatch(elapsedTime: number, recomputeNormals: boolean): void {
    const position = this.patchGeometry.attributes.position

    for (let i = 0; i < position.count; i++) {
      const x = this.basePatchPositions[i * 3]
      const y = this.basePatchPositions[i * 3 + 1]
      this.sampleSurfacePosition(tmpPos, x, y, elapsedTime)
      position.setXYZ(i, tmpPos.x, tmpPos.y, tmpPos.z)
    }

    position.needsUpdate = true
    if (recomputeNormals) {
      this.patchGeometry.computeVertexNormals()
    }
  }

  private updateScales(elapsedTime: number): void {
    const rowStep = PATCH_HEIGHT / (ROWS + 2.6)
    const topY = PATCH_HEIGHT * 0.42
    let instanceIndex = 0

    this.layoutDriver.forEachLaidOutLine({
      spanMin: -PATCH_WIDTH * 0.5,
      spanMax: PATCH_WIDTH * 0.5,
      lineCoordAtRow: (row) => topY - row * rowStep,
      getMaxWidth: (slot) => this.getSlotMaxWidth(slot, elapsedTime),
      onLine: ({ slot, resolvedGlyphs }) => {
        instanceIndex = this.projectLine(slot, resolvedGlyphs, elapsedTime, instanceIndex)
      },
    })

    this.scaleMesh.count = instanceIndex
    this.scaleMesh.instanceMatrix.needsUpdate = true
    if (this.scaleMesh.instanceColor) {
      this.scaleMesh.instanceColor.needsUpdate = true
    }
  }

  private getSlotMaxWidth(slot: SurfaceLayoutSlot, elapsedTime: number): number {
    if (this.isSphericalGlassSurface()) {
      const { phi } = this.glassAnglesFromParams(slot.spanCenter, slot.lineCoord)
      const radius = this.glassRadius(slot.spanCenter, slot.lineCoord, elapsedTime)
      const arcWorld = slot.spanSize * ((Math.PI * 2 * radius * Math.max(0.12, Math.sin(phi))) / PATCH_WIDTH)
      return arcWorld * LAYOUT_PX_PER_WORLD
    }
    const surface = this.sampleSurface(slot.spanCenter, slot.lineCoord, elapsedTime)
    const arcWorld = slot.spanSize * Math.max(1, surface.tangentX.length())
    return arcWorld * LAYOUT_PX_PER_WORLD
  }

  private projectLine(
    slot: SurfaceLayoutSlot,
    resolvedGlyphs: readonly ResolvedSurfaceGlyph<FishTokenId, FishTokenMeta>[],
    elapsedTime: number,
    instanceIndex: number,
  ): number {
    const n = resolvedGlyphs.length
    for (let k = 0; k < n; k++) {
      if (instanceIndex >= MAX_INSTANCES) break

      const token = resolvedGlyphs[k]!
      const identity = token.ordinal + 1
      const { meta } = token
      const t01 = (k + 0.5) / n
      const x = slot.spanStart + t01 * slot.spanSize
      const y = slot.lineCoord
      const localDamage = this.damageAt(x, y)
      const localHole = this.visualHole01At(x, y)
      const literalBreachHole = localHole >= FACADE_VISUAL_HOLE_THRESHOLD
      if (literalBreachHole) continue
      const localCoverage = THREE.MathUtils.lerp(
        1,
        this.appearance === 'shutter' || this.appearance === 'ivy' ? 0 : this.params.woundNarrow,
        Math.max(localDamage, localHole),
      )
      const hashPresence = glyphHash(identity, slot.row * 131 + slot.sector, k)
      if (hashPresence > localCoverage) continue
      const frame = this.sampleSurface(x, y, elapsedTime)
      const isGlassLike = this.appearance === 'glass' || this.appearance === 'glassBulb'
      const isPaneGlass = this.appearance === 'glass'
      const scaleWidth = isGlassLike
        ? isPaneGlass
          ? 0.078 + meta.widthBias * 0.35 + (identity % 5) * 0.012
          : 0.1 + meta.widthBias * 0.5 + (identity % 5) * 0.016
        : 0.145 + meta.widthBias + (identity % 5) * 0.012
      const scaleHeight = isGlassLike
        ? isPaneGlass
          ? 0.2 + meta.heightBias * 0.38 + (identity % 7) * 0.014
          : 0.18 + meta.heightBias * 0.42 + (identity % 7) * 0.018
        : 0.2 + meta.heightBias + (identity % 7) * 0.014
      const scaleDepth = isGlassLike
        ? isPaneGlass
          ? 0.01 + meta.depthBias * 0.14 + (identity % 4) * 0.0015
          : 0.015 + meta.depthBias * 0.18 + (identity % 4) * 0.002
        : 0.05 + meta.depthBias + (identity % 4) * 0.004
      const lift = isGlassLike
        ? isPaneGlass
          ? 0.012 + localDamage * this.params.scaleLift * 0.03
          : 0.02 + localDamage * this.params.scaleLift * 0.06
        : BASE_SCALE_LIFT + localDamage * this.params.scaleLift * 0.18

      dummy.position.copy(frame.position).addScaledVector(frame.normal, lift)

      tmpMatrix.makeBasis(frame.tangentX, frame.tangentY, frame.normal)
      dummy.quaternion.setFromRotationMatrix(tmpMatrix)
      dummy.rotateX(
        this.isSphericalGlassSurface()
          ? 0.08 + localDamage * 0.2
          : isPaneGlass
            ? 0.01 + localDamage * 0.06
            : 0.28 + localDamage * 0.5,
      )
      dummy.rotateZ(
        (((identity % 17) / 17) - 0.5) * (this.isSphericalGlassSurface() ? 0.14 : isPaneGlass ? 0.52 : 0.24),
      )
      if (isPaneGlass) {
        dummy.rotateY((((identity % 23) / 23) - 0.5) * 0.16)
      }
      dummy.scale.set(
        scaleWidth * (1 - localDamage * (isGlassLike ? 0.04 : 0.08)),
        scaleHeight * (1 - localDamage * (isGlassLike ? 0.08 : 0.12)),
        scaleDepth * (1 + localDamage * (isGlassLike ? 0.22 : 0.28)),
      )
      dummy.updateMatrix()
      this.scaleMesh.setMatrixAt(instanceIndex, dummy.matrix)

      const hueBase =
        this.appearance === 'ivy'
          ? 0.28 + slot.row * 0.006 + meta.hueBias
          : this.appearance === 'glass' || this.appearance === 'glassBulb'
            ? 0.55 + slot.row * 0.0015 + meta.hueBias * 0.004
            : 0.44 + slot.row * 0.008 + meta.hueBias
      const hue = hueBase + (identity % 11) * 0.0025
      const saturation = THREE.MathUtils.lerp(
        this.appearance === 'glass' || this.appearance === 'glassBulb' ? 0.04 : 0.22,
        this.appearance === 'glass' || this.appearance === 'glassBulb' ? 0.16 : 0.46,
        1 - localDamage,
      )
      const lightness = THREE.MathUtils.lerp(
        this.appearance === 'glass' || this.appearance === 'glassBulb' ? 0.56 : 0.28,
        this.appearance === 'glass' || this.appearance === 'glassBulb' ? 0.92 : 0.56,
        0.5 + Math.sin(slot.row * 0.35 + k * 0.3) * 0.25,
      )
      tmpColor.setHSL(hue, saturation, lightness)
      const damageTint =
        this.appearance === 'ivy'
          ? DAMAGE_TINT_IVY
          : this.appearance === 'glass' || this.appearance === 'glassBulb'
            ? DAMAGE_TINT_GLASS
            : DAMAGE_TINT_FISH
      const damageMix =
        this.appearance === 'glass' || this.appearance === 'glassBulb' ? localDamage * 0.88 : localDamage * 0.72
      tmpColor.lerp(damageTint, damageMix)
      this.scaleMesh.setColorAt(instanceIndex, tmpColor)

      instanceIndex++
    }

    return instanceIndex
  }
}

export type CreateShellSurfaceEffectOptions = {
  seedCursor: SeedCursorFactory
  surface?: PreparedSurfaceSource<FishTokenId, FishTokenMeta>
  initialParams?: ShellSurfaceParams
  /** Visual subtype for fish, shutter, ivy, glass, or glass-bulb shell surfaces. */
  appearance?: ShellSurfaceAppearance
  /** Unique id when multiple shell-surface walls exist in one scene. */
  effectId?: string
}

export function createShellSurfaceEffect({
  seedCursor,
  surface = getPreparedShellSurface(),
  initialParams = DEFAULT_SHELL_SURFACE_PARAMS,
  appearance = 'fish',
  effectId = 'shell-surface',
}: CreateShellSurfaceEffectOptions): ShellSurfaceEffect {
  const effect = createSurfaceEffect({
    id: effectId,
    source: surface,
    layout: wallLayout({
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 17 + 9,
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

  return new ShellSurfaceEffect(effect.source, seedCursor, initialParams, appearance)
}

export type FishScaleAppearance = ShellSurfaceAppearance
export type FishScaleParams = ShellSurfaceParams
export type CreateFishScaleEffectOptions = CreateShellSurfaceEffectOptions
export const DEFAULT_FISH_SCALE_PARAMS = DEFAULT_SHELL_SURFACE_PARAMS
export const createFishScaleEffect = createShellSurfaceEffect
export { ShellSurfaceEffect as FishScaleEffect }

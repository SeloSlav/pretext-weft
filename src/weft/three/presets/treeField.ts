import * as THREE from 'three'
import type {
  PreparedSurfaceSource,
  ResolvedSurfaceGlyph,
  SeedCursorFactory,
  SurfaceLayoutSlot,
} from '../../core'
import { createWorldField, SurfaceLayoutDriver } from '../../core'
import { decayRecoveringStrength } from '../../runtime'
import { createSurfaceEffect, fieldLayout } from '../api'
import { createBarkGrainTexture, warmBarkColor } from './barkShared'
import {
  createTreeBarkSurfaceEffect,
  DEFAULT_TREE_BARK_SURFACE_PARAMS,
  type TreeBarkPlacement,
} from './treeBarkSurface'
import {
  getPreparedTreeSurface,
  type TreeTokenId,
  type TreeTokenMeta,
} from './treeFieldSource'
export type TreeFieldParams = {
  layoutDensity: number
  sizeScale: number
  heightScale: number
  crownScale: number
  /** Local XZ scorch disk radius (same model as grass burns). */
  trunkBurnRadius: number
  trunkBurnSpreadSpeed: number
  trunkBurnMaxRadius: number
  trunkBurnRecoveryRate: number
}

export const DEFAULT_TREE_FIELD_PARAMS: TreeFieldParams = {
  layoutDensity: 0.6,
  sizeScale: 1.25,
  heightScale: 1.3,
  crownScale: 1.2,
  trunkBurnRadius: 0.38,
  trunkBurnSpreadSpeed: 0.14,
  trunkBurnMaxRadius: 2.4,
  trunkBurnRecoveryRate: 0.014,
}

export type TreeFieldBounds = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export type TreeFieldPlacementMask = {
  bounds?: TreeFieldBounds
  includeAtXZ?: (x: number, z: number) => boolean
}

const DEFAULT_TREE_FIELD_BOUNDS: TreeFieldBounds = {
  minX: -28,
  maxX: 28,
  minZ: -28,
  maxZ: 28,
}

const ROWS = 20
const SECTORS = 24
const MAX_INSTANCES = 1_800
const BASE_LAYOUT_PX_PER_WORLD = 4.2
const MAX_TRUNK_BURNS = 20

const tmpColor = new THREE.Color()
const tmpBarkColor = new THREE.Color()
const tmpCrispOrange = new THREE.Color()
const tmpCharcoal = new THREE.Color()
const tmpLocalPoint = new THREE.Vector3()
const tmpTrunkBurnField = { burn: 0, front: 0 }
const ZERO_TRUNK_BURN_FIELD = { burn: 0, front: 0 }
const tmpPlacementQuat = new THREE.Quaternion()
const tmpPlacementBasisX = new THREE.Vector3()
const tmpPlacementBasisY = new THREE.Vector3()
const tmpPlacementBasisZ = new THREE.Vector3()
const dummy = new THREE.Object3D()

/** Must match GLSL loop and `uTreeBurn*` array sizes. */
const TREE_SHADER_BURN_MAX = 20

type TrunkBurnShaderUniforms = {
  uTreeBurnCount: { value: number }
  uTreeBurnXYZ: { value: Float32Array }
  uTreeBurnRadius: { value: Float32Array }
  uTreeBurnStrength: { value: Float32Array }
}

export type TreeTrunkBurnOptions = {
  radiusScale?: number
  maxRadiusScale?: number
  strength?: number
  mergeRadius?: number
  recoveryRate?: number
}

type TrunkBurn = {
  x: number
  z: number
  y: number
  radius: number
  maxRadius: number
  strength: number
  recoveryRate?: number
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

const treeOrganicWorldField = createWorldField(1427, {
  scale: 8.4,
  octaves: 4,
  roughness: 0.52,
  warpAmplitude: 1.55,
  warpScale: 6.4,
  ridge: 0.14,
  contrast: 1.08,
})

function makeTrunkGeometry(): THREE.BufferGeometry {
  // Extra radial / height segments so laser gouges read smoothly on the trunk.
  return new THREE.CylinderGeometry(0.32, 0.54, 1, 14, 3)
}

function makeCrownGeometry(): THREE.BufferGeometry {
  return new THREE.SphereGeometry(0.5, 7, 5)
}

/**
 * Same grayscale bark grain as ground logs so trunk hue comes purely from `warmBarkColor`.
 */
function createTreeBarkTexture(): THREE.CanvasTexture {
  return createBarkGrainTexture()
}

function treeCrownColor(identity: number, noise: number, meta: TreeTokenMeta): THREE.Color {
  const t = uhash(identity * 2654435761)
  // Ghibli foliage: warm yellow-green to spring green, bright and saturated
  const hue = 0.26 + t * 0.06 + meta.warmth * 0.08
  const seasonalFade = Math.max(0, -meta.warmth)
  const seasonalDryness = Math.max(0, meta.warmth)
  const sat = 0.55 + noise * 0.18 + meta.crownBias * 0.06 + seasonalDryness * 0.22 - seasonalFade * 0.3
  const light = 0.36 + noise * 0.14 + t * 0.08 + seasonalDryness * 0.06 + seasonalFade * 0.18
  return tmpColor.setHSL(hue, sat, light)
}

function treeBarkColor(identity: number, noise: number, meta: TreeTokenMeta): THREE.Color {
  return warmBarkColor(identity, noise, meta.warmth, tmpBarkColor)
}

export class TreeFieldEffect {
  readonly group = new THREE.Group()
  /** Raycast target for laser scorch (same geometry as visible trunks). */
  readonly trunkInteractionMesh: THREE.InstancedMesh

  private readonly barkSurfaceEffect: ReturnType<typeof createTreeBarkSurfaceEffect>
  private readonly trunkBarkTexture = createTreeBarkTexture()
  private readonly trunkGeometry = makeTrunkGeometry()
  private readonly crownGeometry = makeCrownGeometry()
  private readonly trunkMaterial = new THREE.MeshLambertMaterial({
    map: this.trunkBarkTexture,
    emissive: '#5c3a18',
    emissiveIntensity: 0.28,
  })
  private readonly crownMaterial = new THREE.MeshLambertMaterial({ emissive: '#2a5a10', emissiveIntensity: 0.38 })
  private readonly crownMesh: THREE.InstancedMesh
  private readonly placementMask: Required<TreeFieldPlacementMask>
  private readonly fieldWidth: number
  private readonly fieldDepth: number
  private readonly fieldCenterX: number
  private readonly fieldCenterZ: number
  private layoutDriver: SurfaceLayoutDriver<TreeTokenId, TreeTokenMeta>
  private params: TreeFieldParams
  private readonly burns: TrunkBurn[] = []
  private lastElapsedTime = 0
  private readonly treePlacements: TreeBarkPlacement[] = []
  private readonly trunkBurnUniforms: TrunkBurnShaderUniforms = {
    uTreeBurnCount: { value: 0 },
    uTreeBurnXYZ: { value: new Float32Array(TREE_SHADER_BURN_MAX * 3) },
    uTreeBurnRadius: { value: new Float32Array(TREE_SHADER_BURN_MAX) },
    uTreeBurnStrength: { value: new Float32Array(TREE_SHADER_BURN_MAX) },
  }

  constructor(
    surface: PreparedSurfaceSource<TreeTokenId, TreeTokenMeta>,
    seedCursor: SeedCursorFactory,
    initialParams: TreeFieldParams,
    placementMask: TreeFieldPlacementMask = {},
  ) {
    this.params = { ...initialParams }
    const bounds = placementMask.bounds ?? DEFAULT_TREE_FIELD_BOUNDS
    this.fieldWidth = bounds.maxX - bounds.minX
    this.fieldDepth = bounds.maxZ - bounds.minZ
    this.fieldCenterX = (bounds.minX + bounds.maxX) * 0.5
    this.fieldCenterZ = (bounds.minZ + bounds.maxZ) * 0.5
    this.placementMask = {
      bounds,
      includeAtXZ: placementMask.includeAtXZ ?? (() => true),
    }
    this.layoutDriver = this.createLayoutDriver(surface, seedCursor)
    this.barkSurfaceEffect = createTreeBarkSurfaceEffect({
      seedCursor,
      initialParams: this.barkSurfaceParamsFromTreeParams(initialParams),
    })

    this.trunkInteractionMesh = new THREE.InstancedMesh(this.trunkGeometry, this.trunkMaterial, MAX_INSTANCES)
    this.crownMesh = new THREE.InstancedMesh(this.crownGeometry, this.crownMaterial, MAX_INSTANCES)

    this.patchTrunkFishStyleLaser()

    this.trunkInteractionMesh.frustumCulled = false
    this.crownMesh.frustumCulled = false
    this.trunkInteractionMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    this.crownMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    this.group.add(this.trunkInteractionMesh)
    this.group.add(this.barkSurfaceEffect.group)
    this.group.add(this.crownMesh)
  }

  setParams(params: Partial<TreeFieldParams>): void {
    this.params = { ...this.params, ...params }
    this.barkSurfaceEffect.setParams(this.barkSurfaceParamsFromTreeParams(this.params))
  }

  setSurface(surface: PreparedSurfaceSource<TreeTokenId, TreeTokenMeta>, seedCursor: SeedCursorFactory): void {
    this.layoutDriver = this.createLayoutDriver(surface, seedCursor)
  }

  update(elapsedTime: number, getGroundHeight: (x: number, z: number) => number): void {
    const delta = this.lastElapsedTime === 0 ? 0 : Math.max(0, elapsedTime - this.lastElapsedTime)
    this.lastElapsedTime = elapsedTime
    this.updateTrunkBurns(delta)
    this.updateTrees(getGroundHeight)
    this.barkSurfaceEffect.setPlacements(this.treePlacements)
    this.barkSurfaceEffect.update(elapsedTime)
  }

  hasTrunkBurns(): boolean {
    return this.barkSurfaceEffect.hasWounds() || this.burns.length > 0
  }

  clearTrunkBurns(): void {
    this.burns.length = 0
    this.barkSurfaceEffect.clearWounds()
  }

  addTrunkWoundFromRaycastHit(
    hit: THREE.Intersection<THREE.Object3D>,
    worldDirection: THREE.Vector3,
    options: TreeTrunkBurnOptions = {},
  ): boolean {
    const instanceId = hit.instanceId
    if (instanceId == null) return false
    const placement = this.treePlacements[instanceId]
    if (!placement) return false

    tmpLocalPoint.copy(hit.point)
    this.group.worldToLocal(tmpLocalPoint)
    tmpLocalPoint.sub(placement.center)
    const localV = THREE.MathUtils.clamp(tmpLocalPoint.dot(placement.basisY), -placement.trunkHeight * 0.5, placement.trunkHeight * 0.5)
    const lx = tmpLocalPoint.dot(placement.basisX) / Math.max(placement.radiusX, 0.0001)
    const lz = tmpLocalPoint.dot(placement.basisZ) / Math.max(placement.radiusZ, 0.0001)
    const theta = Math.atan2(lz, lx)
    const circumference = this.ellipseCircumferenceForPlacement(placement)
    const localU = (theta / (Math.PI * 2)) * circumference

    this.barkSurfaceEffect.addWound(placement.key, localU, localV, {
      radiusScale: options.radiusScale,
      maxRadiusScale: options.maxRadiusScale,
      strength: options.strength,
      mergeRadius: options.mergeRadius,
      recoveryRate: options.recoveryRate,
      directionX: worldDirection.x,
      directionY: worldDirection.y,
      directionZ: worldDirection.z,
    })
    this.addTrunkBurnFromWorldPoint(hit.point, options)
    return true
  }

  addTrunkBurnFromWorldPoint(worldPoint: THREE.Vector3, options: TreeTrunkBurnOptions = {}): void {
    tmpLocalPoint.copy(worldPoint)
    this.group.worldToLocal(tmpLocalPoint)
    const x = THREE.MathUtils.clamp(tmpLocalPoint.x, -this.fieldWidth * 0.48, this.fieldWidth * 0.48)
    const z = THREE.MathUtils.clamp(tmpLocalPoint.z, -this.fieldDepth * 0.48, this.fieldDepth * 0.48)
    const y = tmpLocalPoint.y
    const radius = this.params.trunkBurnRadius * (options.radiusScale ?? 1)
    const maxRadius = this.params.trunkBurnMaxRadius * (options.maxRadiusScale ?? 1)
    const strength = THREE.MathUtils.clamp(options.strength ?? 1, 0.05, 1.4)
    const mergeRadius = options.mergeRadius ?? 0
    const defaultRecovery = this.params.trunkBurnRecoveryRate
    const incomingRecovery = options.recoveryRate !== undefined ? options.recoveryRate : defaultRecovery

    if (mergeRadius > 0) {
      const mergeRadiusSq = mergeRadius * mergeRadius
      for (const burn of this.burns) {
        const dx = burn.x - x
        const dz = burn.z - z
        const dy = burn.y - y
        if (dx * dx + dz * dz + dy * dy * 0.25 > mergeRadiusSq) continue
        burn.x = THREE.MathUtils.lerp(burn.x, x, 0.35)
        burn.z = THREE.MathUtils.lerp(burn.z, z, 0.35)
        burn.y = THREE.MathUtils.lerp(burn.y, y, 0.35)
        burn.radius = Math.max(burn.radius, radius)
        burn.maxRadius = Math.max(burn.maxRadius, maxRadius)
        burn.strength = Math.min(1.35, Math.max(burn.strength, strength))
        const rOld = burn.recoveryRate ?? defaultRecovery
        burn.recoveryRate = Math.min(rOld, incomingRecovery)
        return
      }
    }

    this.burns.unshift({ x, z, y, radius, maxRadius, strength, recoveryRate: options.recoveryRate })
    if (this.burns.length > MAX_TRUNK_BURNS) {
      this.burns.length = MAX_TRUNK_BURNS
    }
  }

  dispose(): void {
    this.barkSurfaceEffect.dispose()
    this.trunkBarkTexture.dispose()
    this.trunkGeometry.dispose()
    this.crownGeometry.dispose()
    this.trunkMaterial.dispose()
    this.crownMaterial.dispose()
  }

  private getSlotMaxWidth(slot: SurfaceLayoutSlot): number {
    return slot.spanSize * BASE_LAYOUT_PX_PER_WORLD * this.params.layoutDensity
  }

  private createLayoutDriver(
    surface: PreparedSurfaceSource<TreeTokenId, TreeTokenMeta>,
    seedCursor: SeedCursorFactory,
  ) {
    return new SurfaceLayoutDriver({
      surface,
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 9 + 5,
      seedCursor,
      staggerFactor: 0.64,
      minSpanFactor: 0.42,
    })
  }

  private barkSurfaceParamsFromTreeParams(params: TreeFieldParams) {
    return {
      ...DEFAULT_TREE_BARK_SURFACE_PARAMS,
      woundRadius: params.trunkBurnRadius,
      woundSpreadSpeed: params.trunkBurnSpreadSpeed,
      woundMaxRadius: params.trunkBurnMaxRadius,
      recoveryRate: params.trunkBurnRecoveryRate,
    }
  }

  private ellipseCircumferenceForPlacement(placement: TreeBarkPlacement): number {
    const a = Math.max(placement.radiusX, placement.radiusZ)
    const b = Math.min(placement.radiusX, placement.radiusZ)
    const h = ((a - b) * (a - b)) / ((a + b) * (a + b) + 1e-6)
    return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(Math.max(1e-6, 4 - 3 * h))))
  }

  /**
   * Shared distance / strength sample for a single burn vs trunk axis segment (tx,tz,y0–y1).
   */
  private sampleTrunkBurnImpact(
    tx: number,
    tz: number,
    yBottom: number,
    yTop: number,
    impact: TrunkBurn,
  ): { localBurn: number; distance: number; displayRadius: number; yClosest: number } | null {
    const physicalR = Math.max(0.001, impact.radius)
    const s = THREE.MathUtils.clamp(impact.strength, 0, 1)
    const displayRadius = physicalR * THREE.MathUtils.lerp(0.34, 1, Math.pow(s, 0.5))
    const yClosest = THREE.MathUtils.clamp(impact.y, yBottom, yTop)
    const dh = Math.hypot(tx - impact.x, tz - impact.z)
    const dv = yClosest - impact.y
    const distance = Math.hypot(dh, dv * 0.92)
    if (distance > displayRadius + 0.55) return null
    const localBurn =
      impact.strength * Math.pow(1 - THREE.MathUtils.smoothstep(distance, 0, displayRadius), 0.58)
    return { localBurn, distance, displayRadius, yClosest }
  }

  private updateTrunkBurnUniforms(): void {
    const u = this.trunkBurnUniforms
    const n = Math.min(this.burns.length, TREE_SHADER_BURN_MAX)
    u.uTreeBurnCount.value = n
    u.uTreeBurnXYZ.value.fill(0)
    u.uTreeBurnRadius.value.fill(0)
    u.uTreeBurnStrength.value.fill(0)
    for (let i = 0; i < n; i++) {
      const b = this.burns[i]!
      u.uTreeBurnXYZ.value[i * 3] = b.x
      u.uTreeBurnXYZ.value[i * 3 + 1] = b.y
      u.uTreeBurnXYZ.value[i * 3 + 2] = b.z
      u.uTreeBurnRadius.value[i] = b.radius
      u.uTreeBurnStrength.value[i] = b.strength
    }
  }

  /**
   * Fish-scale-style wounds: `smoothPulse` crater + rim in the vertex shader using shared burn
   * uniforms (group-local space), plus per-pixel scorch in the fragment shader so the whole
   * trunk is not tinted from one `instanceColor`.
   */
  private patchTrunkFishStyleLaser(): void {
    const maxB = TREE_SHADER_BURN_MAX
    this.trunkMaterial.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.trunkBurnUniforms)

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
uniform int uTreeBurnCount;
uniform float uTreeBurnXYZ[ ${maxB * 3} ];
uniform float uTreeBurnRadius[ ${maxB} ];
uniform float uTreeBurnStrength[ ${maxB} ];
varying vec3 vTrunkGroupLocal;
`,
      )

      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `
#ifdef USE_INSTANCING
	{
		vec3 basisX = instanceMatrix[ 0 ].xyz;
		vec3 basisY = instanceMatrix[ 1 ].xyz;
		vec3 basisZ = instanceMatrix[ 2 ].xyz;
		float scaleX = max( length( basisX ), 0.0001 );
		float scaleY = max( length( basisY ), 0.0001 );
		float scaleZ = max( length( basisZ ), 0.0001 );
		basisX /= scaleX;
		basisY /= scaleY;
		basisZ /= scaleZ;

		vec3 center = instanceMatrix[ 3 ].xyz;
		vec3 meshP = ( instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
		vec3 rel = meshP - center;
		float hAx = dot( rel, basisY );
		vec3 onAxis = center + basisY * hAx;
		vec3 radialV = meshP - onAxis;
		float rLen = length( radialV );
		vec3 outward = rLen > 1e-4 ? radialV / rLen : basisX;

		float woundOff = 0.0;
		for ( int i = 0; i < ${maxB}; i ++ ) {
			if ( i >= uTreeBurnCount ) break;
			vec3 bc = vec3(
				uTreeBurnXYZ[ i * 3 ],
				uTreeBurnXYZ[ i * 3 + 1 ],
				uTreeBurnXYZ[ i * 3 + 2 ]
			);
			vec3 del = meshP - bc;
			vec3 d = vec3( del.x, del.y * 0.92, del.z );
			float dist = length( d );
			float rad = max( uTreeBurnRadius[ i ], 0.0001 );
			float n = dist / rad;
			if ( n >= 1.25 ) continue;
			float nn = min( n, 1.0 );
			float t = 1.0 - nn * nn;
			float crater = t * t;
			float strength = clamp( uTreeBurnStrength[ i ], 0.0, 1.4 );
			float presence = clamp( strength, 0.0, 1.0 );
			float intens = clamp( ( strength - 0.85 ) * 1.2, 0.0, 1.0 );
			woundOff += - crater * 0.36 * mix( 0.34, 0.52, intens ) * presence;
			float ridgeT = clamp( 1.0 - abs( n - 0.92 ) / 0.22, 0.0, 1.0 );
			woundOff += ridgeT * ridgeT * 0.36 * mix( 0.1, 0.16, intens ) * presence;
		}

		meshP -= outward * woundOff;
		vTrunkGroupLocal = meshP;

		vec3 deformedRel = meshP - center;
		transformed = vec3(
			dot( deformedRel, basisX ) / scaleX,
			dot( deformedRel, basisY ) / scaleY,
			dot( deformedRel, basisZ ) / scaleZ
		);
	}
#else
	vTrunkGroupLocal = vec3( 0.0 );
#endif
	#include <project_vertex>`,
      )

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
uniform int uTreeBurnCount;
uniform float uTreeBurnXYZ[ ${maxB * 3} ];
uniform float uTreeBurnRadius[ ${maxB} ];
uniform float uTreeBurnStrength[ ${maxB} ];
varying vec3 vTrunkGroupLocal;
`,
      )

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
	vec3 p = vTrunkGroupLocal;
	float burn = 0.0;
	float fr = 0.0;
	for ( int i = 0; i < ${maxB}; i ++ ) {
		if ( i >= uTreeBurnCount ) break;
		vec3 bc = vec3(
			uTreeBurnXYZ[ i * 3 ],
			uTreeBurnXYZ[ i * 3 + 1 ],
			uTreeBurnXYZ[ i * 3 + 2 ]
		);
		vec3 del = p - bc;
		vec3 d = vec3( del.x, del.y * 0.92, del.z );
		float dist = length( d );
		float rad = max( uTreeBurnRadius[ i ], 0.0001 );
		float s = clamp( uTreeBurnStrength[ i ], 0.0, 1.0 );
		float displayRadius = rad * mix( 0.34, 1.0, sqrt( s ) );
		if ( dist > displayRadius + 0.55 ) continue;
		float inner = 1.0 - smoothstep( 0.0, displayRadius, dist );
		float lb = uTreeBurnStrength[ i ] * pow( inner, 0.58 );
		burn = max( burn, lb );
		float fw = max( 0.065, displayRadius * 0.095 );
		float fd = abs( dist - displayRadius );
		float lf = uTreeBurnStrength[ i ] * pow( 1.0 - smoothstep( 0.0, fw, fd ), 2.75 );
		fr = max( fr, lf );
	}
	burn = clamp( burn, 0.0, 1.0 );
	fr = clamp( fr, 0.0, 1.0 );
	if ( burn > 0.002 || fr > 0.002 ) {
		float edge = pow( fr, 0.34 );
		vec3 charcoal = vec3( 0.12, 0.09, 0.08 );
		vec3 crispOrange = vec3( 0.96, 0.42, 0.12 );
		float charMix = smoothstep( 0.1, 0.94, burn ) * 0.88;
		diffuseColor.rgb = mix( diffuseColor.rgb, charcoal, charMix );
		float ringBoost = edge * ( 0.82 + 0.18 * ( 1.0 - burn ) );
		diffuseColor.rgb = mix( diffuseColor.rgb, crispOrange, ringBoost );
	}
}
`,
      )
    }
    this.trunkMaterial.customProgramCacheKey = () => 'tree-trunk-fish-wound-v2'
    this.trunkMaterial.needsUpdate = true
  }

  private updateTrunkBurns(delta: number): void {
    if (delta <= 0 || this.burns.length === 0) return
    const removeThreshold = 0.018
    for (const burn of this.burns) {
      const spreadMul = THREE.MathUtils.lerp(0.12, 1, Math.pow(burn.strength, 0.82))
      const growth =
        this.params.trunkBurnSpreadSpeed * delta * (0.45 + burn.strength * 0.55) * spreadMul
      burn.radius = Math.min(burn.maxRadius, burn.radius + growth)
    }
    for (let i = this.burns.length - 1; i >= 0; i--) {
      const burn = this.burns[i]!
      const rate = burn.recoveryRate ?? this.params.trunkBurnRecoveryRate
      if (rate > 0) {
        burn.strength = decayRecoveringStrength(burn.strength, Math.max(1e-7, rate), delta)
      }
      if (burn.strength <= removeThreshold) {
        this.burns.splice(i, 1)
      }
    }
  }

  /**
   * Scorch + rim in trunk axis space: closest point on segment (tx,y0,tz)-(tx,y1,tz) to burn center.
   */
  private trunkBurnFieldAt(
    tx: number,
    tz: number,
    yBottom: number,
    yTop: number,
    target: { burn: number; front: number },
  ): { burn: number; front: number } {
    if (this.burns.length === 0) {
      target.burn = 0
      target.front = 0
      return target
    }

    let burn = 0
    let front = 0
    for (const impact of this.burns) {
      const sample = this.sampleTrunkBurnImpact(tx, tz, yBottom, yTop, impact)
      if (!sample) continue
      burn = Math.max(burn, sample.localBurn)

      const frontWidth = Math.max(0.065, sample.displayRadius * 0.095)
      const frontDistance = Math.abs(sample.distance - sample.displayRadius)
      const localFront =
        impact.strength * Math.pow(1 - THREE.MathUtils.smoothstep(frontDistance, 0, frontWidth), 2.75)
      front = Math.max(front, localFront)
    }

    target.burn = THREE.MathUtils.clamp(burn, 0, 1)
    target.front = THREE.MathUtils.clamp(front, 0, 1)
    return target
  }

  private applyTrunkScorchToBarkColor(color: THREE.Color, burn: number, fr: number): void {
    const edge = Math.pow(fr, 0.34)
    tmpCrispOrange.setHSL(0.052, 0.97, 0.52)
    tmpCharcoal.setHSL(0.07, 0.12, 0.1 + burn * 0.09)
    const charMix = THREE.MathUtils.smoothstep(burn, 0.1, 0.94) * 0.88
    color.lerp(tmpCharcoal, charMix)
    const ringBoost = edge * (0.82 + 0.18 * (1 - burn))
    color.lerp(tmpCrispOrange, ringBoost)
  }

  private updateTrees(getGroundHeight: (x: number, z: number) => number): void {
    if (
      this.params.layoutDensity <= 0 ||
      this.params.sizeScale <= 0 ||
      this.params.heightScale <= 0 ||
      this.params.crownScale <= 0
    ) {
      this.trunkInteractionMesh.count = 0
      this.crownMesh.count = 0
      this.trunkInteractionMesh.instanceMatrix.needsUpdate = true
      this.crownMesh.instanceMatrix.needsUpdate = true
      return
    }

    const rowStep = this.fieldDepth / (ROWS + 1.05)
    const backZ = this.fieldDepth * 0.48
    let instanceIndex = 0
    const hasBurns = this.burns.length > 0
    this.treePlacements.length = 0

    this.updateTrunkBurnUniforms()

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
          hasBurns,
        )
      },
    })

    this.trunkInteractionMesh.count = instanceIndex
    this.crownMesh.count = instanceIndex
    this.trunkInteractionMesh.instanceMatrix.needsUpdate = true
    this.crownMesh.instanceMatrix.needsUpdate = true
    if (this.trunkInteractionMesh.instanceColor) {
      this.trunkInteractionMesh.instanceColor.needsUpdate = true
    }
    if (this.crownMesh.instanceColor) {
      this.crownMesh.instanceColor.needsUpdate = true
    }
  }

  private projectLine(
    slot: SurfaceLayoutSlot,
    resolvedGlyphs: readonly ResolvedSurfaceGlyph<TreeTokenId, TreeTokenMeta>[],
    tokenLineKey: string,
    rowStep: number,
    getGroundHeight: (x: number, z: number) => number,
    instanceIndex: number,
    hasBurns: boolean,
  ): number {
    const n = resolvedGlyphs.length
    const lineSeed = lineSignature(tokenLineKey)
    const lineLateralShift = (lineSeed - 0.5) * slot.sectorStep * 0.18
    const lineDepthShift = (lineSeed - 0.5) * rowStep * 0.12

    for (let k = 0; k < n; k++) {
      if (instanceIndex >= MAX_INSTANCES) break

      const token = resolvedGlyphs[k]!
      const identity = token.ordinal + 1
      const { meta } = token
      const hashLat = glyphHash(identity, slot.row, k)
      const hashDep = glyphHash(identity + 1, slot.sector, k ^ 0xab)
      const hashOrg = glyphHash(identity + 2, slot.row ^ slot.sector, k + 17)
      const hashKeep = glyphHash(identity + 3, slot.row + slot.sector, k ^ 0x11)
      const hashForm = glyphHash(identity + 5, slot.sector + 5, k ^ 0x57)

      const t01 = THREE.MathUtils.clamp((k + hashLat * 0.82 + 0.1) / (n + 0.12), 0.02, 0.98)
      const x =
        this.fieldCenterX +
        slot.spanStart +
        t01 * slot.spanSize +
        lineLateralShift +
        (hashLat - 0.5) * slot.sectorStep * 0.22
      const z =
        this.fieldCenterZ +
        slot.lineCoord +
        (hashDep - 0.5) * rowStep * 0.44 +
        lineDepthShift
      if (!this.placementMask.includeAtXZ(x, z)) continue

      const noise = treeOrganicWorldField(x + hashOrg * 0.24, z + hashOrg * 0.18)
      const keepChance = THREE.MathUtils.clamp(0.34 + noise * 0.42 + meta.crownBias * 0.14, 0.16, 0.86)
      if (hashKeep > keepChance) continue

      const groundY = getGroundHeight(x, z)
      const trunkHeight = Math.max(
        1.4,
        (2.8 + noise * 2.4 + meta.trunkBias * 1.8 + hashForm * 0.9) * this.params.sizeScale * this.params.heightScale,
      )
      const trunkRadius = Math.max(
        0.28,
        (0.36 + meta.trunkBias * 0.18 + noise * 0.12) * this.params.sizeScale,
      )
      const crownWidth = Math.max(
        0.9,
        trunkHeight * (0.42 + meta.spreadBias * 0.16 + noise * 0.08) * this.params.crownScale,
      )
      const crownHeight = Math.max(
        1.1,
        trunkHeight * (0.48 + meta.crownBias * 0.12 + noise * 0.08) * this.params.crownScale,
      )
      const yaw = lineSeed * Math.PI * 2 + k * 1.11 + noise * 0.8
      const leanX = (noise - 0.5) * 0.08
      const leanZ = (hashForm - 0.5) * 0.1
      const crownYaw = yaw + (hashForm - 0.5) * 0.22
      const barkColor = treeBarkColor(identity, noise, meta)

      const yTrunkBottom = groundY
      const yTrunkTop = groundY + trunkHeight
      const burnField = hasBurns
        ? this.trunkBurnFieldAt(x, z, yTrunkBottom, yTrunkTop, tmpTrunkBurnField)
        : ZERO_TRUNK_BURN_FIELD
      const burn = burnField.burn
      const burnFront = burnField.front

      const rz = trunkRadius * (0.88 + hashForm * 0.2)

      dummy.position.set(x, groundY + trunkHeight * 0.5, z)
      dummy.rotation.set(leanX, yaw, leanZ)
      dummy.scale.set(trunkRadius, trunkHeight, rz)
      dummy.updateMatrix()
      this.trunkInteractionMesh.setMatrixAt(instanceIndex, dummy.matrix)

      const placement =
        this.treePlacements[instanceIndex] ??
        ({
          key: '',
          identity: 0,
          warmth: 0,
          noise: 0,
          center: new THREE.Vector3(),
          basisX: new THREE.Vector3(),
          basisY: new THREE.Vector3(),
          basisZ: new THREE.Vector3(),
          trunkHeight: 0,
          radiusX: 0,
          radiusZ: 0,
        } satisfies TreeBarkPlacement)
      this.treePlacements[instanceIndex] = placement
      placement.key = `${slot.row}:${slot.sector}:${tokenLineKey}:${k}`
      placement.identity = identity
      placement.warmth = meta.warmth
      placement.noise = noise
      placement.center.set(x, groundY + trunkHeight * 0.5, z)
      tmpPlacementQuat.setFromEuler(dummy.rotation)
      tmpPlacementBasisX.set(1, 0, 0).applyQuaternion(tmpPlacementQuat)
      tmpPlacementBasisY.set(0, 1, 0).applyQuaternion(tmpPlacementQuat)
      tmpPlacementBasisZ.set(0, 0, 1).applyQuaternion(tmpPlacementQuat)
      placement.basisX.copy(tmpPlacementBasisX)
      placement.basisY.copy(tmpPlacementBasisY)
      placement.basisZ.copy(tmpPlacementBasisZ)
      placement.trunkHeight = trunkHeight
      placement.radiusX = trunkRadius
      placement.radiusZ = rz

      tmpColor.copy(barkColor)
      this.trunkInteractionMesh.setColorAt(instanceIndex, tmpColor)

      const crownColor = treeCrownColor(identity, noise, meta)

      dummy.position.set(x, groundY + trunkHeight * 0.78 + crownHeight * 0.24, z)
      dummy.rotation.set(leanX * 0.45, crownYaw, leanZ * 0.4)
      dummy.scale.set(crownWidth, crownHeight, crownWidth * (0.94 + noise * 0.14 + hashForm * 0.08))
      dummy.updateMatrix()
      this.crownMesh.setMatrixAt(instanceIndex, dummy.matrix)
      if (burn > 0.35) {
        tmpBarkColor.copy(crownColor)
        this.applyTrunkScorchToBarkColor(tmpBarkColor, (burn - 0.35) / 0.65, burnFront * 0.6)
        this.crownMesh.setColorAt(instanceIndex, tmpBarkColor)
      } else {
        this.crownMesh.setColorAt(instanceIndex, crownColor)
      }

      instanceIndex++
    }

    return instanceIndex
  }
}

export type CreateTreeFieldEffectOptions = {
  seedCursor: SeedCursorFactory
  surface?: PreparedSurfaceSource<TreeTokenId, TreeTokenMeta>
  initialParams?: TreeFieldParams
  placementMask?: TreeFieldPlacementMask
}

export function createTreeFieldEffect({
  seedCursor,
  surface = getPreparedTreeSurface(),
  initialParams = DEFAULT_TREE_FIELD_PARAMS,
  placementMask,
}: CreateTreeFieldEffectOptions): TreeFieldEffect {
  const effect = createSurfaceEffect({
    id: 'tree-field',
    source: surface,
    layout: fieldLayout({
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 9 + 5,
      staggerFactor: 0.64,
      minSpanFactor: 0.42,
    }),
    seedCursor,
  })

  return new TreeFieldEffect(effect.source, seedCursor, initialParams, placementMask)
}

import type { MovementBounds, ThirdPersonControllerConfig } from './thirdPersonController'
import type { SolidAabb } from './playgroundCollision'

export const PLAYGROUND_BOUNDS: MovementBounds = {
  minX: -28,
  maxX: 28,
  minZ: -28,
  maxZ: 28,
}

export const PLAYGROUND_CONTROLLER: ThirdPersonControllerConfig = {
  moveSpeed: 5.7,
  sprintMultiplier: 1.5,
  jumpVelocity: 10.57,
  doubleJumpMultiplier: 2,
  gravity: 15.5,
  turnLerp: 10,
  lookYawSpeed: 0.008,
  lookPitchSpeed: 0.006,
  minPitch: -0.82,
  maxPitch: 0.34,
  cameraDistance: 6.7,
  cameraHeight: 2.45,
  shoulderOffset: 0.7,
  reticleDistance: 10.2,
  cameraFollowLerp: 10,
}

export const PLAYGROUND_ZOOM = {
  min: 4.8,
  max: 25,
  current: 6.7,
}

export const PLAYGROUND_SPAWN = {
  x: 0,
  z: 10.5,
  yaw: 0,
  pitch: -0.22,
}

/** Shutter-style facade on the north building, facing the intersection. */
export const SHUTTER_WALL_LAYOUT = {
  x: 0,
  z: -15.02,
  wallCenterHeight: 2.45,
  wallWidth: 8.8,
  wallHeight: 7.2,
  wallDepth: 0.85,
}

/** Ivy-covered wall on the west building, facing +X. */
export const IVY_WALL_LAYOUT = {
  x: -12.5,
  z: 2,
  wallCenterHeight: 2.35,
  wallWidth: 8.2,
  wallHeight: 6.5,
  wallDepth: 0.85,
}

export const WINDOW_GLASS_LAYOUTS = [
  { x: -5.6, y: 5.3, z: -15.02, rotationY: 0, scaleX: 0.84, scaleY: 0.9, scaleZ: 0.12 },
  { x: 5.6, y: 5.3, z: -15.02, rotationY: 0, scaleX: 0.84, scaleY: 0.9, scaleZ: 0.12 },
  // East building: nudge x slightly more −X so glass sits a bit further off the façade than 12.74.
  { x: 12.64, y: 4.4, z: -6.2, rotationY: -Math.PI / 2, scaleX: 0.72, scaleY: 0.86, scaleZ: 0.12 },
  { x: 12.64, y: 4.4, z: -1.6, rotationY: -Math.PI / 2, scaleX: 0.72, scaleY: 0.86, scaleZ: 0.12 },
] as const

export const INTERIOR_FLOOR_Y = 0.14

export type RoofWalkableSurface = {
  bounds: SolidAabb
  y: number
}

const BUILDING_INTERIORS = [
  { minX: -12.74, maxX: 12.74, minZ: -23.49, maxZ: -15.51 },
  { minX: -20.49, maxX: -12.51, minZ: -4.74, maxZ: 8.74 },
  { minX: 12.76, maxX: 21.24, minZ: -9.74, maxZ: 1.74 },
] as const

export function isInsideBuildingInterior(x: number, z: number): boolean {
  return BUILDING_INTERIORS.some((interior) =>
    x >= interior.minX && x <= interior.maxX && z >= interior.minZ && z <= interior.maxZ,
  )
}

/**
 * Roof tops are walkable, but only once the player is actually near roof level.
 * Bounds are slightly inset from the visible shell to avoid edge jitter.
 */
export const ROOF_WALKABLE_SURFACES: RoofWalkableSurface[] = [
  { bounds: { minX: -12.88, maxX: 12.88, minZ: -23.63, maxZ: -15.37 }, y: 8.7 },
  { bounds: { minX: -20.63, maxX: -12.37, minZ: -4.88, maxZ: 8.88 }, y: 6.9 },
  { bounds: { minX: 12.87, maxX: 21.13, minZ: -9.88, maxZ: 1.88 }, y: 7.0 },
]

/** Player XZ collision radius (circle vs AABB). */
export const PLAYER_COLLISION_RADIUS = 0.34

/** Minimum fish-scale damage (0–1) at a point to pass through shutter/ivy breach zones. */
export const FACADE_BREACH_DAMAGE_THRESHOLD = 0.38

/** Lateral offset (m) for multi-sample breach checks; ~player radius for fair hole width. */
export const FACADE_BREACH_SAMPLE_OFFSET = 0.28

/**
 * Wound recovery for shopfront + ivy fish facades only (lower = holes stay open longer).
 * Default fish preset is ~0.8; facades use this so damage lingers.
 */
export const FACADE_FISH_RECOVERY_RATE = 0.12

/** Thicker concrete shells so inner/outer faces read more clearly than paper-thin boxes. */
export const HOLLOW_BUILDING_WALL_THICKNESS = 0.52

/**
 * Solid building shell walls (no walking through). Breachable facades are omitted here;
 * see `BREACHABLE_FACADE_ZONES` and runtime checks against Weft wound state.
 */
export const SOLID_BUILDING_WALLS: SolidAabb[] = [
  // North building (center ~ z=-19.5, half-depth 4.25, half-width 13)
  { minX: -13.1, maxX: 13.1, minZ: -24.05, maxZ: -23.45, maxY: 8.7 },
  { minX: -13.55, maxX: -12.95, minZ: -23.4, maxZ: -15.45, maxY: 8.7 },
  { minX: 12.95, maxX: 13.55, minZ: -23.4, maxZ: -15.45, maxY: 8.7 },
  { minX: -13.1, maxX: -4.55, minZ: -15.72, maxZ: -15.12, maxY: 8.7 },
  { minX: 4.55, maxX: 13.1, minZ: -15.72, maxZ: -15.12, maxY: 8.7 },
  // West building (center ~ x=-16.5, z=2, w=8.5, d=14)
  { minX: -21.05, maxX: -20.5, minZ: -5.05, maxZ: 9.05, maxY: 6.9 },
  { minX: -20.85, maxX: -12.15, minZ: 8.65, maxZ: 9.25, maxY: 6.9 },
  { minX: -20.85, maxX: -12.15, minZ: -5.25, maxZ: -4.65, maxY: 6.9 },
  { minX: -12.95, maxX: -12.2, minZ: 6.38, maxZ: 9.35, maxY: 6.9 },
  { minX: -12.95, maxX: -12.2, minZ: -5.05, maxZ: -2.38, maxY: 6.9 },
  // East building (center ~ x=17, z=-4, w=8.5, d=12)
  { minX: 12.5, maxX: 13.1, minZ: -10.05, maxZ: 2.05, maxY: 7.0 },
  { minX: 12.65, maxX: 21.35, minZ: 1.45, maxZ: 2.15, maxY: 7.0 },
  { minX: 12.65, maxX: 21.35, minZ: -10.35, maxZ: -9.65, maxY: 7.0 },
  { minX: 20.9, maxX: 21.55, minZ: -10.05, maxZ: 2.05, maxY: 7.0 },
]

export type BreachZoneKind = 'shutter' | 'ivy' | 'neon'

export type BreachZone = {
  kind: BreachZoneKind
  bounds: SolidAabb
  /** Index into `NEON_BARRIERS` / `neonSignEffects` when `kind === 'neon'`. */
  neonIndex?: number
}

/**
 * Regions where the shell is intentionally open only when Weft damage/holes allow passage.
 */
export const BREACHABLE_FACADE_ZONES: BreachZone[] = [
  {
    kind: 'shutter',
    bounds: { minX: -4.55, maxX: 4.55, minZ: -15.72, maxZ: -14.95, maxY: 8.7 },
  },
  {
    kind: 'ivy',
    bounds: { minX: -12.98, maxX: -11.82, minZ: -2.38, maxZ: 6.38, maxY: 6.9 },
  },
  {
    kind: 'neon',
    neonIndex: 0,
    bounds: { minX: -9.1, maxX: 9.1, minZ: 8.65, maxZ: 9.35, maxY: 6.7 },
  },
]

/** Keep only the south neon wall segment on the open side with no building behind it. */
export const NEON_BARRIERS = [
  { x: 0, z: 9, rotationY: 0, wallWidth: 18, wallHeight: 6.6 },
] as const

/** Rubble / fracture field: empty lot beside the road. */
export const RUBBLE_ZONE = {
  minX: 6,
  maxX: 18.5,
  minZ: 4,
  maxZ: 17,
}

export function isInsideRubbleZone(x: number, z: number): boolean {
  return x >= RUBBLE_ZONE.minX && x <= RUBBLE_ZONE.maxX && z >= RUBBLE_ZONE.minZ && z <= RUBBLE_ZONE.maxZ
}

/** Sum of wound strengths (each capped 1) before the lamp reads as fully broken; heals with fish-scale recovery. */
export const STREET_LAMP_GLASS_BREAK_THRESHOLD = 3.65

export const STREET_LAMP_POINT_INTENSITY_MAX = 2.35

/** Globe material emissive intensity when the lamp is intact. */
export const STREET_LAMP_GLOBE_EMISSIVE_MAX = 0.88

/** Shared glass tuning for lamps and building windows. */
export const DEFAULT_GLASS_SURFACE_PARAMS = {
  woundRadius: 1.4,
  woundNarrow: 0.2,
  woundDepth: 0.62,
  scaleLift: 0.48,
  surfaceFlex: 0.22,
  recoveryRate: 0,
} as const

import { seedCursor } from '../weft/core'
import {
  createBandFieldEffect,
  createFungusSeamEffect,
  createLeafPileBandEffect,
  buildGrassStateSurface,
  buildLeafPileSeasonSurface,
  buildLogSeasonSurface,
  buildShrubSeasonSurface,
  buildTreeSeasonSurface,
  createFireWallEffect,
  createShellSurfaceEffect,
  createGrassEffect,
  createLogFieldEffect,
  createNeedleLitterFieldEffect,
  createRockFieldEffect,
  createTerrainReliefField,
  createShrubFieldEffect,
  createStarSkyEffect,
  createStickFieldEffect,
  createTreeFieldEffect,
  DEFAULT_BAND_FIELD_PARAMS,
  DEFAULT_FIRE_WALL_PARAMS,
  DEFAULT_FUNGUS_SEAM_PARAMS,
  DEFAULT_SHELL_SURFACE_PARAMS,
  DEFAULT_GRASS_FIELD_PARAMS,
  DEFAULT_LEAF_PILE_BAND_PARAMS,
  DEFAULT_LOG_FIELD_PARAMS,
  DEFAULT_NEEDLE_LITTER_FIELD_PARAMS,
  DEFAULT_ROCK_FIELD_PARAMS,
  DEFAULT_SHRUB_FIELD_PARAMS,
  DEFAULT_STAR_SKY_PARAMS,
  DEFAULT_STICK_FIELD_PARAMS,
  DEFAULT_TREE_FIELD_PARAMS,
  getPreparedBandSurface,
  getPreparedFireSurface,
  getPreparedFungusBandSurface,
  getPreparedGlassSurface,
  getPreparedShellSurface,
  getPreparedIvySurface,
  getPreparedLogSurface,
  getPreparedNeedleLitterSurface,
  getPreparedRockSurface,
  getPreparedShrubSurface,
  getPreparedStarSurface,
  getPreparedStickSurface,
  getPreparedTreeSurface,
  type BandFieldParams,
  type FireWallEffect,
  type FireWallParams,
  type FungusSeamParams,
  type ShellSurfaceEffect,
  type ShellSurfaceParams,
  type GrassFieldParams,
  type LeafPileBandParams,
  type LeafPileSeason,
  type LogFieldParams,
  type NeedleLitterFieldParams,
  type RockFieldParams,
  type ShrubFieldParams,
  type StarSkyParams,
  type StickFieldParams,
  type TreeFieldParams,
  type PresetLayoutViewCull,
} from '../weft/three'
import { createWebGPURenderer } from '../createWebGPURenderer'
import { Timer } from 'three'
import * as THREE from 'three'
import { applyPlaygroundAtmosphere, addPlaygroundLighting } from './playgroundEnvironment'
import {
  type PlayerAnimationState,
  ThirdPersonController,
  type ThirdPersonControllerConfig,
  type ThirdPersonControllerFrame,
  type ThirdPersonControllerInput,
  type ResolveHorizontalMove,
} from './thirdPersonController'
import {
  circleOverlapsAabb,
  pushCircleOutOfAabb,
} from './playgroundCollision'
import {
  DEMO_GRASS_LAYOUT_DENSITY_DEFAULT,
  DEMO_GRASS_LAYOUT_DENSITY_MAX,
  PLAYGROUND_GRASS_LAYOUT_SCALE,
  PLAYGROUND_PIXEL_RATIO_CAP,
  PLAYGROUND_ROCK_LAYOUT_SCALE,
  PLAYGROUND_STAR_LAYOUT_SCALE,
} from './playgroundQuality'
import {
  createTownIntersectionScene,
  STREET_LAMP_BULB_Y_OFFSET,
  STREET_LIGHT_XZ,
} from './playgroundTownScene'
import {
  TOWN_ROAD_SURFACE_Y,
  getVergeStripDistanceAtXZ,
  isCrossRoadAsphalt,
  isVergeStrip,
} from './townRoadMask'
import {
  type BreachZone,
  BREACHABLE_FACADE_ZONES,
  FACADE_BREACH_DAMAGE_THRESHOLD,
  FACADE_BREACH_SAMPLE_OFFSET,
  FACADE_FISH_RECOVERY_RATE,
  FUNGUS_SEAM_ZONE,
  INTERIOR_FLOOR_Y,
  IVY_WALL_LAYOUT,
  NEON_BARRIERS,
  PLAYGROUND_BAND_EDGE_SOFTNESS,
  PLAYGROUND_BAND_LAYOUT_DENSITY,
  PLAYGROUND_BAND_SIZE_SCALE,
  PLAYGROUND_FUNGUS_SEAM_WIDTH,
  PLAYGROUND_VERGE_BAND_WIDTH,
  PLAYER_COLLISION_RADIUS,
  PLAYGROUND_BOUNDS,
  PLAYGROUND_CONTROLLER,
  PLAYGROUND_SPAWN,
  PLAYGROUND_ZOOM,
  ROOF_WALKABLE_SURFACES,
  SHUTTER_WALL_LAYOUT,
  SOLID_BUILDING_WALLS,
  DEFAULT_GLASS_SURFACE_PARAMS,
  STREET_LAMP_GLASS_BREAK_THRESHOLD,
  STREET_LAMP_GLOBE_EMISSIVE_MAX,
  STREET_LAMP_POINT_INTENSITY_MAX,
  WINDOW_GLASS_LAYOUTS,
  distanceToFungusSeamAtXZ,
  isInsideBuildingInterior,
  isInsideFungusSeamZone,
  isInsideRubbleZone,
} from './playgroundWorld'
import {
  createSceneryWorldAuthoring,
  DEFAULT_SCENERY_TERRAIN_RELIEF_PARAMS,
  DEFAULT_SCENERY_WORLD_FIELD_PARAMS,
  SCENERY_BOUNDS,
  SCENERY_LEAF_PILE_BURN_PARAMS,
  SCENERY_NEEDLE_LITTER_BURN_PARAMS,
  SCENERY_SPAWN,
  sampleSceneryTerrainAuthoringRead,
  type SceneryTerrainReliefParams,
  type SceneryWorldAuthoring,
  type SceneryWorldFieldParams,
} from './playgroundSceneryWorld'
import type { MovementBounds } from './thirdPersonController'

export type PlaygroundRuntimeOptions = {
  /** Open grass field only: no town, larger walk bounds, no building collision. */
  scenery?: boolean
}

type SceneryMotionResponseParams = {
  logPushScale: number
  stickPushScale: number
}

type ReticleHit = THREE.Intersection & {
  targetKind: 'shutter' | 'ivy' | 'grass' | 'neon' | 'lamp' | 'glass' | 'rock' | 'tree'
}

/** Rolling CPU/FPS averages over wall-clock window (see `PlaygroundRuntime` long-window buffer). */
export type PlaygroundPerfLongWindow = {
  windowSec: number
  sampleCount: number
  fpsAvg: number
  frameCpuMsAvg: number
  controllerCpuMsAvg: number
  playerCpuMsAvg: number
  effectsCpuMsAvg: number
  renderCpuMsAvg: number
  lightingCpuMsAvg: number
  lampCpuMsAvg: number
  glassCpuMsAvg: number
  grassCpuMsAvg: number
  vergeCpuMsAvg: number
  leafCpuMsAvg: number
  fungusCpuMsAvg: number
  bandCpuMsAvg: number
  rockCpuMsAvg: number
  logCpuMsAvg: number
  stickCpuMsAvg: number
  needleCpuMsAvg: number
  neonCpuMsAvg: number
  skyCpuMsAvg: number
  fishCpuMsAvg: number
}

export type PlaygroundPerfStats = {
  fps: number
  fpsAvg: number
  frameCpuMs: number
  frameCpuMsAvg: number
  controllerCpuMs: number
  effectsCpuMs: number
  effectsCpuMsAvg: number
  renderCpuMs: number
  renderCpuMsAvg: number
  playerCpuMs: number
  shutterCpuMs: number
  ivyCpuMs: number
  lampCpuMs: number
  lampCpuMsAvg: number
  glassCpuMs: number
  glassCpuMsAvg: number
  grassCpuMs: number
  grassCpuMsAvg: number
  vergeCpuMs: number
  vergeCpuMsAvg: number
  leafCpuMs: number
  leafCpuMsAvg: number
  fungusCpuMs: number
  fungusCpuMsAvg: number
  bandCpuMs: number
  bandCpuMsAvg: number
  rockCpuMs: number
  rockCpuMsAvg: number
  logCpuMs: number
  logCpuMsAvg: number
  stickCpuMs: number
  stickCpuMsAvg: number
  needleCpuMs: number
  needleCpuMsAvg: number
  neonCpuMs: number
  neonCpuMsAvg: number
  skyCpuMs: number
  skyCpuMsAvg: number
  lightingCpuMs: number
  fishCpuMsAvg: number
  ranSystems: string[]
  viewportWidth: number
  viewportHeight: number
  pixelRatio: number
  longWindow: PlaygroundPerfLongWindow
}

type PerfWindowSample = {
  fps: number
  frameCpuMs: number
  controllerCpuMs: number
  playerCpuMs: number
  effectsCpuMs: number
  renderCpuMs: number
  lightingCpuMs: number
  lampCpuMs: number
  glassCpuMs: number
  grassCpuMs: number
  vergeCpuMs: number
  leafCpuMs: number
  fungusCpuMs: number
  bandCpuMs: number
  rockCpuMs: number
  logCpuMs: number
  stickCpuMs: number
  needleCpuMs: number
  neonCpuMs: number
  skyCpuMs: number
  fishCpuMs: number
}

const INTERSECTION_LEAF_PILES = [
  { x: -2.42, z: -1.72, radius: 0.38 },
  { x: 2.32, z: -1.52, radius: 0.36 },
  { x: -1.78, z: 2.28, radius: 0.37 },
  { x: 2.05, z: 2.02, radius: 0.32 },
] as const

function isInsideIntersectionLeafPile(x: number, z: number): boolean {
  return INTERSECTION_LEAF_PILES.some((pile) => {
    const dx = x - pile.x
    const dz = z - pile.z
    return dx * dx + dz * dz <= pile.radius * pile.radius
  })
}

function distanceToIntersectionLeafPileAtXZ(x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY
  for (const pile of INTERSECTION_LEAF_PILES) {
    const distance = Math.hypot(x - pile.x, z - pile.z) - pile.radius
    if (distance < best) best = distance
  }
  return best
}

type BreachZoneOpenState = {
  isOpen: boolean
  openSamples: number
  requiredOpenSamples: number
  totalSamples: number
}

type CollisionDebugTile = {
  zone: BreachZone
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  sampleX: number
  sampleY: number
  sampleZ: number
}

const TERRAIN_DEBUG_FLAT_COLOR = new THREE.Color('#70e37d')
const TERRAIN_DEBUG_SLOPE_COLOR = new THREE.Color('#ffbf54')
const TERRAIN_DEBUG_RIDGE_COLOR = new THREE.Color('#ff5ca8')
const TERRAIN_DEBUG_BASIN_COLOR = new THREE.Color('#53b6ff')
const tmpTerrainDebugColor = new THREE.Color()

export class PlaygroundRuntime {
  private static readonly INDOOR_CAMERA_DISTANCE_MAX = 3.15
  private static readonly INDOOR_SHOULDER_OFFSET = 0.24
  private static readonly INDOOR_CAMERA_HEIGHT = 1.95
  private static readonly SCENERY_FIRST_PERSON_CAMERA_HEIGHT = 1.68
  private static readonly ROOF_SNAP_DOWN_DISTANCE = 0.85
  private static readonly WALL_TOP_CLEARANCE = 0.14
  private static readonly INDOOR_FOLLOW_LERP = 14
  private static readonly OUTDOOR_FOV = 32
  private static readonly SCENERY_FIRST_PERSON_FOV = 68
  private static readonly INDOOR_FOV = 37
  private static readonly CAMERA_OBSTRUCTION_PADDING = 0.22
  private static readonly CAMERA_GROUND_CLEARANCE = 0.22
  private static readonly COLLISION_DEBUG_TILE_SIZE = 0.56
  private static readonly COLLISION_DEBUG_TILE_HEIGHT = 0.42
  private static readonly COLLISION_DEBUG_SURFACE_OFFSET = 0.05
  private static readonly TERRAIN_AUTHORING_DEBUG_SEGMENTS = 58
  private static readonly TERRAIN_AUTHORING_DEBUG_OFFSET = 0.05
  private static readonly BREACH_SAMPLE_HEIGHT_OFFSETS = [0.38, 0.98, 1.52] as const
  private static readonly COLLISION_DEBUG_OPEN_COLOR = new THREE.Color('#58ff93')
  private static readonly COLLISION_DEBUG_BLOCKED_COLOR = new THREE.Color('#ff4fb4')

  private readonly host: HTMLElement
  private readonly canvas = document.createElement('canvas')
  private readonly timer = new Timer()
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.2, 600)
  private readonly cameraFill = new THREE.PointLight('#fff4dc', 1.65, 26, 2)
  private readonly raycaster = new THREE.Raycaster()
  private readonly cameraCollisionRaycaster = new THREE.Raycaster()
  private readonly grassAimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private readonly grassFallbackPoint = new THREE.Vector3()
  private readonly playerForward = new THREE.Vector3()
  private readonly footstepPoint = new THREE.Vector3()
  private readonly cameraAimToEye = new THREE.Vector3()
  private readonly cameraLookTarget = new THREE.Vector3()
  private readonly cameraSafePosition = new THREE.Vector3()
  private readonly collisionSample = new THREE.Vector3()
  private readonly effectCullWorld = new THREE.Vector3()
  private readonly effectCullSphere = new THREE.Sphere()
  private readonly ndcCenter = new THREE.Vector2(0, 0)
  private readonly shutterEffect = createShellSurfaceEffect({
    surface: getPreparedShellSurface(),
    seedCursor,
    initialParams: { ...DEFAULT_SHELL_SURFACE_PARAMS, recoveryRate: FACADE_FISH_RECOVERY_RATE },
    appearance: 'shutter',
    effectId: 'shutter-facade',
  })
  private readonly ivyEffect = createShellSurfaceEffect({
    surface: getPreparedIvySurface(),
    seedCursor,
    initialParams: { ...DEFAULT_SHELL_SURFACE_PARAMS, recoveryRate: FACADE_FISH_RECOVERY_RATE },
    appearance: 'ivy',
    effectId: 'ivy-facade',
  })
  private readonly sceneryMode: boolean
  private readonly movementBounds: MovementBounds
  private readonly spawnConfig: { x: number; z: number; yaw: number; pitch: number }
  private sceneryTerrainReliefParams: SceneryTerrainReliefParams = { ...DEFAULT_SCENERY_TERRAIN_RELIEF_PARAMS }
  private readonly sceneryTerrainRelief = createTerrainReliefField(this.sceneryTerrainReliefParams)
  private sceneryWorldFieldParams: SceneryWorldFieldParams = { ...DEFAULT_SCENERY_WORLD_FIELD_PARAMS }
  private sceneryWorldAuthoring: SceneryWorldAuthoring = createSceneryWorldAuthoring(
    this.sceneryWorldFieldParams,
    this.sceneryTerrainRelief,
    this.sceneryTerrainReliefParams,
  )
  private readonly grassEffect: ReturnType<typeof createGrassEffect>
  private readonly vergeBandEffect: ReturnType<typeof createBandFieldEffect>
  private readonly leafPileEffect: ReturnType<typeof createLeafPileBandEffect>
  private readonly fungusBandEffect: ReturnType<typeof createFungusSeamEffect>
  private readonly rockFieldEffect: ReturnType<typeof createRockFieldEffect>
  private readonly shrubFieldEffect: ReturnType<typeof createShrubFieldEffect>
  private readonly treeFieldEffect: ReturnType<typeof createTreeFieldEffect>
  private readonly logFieldEffect: ReturnType<typeof createLogFieldEffect>
  private readonly stickFieldEffect: ReturnType<typeof createStickFieldEffect>
  private readonly needleLitterEffect: ReturnType<typeof createNeedleLitterFieldEffect>
  private readonly neonSignEffects: FireWallEffect[] = NEON_BARRIERS.map((barrier) =>
    createFireWallEffect({
      surface: getPreparedFireSurface(),
      seedCursor,
      initialParams: {
        ...DEFAULT_FIRE_WALL_PARAMS,
        appearance: 'neon',
        wallWidth: barrier.wallWidth,
        wallHeight: barrier.wallHeight,
        recoveryRate: 0.42,
        holeSize: 0.92,
      },
    }),
  )
  private readonly starSkyEffect = createStarSkyEffect({
    surface: getPreparedStarSurface(),
    seedCursor,
    initialParams: DEFAULT_STAR_SKY_PARAMS,
  })
  private readonly controller = new ThirdPersonController()
  private readonly inputState = {
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    sprint: false,
    crouch: false,
    lookActive: false,
    lookDeltaX: 0,
    lookDeltaY: 0,
  }

  private renderer: Awaited<ReturnType<typeof createWebGPURenderer>> | null = null
  private resizeObserver: ResizeObserver | null = null
  private rafId = 0
  private disposed = false
  private lastElapsed = 0
  private sceneryPointerLocked = false
  private readonly skybox: THREE.Mesh
  private walkStampDistance = 0
  private pendingShoot = false
  private pendingJump = false
  private activeFrame: ThirdPersonControllerFrame | null = null
  private readonly laserBeamGroup: THREE.Group
  private readonly laserBeamOuter: THREE.Mesh
  private readonly laserBeamCore: THREE.Mesh
  private readonly laserBeamMeshes: THREE.Mesh[]
  private readonly laserEndPoint = new THREE.Vector3()
  private readonly laserImpactLocked = new THREE.Vector3()
  private laserImpactValid = false
  private readonly laserPlayerForward = new THREE.Vector3()
  private readonly laserMuzzle = new THREE.Vector3()
  private readonly laserDir = new THREE.Vector3()
  private readonly laserMid = new THREE.Vector3()
  private readonly laserAxisY = new THREE.Vector3(0, 1, 0)
  private laserLifeRemaining = 0
  private readonly laserDurationSec = 0.11
  private readonly collisionDebugGroup = new THREE.Group()
  private readonly collisionDebugTiles: CollisionDebugTile[]
  private collisionDebugVisible = false
  private readonly terrainAuthoringDebugGroup = new THREE.Group()
  private terrainAuthoringDebugMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null
  private terrainAuthoringDebugBasePositions: Float32Array | null = null

  private shellSurfaceParams: ShellSurfaceParams = {
    ...DEFAULT_SHELL_SURFACE_PARAMS,
    recoveryRate: FACADE_FISH_RECOVERY_RATE,
  }
  private glassSurfaceParams: ShellSurfaceParams = { ...DEFAULT_GLASS_SURFACE_PARAMS }
  private grassFieldParams: GrassFieldParams = {
    ...DEFAULT_GRASS_FIELD_PARAMS,
    layoutDensity: DEMO_GRASS_LAYOUT_DENSITY_DEFAULT,
  }
  private vergeBandParams: BandFieldParams = {
    ...DEFAULT_BAND_FIELD_PARAMS,
    layoutDensity: PLAYGROUND_BAND_LAYOUT_DENSITY,
    sizeScale: PLAYGROUND_BAND_SIZE_SCALE,
    bandWidth: PLAYGROUND_VERGE_BAND_WIDTH,
    edgeSoftness: PLAYGROUND_BAND_EDGE_SOFTNESS,
  }
  private leafPileParams: LeafPileBandParams = {
    ...DEFAULT_LEAF_PILE_BAND_PARAMS,
    layoutDensity: PLAYGROUND_BAND_LAYOUT_DENSITY * 1.02,
    sizeScale: PLAYGROUND_BAND_SIZE_SCALE * 1.72,
    bandWidth: 1.85,
    edgeSoftness: PLAYGROUND_BAND_EDGE_SOFTNESS * 0.9,
    season: 'autumn',
  }
  private fungusBandParams: FungusSeamParams = {
    ...DEFAULT_FUNGUS_SEAM_PARAMS,
    layoutDensity: PLAYGROUND_BAND_LAYOUT_DENSITY,
    sizeScale: PLAYGROUND_BAND_SIZE_SCALE * 0.92,
    bandWidth: PLAYGROUND_FUNGUS_SEAM_WIDTH,
    edgeSoftness: PLAYGROUND_BAND_EDGE_SOFTNESS * 1.25,
  }
  private rockFieldParams: RockFieldParams = { ...DEFAULT_ROCK_FIELD_PARAMS }
  private shrubFieldParams: ShrubFieldParams = { ...DEFAULT_SHRUB_FIELD_PARAMS }
  private treeFieldParams: TreeFieldParams = { ...DEFAULT_TREE_FIELD_PARAMS }
  private logFieldParams: LogFieldParams = { ...DEFAULT_LOG_FIELD_PARAMS }
  private stickFieldParams: StickFieldParams = { ...DEFAULT_STICK_FIELD_PARAMS }
  private needleLitterParams: NeedleLitterFieldParams = { ...DEFAULT_NEEDLE_LITTER_FIELD_PARAMS }
  private starSkyParams: StarSkyParams = { ...DEFAULT_STAR_SKY_PARAMS }
  private sceneryMotionResponse: SceneryMotionResponseParams = {
    logPushScale: 1.55,
    stickPushScale: 2.6,
  }
  private sceneryFoliageSeasonOverride: LeafPileSeason | null = null
  private zoomDistance = PLAYGROUND_ZOOM.current
  private readonly townGroup: THREE.Group
  private readonly cameraObstacles: THREE.Object3D[]
  private readonly lampLights: THREE.PointLight[]
  private readonly lampGlobes: THREE.Mesh[]
  private readonly lampEffects: ShellSurfaceEffect[]
  private readonly windowGlassEffects: ShellSurfaceEffect[]
  /** Stable interaction targets for raycasts (no per-frame array allocation). */
  private readonly raycastTargets: THREE.Object3D[]
  /** Reused controller input to avoid per-frame object allocation. */
  private readonly frameInput: ThirdPersonControllerInput = {
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    sprint: false,
    jump: false,
    crouch: false,
    lookActive: false,
    lookDeltaX: 0,
    lookDeltaY: 0,
  }
  private readonly controllerConfig: ThirdPersonControllerConfig = { ...PLAYGROUND_CONTROLLER }
  /** Editor-facing layout densities before playground scaling. */
  private userGrassLayoutDensity = DEMO_GRASS_LAYOUT_DENSITY_DEFAULT
  private userBandLayoutDensity = PLAYGROUND_BAND_LAYOUT_DENSITY
  private userStarLayoutDensity = DEFAULT_STAR_SKY_PARAMS.layoutDensity
  private userRockLayoutDensity = DEFAULT_ROCK_FIELD_PARAMS.layoutDensity
  private userShrubLayoutDensity = DEFAULT_SHRUB_FIELD_PARAMS.layoutDensity
  private userTreeLayoutDensity = DEFAULT_TREE_FIELD_PARAMS.layoutDensity
  private userLogLayoutDensity = DEFAULT_LOG_FIELD_PARAMS.layoutDensity
  private userStickLayoutDensity = DEFAULT_STICK_FIELD_PARAMS.layoutDensity
  private userNeedleLayoutDensity = DEFAULT_NEEDLE_LITTER_FIELD_PARAMS.layoutDensity
  private indoorCameraBlend = 0
  private frameTick = 0
  private vergeBandDirty = true
  private leafPileDirty = true
  private fungusBandDirty = true
  private rockFieldDirty = true
  private shrubFieldDirty = true
  private treeFieldDirty = true
  private logFieldDirty = true
  private stickFieldDirty = true
  private needleLitterDirty = true
  /** Last frame CPU time spent in effect updates (ms), for debugging. */
  effectUpdateMs = 0
  /** Smoothed presentation FPS for the current runtime. */
  fps = 0
  perfStats: PlaygroundPerfStats = {
    fps: 0,
    fpsAvg: 0,
    frameCpuMs: 0,
    frameCpuMsAvg: 0,
    controllerCpuMs: 0,
    effectsCpuMs: 0,
    effectsCpuMsAvg: 0,
    renderCpuMs: 0,
    renderCpuMsAvg: 0,
    playerCpuMs: 0,
    shutterCpuMs: 0,
    ivyCpuMs: 0,
    lampCpuMs: 0,
    lampCpuMsAvg: 0,
    glassCpuMs: 0,
    glassCpuMsAvg: 0,
    grassCpuMs: 0,
    grassCpuMsAvg: 0,
    vergeCpuMs: 0,
    vergeCpuMsAvg: 0,
    leafCpuMs: 0,
    leafCpuMsAvg: 0,
    fungusCpuMs: 0,
    fungusCpuMsAvg: 0,
    bandCpuMs: 0,
    bandCpuMsAvg: 0,
    rockCpuMs: 0,
    rockCpuMsAvg: 0,
    logCpuMs: 0,
    logCpuMsAvg: 0,
    stickCpuMs: 0,
    stickCpuMsAvg: 0,
    needleCpuMs: 0,
    needleCpuMsAvg: 0,
    neonCpuMs: 0,
    neonCpuMsAvg: 0,
    skyCpuMs: 0,
    skyCpuMsAvg: 0,
    lightingCpuMs: 0,
    fishCpuMsAvg: 0,
    ranSystems: [],
    viewportWidth: 0,
    viewportHeight: 0,
    pixelRatio: 1,
    longWindow: {
      windowSec: 30,
      sampleCount: 0,
      fpsAvg: 0,
      frameCpuMsAvg: 0,
      controllerCpuMsAvg: 0,
      playerCpuMsAvg: 0,
      effectsCpuMsAvg: 0,
      renderCpuMsAvg: 0,
      lightingCpuMsAvg: 0,
      lampCpuMsAvg: 0,
      glassCpuMsAvg: 0,
      grassCpuMsAvg: 0,
      vergeCpuMsAvg: 0,
      leafCpuMsAvg: 0,
      fungusCpuMsAvg: 0,
      bandCpuMsAvg: 0,
      rockCpuMsAvg: 0,
      logCpuMsAvg: 0,
      stickCpuMsAvg: 0,
      needleCpuMsAvg: 0,
      neonCpuMsAvg: 0,
      skyCpuMsAvg: 0,
      fishCpuMsAvg: 0,
    },
  }
  private readonly perfLoggingEnabled =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('perf') === '1'
  private lastPerfLogElapsed = 0
  private readonly perfWindow: PerfWindowSample[] = []
  private readonly perfLongSamples: PerfWindowSample[] = []
  private readonly perfLongTimes: number[] = []
  private readonly perfLongSums: PerfWindowSample = {
    fps: 0,
    frameCpuMs: 0,
    controllerCpuMs: 0,
    playerCpuMs: 0,
    effectsCpuMs: 0,
    renderCpuMs: 0,
    lightingCpuMs: 0,
    lampCpuMs: 0,
    glassCpuMs: 0,
    grassCpuMs: 0,
    vergeCpuMs: 0,
    leafCpuMs: 0,
    fungusCpuMs: 0,
    bandCpuMs: 0,
    rockCpuMs: 0,
    logCpuMs: 0,
    stickCpuMs: 0,
    needleCpuMs: 0,
    neonCpuMs: 0,
    skyCpuMs: 0,
    fishCpuMs: 0,
  }
  private readonly perfWindowSums: PerfWindowSample = {
    fps: 0,
    frameCpuMs: 0,
    controllerCpuMs: 0,
    playerCpuMs: 0,
    effectsCpuMs: 0,
    renderCpuMs: 0,
    lightingCpuMs: 0,
    lampCpuMs: 0,
    glassCpuMs: 0,
    grassCpuMs: 0,
    vergeCpuMs: 0,
    leafCpuMs: 0,
    fungusCpuMs: 0,
    bandCpuMs: 0,
    rockCpuMs: 0,
    logCpuMs: 0,
    stickCpuMs: 0,
    needleCpuMs: 0,
    neonCpuMs: 0,
    skyCpuMs: 0,
    fishCpuMs: 0,
  }

  private sceneryFoliageSeasonForState(state: number): LeafPileSeason {
    const step = THREE.MathUtils.clamp(Math.round(state), 0, 3)
    switch (step) {
      case 0:
        return 'spring'
      case 1:
        return 'summer'
      case 2:
        return 'autumn'
      case 3:
      default:
        return 'winter'
    }
  }

  private resolvedSceneryFoliageSeason(): LeafPileSeason {
    return this.sceneryFoliageSeasonOverride ?? this.sceneryFoliageSeasonForState(this.grassFieldParams.state)
  }

  private syncSceneryFoliageStateFromGrass(): void {
    if (!this.sceneryMode) return
    const season = this.resolvedSceneryFoliageSeason()
    this.grassFieldParams.colorSeason = season
    this.grassEffect.setParams({ colorSeason: season })
    this.leafPileParams.season = season
    this.leafPileEffect.setSurface(buildLeafPileSeasonSurface(season))
    this.shrubFieldEffect.setSurface(buildShrubSeasonSurface(season), seedCursor)
    this.treeFieldEffect.setSurface(buildTreeSeasonSurface(season), seedCursor)
    this.logFieldEffect.setSurface(buildLogSeasonSurface(season), seedCursor)
    this.leafPileDirty = true
    this.shrubFieldDirty = true
    this.treeFieldDirty = true
    this.logFieldDirty = true
  }
  private static readonly PERF_WINDOW_FRAMES = 45
  private static readonly PERF_LONG_WINDOW_MS = 30_000
  /** Grass uses a tighter disc than sparse props because it also gets a frustum pass. */
  /** Slightly tighter than full mask so idle grass/layout work stays inside the 60fps budget. */
  private static readonly SCENERY_GRASS_VIEW_CULL_RADIUS = 72
  private static readonly PLAYGROUND_GRASS_VIEW_CULL_RADIUS = 52
  /** Tighter than grass: leaf/stick layout skips distant slots; motion integrates off-screen. */
  private static readonly SCENERY_CLUTTER_VIEW_CULL_RADIUS = 52
  private static readonly PLAYGROUND_CLUTTER_VIEW_CULL_RADIUS = 40
  private static readonly GRASS_VIEW_CULL_PADDING = 18
  private static readonly CLUTTER_VIEW_CULL_PADDING = 26
  /**
   * Third-person: blade updates use a disc-only pass (no frustum on cells — avoids flicker).
   * Shift the disc center forward along view so we do not spend CPU on grass behind the camera.
   */
  private static readonly PLAYGROUND_GRASS_CULL_FORWARD_BIAS_MAX = 22
  /** Intact town facades can idle when they are both distant and offscreen. */
  private static readonly PLAYGROUND_FACADE_IDLE_VISIBLE_DISTANCE = 30
  /** Neon walls are large; keep a little more idle range so they still feel alive nearby. */
  private static readonly PLAYGROUND_NEON_IDLE_VISIBLE_DISTANCE = 34
  /** Window and lamp glass are small enough to freeze sooner when intact and offscreen. */
  private static readonly PLAYGROUND_GLASS_IDLE_VISIBLE_DISTANCE = 24
  /** Camera-centered disc + frustum for grass in both demos. */
  private readonly grassViewCullBundle: PresetLayoutViewCull
  /** Same camera/frustum as grass; smaller radius for leaf pile + stick field layout culling. */
  private readonly clutterViewCullBundle: PresetLayoutViewCull
  private readonly sceneryProjScreenMatrix = new THREE.Matrix4()
  private readonly sceneryFrustum = new THREE.Frustum()

  constructor(host: HTMLElement, options?: PlaygroundRuntimeOptions) {
    this.sceneryMode = options?.scenery === true
    this.canvas.style.cursor = this.sceneryMode ? 'none' : ''
    this.controllerConfig.firstPerson = this.sceneryMode
    this.grassViewCullBundle = {
      cameraWorld: new THREE.Vector3(),
      radius: this.sceneryMode
        ? PlaygroundRuntime.SCENERY_GRASS_VIEW_CULL_RADIUS
        : PlaygroundRuntime.PLAYGROUND_GRASS_VIEW_CULL_RADIUS,
      padding: PlaygroundRuntime.GRASS_VIEW_CULL_PADDING,
    }
    this.clutterViewCullBundle = {
      cameraWorld: new THREE.Vector3(),
      radius: this.sceneryMode
        ? PlaygroundRuntime.SCENERY_CLUTTER_VIEW_CULL_RADIUS
        : PlaygroundRuntime.PLAYGROUND_CLUTTER_VIEW_CULL_RADIUS,
      padding: PlaygroundRuntime.CLUTTER_VIEW_CULL_PADDING,
    }
    this.movementBounds = this.sceneryMode ? SCENERY_BOUNDS : PLAYGROUND_BOUNDS
    this.spawnConfig = this.sceneryMode ? SCENERY_SPAWN : PLAYGROUND_SPAWN

    this.grassEffect = createGrassEffect({
      surface: buildGrassStateSurface(DEFAULT_GRASS_FIELD_PARAMS.state),
      seedCursor,
      initialParams: this.grassFieldParams,
      terrainRelief: this.sceneryMode ? this.sceneryTerrainRelief : null,
      placementMask: this.sceneryMode
        ? {
            bounds: SCENERY_BOUNDS,
            excludeAtXZ: () => false,
            coverageMultiplierAtXZ: (x, z) => this.sceneryWorldAuthoring.getGrassCoverageMultiplierAtXZ(x, z),
          }
        : {
            bounds: PLAYGROUND_BOUNDS,
            excludeAtXZ: (x, z) => isCrossRoadAsphalt(x, z) || isInsideBuildingInterior(x, z),
            coverageMultiplierAtXZ: (x, z) => (isVergeStrip(x, z) ? 1.14 : 1),
          },
    })
    if (this.sceneryMode) {
      this.grassFieldParams.colorSeason = this.resolvedSceneryFoliageSeason()
      this.grassFieldParams = {
        ...this.grassFieldParams,
        burnRadius: 0.52,
        burnSpreadSpeed: 0.15,
        burnMaxRadius: 5.6,
        /** Matches slow laser burns; avoids fast decay if a burn omits per-shot `recoveryRate`. */
        burnRecoveryRate: 0.00014,
      }
      this.grassEffect.setParams(this.grassFieldParams)
      this.userBandLayoutDensity = 0.66
      this.vergeBandParams = {
        ...DEFAULT_BAND_FIELD_PARAMS,
        layoutDensity: this.userBandLayoutDensity,
        sizeScale: 1.08,
        bandWidth: 2.6,
        edgeSoftness: 1.55,
      }
      this.leafPileParams = {
        ...DEFAULT_LEAF_PILE_BAND_PARAMS,
        ...SCENERY_LEAF_PILE_BURN_PARAMS,
        layoutDensity: this.userBandLayoutDensity * 0.78,
        sizeScale: 1.38,
        bandWidth: 2.45,
        edgeSoftness: 1.8,
        season: this.resolvedSceneryFoliageSeason(),
      }
      this.userRockLayoutDensity = 0.48
      this.rockFieldParams = {
        ...DEFAULT_ROCK_FIELD_PARAMS,
        layoutDensity: this.userRockLayoutDensity,
        sizeScale: 1.28,
      }
      this.userShrubLayoutDensity = 1
      this.shrubFieldParams = {
        ...DEFAULT_SHRUB_FIELD_PARAMS,
        layoutDensity: this.userShrubLayoutDensity,
        sizeScale: 2.25,
        heightScale: 3,
      }
      this.userTreeLayoutDensity = 0.56
      this.treeFieldParams = {
        ...DEFAULT_TREE_FIELD_PARAMS,
        layoutDensity: this.userTreeLayoutDensity,
        sizeScale: 1.7,
        heightScale: 1.85,
        crownScale: 1.45,
        trunkBurnSpreadSpeed: 0,
        trunkBurnRecoveryRate: 0,
      }
      this.userLogLayoutDensity = 0.26
      this.logFieldParams = {
        ...DEFAULT_LOG_FIELD_PARAMS,
        layoutDensity: this.userLogLayoutDensity,
        sizeScale: 1.08,
        lengthScale: 1.36,
      }
      this.userStickLayoutDensity = 0.5
      this.stickFieldParams = {
        ...DEFAULT_STICK_FIELD_PARAMS,
        layoutDensity: this.userStickLayoutDensity,
        sizeScale: 2,
        lengthScale: 2.2,
      }
      this.userNeedleLayoutDensity = 0.5
      this.needleLitterParams = {
        ...DEFAULT_NEEDLE_LITTER_FIELD_PARAMS,
        ...SCENERY_NEEDLE_LITTER_BURN_PARAMS,
        layoutDensity: this.userNeedleLayoutDensity,
        sizeScale: 1.3,
      }
    } else {
      this.grassFieldParams = { ...this.grassFieldParams, burnRecoveryRate: 0.00015 }
      this.grassEffect.setParams(this.grassFieldParams)
    }
    this.vergeBandEffect = createBandFieldEffect({
      surface: getPreparedBandSurface(),
      seedCursor,
      appearance: 'scrub',
      initialParams: this.vergeBandParams,
      placementMask: this.sceneryMode
        ? {
            bounds: SCENERY_BOUNDS,
            includeAtXZ: (x, z) => this.sceneryWorldAuthoring.isInsideUnderstoryZone(x, z),
            distanceToBandAtXZ: (x, z) => this.sceneryWorldAuthoring.getUnderstoryDistanceAtXZ(x, z),
          }
        : {
            bounds: PLAYGROUND_BOUNDS,
            includeAtXZ: (x, z) => isVergeStrip(x, z) && !isInsideBuildingInterior(x, z),
            distanceToBandAtXZ: getVergeStripDistanceAtXZ,
          },
    })
    this.leafPileEffect = createLeafPileBandEffect({
      seedCursor,
      surface: this.sceneryMode ? buildLeafPileSeasonSurface(this.resolvedSceneryFoliageSeason()) : undefined,
      initialParams: this.leafPileParams,
      placementMask: this.sceneryMode
        ? {
            bounds: SCENERY_BOUNDS,
            includeAtXZ: (x, z) => this.sceneryWorldAuthoring.isInsideLeafLitterZone(x, z),
            distanceToBandAtXZ: (x, z) => this.sceneryWorldAuthoring.getLeafLitterDistanceAtXZ(x, z),
          }
        : {
            bounds: { minX: -4.2, maxX: 4.2, minZ: -4.2, maxZ: 4.2 },
            includeAtXZ: (x, z) =>
              isCrossRoadAsphalt(x, z) &&
              isInsideIntersectionLeafPile(x, z),
            distanceToBandAtXZ: distanceToIntersectionLeafPileAtXZ,
          },
    })
    this.fungusBandEffect = createFungusSeamEffect({
      surface: getPreparedFungusBandSurface(),
      seedCursor,
      initialParams: this.fungusBandParams,
      placementMask: this.sceneryMode
        ? {
            bounds: SCENERY_BOUNDS,
            includeAtXZ: () => false,
            distanceToBandAtXZ: () => 1e9,
          }
        : {
            bounds: FUNGUS_SEAM_ZONE,
            includeAtXZ: isInsideFungusSeamZone,
            distanceToBandAtXZ: distanceToFungusSeamAtXZ,
          },
    })
    this.rockFieldEffect = createRockFieldEffect({
      surface: getPreparedRockSurface(),
      seedCursor,
      initialParams: this.rockFieldParams,
      placementMask: this.sceneryMode
        ? {
            bounds: SCENERY_BOUNDS,
            includeAtXZ: (x, z) => this.sceneryWorldAuthoring.isInsideRockZone(x, z),
          }
        : {
            bounds: PLAYGROUND_BOUNDS,
            includeAtXZ: isInsideRubbleZone,
          },
    })
    this.shrubFieldEffect = createShrubFieldEffect({
      surface: this.sceneryMode
        ? buildShrubSeasonSurface(this.resolvedSceneryFoliageSeason())
        : getPreparedShrubSurface(),
      seedCursor,
      initialParams: this.shrubFieldParams,
      placementMask: this.sceneryMode
        ? {
            bounds: SCENERY_BOUNDS,
            includeAtXZ: (x, z) => this.sceneryWorldAuthoring.isInsideShrubZone(x, z),
          }
        : {
            bounds: PLAYGROUND_BOUNDS,
            includeAtXZ: () => false,
          },
    })
    this.treeFieldEffect = createTreeFieldEffect({
      surface: this.sceneryMode
        ? buildTreeSeasonSurface(this.resolvedSceneryFoliageSeason())
        : getPreparedTreeSurface(),
      seedCursor,
      initialParams: this.treeFieldParams,
      placementMask: this.sceneryMode
        ? {
            bounds: SCENERY_BOUNDS,
            includeAtXZ: (x, z) => this.sceneryWorldAuthoring.isInsideTreeZone(x, z),
          }
        : {
            bounds: PLAYGROUND_BOUNDS,
            includeAtXZ: () => false,
          },
    })
    this.logFieldEffect = createLogFieldEffect({
      surface: this.sceneryMode
        ? buildLogSeasonSurface(this.resolvedSceneryFoliageSeason())
        : getPreparedLogSurface(),
      seedCursor,
      initialParams: this.logFieldParams,
      placementMask: this.sceneryMode
        ? {
            bounds: SCENERY_BOUNDS,
            includeAtXZ: (x, z) => this.sceneryWorldAuthoring.isInsideLogZone(x, z),
          }
        : {
            bounds: PLAYGROUND_BOUNDS,
            includeAtXZ: () => false,
          },
    })
    this.stickFieldEffect = createStickFieldEffect({
      surface: getPreparedStickSurface(),
      seedCursor,
      initialParams: this.stickFieldParams,
      placementMask: this.sceneryMode
        ? {
            bounds: SCENERY_BOUNDS,
            includeAtXZ: (x, z) => this.sceneryWorldAuthoring.isInsideStickZone(x, z),
          }
        : {
            bounds: PLAYGROUND_BOUNDS,
            includeAtXZ: () => false,
          },
    })
    this.needleLitterEffect = createNeedleLitterFieldEffect({
      surface: getPreparedNeedleLitterSurface(),
      seedCursor,
      initialParams: this.needleLitterParams,
      placementMask: this.sceneryMode
        ? {
            bounds: SCENERY_BOUNDS,
            includeAtXZ: (x, z) => this.sceneryWorldAuthoring.isInsideNeedleZone(x, z),
          }
        : {
            bounds: PLAYGROUND_BOUNDS,
            includeAtXZ: () => false,
          },
    })

    this.host = host
    this.canvas.className = 'canvas'
    this.canvas.tabIndex = 0
    this.camera.position.set(0, 2.2, 10.8)

    this.skybox = applyPlaygroundAtmosphere(this.scene)
    addPlaygroundLighting(this.scene)

    if (this.sceneryMode) {
      this.townGroup = new THREE.Group()
      this.cameraObstacles = []
      this.lampLights = []
      this.lampGlobes = []
    } else {
      const townScene = createTownIntersectionScene()
      this.townGroup = townScene.root
      this.cameraObstacles = townScene.cameraObstacles
      this.lampLights = townScene.lampLights
      this.lampGlobes = townScene.lampGlobes
      this.scene.add(this.townGroup)

      const shutterGround = this.grassEffect.getWalkHeightAtWorld(SHUTTER_WALL_LAYOUT.x, SHUTTER_WALL_LAYOUT.z)
      this.shutterEffect.group.position.set(
        SHUTTER_WALL_LAYOUT.x,
        shutterGround + SHUTTER_WALL_LAYOUT.wallCenterHeight,
        SHUTTER_WALL_LAYOUT.z,
      )

      const ivyGround = this.grassEffect.getWalkHeightAtWorld(IVY_WALL_LAYOUT.x, IVY_WALL_LAYOUT.z)
      this.ivyEffect.group.position.set(
        IVY_WALL_LAYOUT.x,
        ivyGround + IVY_WALL_LAYOUT.wallCenterHeight,
        IVY_WALL_LAYOUT.z,
      )
      this.ivyEffect.group.rotation.y = Math.PI / 2

      for (let i = 0; i < this.neonSignEffects.length; i++) {
        const barrier = NEON_BARRIERS[i]!
        const effect = this.neonSignEffects[i]!
        const neonGroundY = this.grassEffect.getGroundHeightAtWorld(barrier.x, barrier.z)
        effect.group.position.set(barrier.x, neonGroundY + 0.06, barrier.z)
        effect.group.rotation.y = barrier.rotationY
      }
    }

    this.cameraFill.position.set(0, 0.85, 2.6)
    this.camera.add(this.cameraFill)
    this.scene.add(this.camera)

    const lamps: ShellSurfaceEffect[] = []
    if (!this.sceneryMode) {
      const bulbY = TOWN_ROAD_SURFACE_Y + STREET_LAMP_BULB_Y_OFFSET
      for (let i = 0; i < STREET_LIGHT_XZ.length; i++) {
        const pos = STREET_LIGHT_XZ[i]!
        const lampEffect = createShellSurfaceEffect({
          surface: getPreparedGlassSurface(),
          seedCursor,
          effectId: `street-lamp-glass-${i}`,
          appearance: 'glassBulb',
          initialParams: this.glassSurfaceParams,
        })
        lampEffect.group.position.set(pos.x, bulbY, pos.z)
        lampEffect.group.rotation.y = Math.atan2(-pos.x, -pos.z)
        lampEffect.group.scale.setScalar(0.152)
        this.scene.add(lampEffect.group)
        lamps.push(lampEffect)
      }
    }
    this.lampEffects = lamps

    const windowGlassEffects: ShellSurfaceEffect[] = []
    if (!this.sceneryMode) {
      for (let i = 0; i < WINDOW_GLASS_LAYOUTS.length; i++) {
        const layout = WINDOW_GLASS_LAYOUTS[i]!
        const glassEffect = createShellSurfaceEffect({
          surface: getPreparedGlassSurface(),
          seedCursor,
          effectId: `building-window-glass-${i}`,
          appearance: 'glass',
          initialParams: this.glassSurfaceParams,
        })
        // Match static pane XY footprint (0.9). Do not mirror pane `translateZ(-0.05)` here — the Weft
        // group’s local axes + thin `scaleZ` recess the glass into the wall if we offset the same way.
        glassEffect.group.position.set(layout.x, layout.y, layout.z)
        glassEffect.group.rotation.y = layout.rotationY
        glassEffect.group.scale.set(layout.scaleX * 0.9, layout.scaleY * 0.9, layout.scaleZ)
        this.scene.add(glassEffect.group)
        windowGlassEffects.push(glassEffect)
      }
    }
    this.windowGlassEffects = windowGlassEffects

    const raycastList: THREE.Object3D[] = this.sceneryMode
      ? [this.grassEffect.interactionMesh, this.rockFieldEffect.interactionMesh, this.treeFieldEffect.trunkInteractionMesh]
      : [
          this.shutterEffect.interactionMesh,
          this.ivyEffect.interactionMesh,
          this.grassEffect.interactionMesh,
          this.rockFieldEffect.interactionMesh,
          this.treeFieldEffect.trunkInteractionMesh,
        ]
    if (!this.sceneryMode) {
      for (const e of this.neonSignEffects) {
        raycastList.push(e.interactionMesh)
      }
      for (const e of this.lampEffects) {
        raycastList.push(e.interactionMesh)
      }
      for (const e of this.windowGlassEffects) {
        raycastList.push(e.interactionMesh)
      }
    }
    this.raycastTargets = raycastList

    this.collisionDebugTiles = this.createCollisionDebugTiles()
    this.collisionDebugGroup.visible = false
    this.createTerrainAuthoringDebugOverlay()
    this.terrainAuthoringDebugGroup.visible = false

    this.scene.add(this.grassEffect.group)
    this.scene.add(this.vergeBandEffect.group)
    this.scene.add(this.leafPileEffect.group)
    if (!this.sceneryMode) {
      this.fungusBandEffect.group.renderOrder = 2
      this.scene.add(this.fungusBandEffect.group)
    }
    this.scene.add(this.rockFieldEffect.group)
    this.scene.add(this.shrubFieldEffect.group)
    this.scene.add(this.treeFieldEffect.group)
    this.scene.add(this.logFieldEffect.group)
    this.scene.add(this.stickFieldEffect.group)
    this.scene.add(this.needleLitterEffect.group)
    this.needleLitterEffect.group.visible = false
    this.scene.add(this.starSkyEffect.group)
    this.scene.add(this.collisionDebugGroup)
    this.scene.add(this.terrainAuthoringDebugGroup)
    if (!this.sceneryMode) {
      this.scene.add(this.shutterEffect.group)
      this.scene.add(this.ivyEffect.group)
      for (const effect of this.neonSignEffects) {
        this.scene.add(effect.group)
      }
    }

    this.scene.add(this.controller.player.group)
    this.camera.add(this.controller.player.reticle)
    this.controller.player.setVisualVisible(!this.sceneryMode)
    this.controller.player.setReticleVisible(true)

    const makeLaserMat = (hex: number, opacity: number): THREE.MeshBasicMaterial =>
      new THREE.MeshBasicMaterial({
        color: hex,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    const outerGeom = new THREE.CylinderGeometry(0.038, 0.038, 1, 12)
    const coreGeom = new THREE.CylinderGeometry(0.012, 0.012, 1, 8)
    this.laserBeamOuter = new THREE.Mesh(outerGeom, makeLaserMat(0xff1538, 0.88))
    this.laserBeamCore = new THREE.Mesh(coreGeom, makeLaserMat(0xffeaee, 0.95))
    this.laserBeamMeshes = [this.laserBeamOuter, this.laserBeamCore]
    this.laserBeamOuter.frustumCulled = false
    this.laserBeamCore.frustumCulled = false
    this.laserBeamOuter.renderOrder = 12
    this.laserBeamCore.renderOrder = 13
    this.laserBeamGroup = new THREE.Group()
    this.laserBeamGroup.add(this.laserBeamOuter)
    this.laserBeamGroup.add(this.laserBeamCore)
    this.laserBeamGroup.visible = false
    this.scene.add(this.laserBeamGroup)

    this.resetPlayer()
  }

  async initialize(): Promise<void> {
    this.host.appendChild(this.canvas)
    this.renderer = await createWebGPURenderer(this.canvas)

    if (this.disposed) {
      this.renderer.dispose()
      return
    }

    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.08

    this.resize()
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.host)
    window.addEventListener('mousedown', this.handleWindowMouseDownForShoot, true)
    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
    this.canvas.addEventListener('pointermove', this.handlePointerMove)
    this.canvas.addEventListener('pointerup', this.handlePointerUp)
    this.canvas.addEventListener('pointercancel', this.handlePointerCancel)
    this.canvas.addEventListener('lostpointercapture', this.handleLostPointerCapture)
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false })
    this.canvas.addEventListener('contextmenu', this.handleContextMenu)
    document.addEventListener('pointerlockchange', this.handlePointerLockChange)
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
    window.addEventListener('blur', this.handleWindowBlur)

    this.frame()
  }

  setShellSurfaceParams(params: Partial<ShellSurfaceParams>): void {
    this.shellSurfaceParams = { ...this.shellSurfaceParams, ...params }
    this.shutterEffect.setParams(this.shellSurfaceParams)
    this.ivyEffect.setParams(this.shellSurfaceParams)
  }

  setGlassSurfaceParams(params: Partial<ShellSurfaceParams>): void {
    this.glassSurfaceParams = { ...this.glassSurfaceParams, ...params }
    for (const lamp of this.lampEffects) {
      lamp.setParams(this.glassSurfaceParams)
    }
    for (const glass of this.windowGlassEffects) {
      glass.setParams(this.glassSurfaceParams)
    }
  }

  setGrassFieldParams(params: Partial<GrassFieldParams>): void {
    this.grassFieldParams = { ...this.grassFieldParams, ...params }
    if (params.layoutDensity !== undefined) {
      this.userGrassLayoutDensity = THREE.MathUtils.clamp(
        params.layoutDensity,
        0,
        DEMO_GRASS_LAYOUT_DENSITY_MAX,
      )
    }
    this.grassFieldParams.layoutDensity =
      this.userGrassLayoutDensity * PLAYGROUND_GRASS_LAYOUT_SCALE
    if (params.state !== undefined) {
      this.grassEffect.setSurface(buildGrassStateSurface(this.grassFieldParams.state))
      this.syncSceneryFoliageStateFromGrass()
    }
    this.grassEffect.setParams(this.grassFieldParams)
  }

  setSceneryFoliageSeasonOverride(season: LeafPileSeason | null): void {
    this.sceneryFoliageSeasonOverride = season
    this.syncSceneryFoliageStateFromGrass()
  }

  setBandFieldParams(params: {
    layoutDensity?: number
    vergeSizeScale?: number
    leafPileSizeScale?: number
    fungusSizeScale?: number
    fungusBurnRecoveryRate?: number
    fungusBurnSpreadSpeed?: number
    fungusBurnBlastSize?: number
    edgeSoftness?: number
    vergeBandWidth?: number
    leafPileBandWidth?: number
    leafPileSeason?: LeafPileSeason
    fungusBandWidth?: number
    showVergeBand?: boolean
    showLeafPiles?: boolean
    showFungusBand?: boolean
  }): void {
    if (params.layoutDensity !== undefined) {
      this.userBandLayoutDensity = params.layoutDensity
    }
    if (params.vergeSizeScale !== undefined) {
      this.vergeBandParams.sizeScale = params.vergeSizeScale
    }
    if (params.leafPileSizeScale !== undefined) {
      this.leafPileParams.sizeScale = params.leafPileSizeScale
    }
    if (params.fungusSizeScale !== undefined) {
      this.fungusBandParams.sizeScale = params.fungusSizeScale
    }
    if (params.fungusBurnRecoveryRate !== undefined) {
      this.fungusBandParams.recoveryRate = params.fungusBurnRecoveryRate
    }
    if (params.fungusBurnSpreadSpeed !== undefined) {
      this.fungusBandParams.burnSpreadSpeed = params.fungusBurnSpreadSpeed
    }
    if (params.fungusBurnBlastSize !== undefined) {
      this.fungusBandParams.burnRadius = DEFAULT_FUNGUS_SEAM_PARAMS.burnRadius * params.fungusBurnBlastSize
      this.fungusBandParams.burnMaxRadius =
        DEFAULT_FUNGUS_SEAM_PARAMS.burnMaxRadius * params.fungusBurnBlastSize
    }
    if (params.edgeSoftness !== undefined) {
      this.vergeBandParams.edgeSoftness = params.edgeSoftness
      this.leafPileParams.edgeSoftness = params.edgeSoftness * 0.9
      this.fungusBandParams.edgeSoftness = params.edgeSoftness * 1.25
    }
    if (params.vergeBandWidth !== undefined) {
      this.vergeBandParams.bandWidth = params.vergeBandWidth
    }
    if (params.leafPileBandWidth !== undefined) {
      this.leafPileParams.bandWidth = params.leafPileBandWidth
    }
    if (params.leafPileSeason !== undefined && !this.sceneryMode) {
      this.leafPileParams.season = params.leafPileSeason
    }
    if (params.fungusBandWidth !== undefined) {
      this.fungusBandParams.bandWidth = params.fungusBandWidth
    }
    const scaledDensity = this.userBandLayoutDensity * PLAYGROUND_GRASS_LAYOUT_SCALE
    this.vergeBandParams.layoutDensity = scaledDensity
    this.leafPileParams.layoutDensity = scaledDensity * 0.78
    this.fungusBandParams.layoutDensity = scaledDensity * (this.sceneryMode ? 1.05 : 1)
    this.vergeBandEffect.setParams(this.vergeBandParams)
    this.leafPileEffect.setParams(this.leafPileParams)
    if (!this.sceneryMode) {
      this.fungusBandEffect.setParams(this.fungusBandParams)
      if (params.showFungusBand !== undefined) {
        this.fungusBandEffect.group.visible = params.showFungusBand
      }
      this.fungusBandDirty = true
    }
    if (params.showVergeBand !== undefined) {
      this.vergeBandEffect.group.visible = params.showVergeBand
    }
    if (params.showLeafPiles !== undefined) {
      this.leafPileEffect.group.visible = params.showLeafPiles
    }
    this.vergeBandDirty = true
    this.leafPileDirty = true
  }

  setRockFieldParams(params: Partial<RockFieldParams> & { showRocks?: boolean }): void {
    this.rockFieldParams = { ...this.rockFieldParams, ...params }
    if (params.layoutDensity !== undefined) {
      this.userRockLayoutDensity = params.layoutDensity
    }
    this.rockFieldParams.layoutDensity =
      this.userRockLayoutDensity * PLAYGROUND_ROCK_LAYOUT_SCALE
    this.rockFieldEffect.setParams(this.rockFieldParams)
    if (params.showRocks !== undefined) {
      this.rockFieldEffect.group.visible = params.showRocks
    }
    this.rockFieldDirty = true
  }

  setShrubFieldParams(params: Partial<ShrubFieldParams> & { showShrubs?: boolean }): void {
    this.shrubFieldParams = { ...this.shrubFieldParams, ...params }
    if (params.layoutDensity !== undefined) {
      this.userShrubLayoutDensity = params.layoutDensity
    }
    this.shrubFieldParams.layoutDensity =
      this.userShrubLayoutDensity * PLAYGROUND_ROCK_LAYOUT_SCALE
    this.shrubFieldEffect.setParams(this.shrubFieldParams)
    if (params.showShrubs !== undefined) {
      this.shrubFieldEffect.group.visible = params.showShrubs
    }
    this.shrubFieldDirty = true
  }

  setTreeFieldParams(params: Partial<TreeFieldParams> & { showTrees?: boolean }): void {
    this.treeFieldParams = { ...this.treeFieldParams, ...params }
    if (params.layoutDensity !== undefined) {
      this.userTreeLayoutDensity = params.layoutDensity
    }
    this.treeFieldParams.layoutDensity =
      this.userTreeLayoutDensity * PLAYGROUND_ROCK_LAYOUT_SCALE
    this.treeFieldEffect.setParams(this.treeFieldParams)
    if (params.showTrees !== undefined) {
      this.treeFieldEffect.group.visible = params.showTrees
    }
    this.treeFieldDirty = true
  }

  setLogFieldParams(params: Partial<LogFieldParams> & { showLogs?: boolean }): void {
    this.logFieldParams = { ...this.logFieldParams, ...params }
    if (params.layoutDensity !== undefined) {
      this.userLogLayoutDensity = params.layoutDensity
    }
    this.logFieldParams.layoutDensity =
      this.userLogLayoutDensity * PLAYGROUND_ROCK_LAYOUT_SCALE
    this.logFieldEffect.setParams(this.logFieldParams)
    if (params.showLogs !== undefined) {
      this.logFieldEffect.group.visible = params.showLogs
    }
    this.logFieldDirty = true
  }

  setStickFieldParams(params: Partial<StickFieldParams> & { showSticks?: boolean }): void {
    this.stickFieldParams = { ...this.stickFieldParams, ...params }
    if (params.layoutDensity !== undefined) {
      this.userStickLayoutDensity = params.layoutDensity
    }
    this.stickFieldParams.layoutDensity =
      this.userStickLayoutDensity * PLAYGROUND_ROCK_LAYOUT_SCALE
    this.stickFieldEffect.setParams(this.stickFieldParams)
    if (params.showSticks !== undefined) {
      this.stickFieldEffect.group.visible = params.showSticks
    }
    this.stickFieldDirty = true
  }

  setNeedleLitterFieldParams(
    params: Partial<NeedleLitterFieldParams> & { showNeedles?: boolean },
  ): void {
    this.needleLitterParams = { ...this.needleLitterParams, ...params }
    if (params.layoutDensity !== undefined) {
      this.userNeedleLayoutDensity = params.layoutDensity
    }
    this.needleLitterParams.layoutDensity =
      this.userNeedleLayoutDensity * PLAYGROUND_GRASS_LAYOUT_SCALE
    this.needleLitterEffect.setParams(this.needleLitterParams)
    if (params.showNeedles !== undefined) {
      this.needleLitterEffect.group.visible = params.showNeedles
    }
    this.needleLitterDirty = true
  }

  setSceneryWorldFieldParams(params: Partial<SceneryWorldFieldParams>): void {
    this.sceneryWorldFieldParams = { ...this.sceneryWorldFieldParams, ...params }
    this.rebuildSceneryWorldAuthoring()
    if (!this.sceneryMode) return

    // Rebuild cached grass placement so field-driven coverage changes take effect immediately.
    this.grassEffect.setSurface(buildGrassStateSurface(this.grassFieldParams.state))
    this.markSceneryGroundDependentEffectsDirty()
  }

  setSceneryTerrainReliefParams(params: Partial<SceneryTerrainReliefParams>): void {
    this.sceneryTerrainReliefParams = { ...this.sceneryTerrainReliefParams, ...params }
    this.sceneryTerrainRelief.setParams(this.sceneryTerrainReliefParams)
    this.rebuildSceneryWorldAuthoring()
    if (!this.sceneryMode) return

    this.grassEffect.setTerrainRelief(this.sceneryTerrainRelief)
    this.updateTerrainAuthoringDebugOverlay()
    this.markSceneryGroundDependentEffectsDirty()
  }

  setSceneryMotionResponse(params: Partial<SceneryMotionResponseParams>): void {
    this.sceneryMotionResponse = { ...this.sceneryMotionResponse, ...params }
  }

  private rebuildSceneryWorldAuthoring(): void {
    this.sceneryWorldAuthoring = createSceneryWorldAuthoring(
      this.sceneryWorldFieldParams,
      this.sceneryTerrainRelief,
      this.sceneryTerrainReliefParams,
    )
  }

  private markSceneryGroundDependentEffectsDirty(): void {
    this.vergeBandDirty = true
    this.leafPileDirty = true
    this.rockFieldDirty = true
    this.shrubFieldDirty = true
    this.treeFieldDirty = true
    this.logFieldDirty = true
    this.stickFieldDirty = true
    this.needleLitterDirty = true
  }

  setFireWallParams(params: Partial<FireWallParams>): void {
    for (const effect of this.neonSignEffects) {
      effect.setParams({ ...params, appearance: 'neon' })
    }
  }

  setStarSkyParams(params: Partial<StarSkyParams>): void {
    this.starSkyParams = { ...this.starSkyParams, ...params }
    if (params.layoutDensity !== undefined) {
      this.userStarLayoutDensity = params.layoutDensity
    }
    this.starSkyParams.layoutDensity =
      this.userStarLayoutDensity * PLAYGROUND_STAR_LAYOUT_SCALE
    this.starSkyEffect.setParams(this.starSkyParams)
  }

  setCollisionDebugVisible(visible: boolean): void {
    this.collisionDebugVisible = visible
    this.collisionDebugGroup.visible = visible
    if (visible) {
      this.updateCollisionDebugOverlay()
    }
  }

  setTerrainAuthoringDebugVisible(visible: boolean): void {
    this.terrainAuthoringDebugGroup.visible = visible && this.sceneryMode
    if (this.terrainAuthoringDebugGroup.visible) {
      this.updateTerrainAuthoringDebugOverlay()
    }
  }

  clearFishWounds(): void {
    this.shutterEffect.clearWounds()
    this.ivyEffect.clearWounds()
  }

  clearGlassWounds(): void {
    for (const lamp of this.lampEffects) {
      lamp.clearWounds()
    }
    for (const glass of this.windowGlassEffects) {
      glass.clearWounds()
    }
  }

  clearGrassDisturbances(): void {
    this.grassEffect.clearDisturbances()
  }

  clearGrassBurns(): void {
    this.grassEffect.clearDisturbances()
    this.grassEffect.clearBurns()
  }

  clearTreeTrunkBurns(): void {
    this.treeFieldEffect.clearTrunkBurns()
    this.treeFieldDirty = true
  }

  clearLeafPileDisturbances(): void {
    this.leafPileEffect.clearDisturbances()
    this.leafPileDirty = true
  }

  clearLeafPileBurns(): void {
    this.leafPileEffect.clearBurns()
    this.leafPileDirty = true
  }

  clearStickFieldDisturbances(): void {
    this.stickFieldEffect.clearMotion()
    this.stickFieldDirty = true
  }

  clearLogFieldReactions(): void {
    this.logFieldEffect.clearMotion()
    this.logFieldDirty = true
  }

  clearFireWounds(): void {
    for (const effect of this.neonSignEffects) {
      effect.clearWounds()
    }
  }

  clearSkyWounds(): void {
    this.starSkyEffect.clearWounds()
  }

  clearNeedleLitterBurns(): void {
    this.needleLitterEffect.clearBurns()
    this.needleLitterDirty = true
  }

  clearAllEffects(): void {
    this.clearFishWounds()
    this.clearGlassWounds()
    this.clearGrassDisturbances()
    this.clearGrassBurns()
    this.clearTreeTrunkBurns()
    this.clearLeafPileDisturbances()
    this.clearLeafPileBurns()
    this.clearStickFieldDisturbances()
    this.clearLogFieldReactions()
    this.rockFieldEffect.clearDestruction()
    this.rockFieldDirty = true
    this.clearFireWounds()
    this.clearNeedleLitterBurns()
    this.clearSkyWounds()
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.rafId)
    this.resizeObserver?.disconnect()
    window.removeEventListener('mousedown', this.handleWindowMouseDownForShoot, true)
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    this.canvas.removeEventListener('pointermove', this.handlePointerMove)
    this.canvas.removeEventListener('pointerup', this.handlePointerUp)
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel)
    this.canvas.removeEventListener('lostpointercapture', this.handleLostPointerCapture)
    this.canvas.removeEventListener('wheel', this.handleWheel)
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu)
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange)
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    window.removeEventListener('blur', this.handleWindowBlur)
    this.releaseSceneryPointerLock()
    this.scene.remove(this.townGroup)
    this.scene.remove(this.grassEffect.group)
    this.scene.remove(this.vergeBandEffect.group)
    this.scene.remove(this.leafPileEffect.group)
    this.scene.remove(this.fungusBandEffect.group)
    this.scene.remove(this.shutterEffect.group)
    this.scene.remove(this.ivyEffect.group)
    this.scene.remove(this.rockFieldEffect.group)
    this.scene.remove(this.shrubFieldEffect.group)
    this.scene.remove(this.treeFieldEffect.group)
    this.scene.remove(this.logFieldEffect.group)
    this.scene.remove(this.stickFieldEffect.group)
    this.scene.remove(this.needleLitterEffect.group)
    this.scene.remove(this.starSkyEffect.group)
    for (const effect of this.neonSignEffects) {
      this.scene.remove(effect.group)
    }
    for (const lamp of this.lampEffects) {
      this.scene.remove(lamp.group)
      lamp.dispose()
    }
    for (const glass of this.windowGlassEffects) {
      this.scene.remove(glass.group)
      glass.dispose()
    }
    this.scene.remove(this.controller.player.group)
    this.camera.remove(this.controller.player.reticle)
    this.scene.remove(this.laserBeamGroup)
    this.scene.remove(this.collisionDebugGroup)
    this.scene.remove(this.terrainAuthoringDebugGroup)
    this.laserBeamOuter.geometry.dispose()
    this.laserBeamCore.geometry.dispose()
    ;(this.laserBeamOuter.material as THREE.MeshBasicMaterial).dispose()
    ;(this.laserBeamCore.material as THREE.MeshBasicMaterial).dispose()
    for (const tile of this.collisionDebugTiles) {
      tile.mesh.geometry.dispose()
      tile.mesh.material.dispose()
    }
    if (this.terrainAuthoringDebugMesh) {
      this.terrainAuthoringDebugMesh.geometry.dispose()
      this.terrainAuthoringDebugMesh.material.dispose()
    }
    this.shutterEffect.dispose()
    this.ivyEffect.dispose()
    this.grassEffect.dispose()
    this.vergeBandEffect.dispose()
    this.leafPileEffect.dispose()
    this.fungusBandEffect.dispose()
    this.rockFieldEffect.dispose()
    this.shrubFieldEffect.dispose()
    this.treeFieldEffect.dispose()
    this.logFieldEffect.dispose()
    this.stickFieldEffect.dispose()
    this.needleLitterEffect.dispose()
    this.starSkyEffect.dispose()
    for (const effect of this.neonSignEffects) {
      effect.dispose()
    }
    this.controller.player.dispose()
    this.renderer?.dispose()
    this.timer.dispose()
    this.canvas.remove()
  }

  private resize(): void {
    if (!this.renderer) return

    const width = this.host.clientWidth
    const height = this.host.clientHeight
    if (width <= 0 || height <= 0) return

    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    const cap = PLAYGROUND_PIXEL_RATIO_CAP
    const pixelRatio = Math.min(window.devicePixelRatio || 1, cap)
    this.renderer.setPixelRatio(pixelRatio)
    this.renderer.setSize(width, height, false)
    this.perfStats.viewportWidth = width
    this.perfStats.viewportHeight = height
    this.perfStats.pixelRatio = pixelRatio
  }

  private resetPlayer(): void {
    const spawn = new THREE.Vector3(
      this.spawnConfig.x,
      this.grassEffect.getGroundHeightAtWorld(this.spawnConfig.x, this.spawnConfig.z),
      this.spawnConfig.z,
    )

    this.walkStampDistance = 0
    this.pendingJump = false
    this.controller.setSpawn(spawn, this.spawnConfig.yaw, this.spawnConfig.yaw, this.spawnConfig.pitch)
    if (this.sceneryMode) {
      this.controllerConfig.firstPerson = true
      this.controllerConfig.cameraDistance = 0
      this.controllerConfig.shoulderOffset = 0
      this.controllerConfig.cameraHeight = PlaygroundRuntime.SCENERY_FIRST_PERSON_CAMERA_HEIGHT
    } else {
      this.controllerConfig.firstPerson = false
      this.controllerConfig.cameraDistance = this.zoomDistance
    }
    this.activeFrame = this.controller.update(
      this.camera,
      this.syncFrameInput(),
      this.controllerConfig,
      this.movementBounds,
      this.getPlayerWalkHeightAtWorld,
      1,
      this.resolveHorizontalMove,
    )

    const elapsed = this.timer.getElapsed()
    if (!this.sceneryMode) {
      this.shutterEffect.update(elapsed)
      this.ivyEffect.update(elapsed)
      for (const lamp of this.lampEffects) {
        lamp.update(elapsed)
      }
      for (const glass of this.windowGlassEffects) {
        glass.update(elapsed)
      }
    }
    this.fillGrassViewCullBundle()
    this.grassEffect.update(elapsed, this.grassViewCullBundle)
    this.vergeBandEffect.update(this.getGroundHeightAtWorld)
    this.leafPileEffect.update(elapsed, this.getGroundHeightAtWorld)
    if (!this.sceneryMode) {
      this.fungusBandEffect.update(elapsed, this.getGroundHeightAtWorld)
    }
    this.controller.player.update(0, 'idle')
  }

  private syncFrameInput(): ThirdPersonControllerInput {
    this.frameInput.moveForward = this.inputState.moveForward
    this.frameInput.moveBackward = this.inputState.moveBackward
    this.frameInput.moveLeft = this.inputState.moveLeft
    this.frameInput.moveRight = this.inputState.moveRight
    this.frameInput.sprint = this.inputState.sprint
    this.frameInput.lookActive = this.sceneryMode ? this.sceneryPointerLocked : this.inputState.lookActive
    this.frameInput.lookDeltaX = this.inputState.lookDeltaX
    this.frameInput.lookDeltaY = this.inputState.lookDeltaY
    this.frameInput.jump = this.pendingJump
    this.frameInput.crouch = this.inputState.crouch
    return this.frameInput
  }

  /** Camera-centered disc + frustum for grass in both demos. */
  private fillGrassViewCullBundle(): void {
    const grassCull = this.grassViewCullBundle
    grassCull.cameraWorld.copy(this.camera.position)
    if (!this.sceneryMode && this.activeFrame) {
      const frame = this.activeFrame
      const ax = frame.aimDirection.x
      const az = frame.aimDirection.z
      const hLen = Math.hypot(ax, az)
      if (hLen > 1e-5) {
        const px = frame.playerPosition.x
        const pz = frame.playerPosition.z
        const camToPlayerXZ = Math.hypot(px - this.camera.position.x, pz - this.camera.position.z)
        const bias = Math.min(
          PlaygroundRuntime.PLAYGROUND_GRASS_CULL_FORWARD_BIAS_MAX,
          camToPlayerXZ * 0.7 + 3.5,
        )
        grassCull.cameraWorld.x += (ax / hLen) * bias
        grassCull.cameraWorld.z += (az / hLen) * bias
      }
    }
    grassCull.radius = this.grassViewCullRadius()
    grassCull.padding = this.grassViewCullPadding()
    this.sceneryProjScreenMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse,
    )
    this.sceneryFrustum.setFromProjectionMatrix(this.sceneryProjScreenMatrix)
    grassCull.frustum = this.sceneryFrustum
    const clutter = this.clutterViewCullBundle
    // Use the raw camera position (no forward bias) so the disc is centred on the player,
    // not shifted forward. No frustum: disc-only culling avoids visible pop on nearby slots.
    clutter.cameraWorld.copy(this.camera.position)
    clutter.frustum = undefined
    clutter.radius = this.sceneryMode
      ? PlaygroundRuntime.SCENERY_CLUTTER_VIEW_CULL_RADIUS
      : PlaygroundRuntime.PLAYGROUND_CLUTTER_VIEW_CULL_RADIUS
    clutter.padding = PlaygroundRuntime.CLUTTER_VIEW_CULL_PADDING
  }

  private getGroundHeightAtWorld = (x: number, z: number): number => {
    const gy = this.grassEffect.getGroundHeightAtWorld(x, z)
    if (this.sceneryMode) {
      return gy
    }
    if (isInsideBuildingInterior(x, z)) {
      return Math.max(gy, INTERIOR_FLOOR_Y)
    }
    if (isCrossRoadAsphalt(x, z)) {
      return Math.max(gy, TOWN_ROAD_SURFACE_Y)
    }
    return gy
  }

  private getPlayerWalkHeightAtWorld = (x: number, z: number): number => {
    const gy = this.getGroundHeightAtWorld(x, z)
    if (this.sceneryMode) {
      return gy
    }
    const roofY = this.getRoofHeightAtWorld(x, z, this.getPlayerCollisionProbeY())
    return roofY == null ? gy : Math.max(gy, roofY)
  }

  private getPlayerCollisionProbeY(): number {
    return this.activeFrame?.playerPosition.y ?? this.controller.player.group.position.y
  }

  /** Preset update cadence (every N frames). Excludes scenery-wide floors; see `cadenceFor`. */
  private rawEffectCadence(
    kind: 'grass' | 'leaf' | 'band' | 'stick' | 'log' | 'needle' | 'tree' | 'fish' | 'neon' | 'sky' | 'glass',
  ): number {
    if (kind === 'grass') return 3
    if (kind === 'leaf' || kind === 'band') return 3
    if (kind === 'stick' || kind === 'log') return 3
    if (kind === 'needle' || kind === 'tree') return 4
    if (kind === 'sky') return 4
    if (kind === 'glass') return 4
    return 3
  }

  /**
   * Scenery spans a huge masked region; clutter presets still run full layout when `hasMotion()` stays true
   * (every instance keeps state). Raise minimum cadence so those passes amortize across frames.
   */
  private applySceneryOpenFieldCadenceFloor(
    interval: number,
    kind: 'grass' | 'leaf' | 'band' | 'stick' | 'log' | 'needle' | 'tree' | 'fish' | 'neon' | 'sky' | 'glass',
  ): number {
    if (!this.sceneryMode) return interval
    switch (kind) {
      case 'stick':
        return Math.max(interval, 9)
      case 'log':
        return Math.max(interval, 8)
      case 'leaf':
      case 'band':
        return Math.max(interval, 7)
      case 'grass':
        return Math.max(interval, 6)
      case 'needle':
        return Math.max(interval, 9)
      case 'tree':
        return Math.max(interval, 8)
      case 'sky':
        return Math.max(interval, 6)
      default:
        return interval
    }
  }

  private cadenceFor(
    kind: 'grass' | 'leaf' | 'band' | 'stick' | 'log' | 'needle' | 'tree' | 'fish' | 'neon' | 'sky' | 'glass',
  ): number {
    return this.applySceneryOpenFieldCadenceFloor(this.rawEffectCadence(kind), kind)
  }

  private idleCadenceFor(
    kind: 'grass' | 'leaf' | 'band' | 'stick' | 'log' | 'needle' | 'tree' | 'fish' | 'neon' | 'sky' | 'glass',
  ): number {
    return this.applySceneryOpenFieldCadenceFloor(this.rawEffectCadence(kind), kind)
  }

  private shouldRunCadencedUpdate(interval: number, offset: number): boolean {
    return interval <= 1 || this.frameTick % interval === offset % interval
  }

  private grassViewCullRadius(): number {
    return this.sceneryMode ? 64 : 42
  }

  private grassViewCullPadding(): number {
    return 10
  }

  private shouldUpdateIdleTownEffect(object: THREE.Object3D, maxVisibleDistance: number, boundsRadius: number): boolean {
    object.getWorldPosition(this.effectCullWorld)
    if (this.effectCullWorld.distanceTo(this.camera.position) <= maxVisibleDistance) {
      return true
    }
    this.effectCullSphere.center.copy(this.effectCullWorld)
    this.effectCullSphere.radius = boundsRadius
    return this.sceneryFrustum.intersectsSphere(this.effectCullSphere)
  }

  private pushPerfWindowSample(sample: PerfWindowSample): void {
    this.perfWindow.push(sample)
    this.perfWindowSums.fps += sample.fps
    this.perfWindowSums.frameCpuMs += sample.frameCpuMs
    this.perfWindowSums.controllerCpuMs += sample.controllerCpuMs
    this.perfWindowSums.playerCpuMs += sample.playerCpuMs
    this.perfWindowSums.effectsCpuMs += sample.effectsCpuMs
    this.perfWindowSums.renderCpuMs += sample.renderCpuMs
    this.perfWindowSums.lightingCpuMs += sample.lightingCpuMs
    this.perfWindowSums.lampCpuMs += sample.lampCpuMs
    this.perfWindowSums.glassCpuMs += sample.glassCpuMs
    this.perfWindowSums.grassCpuMs += sample.grassCpuMs
    this.perfWindowSums.vergeCpuMs += sample.vergeCpuMs
    this.perfWindowSums.leafCpuMs += sample.leafCpuMs
    this.perfWindowSums.fungusCpuMs += sample.fungusCpuMs
    this.perfWindowSums.bandCpuMs += sample.bandCpuMs
    this.perfWindowSums.rockCpuMs += sample.rockCpuMs
    this.perfWindowSums.logCpuMs += sample.logCpuMs
    this.perfWindowSums.stickCpuMs += sample.stickCpuMs
    this.perfWindowSums.needleCpuMs += sample.needleCpuMs
    this.perfWindowSums.neonCpuMs += sample.neonCpuMs
    this.perfWindowSums.skyCpuMs += sample.skyCpuMs
    this.perfWindowSums.fishCpuMs += sample.fishCpuMs

    if (this.perfWindow.length > PlaygroundRuntime.PERF_WINDOW_FRAMES) {
      const removed = this.perfWindow.shift()!
      this.perfWindowSums.fps -= removed.fps
      this.perfWindowSums.frameCpuMs -= removed.frameCpuMs
      this.perfWindowSums.controllerCpuMs -= removed.controllerCpuMs
      this.perfWindowSums.playerCpuMs -= removed.playerCpuMs
      this.perfWindowSums.effectsCpuMs -= removed.effectsCpuMs
      this.perfWindowSums.renderCpuMs -= removed.renderCpuMs
      this.perfWindowSums.lightingCpuMs -= removed.lightingCpuMs
      this.perfWindowSums.lampCpuMs -= removed.lampCpuMs
      this.perfWindowSums.glassCpuMs -= removed.glassCpuMs
      this.perfWindowSums.grassCpuMs -= removed.grassCpuMs
      this.perfWindowSums.vergeCpuMs -= removed.vergeCpuMs
      this.perfWindowSums.leafCpuMs -= removed.leafCpuMs
      this.perfWindowSums.fungusCpuMs -= removed.fungusCpuMs
      this.perfWindowSums.bandCpuMs -= removed.bandCpuMs
      this.perfWindowSums.rockCpuMs -= removed.rockCpuMs
      this.perfWindowSums.logCpuMs -= removed.logCpuMs
      this.perfWindowSums.stickCpuMs -= removed.stickCpuMs
      this.perfWindowSums.needleCpuMs -= removed.needleCpuMs
      this.perfWindowSums.neonCpuMs -= removed.neonCpuMs
      this.perfWindowSums.skyCpuMs -= removed.skyCpuMs
      this.perfWindowSums.fishCpuMs -= removed.fishCpuMs
    }
  }

  private perfWindowAverage(key: keyof PerfWindowSample): number {
    const count = this.perfWindow.length
    return count === 0 ? 0 : this.perfWindowSums[key] / count
  }

  private pushPerfLongWindowSample(sample: PerfWindowSample, wallMs: number): void {
    const cutoff = wallMs - PlaygroundRuntime.PERF_LONG_WINDOW_MS
    while (this.perfLongTimes.length > 0 && this.perfLongTimes[0]! < cutoff) {
      const removed = this.perfLongSamples.shift()!
      this.perfLongTimes.shift()
      this.perfLongSums.fps -= removed.fps
      this.perfLongSums.frameCpuMs -= removed.frameCpuMs
      this.perfLongSums.controllerCpuMs -= removed.controllerCpuMs
      this.perfLongSums.playerCpuMs -= removed.playerCpuMs
      this.perfLongSums.effectsCpuMs -= removed.effectsCpuMs
      this.perfLongSums.renderCpuMs -= removed.renderCpuMs
      this.perfLongSums.lightingCpuMs -= removed.lightingCpuMs
      this.perfLongSums.lampCpuMs -= removed.lampCpuMs
      this.perfLongSums.glassCpuMs -= removed.glassCpuMs
      this.perfLongSums.grassCpuMs -= removed.grassCpuMs
      this.perfLongSums.vergeCpuMs -= removed.vergeCpuMs
      this.perfLongSums.leafCpuMs -= removed.leafCpuMs
      this.perfLongSums.fungusCpuMs -= removed.fungusCpuMs
      this.perfLongSums.bandCpuMs -= removed.bandCpuMs
      this.perfLongSums.rockCpuMs -= removed.rockCpuMs
      this.perfLongSums.logCpuMs -= removed.logCpuMs
      this.perfLongSums.stickCpuMs -= removed.stickCpuMs
      this.perfLongSums.needleCpuMs -= removed.needleCpuMs
      this.perfLongSums.neonCpuMs -= removed.neonCpuMs
      this.perfLongSums.skyCpuMs -= removed.skyCpuMs
      this.perfLongSums.fishCpuMs -= removed.fishCpuMs
    }
    this.perfLongSamples.push(sample)
    this.perfLongTimes.push(wallMs)
    this.perfLongSums.fps += sample.fps
    this.perfLongSums.frameCpuMs += sample.frameCpuMs
    this.perfLongSums.controllerCpuMs += sample.controllerCpuMs
    this.perfLongSums.playerCpuMs += sample.playerCpuMs
    this.perfLongSums.effectsCpuMs += sample.effectsCpuMs
    this.perfLongSums.renderCpuMs += sample.renderCpuMs
    this.perfLongSums.lightingCpuMs += sample.lightingCpuMs
    this.perfLongSums.lampCpuMs += sample.lampCpuMs
    this.perfLongSums.glassCpuMs += sample.glassCpuMs
    this.perfLongSums.grassCpuMs += sample.grassCpuMs
    this.perfLongSums.vergeCpuMs += sample.vergeCpuMs
    this.perfLongSums.leafCpuMs += sample.leafCpuMs
    this.perfLongSums.fungusCpuMs += sample.fungusCpuMs
    this.perfLongSums.bandCpuMs += sample.bandCpuMs
    this.perfLongSums.rockCpuMs += sample.rockCpuMs
    this.perfLongSums.logCpuMs += sample.logCpuMs
    this.perfLongSums.stickCpuMs += sample.stickCpuMs
    this.perfLongSums.needleCpuMs += sample.needleCpuMs
    this.perfLongSums.neonCpuMs += sample.neonCpuMs
    this.perfLongSums.skyCpuMs += sample.skyCpuMs
    this.perfLongSums.fishCpuMs += sample.fishCpuMs
  }

  private perfLongWindowAverage(key: keyof PerfWindowSample): number {
    const count = this.perfLongSamples.length
    return count === 0 ? 0 : this.perfLongSums[key] / count
  }

  private buildPerfLongWindow(): PlaygroundPerfLongWindow {
    const windowSec = PlaygroundRuntime.PERF_LONG_WINDOW_MS / 1000
    const sampleCount = this.perfLongSamples.length
    return {
      windowSec,
      sampleCount,
      fpsAvg: this.perfLongWindowAverage('fps'),
      frameCpuMsAvg: this.perfLongWindowAverage('frameCpuMs'),
      controllerCpuMsAvg: this.perfLongWindowAverage('controllerCpuMs'),
      playerCpuMsAvg: this.perfLongWindowAverage('playerCpuMs'),
      effectsCpuMsAvg: this.perfLongWindowAverage('effectsCpuMs'),
      renderCpuMsAvg: this.perfLongWindowAverage('renderCpuMs'),
      lightingCpuMsAvg: this.perfLongWindowAverage('lightingCpuMs'),
      lampCpuMsAvg: this.perfLongWindowAverage('lampCpuMs'),
      glassCpuMsAvg: this.perfLongWindowAverage('glassCpuMs'),
      grassCpuMsAvg: this.perfLongWindowAverage('grassCpuMs'),
      vergeCpuMsAvg: this.perfLongWindowAverage('vergeCpuMs'),
      leafCpuMsAvg: this.perfLongWindowAverage('leafCpuMs'),
      fungusCpuMsAvg: this.perfLongWindowAverage('fungusCpuMs'),
      bandCpuMsAvg: this.perfLongWindowAverage('bandCpuMs'),
      rockCpuMsAvg: this.perfLongWindowAverage('rockCpuMs'),
      logCpuMsAvg: this.perfLongWindowAverage('logCpuMs'),
      stickCpuMsAvg: this.perfLongWindowAverage('stickCpuMs'),
      needleCpuMsAvg: this.perfLongWindowAverage('needleCpuMs'),
      neonCpuMsAvg: this.perfLongWindowAverage('neonCpuMs'),
      skyCpuMsAvg: this.perfLongWindowAverage('skyCpuMs'),
      fishCpuMsAvg: this.perfLongWindowAverage('fishCpuMs'),
    }
  }

  private getRoofHeightAtWorld(x: number, z: number, referenceY: number): number | null {
    for (const roof of ROOF_WALKABLE_SURFACES) {
      if (
        x >= roof.bounds.minX &&
        x <= roof.bounds.maxX &&
        z >= roof.bounds.minZ &&
        z <= roof.bounds.maxZ &&
        referenceY >= roof.y - PlaygroundRuntime.ROOF_SNAP_DOWN_DISTANCE
      ) {
        return roof.y
      }
    }
    return null
  }

  private blocksAtProbeHeight(maxY: number | undefined, probeY: number): boolean {
    return maxY == null || probeY < maxY - PlaygroundRuntime.WALL_TOP_CLEARANCE
  }

  private aabbOverlaps(a: { minX: number; maxX: number; minZ: number; maxZ: number }, b: { minX: number; maxX: number; minZ: number; maxZ: number }): boolean {
    return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ
  }

  private getBreachOffsets(zone: BreachZone): readonly number[] {
    const sampleOffset = zone.sampleOffset ?? FACADE_BREACH_SAMPLE_OFFSET
    return sampleOffset <= 1e-6 ? [0] : [0, sampleOffset, -sampleOffset]
  }

  private isBreachSampleOpen(zone: BreachZone, sampleX: number, sampleY: number, sampleZ: number): boolean {
    if (zone.kind === 'shutter') {
      this.collisionSample.set(sampleX, sampleY, SHUTTER_WALL_LAYOUT.z)
      return this.shutterEffect.getSurfaceDamage01AtWorldPoint(this.collisionSample) >= FACADE_BREACH_DAMAGE_THRESHOLD
    }

    if (zone.kind === 'ivy') {
      this.collisionSample.set(IVY_WALL_LAYOUT.x, sampleY, sampleZ)
      return this.ivyEffect.getSurfaceDamage01AtWorldPoint(this.collisionSample) >= FACADE_BREACH_DAMAGE_THRESHOLD
    }

    if (zone.kind === 'neon') {
      const idx = zone.neonIndex ?? 0
      const neon = this.neonSignEffects[idx]
      const barrier = NEON_BARRIERS[idx]
      if (!neon || !barrier) return false
      this.collisionSample.set(sampleX, sampleY, barrier.z)
      return neon.isHoleOpenAtWorldPoint(this.collisionSample)
    }

    return false
  }

  /** Solid building AABBs plus breach zones: pass only through Weft holes when sampled points are open enough. */
  private readonly resolveHorizontalMove: ResolveHorizontalMove = (prevX, prevZ, nextX, nextZ) => {
    if (this.sceneryMode) {
      return { x: nextX, z: nextZ }
    }
    const r = PLAYER_COLLISION_RADIUS
    let x = nextX
    let z = nextZ
    const probeY = this.getPlayerCollisionProbeY()

    const mdx = nextX - prevX
    const mdz = nextZ - prevZ
    const mlen = Math.hypot(mdx, mdz)
    const perpX = mlen > 1e-6 ? -mdz / mlen : 1
    const perpZ = mlen > 1e-6 ? mdx / mlen : 0

    const openPassages = BREACHABLE_FACADE_ZONES.filter((zone) => {
      const passage = zone.passageBounds ?? zone.bounds
      return (
        this.blocksAtProbeHeight(passage.maxY, probeY) &&
        circleOverlapsAabb(x, z, r, passage) &&
        this.isBreachZoneOpen(zone, x, z, perpX, perpZ, this.getBreachOffsets(zone))
      )
    }).map((zone) => zone.passageBounds ?? zone.bounds)

    for (let iter = 0; iter < 5; iter++) {
      let changed = false

      for (const wall of SOLID_BUILDING_WALLS) {
        if (!this.blocksAtProbeHeight(wall.maxY, probeY)) continue
        if (openPassages.some((passage) => this.aabbOverlaps(wall, passage))) continue
        const p = pushCircleOutOfAabb(x, z, r, wall)
        if (p.x !== x || p.z !== z) changed = true
        x = p.x
        z = p.z
      }

      for (const zone of BREACHABLE_FACADE_ZONES) {
        if (!this.blocksAtProbeHeight(zone.bounds.maxY, probeY)) continue
        if (!circleOverlapsAabb(x, z, r, zone.bounds)) continue
        if (this.isBreachZoneOpen(zone, x, z, perpX, perpZ, this.getBreachOffsets(zone))) continue
        const p = pushCircleOutOfAabb(x, z, r, zone.bounds)
        if (p.x !== x || p.z !== z) changed = true
        x = p.x
        z = p.z
      }

      if (!changed) break
    }

    return { x, z }
  }

  private isBreachZoneOpen(
    zone: BreachZone,
    x: number,
    z: number,
    perpX: number,
    perpZ: number,
    breachOffsets: readonly number[],
  ): boolean {
    return this.getBreachZoneOpenState(zone, x, z, perpX, perpZ, breachOffsets).isOpen
  }

  private getBreachZoneOpenState(
    zone: BreachZone,
    x: number,
    z: number,
    perpX: number,
    perpZ: number,
    breachOffsets: readonly number[],
  ): BreachZoneOpenState {
    const gy = this.getGroundHeightAtWorld(x, z)
    const heightOffsets = PlaygroundRuntime.BREACH_SAMPLE_HEIGHT_OFFSETS
    const totalSamples = breachOffsets.length * heightOffsets.length
    const requiredOpenSamples = zone.requiredOpenSamples ?? Math.max(1, Math.ceil(totalSamples * 0.55))
    let openSamples = 0

    for (const h of heightOffsets) {
      const sampleY = gy + h
      for (const off of breachOffsets) {
        const sampleX = x + perpX * off
        const sampleZ = z + perpZ * off
        if (this.isBreachSampleOpen(zone, sampleX, sampleY, sampleZ)) {
          openSamples++
        }
      }
    }

    return {
      isOpen: openSamples >= requiredOpenSamples,
      openSamples,
      requiredOpenSamples,
      totalSamples,
    }
  }

  private createCollisionDebugTiles(): CollisionDebugTile[] {
    if (this.sceneryMode) {
      return []
    }
    const tiles: CollisionDebugTile[] = []
    this.collisionDebugGroup.name = 'collision-debug-overlay'

    for (const zone of BREACHABLE_FACADE_ZONES) {
      const centerX = (zone.bounds.minX + zone.bounds.maxX) * 0.5
      const centerZ = (zone.bounds.minZ + zone.bounds.maxZ) * 0.5
      const groundY = this.getGroundHeightAtWorld(centerX, centerZ)
      const heightOffsets = PlaygroundRuntime.BREACH_SAMPLE_HEIGHT_OFFSETS

      if (zone.kind === 'ivy') {
        this.addCollisionDebugStripTiles(tiles, zone, {
          axisStart: zone.bounds.minZ,
          axisEnd: zone.bounds.maxZ,
          sampleYs: heightOffsets.map((offset) => groundY + offset),
          rotationY: Math.PI / 2,
          makePosition: (axisCenter, sampleY) =>
            new THREE.Vector3(
              IVY_WALL_LAYOUT.x + PlaygroundRuntime.COLLISION_DEBUG_SURFACE_OFFSET,
              sampleY,
              axisCenter,
            ),
          getSamplePoint: (axisCenter, sampleY) => ({ x: centerX, y: sampleY, z: axisCenter }),
        })
        continue
      }

      const surfaceZ =
        zone.kind === 'shutter'
          ? SHUTTER_WALL_LAYOUT.z + PlaygroundRuntime.COLLISION_DEBUG_SURFACE_OFFSET
          : NEON_BARRIERS[zone.neonIndex ?? 0]?.z ?? centerZ

      this.addCollisionDebugStripTiles(tiles, zone, {
        axisStart: zone.bounds.minX,
        axisEnd: zone.bounds.maxX,
        sampleYs: heightOffsets.map((offset) => groundY + offset),
        rotationY: 0,
        makePosition: (axisCenter, sampleY) =>
          new THREE.Vector3(
            axisCenter,
            sampleY,
            surfaceZ + (zone.kind === 'neon' ? PlaygroundRuntime.COLLISION_DEBUG_SURFACE_OFFSET : 0),
          ),
        getSamplePoint: (axisCenter, sampleY) => ({ x: axisCenter, y: sampleY, z: centerZ }),
      })
    }

    return tiles
  }

  private createTerrainAuthoringDebugOverlay(): void {
    this.terrainAuthoringDebugGroup.clear()
    this.terrainAuthoringDebugGroup.name = 'terrain-authoring-debug-overlay'
    this.terrainAuthoringDebugMesh = null
    this.terrainAuthoringDebugBasePositions = null
    if (!this.sceneryMode) return

    const bounds = SCENERY_BOUNDS
    const width = bounds.maxX - bounds.minX
    const depth = bounds.maxZ - bounds.minZ
    const centerX = (bounds.minX + bounds.maxX) * 0.5
    const centerZ = (bounds.minZ + bounds.maxZ) * 0.5
    const geometry = new THREE.PlaneGeometry(
      width,
      depth,
      PlaygroundRuntime.TERRAIN_AUTHORING_DEBUG_SEGMENTS,
      PlaygroundRuntime.TERRAIN_AUTHORING_DEBUG_SEGMENTS,
    )
    const colorArray = new Float32Array(geometry.attributes.position.count * 3)
    geometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3))
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.52,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(centerX, 0, centerZ)
    mesh.renderOrder = 6
    this.terrainAuthoringDebugGroup.add(mesh)
    this.terrainAuthoringDebugMesh = mesh
    this.terrainAuthoringDebugBasePositions = Float32Array.from(
      geometry.attributes.position.array as ArrayLike<number>,
    )
    this.updateTerrainAuthoringDebugOverlay()
  }

  private addCollisionDebugStripTiles(
    tiles: CollisionDebugTile[],
    zone: BreachZone,
    config: {
      axisStart: number
      axisEnd: number
      sampleYs: number[]
      rotationY: number
      makePosition: (axisCenter: number, sampleY: number) => THREE.Vector3
      getSamplePoint: (axisCenter: number, sampleY: number) => { x: number; y: number; z: number }
    },
  ): void {
    for (
      let cursor = config.axisStart;
      cursor < config.axisEnd - 1e-6;
      cursor += PlaygroundRuntime.COLLISION_DEBUG_TILE_SIZE
    ) {
      const next = Math.min(config.axisEnd, cursor + PlaygroundRuntime.COLLISION_DEBUG_TILE_SIZE)
      const tileWidth = Math.max(0.08, next - cursor)
      const axisCenter = cursor + tileWidth * 0.5
      for (const sampleY of config.sampleYs) {
        const geometry = new THREE.PlaneGeometry(tileWidth, PlaygroundRuntime.COLLISION_DEBUG_TILE_HEIGHT)
        const material = new THREE.MeshBasicMaterial({
          color: PlaygroundRuntime.COLLISION_DEBUG_BLOCKED_COLOR,
          transparent: true,
          opacity: 0.24,
          side: THREE.DoubleSide,
          depthWrite: false,
          depthTest: false,
          toneMapped: false,
        })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.copy(config.makePosition(axisCenter, sampleY))
        mesh.rotation.y = config.rotationY
        mesh.renderOrder = 24
        this.collisionDebugGroup.add(mesh)

        const samplePoint = config.getSamplePoint(axisCenter, sampleY)
        tiles.push({
          zone,
          mesh,
          sampleX: samplePoint.x,
          sampleY: samplePoint.y,
          sampleZ: samplePoint.z,
        })
      }
    }
  }

  private updateCollisionDebugOverlay(): void {
    const probeY = this.getPlayerCollisionProbeY()
    for (const tile of this.collisionDebugTiles) {
      const material = tile.mesh.material
      const passesOverTop = !this.blocksAtProbeHeight(tile.zone.bounds.maxY, probeY)
      const isOpen = passesOverTop || this.isBreachSampleOpen(tile.zone, tile.sampleX, tile.sampleY, tile.sampleZ)
      material.color.copy(
        isOpen
          ? PlaygroundRuntime.COLLISION_DEBUG_OPEN_COLOR
          : PlaygroundRuntime.COLLISION_DEBUG_BLOCKED_COLOR,
      )
      material.opacity = isOpen ? 0.2 : 0.34
    }
  }

  private updateTerrainAuthoringDebugOverlay(): void {
    if (!this.sceneryMode || !this.terrainAuthoringDebugMesh || !this.terrainAuthoringDebugBasePositions) {
      return
    }

    const bounds = SCENERY_BOUNDS
    const centerX = (bounds.minX + bounds.maxX) * 0.5
    const centerZ = (bounds.minZ + bounds.maxZ) * 0.5
    const position = this.terrainAuthoringDebugMesh.geometry.attributes.position
    const color = this.terrainAuthoringDebugMesh.geometry.attributes.color as THREE.BufferAttribute

    for (let i = 0; i < position.count; i++) {
      const localX = this.terrainAuthoringDebugBasePositions[i * 3]
      const localYPlane = this.terrainAuthoringDebugBasePositions[i * 3 + 1]
      const worldX = centerX + localX
      const worldZ = centerZ - localYPlane
      const groundY =
        this.grassEffect.getGroundHeightAtWorld(worldX, worldZ) + PlaygroundRuntime.TERRAIN_AUTHORING_DEBUG_OFFSET
      const terrain = sampleSceneryTerrainAuthoringRead(
        worldX,
        worldZ,
        this.sceneryTerrainRelief,
        this.sceneryTerrainReliefParams,
      )
      const flatWeight = terrain.flat01 * (1 - terrain.ridge01 * 0.2)
      const slopeWeight = terrain.slope01
      const ridgeWeight = terrain.ridge01
      const basinWeight = terrain.basin01
      const baseWeight = 0.28
      const totalWeight = baseWeight + flatWeight + slopeWeight + ridgeWeight + basinWeight
      tmpTerrainDebugColor.setRGB(
        (0.08 * baseWeight +
          TERRAIN_DEBUG_FLAT_COLOR.r * flatWeight +
          TERRAIN_DEBUG_SLOPE_COLOR.r * slopeWeight +
          TERRAIN_DEBUG_RIDGE_COLOR.r * ridgeWeight +
          TERRAIN_DEBUG_BASIN_COLOR.r * basinWeight) /
          totalWeight,
        (0.1 * baseWeight +
          TERRAIN_DEBUG_FLAT_COLOR.g * flatWeight +
          TERRAIN_DEBUG_SLOPE_COLOR.g * slopeWeight +
          TERRAIN_DEBUG_RIDGE_COLOR.g * ridgeWeight +
          TERRAIN_DEBUG_BASIN_COLOR.g * basinWeight) /
          totalWeight,
        (0.12 * baseWeight +
          TERRAIN_DEBUG_FLAT_COLOR.b * flatWeight +
          TERRAIN_DEBUG_SLOPE_COLOR.b * slopeWeight +
          TERRAIN_DEBUG_RIDGE_COLOR.b * ridgeWeight +
          TERRAIN_DEBUG_BASIN_COLOR.b * basinWeight) /
          totalWeight,
      )
      tmpTerrainDebugColor.multiplyScalar(0.9 + terrain.altitude01 * 0.16)
      position.setXYZ(i, localX, localYPlane, groundY)
      color.setXYZ(i, tmpTerrainDebugColor.r, tmpTerrainDebugColor.g, tmpTerrainDebugColor.b)
    }

    position.needsUpdate = true
    color.needsUpdate = true
    this.terrainAuthoringDebugMesh.geometry.computeBoundingBox()
    this.terrainAuthoringDebugMesh.geometry.computeBoundingSphere()
  }

  /**
   * Use `mousedown` instead of `pointerdown` so LMB still fires while RMB is already held
   * for orbit/pan; pointer events do not emit a second `pointerdown` for chorded mouse buttons.
   */
  private handleWindowMouseDownForShoot = (event: MouseEvent): void => {
    if (this.disposed || event.button !== 0) return
    const t = event.target
    if (!(t instanceof Node) || !this.host.contains(t)) return
    if (this.sceneryMode && !this.sceneryPointerLocked) {
      this.requestSceneryPointerLock()
      return
    }
    this.pendingShoot = true
    this.canvas.focus()
  }

  private handlePointerDown = (event: PointerEvent): void => {
    this.canvas.focus()
    if (this.sceneryMode) {
      if (!this.sceneryPointerLocked) {
        this.requestSceneryPointerLock()
      }
      return
    }
    if (event.button === 2) {
      this.inputState.lookActive = true
      this.canvas.setPointerCapture(event.pointerId)
    }
  }

  private handlePointerMove = (event: PointerEvent): void => {
    if (this.sceneryMode) {
      if (!this.sceneryPointerLocked) return
      this.inputState.lookDeltaX += event.movementX
      this.inputState.lookDeltaY += event.movementY
      return
    }
    if ((event.buttons & 2) === 0 && this.inputState.lookActive) {
      this.releaseLookCapture(event.pointerId)
      return
    }
    if (!this.inputState.lookActive) return
    this.inputState.lookDeltaX += event.movementX
    this.inputState.lookDeltaY += event.movementY
  }

  private handlePointerUp = (event: PointerEvent): void => {
    if ((event.buttons & 2) === 0 && this.inputState.lookActive) {
      this.releaseLookCapture(event.pointerId)
    }
  }

  private handlePointerCancel = (event: PointerEvent): void => {
    this.releaseLookCapture(event.pointerId)
  }

  private handleLostPointerCapture = (): void => {
    this.inputState.lookActive = false
  }

  private handleWheel = (event: WheelEvent): void => {
    event.preventDefault()
    if (this.sceneryMode) {
      return
    }
    this.zoomDistance = THREE.MathUtils.clamp(this.zoomDistance + event.deltaY * 0.01, PLAYGROUND_ZOOM.min, PLAYGROUND_ZOOM.max)
  }

  private handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
  }

  private handlePointerLockChange = (): void => {
    this.sceneryPointerLocked = document.pointerLockElement === this.canvas
    if (!this.sceneryPointerLocked) {
      this.inputState.lookDeltaX = 0
      this.inputState.lookDeltaY = 0
    }
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (this.sceneryMode && event.code === 'Escape') {
      this.releaseSceneryPointerLock()
      return
    }
    if (event.code === 'KeyW') this.inputState.moveForward = true
    if (event.code === 'KeyS') this.inputState.moveBackward = true
    if (event.code === 'KeyA') this.inputState.moveLeft = true
    if (event.code === 'KeyD') this.inputState.moveRight = true
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.inputState.sprint = true
    if (event.code === 'KeyC' && !event.repeat) {
      this.inputState.crouch = !this.inputState.crouch
    }
    if (event.code === 'Space' && !event.repeat) {
      event.preventDefault()
      this.pendingJump = true
    }
  }

  private handleKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'KeyW') this.inputState.moveForward = false
    if (event.code === 'KeyS') this.inputState.moveBackward = false
    if (event.code === 'KeyA') this.inputState.moveLeft = false
    if (event.code === 'KeyD') this.inputState.moveRight = false
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.inputState.sprint = false
    if (event.code === 'Space') {
      event.preventDefault()
    }
  }

  private handleWindowBlur = (): void => {
    this.inputState.moveForward = false
    this.inputState.moveBackward = false
    this.inputState.moveLeft = false
    this.inputState.moveRight = false
    this.inputState.sprint = false
    this.inputState.crouch = false
    this.inputState.lookActive = false
    this.inputState.lookDeltaX = 0
    this.inputState.lookDeltaY = 0
    this.pendingShoot = false
    this.pendingJump = false
  }

  private requestSceneryPointerLock(): void {
    if (!this.sceneryMode || this.sceneryPointerLocked) return
    this.canvas.focus()
    const request = this.canvas.requestPointerLock()
    if (request instanceof Promise) {
      void request.catch(() => {})
    }
  }

  private releaseSceneryPointerLock(): void {
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock()
    }
    this.sceneryPointerLocked = false
    this.inputState.lookDeltaX = 0
    this.inputState.lookDeltaY = 0
  }

  private releaseLookCapture(pointerId: number): void {
    if (this.canvas.hasPointerCapture(pointerId)) {
      this.canvas.releasePointerCapture(pointerId)
    }
    this.inputState.lookActive = false
  }

  private getPlayerAnimationState(frame: ThirdPersonControllerFrame | null): PlayerAnimationState {
    if (!frame?.isMoving) return 'idle'
    if (frame.isSprinting) return 'running'
    return 'walking'
  }

  private stampGrassWalkDisturbance(frame: ThirdPersonControllerFrame): void {
    if (!frame.isMoving || frame.isJumping) {
      this.walkStampDistance = 0
      return
    }

    this.walkStampDistance += frame.movedDistance
    if (this.walkStampDistance < 0.55) return
    this.walkStampDistance = 0

    this.controller.player.group.getWorldDirection(this.playerForward)
    this.playerForward.y = 0
    if (this.playerForward.lengthSq() < 0.0001) {
      this.playerForward.set(0, 0, -1)
    } else {
      this.playerForward.normalize()
    }

    this.footstepPoint.copy(frame.playerPosition).addScaledVector(this.playerForward, -0.18)
    this.footstepPoint.y = this.grassEffect.getGroundHeightAtWorld(this.footstepPoint.x, this.footstepPoint.z)
    this.stampLeafPileDisturbance(this.footstepPoint, {
      radiusScale: 1.35,
      strength: 1.75,
      displacementScale: 1.55,
      mergeRadius: 0.7,
    })
    this.stampStickFieldDisturbance(this.footstepPoint, {
      radiusScale: 1.15,
      strength: 1.15,
      displacementScale: 1.5,
      mergeRadius: 0.65,
      directionX: this.playerForward.x,
      directionZ: this.playerForward.z,
      tangentialStrength: 0.2,
      spin: 0.16,
    })
    this.stampLogFieldReaction(this.footstepPoint, {
      radiusScale: 0.65,
      strength: 0.55,
      mergeRadius: 1.2,
      directionX: this.playerForward.x,
      directionZ: this.playerForward.z,
      tangentialStrength: 0.18,
      spin: 0.32,
    })
    if (
      !this.sceneryMode &&
      (isCrossRoadAsphalt(this.footstepPoint.x, this.footstepPoint.z) ||
        isInsideBuildingInterior(this.footstepPoint.x, this.footstepPoint.z))
    ) {
      return
    }
    this.grassEffect.addDisturbanceFromWorldPoint(this.footstepPoint, {
      radiusScale: 0.42,
      strength: 1.0,
      recoveryRate: 0.001,  // effectively persistent footprints
      mergeRadius: 0.95,
    })
  }

  private stampLeafPileDisturbance(
    point: THREE.Vector3,
    options: {
      radiusScale?: number
      strength?: number
      displacementScale?: number
      mergeRadius?: number
    } = {},
  ): void {
    if (isInsideBuildingInterior(point.x, point.z)) return
    this.leafPileEffect.addDisturbanceFromWorldPoint(point, options)
    this.leafPileDirty = true
  }

  private stampLeafPileBurn(point: THREE.Vector3): void {
    if (isInsideBuildingInterior(point.x, point.z)) return
    const opts = this.sceneryMode
      ? {
          radiusScale: 0.82,
          maxRadiusScale: 0.98,
          strength: 0.72,
          mergeRadius: 0.55,
        }
      : {
          radiusScale: 1.05,
          maxRadiusScale: 1.22,
          strength: 0.95,
          mergeRadius: 0.6,
        }
    this.leafPileEffect.addBurnFromWorldPoint(point, opts)
    this.leafPileDirty = true
  }

  private stampTreeTrunkBurn(hit: ReticleHit, direction: THREE.Vector3): void {
    const opts = this.sceneryMode
      ? {
          radiusScale: 0.72,
          maxRadiusScale: 0.92,
          strength: 0.72,
          mergeRadius: 0.5,
          recoveryRate: 0,
        }
      : {
          radiusScale: 0.95,
          maxRadiusScale: 1.12,
          strength: 0.9,
          mergeRadius: 0.58,
          recoveryRate: 0.00062,
        }
    if (this.treeFieldEffect.addTrunkWoundFromRaycastHit(hit, direction, opts)) {
      this.treeFieldDirty = true
    }
  }

  private stampGrassBurn(point: THREE.Vector3): void {
    if (isInsideBuildingInterior(point.x, point.z)) return
    const opts = this.sceneryMode
      ? {
          radiusScale: 0.34,
          strength: 1.12,
          mergeRadius: 0.58,
          recoveryRate: 0.0001,
          deformGround: false,
        }
      : {
          radiusScale: 0.4,
          strength: 1.2,
          mergeRadius: 0.62,
          recoveryRate: 0.00013,
          deformGround: false,
        }
    this.grassEffect.addDisturbanceFromWorldPoint(point, opts)
  }

  private stampStickFieldDisturbance(
    point: THREE.Vector3,
    options: {
      radiusScale?: number
      strength?: number
      displacementScale?: number
      mergeRadius?: number
      directionX?: number
      directionZ?: number
      tangentialStrength?: number
      spin?: number
    } = {},
  ): void {
    if (!this.sceneryMode) return
    this.stickFieldEffect.addMotionFromWorldPoint(point, {
      ...options,
      strength: (options.strength ?? 1) * this.sceneryMotionResponse.stickPushScale,
    })
    this.stickFieldDirty = true
  }

  private stampLogFieldReaction(
    point: THREE.Vector3,
    options: {
      radiusScale?: number
      strength?: number
      mergeRadius?: number
      directionX?: number
      directionZ?: number
      tangentialStrength?: number
      spin?: number
    } = {},
  ): void {
    if (!this.sceneryMode) return
    this.logFieldEffect.addMotionFromWorldPoint(point, {
      ...options,
      strength: (options.strength ?? 1) * this.sceneryMotionResponse.logPushScale,
    })
    this.logFieldDirty = true
  }

  private stampFungusBurn(point: THREE.Vector3): void {
    if (this.sceneryMode) return
    if (!isInsideFungusSeamZone(point.x, point.z)) return
    const seamDistance = Math.abs(distanceToFungusSeamAtXZ(point.x, point.z))
    const burnReach = this.fungusBandParams.bandWidth * 0.7 + 0.45
    if (seamDistance > burnReach) return
    this.fungusBandEffect.addBurnFromWorldPoint(point, {
      radiusScale: 1.18,
      maxRadiusScale: 1.28,
      strength: 0.88,
      mergeRadius: 0.85,
    })
    this.fungusBandDirty = true
  }

  private stampNeedleLitterBurn(point: THREE.Vector3): void {
    if (!this.sceneryMode) return
    this.needleLitterEffect.addBurnFromWorldPoint(point, {
      radiusScale: 0.82,
      maxRadiusScale: 0.98,
      strength: 0.72,
      mergeRadius: 0.58,
    })
    this.needleLitterDirty = true
  }

  private getCenterRayHit(): ReticleHit | null {
    this.raycaster.setFromCamera(this.ndcCenter, this.camera)
    this.raycaster.far = 140

    const hits = this.raycaster.intersectObjects(this.raycastTargets, false)
    const hit = hits[0]
    if (!hit?.point) return null

    let targetKind: ReticleHit['targetKind']
    if (hit.object === this.shutterEffect.interactionMesh) targetKind = 'shutter'
    else if (hit.object === this.ivyEffect.interactionMesh) targetKind = 'ivy'
    else if (this.neonSignEffects.some((e) => e.interactionMesh === hit.object)) targetKind = 'neon'
    else if (this.lampEffects.some((e) => e.interactionMesh === hit.object)) targetKind = 'lamp'
    else if (this.windowGlassEffects.some((e) => e.interactionMesh === hit.object)) targetKind = 'glass'
    else if (hit.object === this.rockFieldEffect.interactionMesh) targetKind = 'rock'
    else if (hit.object === this.treeFieldEffect.trunkInteractionMesh) targetKind = 'tree'
    else targetKind = 'grass'

    return { ...hit, targetKind }
  }

  /** World point where the center-screen ray meets the scene (matches shot impact logic). */
  private getLaserImpactPoint(hit: ReticleHit | null, out: THREE.Vector3): void {
    if (hit?.point) {
      out.copy(hit.point)
      return
    }
    if (!hit && this.raycaster.ray.direction.y > 0.02) {
      out.copy(this.raycaster.ray.origin).addScaledVector(this.raycaster.ray.direction, 96)
      return
    }
    if (!hit) {
      const grassHit = this.getGrassFallbackHit()
      if (grassHit?.point) {
        out.copy(grassHit.point)
        return
      }
    }
    out.copy(this.raycaster.ray.origin).addScaledVector(this.raycaster.ray.direction, this.raycaster.far)
  }

  /** Chest-height point in front of the character mesh (world space), not the camera ray. */
  private getLaserMuzzleWorld(frame: ThirdPersonControllerFrame, out: THREE.Vector3): void {
    this.controller.player.group.getWorldDirection(this.laserPlayerForward)
    this.laserPlayerForward.negate()
    this.laserPlayerForward.y = 0
    if (this.laserPlayerForward.lengthSq() < 1e-8) {
      this.laserPlayerForward.set(0, 0, -1)
    } else {
      this.laserPlayerForward.normalize()
    }
    out.copy(frame.playerPosition)
    out.y += 1.14
    out.addScaledVector(this.laserPlayerForward, 0.48)
  }

  private refreshLaserBeamGeometry(frame: ThirdPersonControllerFrame, endWorld: THREE.Vector3): void {
    this.getLaserMuzzleWorld(frame, this.laserMuzzle)
    const dist = this.laserMuzzle.distanceTo(endWorld)
    if (dist < 0.05) {
      this.laserBeamGroup.visible = false
      return
    }
    this.laserDir.subVectors(endWorld, this.laserMuzzle).normalize()
    this.laserMid.copy(this.laserMuzzle).add(endWorld).multiplyScalar(0.5)
    for (const mesh of this.laserBeamMeshes) {
      mesh.position.copy(this.laserMid)
      mesh.scale.set(1, dist, 1)
      mesh.quaternion.setFromUnitVectors(this.laserAxisY, this.laserDir)
    }
  }

  private getGrassFallbackHit(): ReticleHit | null {
    const referenceY = this.activeFrame?.playerPosition.y ?? this.grassEffect.getGroundHeightAtWorld(0, 0)
    this.grassAimPlane.constant = -referenceY
    const point = this.raycaster.ray.intersectPlane(this.grassAimPlane, this.grassFallbackPoint)
    if (!point) return null

    return {
      distance: this.raycaster.ray.origin.distanceTo(point),
      point: point.clone(),
      object: this.grassEffect.interactionMesh,
      targetKind: 'grass',
    } as ReticleHit
  }

  private fireShot(): void {
    const hit = this.getCenterRayHit()
    if (this.activeFrame) {
      this.getLaserImpactPoint(hit, this.laserEndPoint)
      this.laserImpactLocked.copy(this.laserEndPoint)
      this.laserImpactValid = true
      this.refreshLaserBeamGeometry(this.activeFrame, this.laserImpactLocked)
      const outerMat = this.laserBeamOuter.material as THREE.MeshBasicMaterial
      const coreMat = this.laserBeamCore.material as THREE.MeshBasicMaterial
      outerMat.opacity = 0.88
      coreMat.opacity = 0.95
      this.laserBeamGroup.visible = true
      this.laserLifeRemaining = this.laserDurationSec
    }

    if (hit?.targetKind === 'rock') {
      this.rockFieldEffect.destroyFromRaycastHit(hit, this.raycaster.ray.direction, {
        shardCount: 14,
        burstScale: 1.05,
      })
      this.rockFieldDirty = true
    }

    if (hit?.targetKind === 'tree') {
      this.stampTreeTrunkBurn(hit, this.raycaster.ray.direction)
      return
    }

    if (hit?.targetKind === 'shutter') {
      this.shutterEffect.addWoundFromWorldPoint(hit.point, this.raycaster.ray.direction)
      return
    }

    if (hit?.targetKind === 'ivy') {
      this.ivyEffect.addWoundFromWorldPoint(hit.point, this.raycaster.ray.direction)
      return
    }

    if (hit?.targetKind === 'lamp') {
      const lamp = this.lampEffects.find((e) => e.interactionMesh === hit.object)
      lamp?.addWoundFromWorldPoint(hit.point, this.raycaster.ray.direction)
      return
    }

    if (hit?.targetKind === 'glass') {
      const glass = this.windowGlassEffects.find((e) => e.interactionMesh === hit.object)
      glass?.addWoundFromWorldPoint(hit.point, this.raycaster.ray.direction)
      return
    }

    if (hit?.targetKind === 'neon') {
      const neon = this.neonSignEffects.find((e) => e.interactionMesh === hit.object)
      neon?.addWoundFromWorldPoint(hit.point)
      return
    }

    if (!hit && this.raycaster.ray.direction.y > 0.02) {
      this.starSkyEffect.addWoundFromWorldDirection(this.raycaster.ray.direction)
      return
    }

    if (!hit) {
      const grassHit = this.getGrassFallbackHit()
      if (!grassHit) return
      if (!this.sceneryMode) {
        this.stampFungusBurn(grassHit.point)
      }
      this.stampGrassBurn(grassHit.point)
      this.stampLeafPileBurn(grassHit.point)
      this.stampLeafPileDisturbance(grassHit.point, {
        radiusScale: 1.2,
        strength: 1.7,
        displacementScale: 1.85,
        mergeRadius: 0.35,
      })
      this.stampStickFieldDisturbance(grassHit.point, {
        radiusScale: 1.55,
        strength: 4.2,
        displacementScale: 2.1,
        mergeRadius: 0.45,
        directionX: this.raycaster.ray.direction.x,
        directionZ: this.raycaster.ray.direction.z,
        tangentialStrength: 0.24,
        spin: 0.34,
      })
      this.stampLogFieldReaction(grassHit.point, {
        radiusScale: 0.8,
        strength: 3.4,
        mergeRadius: 0.9,
        directionX: this.raycaster.ray.direction.x,
        directionZ: this.raycaster.ray.direction.z,
        tangentialStrength: 0.28,
        spin: 0.5,
      })
      this.stampNeedleLitterBurn(grassHit.point)
      return
    }

    if (!this.sceneryMode) {
      this.stampFungusBurn(hit.point)
    }
    this.stampGrassBurn(hit.point)
    this.stampLeafPileBurn(hit.point)
    this.stampLeafPileDisturbance(hit.point, {
      radiusScale: 1.2,
      strength: 1.7,
      displacementScale: 1.85,
      mergeRadius: 0.35,
    })
    this.stampStickFieldDisturbance(hit.point, {
      radiusScale: 1.55,
      strength: 4.2,
      displacementScale: 2.1,
      mergeRadius: 0.45,
      directionX: this.raycaster.ray.direction.x,
      directionZ: this.raycaster.ray.direction.z,
      tangentialStrength: 0.24,
      spin: 0.34,
    })
    this.stampLogFieldReaction(hit.point, {
      radiusScale: 0.8,
      strength: 3.4,
      mergeRadius: 0.9,
      directionX: this.raycaster.ray.direction.x,
      directionZ: this.raycaster.ray.direction.z,
      tangentialStrength: 0.28,
      spin: 0.5,
    })
    this.stampNeedleLitterBurn(hit.point)
  }

  /** Dim point light and bulb emissive as glass wound load rises; recovers with Weft wound decay. */
  private updateStreetLampLighting(): void {
    for (let i = 0; i < this.lampEffects.length; i++) {
      const load = this.lampEffects[i]!.getWoundLoad01(STREET_LAMP_GLASS_BREAK_THRESHOLD)
      const alive01 = Math.pow(1 - load, 1.22)
      const light = this.lampLights[i]
      const globe = this.lampGlobes[i]
      if (light) {
        light.intensity = STREET_LAMP_POINT_INTENSITY_MAX * alive01
      }
      if (globe?.material instanceof THREE.MeshStandardMaterial) {
        globe.material.emissiveIntensity = THREE.MathUtils.lerp(
          0.04,
          STREET_LAMP_GLOBE_EMISSIVE_MAX,
          alive01,
        )
      }
    }
  }

  private frame = (time?: number): void => {
    if (this.disposed || !this.renderer) return
    const perfAvailable = typeof performance !== 'undefined'
    const now = () => (perfAvailable ? performance.now() : 0)
    const tFrame0 = now()

    this.timer.update(time)
    const elapsed = this.timer.getElapsed()
    const delta = this.lastElapsed === 0 ? 0 : Math.min(0.05, Math.max(0, elapsed - this.lastElapsed))
    this.lastElapsed = elapsed
    this.frameTick++
    if (delta > 0) {
      const instantFps = 1 / delta
      const fpsBlend = 1 - Math.exp(-8 * delta)
      this.fps = this.fps === 0 ? instantFps : THREE.MathUtils.lerp(this.fps, instantFps, fpsBlend)
    }

    this.updateCameraProfile(delta)
    const tController0 = now()
    this.activeFrame = this.controller.update(
      this.camera,
      this.syncFrameInput(),
      this.controllerConfig,
      this.movementBounds,
      this.getPlayerWalkHeightAtWorld,
      delta,
      this.resolveHorizontalMove,
    )
    const controllerCpuMs = now() - tController0
    if (this.activeFrame) {
      this.applyCameraObstruction(this.activeFrame)
    }
    this.pendingJump = false
    this.inputState.lookDeltaX = 0
    this.inputState.lookDeltaY = 0

    if (this.activeFrame) {
      this.stampGrassWalkDisturbance(this.activeFrame)
    }

    if (this.pendingShoot && this.activeFrame) {
      this.fireShot()
      this.pendingShoot = false
    }

    if (this.laserLifeRemaining > 0 && this.laserImpactValid && this.activeFrame) {
      this.refreshLaserBeamGeometry(this.activeFrame, this.laserImpactLocked)
    }

    if (this.laserLifeRemaining > 0) {
      this.laserLifeRemaining = Math.max(0, this.laserLifeRemaining - delta)
      const k = this.laserLifeRemaining > 0 ? Math.min(1, this.laserLifeRemaining / this.laserDurationSec) : 0
      ;(this.laserBeamOuter.material as THREE.MeshBasicMaterial).opacity = 0.88 * k
      ;(this.laserBeamCore.material as THREE.MeshBasicMaterial).opacity = 0.95 * k
      if (this.laserLifeRemaining <= 0) {
        this.laserBeamGroup.visible = false
        this.laserImpactValid = false
      }
    }

    this.fillGrassViewCullBundle()
    const tEffects0 = now()
    const tPlayer0 = now()
    this.controller.player.update(delta, this.getPlayerAnimationState(this.activeFrame))
    const playerCpuMs = now() - tPlayer0
    let ranShutter = false
    let ranIvy = false
    let shutterCpuMs = 0
    let ivyCpuMs = 0
    let lampCpuMs = 0
    let glassCpuMs = 0
    let ranGlass = false
    let vergeCpuMs = 0
    let leafCpuMs = 0
    let fungusCpuMs = 0
    let ranBand = false
    let bandCpuMs = 0
    let rockCpuMs = 0
    let ranRock = false
    let logCpuMs = 0
    let ranLog = false
    let stickCpuMs = 0
    let ranStick = false
    let needleCpuMs = 0
    let ranNeedles = false
    let neonCpuMs = 0
    let ranNeon = false

    if (!this.sceneryMode) {
      const shutterHasWounds = this.shutterEffect.hasWounds()
      const ivyHasWounds = this.ivyEffect.hasWounds()
      const fishCadence = shutterHasWounds || ivyHasWounds ? this.cadenceFor('fish') : this.idleCadenceFor('fish')
      const shouldUpdateShutter =
        shutterHasWounds ||
        this.shouldUpdateIdleTownEffect(
          this.shutterEffect.group,
          PlaygroundRuntime.PLAYGROUND_FACADE_IDLE_VISIBLE_DISTANCE,
          Math.max(SHUTTER_WALL_LAYOUT.wallWidth, SHUTTER_WALL_LAYOUT.wallHeight) * 0.6,
        )
      const shouldUpdateIvy =
        ivyHasWounds ||
        this.shouldUpdateIdleTownEffect(
          this.ivyEffect.group,
          PlaygroundRuntime.PLAYGROUND_FACADE_IDLE_VISIBLE_DISTANCE,
          Math.max(IVY_WALL_LAYOUT.wallWidth, IVY_WALL_LAYOUT.wallHeight) * 0.6,
        )
      if (shouldUpdateShutter && this.shouldRunCadencedUpdate(fishCadence, 0)) {
        const tShutter0 = now()
        this.shutterEffect.update(elapsed)
        shutterCpuMs = now() - tShutter0
        ranShutter = true
      }
      if (shouldUpdateIvy && this.shouldRunCadencedUpdate(fishCadence, 1)) {
        const tIvy0 = now()
        this.ivyEffect.update(elapsed)
        ivyCpuMs = now() - tIvy0
        ranIvy = true
      }
      const tLamp0 = now()
      const glassIdleCadence = this.idleCadenceFor('glass')
      for (let i = 0; i < this.lampEffects.length; i++) {
        const lamp = this.lampEffects[i]!
        const shouldUpdateLamp =
          lamp.needsActiveRefresh() ||
          this.shouldUpdateIdleTownEffect(
            lamp.group,
            PlaygroundRuntime.PLAYGROUND_GLASS_IDLE_VISIBLE_DISTANCE,
            1.1,
          )
        if (shouldUpdateLamp && this.shouldRunCadencedUpdate(glassIdleCadence, i)) {
          lamp.update(elapsed)
          ranGlass = true
        }
      }
      lampCpuMs = now() - tLamp0
      const tGlass0 = now()
      const glassIdleOffsetBase = this.lampEffects.length
      for (let i = 0; i < this.windowGlassEffects.length; i++) {
        const glass = this.windowGlassEffects[i]!
        const idleOffset = glassIdleOffsetBase + i
        const shouldUpdateGlass =
          glass.needsActiveRefresh() ||
          this.shouldUpdateIdleTownEffect(
            glass.group,
            PlaygroundRuntime.PLAYGROUND_GLASS_IDLE_VISIBLE_DISTANCE,
            1.25,
          )
        if (shouldUpdateGlass && this.shouldRunCadencedUpdate(glassIdleCadence, idleOffset)) {
          glass.update(elapsed)
          ranGlass = true
        }
      }
      glassCpuMs = now() - tGlass0
      if (!this.sceneryMode) {
        const neonCadence = this.neonSignEffects.some((effect) => effect.hasWounds())
          ? this.cadenceFor('neon')
          : this.idleCadenceFor('neon')
        if (neonCadence <= 1) {
          const tNeon0 = now()
          for (const effect of this.neonSignEffects) {
            effect.update(elapsed)
          }
          neonCpuMs = now() - tNeon0
          ranNeon = true
        } else {
          const tNeon0 = now()
          for (let i = 0; i < this.neonSignEffects.length; i++) {
            const effect = this.neonSignEffects[i]!
            const shouldUpdateNeon =
              effect.hasWounds() ||
              this.shouldUpdateIdleTownEffect(
                effect.group,
                PlaygroundRuntime.PLAYGROUND_NEON_IDLE_VISIBLE_DISTANCE,
                Math.max(NEON_BARRIERS[i]!.wallWidth, NEON_BARRIERS[i]!.wallHeight) * 0.6,
              )
            if (shouldUpdateNeon && this.shouldRunCadencedUpdate(neonCadence, i)) {
              effect.update(elapsed)
              ranNeon = true
            }
          }
          neonCpuMs = now() - tNeon0
        }
      }
    }

    if (this.vergeBandDirty) {
      const tVerge0 = now()
      this.vergeBandEffect.update(this.getGroundHeightAtWorld)
      vergeCpuMs = now() - tVerge0
      this.vergeBandDirty = false
      ranBand = true
    }
    const leafHasDisturbances = this.leafPileEffect.hasDisturbances()
    const leafHasBurns = this.leafPileEffect.hasBurns()
    // Interactive leaf motion must run every frame; burns-only can stay on the lighter cadence.
    const leafCadence =
      leafHasDisturbances || this.leafPileDirty
        ? 3
        : leafHasBurns
          ? this.cadenceFor('leaf')
          : this.idleCadenceFor('leaf')
    if ((leafHasBurns || leafHasDisturbances || this.leafPileDirty) && this.shouldRunCadencedUpdate(leafCadence, 0)) {
      const tLeaf0 = now()
      this.leafPileEffect.update(elapsed, this.getGroundHeightAtWorld)
      leafCpuMs = now() - tLeaf0
      this.leafPileDirty = this.leafPileEffect.hasBurns() || this.leafPileEffect.hasDisturbances()
      ranBand = true
    }
    if (!this.sceneryMode) {
      const fungusBandHasBurns = this.fungusBandEffect.hasBurns()
      const fungusBandCadence = fungusBandHasBurns ? this.cadenceFor('band') : this.idleCadenceFor('band')
      if (
        (fungusBandHasBurns || this.fungusBandDirty) &&
        this.shouldRunCadencedUpdate(fungusBandCadence, 2)
      ) {
        const tFungus0 = now()
        this.fungusBandEffect.update(elapsed, this.getGroundHeightAtWorld)
        fungusCpuMs = now() - tFungus0
        this.fungusBandDirty = this.fungusBandEffect.hasBurns()
        ranBand = true
      }
    }
    bandCpuMs = vergeCpuMs + leafCpuMs + fungusCpuMs
    const tRock0 = now()
    const rockHasActivity = this.rockFieldDirty || this.rockFieldEffect.hasActiveShards()
    const rockCadence = rockHasActivity ? 2 : this.cadenceFor('needle')
    if (rockHasActivity && this.shouldRunCadencedUpdate(rockCadence, 4)) {
      this.rockFieldEffect.update(elapsed, this.getGroundHeightAtWorld)
      this.rockFieldDirty = false
      ranRock = true
    }
    rockCpuMs = now() - tRock0
    if (this.shrubFieldDirty) {
      this.shrubFieldEffect.update(this.getGroundHeightAtWorld)
      this.shrubFieldDirty = false
    }
    const treeHasBurns = this.treeFieldEffect.hasTrunkBurns()
    const treeCadence = treeHasBurns ? this.cadenceFor('tree') : this.idleCadenceFor('tree')
    if (
      this.treeFieldDirty ||
      (treeHasBurns && this.shouldRunCadencedUpdate(treeCadence, treeHasBurns ? 0 : 2))
    ) {
      this.treeFieldEffect.update(elapsed, this.getGroundHeightAtWorld, this.treeFieldDirty)
      this.treeFieldDirty = false
    }
    const tLog0 = now()
    const logHasMotion = this.logFieldEffect.hasMotion()
    const logCadence = logHasMotion || this.logFieldDirty ? 1 : this.cadenceFor('log')
    if ((logHasMotion || this.logFieldDirty) && this.shouldRunCadencedUpdate(logCadence, 3)) {
      this.logFieldEffect.update(elapsed, this.getGroundHeightAtWorld, this.clutterViewCullBundle)
      this.logFieldDirty = this.logFieldEffect.hasMotion()
      ranLog = true
    }
    logCpuMs = now() - tLog0
    const tStick0 = now()
    const stickHasMotion = this.stickFieldEffect.hasMotion()
    const stickCadence = stickHasMotion || this.stickFieldDirty ? 1 : this.cadenceFor('stick')
    if ((stickHasMotion || this.stickFieldDirty) && this.shouldRunCadencedUpdate(stickCadence, 1)) {
      this.stickFieldEffect.update(elapsed, this.getGroundHeightAtWorld, this.clutterViewCullBundle)
      this.stickFieldDirty = this.stickFieldEffect.hasMotion()
      ranStick = true
    }
    stickCpuMs = now() - tStick0
    const tNeedle0 = now()
    const needleHasBurns = this.needleLitterEffect.hasBurns()
    const needleCadence = needleHasBurns ? this.cadenceFor('needle') : this.idleCadenceFor('needle')
    if ((needleHasBurns || this.needleLitterDirty) && this.shouldRunCadencedUpdate(needleCadence, 0)) {
      this.needleLitterEffect.update(elapsed, this.getGroundHeightAtWorld)
      this.needleLitterDirty = this.needleLitterEffect.hasBurns()
      ranNeedles = true
    }
    needleCpuMs = now() - tNeedle0

    // Grass is the main dynamic ground-cover cost, so idle wind runs on a lighter cadence.
    // Burns are slow-moving and don't need the faster active cadence — only disturbances do.
    let grassCpuMs = 0
    let ranGrass = false
    const grassCadence = this.grassEffect.hasDisturbances()
      ? this.cadenceFor('grass')
      : this.idleCadenceFor('grass')
    if (this.shouldRunCadencedUpdate(grassCadence, 1)) {
      const tGrass0 = now()
      this.grassEffect.update(elapsed, this.grassViewCullBundle)
      grassCpuMs = now() - tGrass0
      ranGrass = true
    }
    let skyCpuMs = 0
    let ranSky = false
    const skyCadence = this.starSkyEffect.hasWounds() ? this.cadenceFor('sky') : this.idleCadenceFor('sky')
    if (this.shouldRunCadencedUpdate(skyCadence, 2)) {
      const tSky0 = now()
      this.starSkyEffect.update(elapsed)
      skyCpuMs = now() - tSky0
      ranSky = true
    }
    const tLighting0 = now()
    if (!this.sceneryMode) {
      this.updateStreetLampLighting()
    }
    const lightingCpuMs = now() - tLighting0
    if (this.collisionDebugVisible) {
      this.updateCollisionDebugOverlay()
    }
    this.skybox.position.copy(this.camera.position)
    this.starSkyEffect.group.position.copy(this.camera.position)
    const effectsCpuMs = now() - tEffects0
    this.effectUpdateMs = effectsCpuMs

    const tRender0 = now()
    this.renderer.render(this.scene, this.camera)
    const renderCpuMs = now() - tRender0
    const frameCpuMs = now() - tFrame0
    const fishCpuMs = shutterCpuMs + ivyCpuMs
    const ranSystems = [
      ...(ranGrass ? ['grass'] : []),
      ...(ranBand ? ['band'] : []),
      ...(ranRock ? ['rock'] : []),
      ...(ranLog ? ['log'] : []),
      ...(ranStick ? ['stick'] : []),
      ...(ranNeedles ? ['needles'] : []),
      ...(ranNeon ? ['neon'] : []),
      ...(ranSky ? ['sky'] : []),
      ...(ranShutter || ranIvy ? ['fish'] : []),
      ...(ranGlass ? ['glass'] : []),
    ]
    const perfSample: PerfWindowSample = {
      fps: this.fps,
      frameCpuMs,
      controllerCpuMs,
      playerCpuMs,
      effectsCpuMs,
      renderCpuMs,
      lightingCpuMs,
      lampCpuMs,
      glassCpuMs,
      grassCpuMs,
      vergeCpuMs,
      leafCpuMs,
      fungusCpuMs,
      bandCpuMs,
      rockCpuMs,
      logCpuMs,
      stickCpuMs,
      needleCpuMs,
      neonCpuMs,
      skyCpuMs,
      fishCpuMs,
    }
    this.pushPerfWindowSample(perfSample)
    this.pushPerfLongWindowSample(perfSample, now())
    this.perfStats = {
      fps: this.fps,
      fpsAvg: this.perfWindowAverage('fps'),
      frameCpuMs,
      frameCpuMsAvg: this.perfWindowAverage('frameCpuMs'),
      controllerCpuMs,
      effectsCpuMs,
      effectsCpuMsAvg: this.perfWindowAverage('effectsCpuMs'),
      renderCpuMs,
      renderCpuMsAvg: this.perfWindowAverage('renderCpuMs'),
      playerCpuMs,
      shutterCpuMs,
      ivyCpuMs,
      lampCpuMs,
      lampCpuMsAvg: this.perfWindowAverage('lampCpuMs'),
      glassCpuMs,
      glassCpuMsAvg: this.perfWindowAverage('glassCpuMs'),
      grassCpuMs,
      grassCpuMsAvg: this.perfWindowAverage('grassCpuMs'),
      vergeCpuMs,
      vergeCpuMsAvg: this.perfWindowAverage('vergeCpuMs'),
      leafCpuMs,
      leafCpuMsAvg: this.perfWindowAverage('leafCpuMs'),
      fungusCpuMs,
      fungusCpuMsAvg: this.perfWindowAverage('fungusCpuMs'),
      bandCpuMs,
      bandCpuMsAvg: this.perfWindowAverage('bandCpuMs'),
      rockCpuMs,
      rockCpuMsAvg: this.perfWindowAverage('rockCpuMs'),
      logCpuMs,
      logCpuMsAvg: this.perfWindowAverage('logCpuMs'),
      stickCpuMs,
      stickCpuMsAvg: this.perfWindowAverage('stickCpuMs'),
      needleCpuMs,
      needleCpuMsAvg: this.perfWindowAverage('needleCpuMs'),
      neonCpuMs,
      neonCpuMsAvg: this.perfWindowAverage('neonCpuMs'),
      skyCpuMs,
      skyCpuMsAvg: this.perfWindowAverage('skyCpuMs'),
      lightingCpuMs,
      fishCpuMsAvg: this.perfWindowAverage('fishCpuMs'),
      ranSystems,
      viewportWidth: this.perfStats.viewportWidth,
      viewportHeight: this.perfStats.viewportHeight,
      pixelRatio: this.perfStats.pixelRatio,
      longWindow: this.buildPerfLongWindow(),
    }
    if (this.perfLoggingEnabled && elapsed - this.lastPerfLogElapsed >= 1) {
      this.lastPerfLogElapsed = elapsed
      console.info(
        `[Weft perf] ${this.perfStats.fps.toFixed(1)} fps | frame ${this.perfStats.frameCpuMs.toFixed(2)} ms | ` +
          `controller ${this.perfStats.controllerCpuMs.toFixed(2)} | effects ${this.perfStats.effectsCpuMs.toFixed(2)} | ` +
          `render ${this.perfStats.renderCpuMs.toFixed(2)} | grass ${this.perfStats.grassCpuMs.toFixed(2)} | ` +
          `band ${this.perfStats.bandCpuMs.toFixed(2)} | ` +
          `rock ${this.perfStats.rockCpuMs.toFixed(2)} | log ${this.perfStats.logCpuMs.toFixed(2)} | ` +
          `stick ${this.perfStats.stickCpuMs.toFixed(2)} | needle ${this.perfStats.needleCpuMs.toFixed(2)} | ` +
          `neon ${this.perfStats.neonCpuMs.toFixed(2)} | ` +
          `sky ${this.perfStats.skyCpuMs.toFixed(2)} | dpr ${this.perfStats.pixelRatio.toFixed(2)} | ` +
          `${this.perfStats.viewportWidth}x${this.perfStats.viewportHeight}`,
      )
    }
    this.rafId = requestAnimationFrame(this.frame)
  }

  private updateCameraProfile(delta: number): void {
    if (this.sceneryMode) {
      this.indoorCameraBlend = 0
      this.controllerConfig.firstPerson = true
      this.controllerConfig.cameraDistance = 0
      this.controllerConfig.shoulderOffset = 0
      this.controllerConfig.cameraHeight = PlaygroundRuntime.SCENERY_FIRST_PERSON_CAMERA_HEIGHT
      this.controllerConfig.cameraFollowLerp = PLAYGROUND_CONTROLLER.cameraFollowLerp
      const targetFov = PlaygroundRuntime.SCENERY_FIRST_PERSON_FOV
      if (Math.abs(this.camera.fov - targetFov) > 0.01) {
        this.camera.fov = targetFov
        this.camera.updateProjectionMatrix()
      }
      return
    }
    this.controllerConfig.firstPerson = false
    const playerPos = this.activeFrame?.playerPosition ?? this.controller.player.group.position
    const isIndoor = isInsideBuildingInterior(playerPos.x, playerPos.z)
    if (delta <= 0) {
      this.indoorCameraBlend = isIndoor ? 1 : 0
    } else {
      const blendAlpha = 1 - Math.exp(-(isIndoor ? 10 : 7) * delta)
      this.indoorCameraBlend = THREE.MathUtils.lerp(this.indoorCameraBlend, isIndoor ? 1 : 0, blendAlpha)
    }

    const indoorDistance = Math.min(this.zoomDistance, PlaygroundRuntime.INDOOR_CAMERA_DISTANCE_MAX)
    this.controllerConfig.cameraDistance = THREE.MathUtils.lerp(this.zoomDistance, indoorDistance, this.indoorCameraBlend)
    this.controllerConfig.shoulderOffset = THREE.MathUtils.lerp(
      PLAYGROUND_CONTROLLER.shoulderOffset,
      PlaygroundRuntime.INDOOR_SHOULDER_OFFSET,
      this.indoorCameraBlend,
    )
    this.controllerConfig.cameraHeight = THREE.MathUtils.lerp(
      PLAYGROUND_CONTROLLER.cameraHeight,
      PlaygroundRuntime.INDOOR_CAMERA_HEIGHT,
      this.indoorCameraBlend,
    )
    this.controllerConfig.cameraFollowLerp = THREE.MathUtils.lerp(
      PLAYGROUND_CONTROLLER.cameraFollowLerp,
      PlaygroundRuntime.INDOOR_FOLLOW_LERP,
      this.indoorCameraBlend,
    )

    const targetFov = THREE.MathUtils.lerp(
      PlaygroundRuntime.OUTDOOR_FOV,
      PlaygroundRuntime.INDOOR_FOV,
      this.indoorCameraBlend,
    )
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov = targetFov
      this.camera.updateProjectionMatrix()
    }
  }

  private applyCameraObstruction(frame: ThirdPersonControllerFrame): void {
    this.cameraAimToEye.subVectors(this.camera.position, frame.aimOrigin)
    const targetDistance = this.cameraAimToEye.length()
    if (targetDistance <= 0.001 || this.cameraObstacles.length === 0) {
      return
    }

    this.cameraAimToEye.divideScalar(targetDistance)
    this.cameraCollisionRaycaster.set(frame.aimOrigin, this.cameraAimToEye)
    this.cameraCollisionRaycaster.far = targetDistance
    const hit = this.cameraCollisionRaycaster.intersectObjects(this.cameraObstacles, false)[0]
    if (!hit || hit.distance >= targetDistance) {
      return
    }

    const safeDistance = Math.max(
      0.12,
      hit.distance - PlaygroundRuntime.CAMERA_OBSTRUCTION_PADDING,
    )
    this.cameraSafePosition.copy(frame.aimOrigin).addScaledVector(this.cameraAimToEye, safeDistance)
    this.cameraSafePosition.y = Math.max(
      this.cameraSafePosition.y,
      this.getGroundHeightAtWorld(this.cameraSafePosition.x, this.cameraSafePosition.z) +
        PlaygroundRuntime.CAMERA_GROUND_CLEARANCE,
    )
    this.camera.position.copy(this.cameraSafePosition)

    this.cameraLookTarget.copy(frame.playerPosition)
    this.cameraLookTarget.y += this.controllerConfig.cameraHeight * 0.86
    this.cameraLookTarget.addScaledVector(frame.aimDirection, this.controllerConfig.reticleDistance * 0.42)
    this.camera.lookAt(this.cameraLookTarget)
  }
}

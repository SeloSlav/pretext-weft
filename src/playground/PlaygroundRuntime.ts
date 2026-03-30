import { seedCursor } from '../weft/core'
import {
  createBandFieldEffect,
  buildGrassStateSurface,
  createFireWallEffect,
  createShellSurfaceEffect,
  createGrassEffect,
  createRockFieldEffect,
  createStarSkyEffect,
  DEFAULT_BAND_FIELD_PARAMS,
  DEFAULT_FIRE_WALL_PARAMS,
  DEFAULT_SHELL_SURFACE_PARAMS,
  DEFAULT_GRASS_FIELD_PARAMS,
  DEFAULT_ROCK_FIELD_PARAMS,
  DEFAULT_STAR_SKY_PARAMS,
  getPreparedBandSurface,
  getPreparedFireSurface,
  getPreparedFungusBandSurface,
  getPreparedGlassSurface,
  getPreparedShellSurface,
  getPreparedIvySurface,
  getPreparedRockSurface,
  getPreparedStarSurface,
  type BandFieldParams,
  type FireWallEffect,
  type FireWallParams,
  type ShellSurfaceEffect,
  type ShellSurfaceParams,
  type GrassFieldParams,
  type RockFieldParams,
  type StarSkyParams,
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
  getQualityGrassLayoutScale,
  getQualityPixelRatioCap,
  getQualityRockLayoutScale,
  getQualityStarLayoutScale,
  type PlaygroundQuality,
  PLAYGROUND_QUALITY_DEFAULT,
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

type ReticleHit = THREE.Intersection & {
  targetKind: 'shutter' | 'ivy' | 'grass' | 'neon' | 'lamp' | 'glass'
}

export type PlaygroundPerfStats = {
  fps: number
  frameCpuMs: number
  controllerCpuMs: number
  effectsCpuMs: number
  renderCpuMs: number
  playerCpuMs: number
  shutterCpuMs: number
  ivyCpuMs: number
  lampCpuMs: number
  glassCpuMs: number
  grassCpuMs: number
  bandCpuMs: number
  rockCpuMs: number
  neonCpuMs: number
  skyCpuMs: number
  lightingCpuMs: number
  viewportWidth: number
  viewportHeight: number
  pixelRatio: number
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

export class PlaygroundRuntime {
  private static readonly INDOOR_CAMERA_DISTANCE_MAX = 3.15
  private static readonly INDOOR_SHOULDER_OFFSET = 0.24
  private static readonly INDOOR_CAMERA_HEIGHT = 1.95
  private static readonly ROOF_SNAP_DOWN_DISTANCE = 0.85
  private static readonly WALL_TOP_CLEARANCE = 0.14
  private static readonly INDOOR_FOLLOW_LERP = 14
  private static readonly OUTDOOR_FOV = 32
  private static readonly INDOOR_FOV = 37
  private static readonly CAMERA_OBSTRUCTION_PADDING = 0.22
  private static readonly CAMERA_GROUND_CLEARANCE = 0.22
  private static readonly COLLISION_DEBUG_TILE_SIZE = 0.56
  private static readonly COLLISION_DEBUG_TILE_HEIGHT = 0.42
  private static readonly COLLISION_DEBUG_SURFACE_OFFSET = 0.05
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
  private readonly grassEffect = createGrassEffect({
    surface: buildGrassStateSurface(DEFAULT_GRASS_FIELD_PARAMS.state),
    seedCursor,
    initialParams: DEFAULT_GRASS_FIELD_PARAMS,
    placementMask: {
      bounds: PLAYGROUND_BOUNDS,
      excludeAtXZ: (x, z) => isCrossRoadAsphalt(x, z) || isInsideBuildingInterior(x, z),
      coverageMultiplierAtXZ: (x, z) => (isVergeStrip(x, z) ? 1.14 : 1),
    },
  })
  private readonly vergeBandEffect = createBandFieldEffect({
    surface: getPreparedBandSurface(),
    seedCursor,
    appearance: 'scrub',
    initialParams: {
      ...DEFAULT_BAND_FIELD_PARAMS,
      layoutDensity: PLAYGROUND_BAND_LAYOUT_DENSITY,
      sizeScale: PLAYGROUND_BAND_SIZE_SCALE,
      bandWidth: PLAYGROUND_VERGE_BAND_WIDTH,
      edgeSoftness: PLAYGROUND_BAND_EDGE_SOFTNESS,
    },
    placementMask: {
      bounds: PLAYGROUND_BOUNDS,
      includeAtXZ: (x, z) => isVergeStrip(x, z) && !isInsideBuildingInterior(x, z),
      distanceToBandAtXZ: getVergeStripDistanceAtXZ,
    },
  })
  private readonly fungusBandEffect = createBandFieldEffect({
    surface: getPreparedFungusBandSurface(),
    seedCursor,
    appearance: 'fungus',
    initialParams: {
      ...DEFAULT_BAND_FIELD_PARAMS,
      layoutDensity: PLAYGROUND_BAND_LAYOUT_DENSITY,
      sizeScale: PLAYGROUND_BAND_SIZE_SCALE * 0.92,
      bandWidth: PLAYGROUND_FUNGUS_SEAM_WIDTH,
      edgeSoftness: PLAYGROUND_BAND_EDGE_SOFTNESS * 1.25,
    },
    placementMask: {
      bounds: FUNGUS_SEAM_ZONE,
      includeAtXZ: isInsideFungusSeamZone,
      distanceToBandAtXZ: distanceToFungusSeamAtXZ,
    },
  })
  private readonly rockFieldEffect = createRockFieldEffect({
    surface: getPreparedRockSurface(),
    seedCursor,
    initialParams: DEFAULT_ROCK_FIELD_PARAMS,
    placementMask: {
      bounds: PLAYGROUND_BOUNDS,
      includeAtXZ: isInsideRubbleZone,
    },
  })
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
    lookActive: false,
    lookDeltaX: 0,
    lookDeltaY: 0,
  }

  private renderer: Awaited<ReturnType<typeof createWebGPURenderer>> | null = null
  private resizeObserver: ResizeObserver | null = null
  private rafId = 0
  private disposed = false
  private lastElapsed = 0
  private readonly skybox: THREE.Mesh
  private walkStampDistance = 0
  private pendingShoot = false
  private pendingJump = false
  private activeFrame: ThirdPersonControllerFrame | null = null
  private readonly laserBeamGroup: THREE.Group
  private readonly laserBeamOuter: THREE.Mesh
  private readonly laserBeamCore: THREE.Mesh
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

  private shellSurfaceParams: ShellSurfaceParams = {
    ...DEFAULT_SHELL_SURFACE_PARAMS,
    recoveryRate: FACADE_FISH_RECOVERY_RATE,
  }
  private glassSurfaceParams: ShellSurfaceParams = { ...DEFAULT_GLASS_SURFACE_PARAMS }
  private grassFieldParams: GrassFieldParams = { ...DEFAULT_GRASS_FIELD_PARAMS }
  private vergeBandParams: BandFieldParams = {
    ...DEFAULT_BAND_FIELD_PARAMS,
    layoutDensity: PLAYGROUND_BAND_LAYOUT_DENSITY,
    sizeScale: PLAYGROUND_BAND_SIZE_SCALE,
    bandWidth: PLAYGROUND_VERGE_BAND_WIDTH,
    edgeSoftness: PLAYGROUND_BAND_EDGE_SOFTNESS,
  }
  private fungusBandParams: BandFieldParams = {
    ...DEFAULT_BAND_FIELD_PARAMS,
    layoutDensity: PLAYGROUND_BAND_LAYOUT_DENSITY,
    sizeScale: PLAYGROUND_BAND_SIZE_SCALE * 0.92,
    bandWidth: PLAYGROUND_FUNGUS_SEAM_WIDTH,
    edgeSoftness: PLAYGROUND_BAND_EDGE_SOFTNESS * 1.25,
  }
  private rockFieldParams: RockFieldParams = { ...DEFAULT_ROCK_FIELD_PARAMS }
  private starSkyParams: StarSkyParams = { ...DEFAULT_STAR_SKY_PARAMS }
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
    lookActive: false,
    lookDeltaX: 0,
    lookDeltaY: 0,
  }
  private readonly controllerConfig: ThirdPersonControllerConfig = { ...PLAYGROUND_CONTROLLER }
  private quality: PlaygroundQuality = PLAYGROUND_QUALITY_DEFAULT
  /** Editor-facing layout densities before quality scaling. */
  private userGrassLayoutDensity = DEFAULT_GRASS_FIELD_PARAMS.layoutDensity
  private userBandLayoutDensity = PLAYGROUND_BAND_LAYOUT_DENSITY
  private userStarLayoutDensity = DEFAULT_STAR_SKY_PARAMS.layoutDensity
  private userRockLayoutDensity = DEFAULT_ROCK_FIELD_PARAMS.layoutDensity
  private indoorCameraBlend = 0
  private frameTick = 0
  /** Last frame CPU time spent in effect updates (ms), for debugging. */
  effectUpdateMs = 0
  /** Smoothed presentation FPS for the current runtime. */
  fps = 0
  perfStats: PlaygroundPerfStats = {
    fps: 0,
    frameCpuMs: 0,
    controllerCpuMs: 0,
    effectsCpuMs: 0,
    renderCpuMs: 0,
    playerCpuMs: 0,
    shutterCpuMs: 0,
    ivyCpuMs: 0,
    lampCpuMs: 0,
    glassCpuMs: 0,
    grassCpuMs: 0,
    bandCpuMs: 0,
    rockCpuMs: 0,
    neonCpuMs: 0,
    skyCpuMs: 0,
    lightingCpuMs: 0,
    viewportWidth: 0,
    viewportHeight: 0,
    pixelRatio: 1,
  }
  private readonly perfLoggingEnabled =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('perf') === '1'
  private lastPerfLogElapsed = 0

  constructor(host: HTMLElement) {
    this.host = host
    this.canvas.className = 'canvas'
    this.canvas.tabIndex = 0
    this.camera.position.set(0, 2.2, 10.8)

    this.skybox = applyPlaygroundAtmosphere(this.scene)
    addPlaygroundLighting(this.scene)

    const townScene = createTownIntersectionScene()
    this.townGroup = townScene.root
    this.cameraObstacles = townScene.cameraObstacles
    this.lampLights = townScene.lampLights
    this.lampGlobes = townScene.lampGlobes
    this.scene.add(this.townGroup)

    this.cameraFill.position.set(0, 0.85, 2.6)
    this.camera.add(this.cameraFill)
    this.scene.add(this.camera)

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

    const bulbY = TOWN_ROAD_SURFACE_Y + STREET_LAMP_BULB_Y_OFFSET
    const lamps: ShellSurfaceEffect[] = []
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
    this.lampEffects = lamps

    const windowGlassEffects: ShellSurfaceEffect[] = []
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
    this.windowGlassEffects = windowGlassEffects

    const raycastList: THREE.Object3D[] = [
      this.shutterEffect.interactionMesh,
      this.ivyEffect.interactionMesh,
      this.grassEffect.interactionMesh,
    ]
    for (const e of this.neonSignEffects) {
      raycastList.push(e.interactionMesh)
    }
    for (const e of this.lampEffects) {
      raycastList.push(e.interactionMesh)
    }
    for (const e of this.windowGlassEffects) {
      raycastList.push(e.interactionMesh)
    }
    this.raycastTargets = raycastList

    this.collisionDebugTiles = this.createCollisionDebugTiles()
    this.collisionDebugGroup.visible = false

    this.scene.add(this.grassEffect.group)
    this.scene.add(this.vergeBandEffect.group)
    this.scene.add(this.fungusBandEffect.group)
    this.scene.add(this.shutterEffect.group)
    this.scene.add(this.ivyEffect.group)
    this.scene.add(this.rockFieldEffect.group)
    this.scene.add(this.starSkyEffect.group)
    this.scene.add(this.collisionDebugGroup)
    for (const effect of this.neonSignEffects) {
      this.scene.add(effect.group)
    }

    this.scene.add(this.controller.player.group)
    this.camera.add(this.controller.player.reticle)
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
      this.userGrassLayoutDensity = params.layoutDensity
    }
    this.grassFieldParams.layoutDensity =
      this.userGrassLayoutDensity * getQualityGrassLayoutScale(this.quality)
    if (params.state !== undefined) {
      this.grassEffect.setSurface(buildGrassStateSurface(this.grassFieldParams.state))
    }
    this.grassEffect.setParams(this.grassFieldParams)
  }

  setBandFieldParams(params: {
    layoutDensity?: number
    sizeScale?: number
    edgeSoftness?: number
    vergeBandWidth?: number
    fungusBandWidth?: number
    showVergeBand?: boolean
    showFungusBand?: boolean
  }): void {
    if (params.layoutDensity !== undefined) {
      this.userBandLayoutDensity = params.layoutDensity
    }
    if (params.sizeScale !== undefined) {
      this.vergeBandParams.sizeScale = params.sizeScale
      this.fungusBandParams.sizeScale = params.sizeScale * 0.92
    }
    if (params.edgeSoftness !== undefined) {
      this.vergeBandParams.edgeSoftness = params.edgeSoftness
      this.fungusBandParams.edgeSoftness = params.edgeSoftness * 1.25
    }
    if (params.vergeBandWidth !== undefined) {
      this.vergeBandParams.bandWidth = params.vergeBandWidth
    }
    if (params.fungusBandWidth !== undefined) {
      this.fungusBandParams.bandWidth = params.fungusBandWidth
    }
    const scaledDensity = this.userBandLayoutDensity * getQualityGrassLayoutScale(this.quality)
    this.vergeBandParams.layoutDensity = scaledDensity
    this.fungusBandParams.layoutDensity = scaledDensity
    this.vergeBandEffect.setParams(this.vergeBandParams)
    this.fungusBandEffect.setParams(this.fungusBandParams)
    if (params.showVergeBand !== undefined) {
      this.vergeBandEffect.group.visible = params.showVergeBand
    }
    if (params.showFungusBand !== undefined) {
      this.fungusBandEffect.group.visible = params.showFungusBand
    }
  }

  setRockFieldParams(params: Partial<RockFieldParams>): void {
    this.rockFieldParams = { ...this.rockFieldParams, ...params }
    if (params.layoutDensity !== undefined) {
      this.userRockLayoutDensity = params.layoutDensity
    }
    this.rockFieldParams.layoutDensity =
      this.userRockLayoutDensity * getQualityRockLayoutScale(this.quality)
    this.rockFieldEffect.setParams(this.rockFieldParams)
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
      this.userStarLayoutDensity * getQualityStarLayoutScale(this.quality)
    this.starSkyEffect.setParams(this.starSkyParams)
  }

  setCollisionDebugVisible(visible: boolean): void {
    this.collisionDebugVisible = visible
    this.collisionDebugGroup.visible = visible
    if (visible) {
      this.updateCollisionDebugOverlay()
    }
  }

  /** Low/Medium/High: DPR cap + scaled grass/star/rock layout density (editor values preserved). */
  setQuality(quality: PlaygroundQuality): void {
    this.quality = quality
    this.grassFieldParams.layoutDensity =
      this.userGrassLayoutDensity * getQualityGrassLayoutScale(this.quality)
    this.grassEffect.setParams(this.grassFieldParams)
    this.vergeBandParams.layoutDensity =
      this.userBandLayoutDensity * getQualityGrassLayoutScale(this.quality)
    this.fungusBandParams.layoutDensity = this.vergeBandParams.layoutDensity
    this.vergeBandEffect.setParams(this.vergeBandParams)
    this.fungusBandEffect.setParams(this.fungusBandParams)
    this.starSkyParams.layoutDensity =
      this.userStarLayoutDensity * getQualityStarLayoutScale(this.quality)
    this.starSkyEffect.setParams(this.starSkyParams)
    this.rockFieldParams.layoutDensity =
      this.userRockLayoutDensity * getQualityRockLayoutScale(this.quality)
    this.rockFieldEffect.setParams(this.rockFieldParams)
    this.resize()
  }

  getQuality(): PlaygroundQuality {
    return this.quality
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

  clearFireWounds(): void {
    for (const effect of this.neonSignEffects) {
      effect.clearWounds()
    }
  }

  clearSkyWounds(): void {
    this.starSkyEffect.clearWounds()
  }

  clearAllEffects(): void {
    this.clearFishWounds()
    this.clearGlassWounds()
    this.clearGrassDisturbances()
    this.clearFireWounds()
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
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    window.removeEventListener('blur', this.handleWindowBlur)
    this.scene.remove(this.townGroup)
    this.scene.remove(this.grassEffect.group)
    this.scene.remove(this.vergeBandEffect.group)
    this.scene.remove(this.fungusBandEffect.group)
    this.scene.remove(this.shutterEffect.group)
    this.scene.remove(this.ivyEffect.group)
    this.scene.remove(this.rockFieldEffect.group)
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
    this.laserBeamOuter.geometry.dispose()
    this.laserBeamCore.geometry.dispose()
    ;(this.laserBeamOuter.material as THREE.MeshBasicMaterial).dispose()
    ;(this.laserBeamCore.material as THREE.MeshBasicMaterial).dispose()
    for (const tile of this.collisionDebugTiles) {
      tile.mesh.geometry.dispose()
      tile.mesh.material.dispose()
    }
    this.shutterEffect.dispose()
    this.ivyEffect.dispose()
    this.grassEffect.dispose()
    this.vergeBandEffect.dispose()
    this.fungusBandEffect.dispose()
    this.rockFieldEffect.dispose()
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
    const cap = getQualityPixelRatioCap(this.quality)
    const pixelRatio = Math.min(window.devicePixelRatio || 1, cap)
    this.renderer.setPixelRatio(pixelRatio)
    this.renderer.setSize(width, height, false)
    this.perfStats.viewportWidth = width
    this.perfStats.viewportHeight = height
    this.perfStats.pixelRatio = pixelRatio
  }

  private resetPlayer(): void {
    const spawn = new THREE.Vector3(
      PLAYGROUND_SPAWN.x,
      this.grassEffect.getGroundHeightAtWorld(PLAYGROUND_SPAWN.x, PLAYGROUND_SPAWN.z),
      PLAYGROUND_SPAWN.z,
    )

    this.walkStampDistance = 0
    this.pendingJump = false
    this.controller.setSpawn(spawn, PLAYGROUND_SPAWN.yaw, PLAYGROUND_SPAWN.yaw, PLAYGROUND_SPAWN.pitch)
    this.controllerConfig.cameraDistance = this.zoomDistance
    this.activeFrame = this.controller.update(
      this.camera,
      this.syncFrameInput(),
      this.controllerConfig,
      PLAYGROUND_BOUNDS,
      this.getPlayerWalkHeightAtWorld,
      1,
      this.resolveHorizontalMove,
    )

    const elapsed = this.timer.getElapsed()
    this.shutterEffect.update(elapsed)
    this.ivyEffect.update(elapsed)
    for (const lamp of this.lampEffects) {
      lamp.update(elapsed)
    }
    for (const glass of this.windowGlassEffects) {
      glass.update(elapsed)
    }
    this.grassEffect.update(elapsed)
    this.vergeBandEffect.update(this.getGroundHeightAtWorld)
    this.fungusBandEffect.update(this.getGroundHeightAtWorld)
    this.controller.player.update(0, 'idle')
  }

  private syncFrameInput(): ThirdPersonControllerInput {
    this.frameInput.moveForward = this.inputState.moveForward
    this.frameInput.moveBackward = this.inputState.moveBackward
    this.frameInput.moveLeft = this.inputState.moveLeft
    this.frameInput.moveRight = this.inputState.moveRight
    this.frameInput.sprint = this.inputState.sprint
    this.frameInput.lookActive = this.inputState.lookActive
    this.frameInput.lookDeltaX = this.inputState.lookDeltaX
    this.frameInput.lookDeltaY = this.inputState.lookDeltaY
    this.frameInput.jump = this.pendingJump
    return this.frameInput
  }

  private getGroundHeightAtWorld = (x: number, z: number): number => {
    const gy = this.grassEffect.getGroundHeightAtWorld(x, z)
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
    const roofY = this.getRoofHeightAtWorld(x, z, this.getPlayerCollisionProbeY())
    return roofY == null ? gy : Math.max(gy, roofY)
  }

  private getPlayerCollisionProbeY(): number {
    return this.activeFrame?.playerPosition.y ?? this.controller.player.group.position.y
  }

  private cadenceFor(kind: 'grass' | 'fish' | 'neon' | 'sky' | 'glass'): number {
    switch (this.quality) {
      case 'low':
        if (kind === 'grass') return 3
        if (kind === 'sky') return 3
        if (kind === 'glass') return 3
        return 2
      case 'medium':
        if (kind === 'grass') return 2
        if (kind === 'sky') return 3
        if (kind === 'glass') return 3
        return 2
      case 'high':
      default:
        return 1
    }
  }

  private shouldRunCadencedUpdate(interval: number, offset: number): boolean {
    return interval <= 1 || this.frameTick % interval === offset % interval
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

  /**
   * Use `mousedown` instead of `pointerdown` so LMB still fires while RMB is already held
   * for orbit/pan; pointer events do not emit a second `pointerdown` for chorded mouse buttons.
   */
  private handleWindowMouseDownForShoot = (event: MouseEvent): void => {
    if (this.disposed || event.button !== 0) return
    const t = event.target
    if (!(t instanceof Node) || !this.host.contains(t)) return
    this.pendingShoot = true
    this.canvas.focus()
  }

  private handlePointerDown = (event: PointerEvent): void => {
    this.canvas.focus()
    if (event.button === 2) {
      this.inputState.lookActive = true
      this.canvas.setPointerCapture(event.pointerId)
    }
  }

  private handlePointerMove = (event: PointerEvent): void => {
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
    this.zoomDistance = THREE.MathUtils.clamp(this.zoomDistance + event.deltaY * 0.01, PLAYGROUND_ZOOM.min, PLAYGROUND_ZOOM.max)
  }

  private handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'KeyW') this.inputState.moveForward = true
    if (event.code === 'KeyS') this.inputState.moveBackward = true
    if (event.code === 'KeyA') this.inputState.moveLeft = true
    if (event.code === 'KeyD') this.inputState.moveRight = true
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.inputState.sprint = true
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
    this.inputState.lookActive = false
    this.inputState.lookDeltaX = 0
    this.inputState.lookDeltaY = 0
    this.pendingShoot = false
    this.pendingJump = false
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
    if (
      isCrossRoadAsphalt(this.footstepPoint.x, this.footstepPoint.z) ||
      isInsideBuildingInterior(this.footstepPoint.x, this.footstepPoint.z)
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
    for (const mesh of [this.laserBeamOuter, this.laserBeamCore]) {
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
      this.grassEffect.addDisturbanceFromWorldPoint(grassHit.point, {
        radiusScale: 1.15,
        strength: 1.45,
        deformGround: false,
      })
      return
    }

    this.grassEffect.addDisturbanceFromWorldPoint(hit.point, { radiusScale: 1.15, strength: 1.45, deformGround: false })
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
      PLAYGROUND_BOUNDS,
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

    const tEffects0 = now()
    const tPlayer0 = now()
    this.controller.player.update(delta, this.getPlayerAnimationState(this.activeFrame))
    const playerCpuMs = now() - tPlayer0
    const fishCadence = this.cadenceFor('fish')
    let shutterCpuMs = 0
    let ivyCpuMs = 0
    if (this.shouldRunCadencedUpdate(fishCadence, 0)) {
      const tShutter0 = now()
      this.shutterEffect.update(elapsed)
      shutterCpuMs = now() - tShutter0
    }
    if (this.shouldRunCadencedUpdate(fishCadence, 1)) {
      const tIvy0 = now()
      this.ivyEffect.update(elapsed)
      ivyCpuMs = now() - tIvy0
    }
    const tLamp0 = now()
    for (const lamp of this.lampEffects) {
      if (lamp.hasWounds() || (this.frameTick & 1) === 0) {
        lamp.update(elapsed)
      }
    }
    const lampCpuMs = now() - tLamp0
    const tGlass0 = now()
    const glassCadence = this.cadenceFor('glass')
    for (const glass of this.windowGlassEffects) {
      if (glass.hasWounds() || this.shouldRunCadencedUpdate(glassCadence, 1)) {
        glass.update(elapsed)
      }
    }
    const glassCpuMs = now() - tGlass0
    // Grass update first so later samples read the current flattened field state.
    let grassCpuMs = 0
    if (this.shouldRunCadencedUpdate(this.cadenceFor('grass'), 0)) {
      const tGrass0 = now()
      this.grassEffect.update(elapsed)
      grassCpuMs = now() - tGrass0
    }
    const tBand0 = now()
    this.vergeBandEffect.update(this.getGroundHeightAtWorld)
    this.fungusBandEffect.update(this.getGroundHeightAtWorld)
    const bandCpuMs = now() - tBand0
    const tRock0 = now()
    this.rockFieldEffect.update(this.getGroundHeightAtWorld)
    const rockCpuMs = now() - tRock0
    let neonCpuMs = 0
    if (this.shouldRunCadencedUpdate(this.cadenceFor('neon'), 0)) {
      const tNeon0 = now()
      for (const effect of this.neonSignEffects) {
        effect.update(elapsed)
      }
      neonCpuMs = now() - tNeon0
    }
    let skyCpuMs = 0
    if (this.shouldRunCadencedUpdate(this.cadenceFor('sky'), 2)) {
      const tSky0 = now()
      this.starSkyEffect.update(elapsed)
      skyCpuMs = now() - tSky0
    }
    const tLighting0 = now()
    this.updateStreetLampLighting()
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
    this.perfStats = {
      fps: this.fps,
      frameCpuMs,
      controllerCpuMs,
      effectsCpuMs,
      renderCpuMs,
      playerCpuMs,
      shutterCpuMs,
      ivyCpuMs,
      lampCpuMs,
      glassCpuMs,
      grassCpuMs,
      bandCpuMs,
      rockCpuMs,
      neonCpuMs,
      skyCpuMs,
      lightingCpuMs,
      viewportWidth: this.perfStats.viewportWidth,
      viewportHeight: this.perfStats.viewportHeight,
      pixelRatio: this.perfStats.pixelRatio,
    }
    if (this.perfLoggingEnabled && elapsed - this.lastPerfLogElapsed >= 1) {
      this.lastPerfLogElapsed = elapsed
      console.info(
        `[Weft perf] ${this.perfStats.fps.toFixed(1)} fps | frame ${this.perfStats.frameCpuMs.toFixed(2)} ms | ` +
          `controller ${this.perfStats.controllerCpuMs.toFixed(2)} | effects ${this.perfStats.effectsCpuMs.toFixed(2)} | ` +
          `render ${this.perfStats.renderCpuMs.toFixed(2)} | grass ${this.perfStats.grassCpuMs.toFixed(2)} | ` +
          `band ${this.perfStats.bandCpuMs.toFixed(2)} | ` +
          `rock ${this.perfStats.rockCpuMs.toFixed(2)} | neon ${this.perfStats.neonCpuMs.toFixed(2)} | ` +
          `sky ${this.perfStats.skyCpuMs.toFixed(2)} | dpr ${this.perfStats.pixelRatio.toFixed(2)} | ` +
          `${this.perfStats.viewportWidth}x${this.perfStats.viewportHeight}`,
      )
    }
    this.rafId = requestAnimationFrame(this.frame)
  }

  private updateCameraProfile(delta: number): void {
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

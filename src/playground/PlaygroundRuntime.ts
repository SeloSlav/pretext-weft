import { seedCursor } from '../weft/core'
import {
  buildGrassStateSurface,
  createFireWallEffect,
  createFishScaleEffect,
  createGrassEffect,
  createRockFieldEffect,
  createStarSkyEffect,
  DEFAULT_FIRE_WALL_PARAMS,
  DEFAULT_FISH_SCALE_PARAMS,
  DEFAULT_GRASS_FIELD_PARAMS,
  DEFAULT_ROCK_FIELD_PARAMS,
  DEFAULT_STAR_SKY_PARAMS,
  getPreparedFireSurface,
  getPreparedFishSurface,
  getPreparedIvySurface,
  getPreparedRockSurface,
  getPreparedStarSurface,
  type FireWallParams,
  type FishScaleEffect,
  type FishScaleParams,
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
  type ThirdPersonControllerFrame,
} from './thirdPersonController'
import {
  createTownIntersectionScene,
  STREET_LAMP_BULB_Y_OFFSET,
  STREET_LIGHT_XZ,
} from './playgroundTownScene'
import { TOWN_ROAD_SURFACE_Y, isCrossRoadAsphalt } from './townRoadMask'
import {
  IVY_WALL_LAYOUT,
  NEON_BARRIER,
  PLAYGROUND_BOUNDS,
  PLAYGROUND_CONTROLLER,
  PLAYGROUND_SPAWN,
  PLAYGROUND_ZOOM,
  SHUTTER_WALL_LAYOUT,
  DEFAULT_GLASS_SURFACE_PARAMS,
  STREET_LAMP_GLASS_BREAK_THRESHOLD,
  STREET_LAMP_GLOBE_EMISSIVE_MAX,
  STREET_LAMP_POINT_INTENSITY_MAX,
  WINDOW_GLASS_LAYOUTS,
} from './playgroundWorld'

type ReticleHit = THREE.Intersection & {
  targetKind: 'shutter' | 'ivy' | 'grass' | 'neon' | 'lamp' | 'glass'
}

export class PlaygroundRuntime {
  private readonly host: HTMLElement
  private readonly canvas = document.createElement('canvas')
  private readonly timer = new Timer()
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.2, 600)
  private readonly cameraFill = new THREE.PointLight('#fff4dc', 1.65, 26, 2)
  private readonly raycaster = new THREE.Raycaster()
  private readonly grassAimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private readonly grassFallbackPoint = new THREE.Vector3()
  private readonly playerForward = new THREE.Vector3()
  private readonly footstepPoint = new THREE.Vector3()
  private readonly ndcCenter = new THREE.Vector2(0, 0)
  private readonly shutterEffect = createFishScaleEffect({
    surface: getPreparedFishSurface(),
    seedCursor,
    initialParams: DEFAULT_FISH_SCALE_PARAMS,
    appearance: 'shutter',
    effectId: 'shutter-facade',
  })
  private readonly ivyEffect = createFishScaleEffect({
    surface: getPreparedIvySurface(),
    seedCursor,
    initialParams: DEFAULT_FISH_SCALE_PARAMS,
    appearance: 'ivy',
    effectId: 'ivy-facade',
  })
  private readonly grassEffect = createGrassEffect({
    surface: buildGrassStateSurface(DEFAULT_GRASS_FIELD_PARAMS.state),
    seedCursor,
    initialParams: DEFAULT_GRASS_FIELD_PARAMS,
  })
  private readonly rockFieldEffect = createRockFieldEffect({
    surface: getPreparedRockSurface(),
    seedCursor,
    initialParams: DEFAULT_ROCK_FIELD_PARAMS,
  })
  private readonly neonSignEffect = createFireWallEffect({
    surface: getPreparedFireSurface(),
    seedCursor,
    initialParams: {
      ...DEFAULT_FIRE_WALL_PARAMS,
      appearance: 'neon',
      wallWidth: NEON_BARRIER.wallWidth,
      wallHeight: NEON_BARRIER.wallHeight,
      recoveryRate: 0.42,
      holeSize: 0.92,
    },
  })
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

  private fishScaleParams: FishScaleParams = { ...DEFAULT_FISH_SCALE_PARAMS }
  private glassSurfaceParams: FishScaleParams = { ...DEFAULT_GLASS_SURFACE_PARAMS }
  private grassFieldParams: GrassFieldParams = { ...DEFAULT_GRASS_FIELD_PARAMS }
  private rockFieldParams: RockFieldParams = { ...DEFAULT_ROCK_FIELD_PARAMS }
  private starSkyParams: StarSkyParams = { ...DEFAULT_STAR_SKY_PARAMS }
  private zoomDistance = PLAYGROUND_ZOOM.current
  private readonly townGroup: THREE.Group
  private readonly lampLights: THREE.PointLight[]
  private readonly lampGlobes: THREE.Mesh[]
  private readonly lampEffects: FishScaleEffect[]
  private readonly windowGlassEffects: FishScaleEffect[]

  constructor(host: HTMLElement) {
    this.host = host
    this.canvas.className = 'canvas'
    this.canvas.tabIndex = 0
    this.camera.position.set(0, 2.2, 10.8)

    this.skybox = applyPlaygroundAtmosphere(this.scene)
    addPlaygroundLighting(this.scene)

    const townScene = createTownIntersectionScene()
    this.townGroup = townScene.root
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

    const neonGroundY = this.grassEffect.getGroundHeightAtWorld(NEON_BARRIER.x, NEON_BARRIER.z)
    this.neonSignEffect.group.position.set(NEON_BARRIER.x, neonGroundY + 0.06, NEON_BARRIER.z)
    this.neonSignEffect.group.rotation.y = NEON_BARRIER.rotationY

    const bulbY = TOWN_ROAD_SURFACE_Y + STREET_LAMP_BULB_Y_OFFSET
    const lamps: FishScaleEffect[] = []
    for (let i = 0; i < STREET_LIGHT_XZ.length; i++) {
      const pos = STREET_LIGHT_XZ[i]!
      const lampEffect = createFishScaleEffect({
        surface: getPreparedFishSurface(),
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

    const windowGlassEffects: FishScaleEffect[] = []
    for (let i = 0; i < WINDOW_GLASS_LAYOUTS.length; i++) {
      const layout = WINDOW_GLASS_LAYOUTS[i]!
      const glassEffect = createFishScaleEffect({
        surface: getPreparedFishSurface(),
        seedCursor,
        effectId: `building-window-glass-${i}`,
        appearance: 'glass',
        initialParams: this.glassSurfaceParams,
      })
      glassEffect.group.position.set(layout.x, layout.y, layout.z)
      glassEffect.group.rotation.y = layout.rotationY
      glassEffect.group.scale.set(layout.scaleX, layout.scaleY, layout.scaleZ)
      this.scene.add(glassEffect.group)
      windowGlassEffects.push(glassEffect)
    }
    this.windowGlassEffects = windowGlassEffects

    this.scene.add(this.grassEffect.group)
    this.scene.add(this.shutterEffect.group)
    this.scene.add(this.ivyEffect.group)
    this.scene.add(this.rockFieldEffect.group)
    this.scene.add(this.starSkyEffect.group)
    this.scene.add(this.neonSignEffect.group)

    this.scene.add(this.controller.player.group)
    this.camera.add(this.controller.player.reticle)
    this.controller.player.setReticleVisible(true)

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
    this.canvas.addEventListener('mousedown', this.handleMouseDown)
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

  setFishScaleParams(params: Partial<FishScaleParams>): void {
    this.fishScaleParams = { ...this.fishScaleParams, ...params }
    this.shutterEffect.setParams(this.fishScaleParams)
    this.ivyEffect.setParams(this.fishScaleParams)
  }

  setGlassSurfaceParams(params: Partial<FishScaleParams>): void {
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
    if (params.state !== undefined) {
      this.grassEffect.setSurface(buildGrassStateSurface(this.grassFieldParams.state))
    }
    this.grassEffect.setParams(this.grassFieldParams)
  }

  setRockFieldParams(params: Partial<RockFieldParams>): void {
    this.rockFieldParams = { ...this.rockFieldParams, ...params }
    this.rockFieldEffect.setParams(this.rockFieldParams)
  }

  setFireWallParams(params: Partial<FireWallParams>): void {
    this.neonSignEffect.setParams({ ...params, appearance: 'neon' })
  }

  setStarSkyParams(params: Partial<StarSkyParams>): void {
    this.starSkyParams = { ...this.starSkyParams, ...params }
    this.starSkyEffect.setParams(this.starSkyParams)
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
    this.neonSignEffect.clearWounds()
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
    this.canvas.removeEventListener('mousedown', this.handleMouseDown)
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
    this.scene.remove(this.shutterEffect.group)
    this.scene.remove(this.ivyEffect.group)
    this.scene.remove(this.rockFieldEffect.group)
    this.scene.remove(this.starSkyEffect.group)
    this.scene.remove(this.neonSignEffect.group)
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
    this.shutterEffect.dispose()
    this.ivyEffect.dispose()
    this.grassEffect.dispose()
    this.rockFieldEffect.dispose()
    this.starSkyEffect.dispose()
    this.neonSignEffect.dispose()
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setSize(width, height, false)
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
    this.activeFrame = this.controller.update(
      this.camera,
      this.getFrameInput(),
      this.getControllerConfig(),
      PLAYGROUND_BOUNDS,
      this.getGroundHeightAtWorld,
      1,
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
    this.updateReticleFromCamera()
    this.controller.player.update(0, 'idle')
  }

  private getControllerConfig() {
    return {
      ...PLAYGROUND_CONTROLLER,
      cameraDistance: this.zoomDistance,
    }
  }

  private getGroundHeightAtWorld = (x: number, z: number): number => {
    const gy = this.grassEffect.getGroundHeightAtWorld(x, z)
    if (isCrossRoadAsphalt(x, z)) {
      return Math.max(gy, TOWN_ROAD_SURFACE_Y)
    }
    return gy
  }

  private handlePointerDown = (event: PointerEvent): void => {
    this.canvas.focus()
    if (event.button === 2) {
      this.inputState.lookActive = true
      this.canvas.setPointerCapture(event.pointerId)
    }
  }

  private handleMouseDown = (event: MouseEvent): void => {
    if (event.button === 0) {
      this.canvas.focus()
      this.pendingShoot = true
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

  private getFrameInput() {
    return {
      ...this.inputState,
      jump: this.pendingJump,
    }
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
    if (isCrossRoadAsphalt(this.footstepPoint.x, this.footstepPoint.z)) {
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

    const hits = this.raycaster.intersectObjects(
      [
        this.shutterEffect.interactionMesh,
        this.ivyEffect.interactionMesh,
        this.grassEffect.interactionMesh,
        this.neonSignEffect.interactionMesh,
        ...this.lampEffects.map((e) => e.interactionMesh),
        ...this.windowGlassEffects.map((e) => e.interactionMesh),
      ],
      false,
    )
    const hit = hits[0]
    if (!hit?.point) return null

    let targetKind: ReticleHit['targetKind']
    if (hit.object === this.shutterEffect.interactionMesh) targetKind = 'shutter'
    else if (hit.object === this.ivyEffect.interactionMesh) targetKind = 'ivy'
    else if (hit.object === this.neonSignEffect.interactionMesh) targetKind = 'neon'
    else if (this.lampEffects.some((e) => e.interactionMesh === hit.object)) targetKind = 'lamp'
    else if (this.windowGlassEffects.some((e) => e.interactionMesh === hit.object)) targetKind = 'glass'
    else targetKind = 'grass'

    return { ...hit, targetKind }
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
      this.neonSignEffect.addWoundFromWorldPoint(hit.point)
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

  private showFallbackReticle(): void {
    this.controller.player.setReticleVisible(true)
  }

  private updateReticleFromCamera(): void {
    const hit = this.getCenterRayHit() ?? this.getGrassFallbackHit()
    if (!hit?.point) {
      this.showFallbackReticle()
      return
    }
    this.controller.player.setReticleVisible(true)
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

    this.timer.update(time)
    const elapsed = this.timer.getElapsed()
    const delta = this.lastElapsed === 0 ? 0 : Math.min(0.05, Math.max(0, elapsed - this.lastElapsed))
    this.lastElapsed = elapsed

    this.activeFrame = this.controller.update(
      this.camera,
      this.getFrameInput(),
      this.getControllerConfig(),
      PLAYGROUND_BOUNDS,
      this.getGroundHeightAtWorld,
      delta,
    )
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

    this.controller.player.update(delta, this.getPlayerAnimationState(this.activeFrame))
    this.shutterEffect.update(elapsed)
    this.ivyEffect.update(elapsed)
    for (const lamp of this.lampEffects) {
      lamp.update(elapsed)
    }
    for (const glass of this.windowGlassEffects) {
      glass.update(elapsed)
    }
    // Grass update first so later samples read the current flattened field state.
    this.grassEffect.update(elapsed)
    this.rockFieldEffect.update(this.getGroundHeightAtWorld)
    this.neonSignEffect.update(elapsed)
    this.starSkyEffect.update(elapsed)
    this.updateStreetLampLighting()
    this.skybox.position.copy(this.camera.position)
    this.starSkyEffect.group.position.copy(this.camera.position)
    this.updateReticleFromCamera()
    this.renderer.render(this.scene, this.camera)
    this.rafId = requestAnimationFrame(this.frame)
  }
}

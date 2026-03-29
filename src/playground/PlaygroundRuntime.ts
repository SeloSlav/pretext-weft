import { seedCursor } from '../weft/core'
import {
  buildGrassStateSurface,
  createFireWallEffect,
  createFishScaleEffect,
  createGrassEffect,
  createRockFieldEffect,
  createStarSkyEffect,
  DEFAULT_FISH_SCALE_PARAMS,
  DEFAULT_GRASS_FIELD_PARAMS,
  DEFAULT_ROCK_FIELD_PARAMS,
  DEFAULT_STAR_SKY_PARAMS,
  getPreparedFireSurface,
  getPreparedFishSurface,
  getPreparedRockSurface,
  getPreparedStarSurface,
  type FireWallParams,
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
  FIRE_POSITION,
  FISH_SURFACE_LAYOUT,
  PLAYGROUND_BOUNDS,
  PLAYGROUND_CONTROLLER,
  PLAYGROUND_SPAWN,
  PLAYGROUND_ZOOM,
} from './playgroundWorld'

type ReticleHit = THREE.Intersection & {
  targetKind: 'fish' | 'grass' | 'fire'
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
  private readonly fishScaleEffect = createFishScaleEffect({
    surface: getPreparedFishSurface(),
    seedCursor,
    initialParams: DEFAULT_FISH_SCALE_PARAMS,
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
  private readonly fireWallEffect = createFireWallEffect({
    surface: getPreparedFireSurface(),
    seedCursor,
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
  private grassFieldParams: GrassFieldParams = { ...DEFAULT_GRASS_FIELD_PARAMS }
  private rockFieldParams: RockFieldParams = { ...DEFAULT_ROCK_FIELD_PARAMS }
  private starSkyParams: StarSkyParams = { ...DEFAULT_STAR_SKY_PARAMS }
  private zoomDistance = PLAYGROUND_ZOOM.current

  constructor(host: HTMLElement) {
    this.host = host
    this.canvas.className = 'canvas'
    this.canvas.tabIndex = 0
    this.camera.position.set(0, 2.2, 10.8)

    this.skybox = applyPlaygroundAtmosphere(this.scene)
    addPlaygroundLighting(this.scene)

    this.cameraFill.position.set(0, 0.85, 2.6)
    this.camera.add(this.cameraFill)
    this.scene.add(this.camera)

    const fishWallGround = this.grassEffect.getWalkHeightAtWorld(FISH_SURFACE_LAYOUT.x, FISH_SURFACE_LAYOUT.z)
    this.fishScaleEffect.group.position.set(
      FISH_SURFACE_LAYOUT.x,
      fishWallGround + FISH_SURFACE_LAYOUT.wallCenterHeight,
      FISH_SURFACE_LAYOUT.z,
    )

    this.scene.add(this.grassEffect.group)
    this.scene.add(this.fishScaleEffect.group)
    this.scene.add(this.rockFieldEffect.group)
    this.scene.add(this.starSkyEffect.group)

    // Position the campfire on the ground surface.
    const fireGroundY = this.grassEffect.getGroundHeightAtWorld(FIRE_POSITION.x, FIRE_POSITION.z)
    this.fireWallEffect.group.position.set(FIRE_POSITION.x, fireGroundY, FIRE_POSITION.z)
    this.scene.add(this.fireWallEffect.group)

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
    this.fishScaleEffect.setParams(this.fishScaleParams)
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
    this.fireWallEffect.setParams(params)
  }

  setStarSkyParams(params: Partial<StarSkyParams>): void {
    this.starSkyParams = { ...this.starSkyParams, ...params }
    this.starSkyEffect.setParams(this.starSkyParams)
  }

  clearFishWounds(): void {
    this.fishScaleEffect.clearWounds()
  }

  clearGrassDisturbances(): void {
    this.grassEffect.clearDisturbances()
  }

  clearFireWounds(): void {
    this.fireWallEffect.clearWounds()
  }

  clearSkyWounds(): void {
    this.starSkyEffect.clearWounds()
  }

  clearAllEffects(): void {
    this.clearFishWounds()
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
    this.scene.remove(this.grassEffect.group)
    this.scene.remove(this.fishScaleEffect.group)
    this.scene.remove(this.rockFieldEffect.group)
    this.scene.remove(this.starSkyEffect.group)
    this.scene.remove(this.fireWallEffect.group)
    this.scene.remove(this.controller.player.group)
    this.camera.remove(this.controller.player.reticle)
    this.fishScaleEffect.dispose()
    this.grassEffect.dispose()
    this.rockFieldEffect.dispose()
    this.starSkyEffect.dispose()
    this.fireWallEffect.dispose()
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
    this.fishScaleEffect.update(elapsed)
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

  private getGroundHeightAtWorld = (x: number, z: number): number =>
    this.grassEffect.getGroundHeightAtWorld(x, z)

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
        this.fishScaleEffect.interactionMesh,
        this.grassEffect.interactionMesh,
        this.fireWallEffect.interactionMesh,
      ],
      false,
    )
    const hit = hits[0]
    if (!hit?.point) return null

    let targetKind: ReticleHit['targetKind']
    if (hit.object === this.fishScaleEffect.interactionMesh) targetKind = 'fish'
    else if (hit.object === this.fireWallEffect.interactionMesh) targetKind = 'fire'
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

    if (hit?.targetKind === 'fish') {
      this.fishScaleEffect.addWoundFromWorldPoint(hit.point, this.raycaster.ray.direction)
      return
    }

    if (hit?.targetKind === 'fire') {
      this.fireWallEffect.addWoundFromWorldPoint(hit.point)
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
    this.fishScaleEffect.update(elapsed)
    // Grass update first so later samples read the current flattened field state.
    this.grassEffect.update(elapsed)
    this.rockFieldEffect.update(this.getGroundHeightAtWorld)
    this.fireWallEffect.update(elapsed)
    this.starSkyEffect.update(elapsed)
    this.skybox.position.copy(this.camera.position)
    this.starSkyEffect.group.position.copy(this.camera.position)
    this.updateReticleFromCamera()
    this.renderer.render(this.scene, this.camera)
    this.rafId = requestAnimationFrame(this.frame)
  }
}

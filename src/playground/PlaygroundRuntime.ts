import { seedCursor } from '../skinText'
import { createWebGPURenderer } from '../createWebGPURenderer'
import { Timer } from 'three'
import * as THREE from 'three'
import { FishScaleSample } from './fishScaleSample'
import { GrassFieldSample } from './grassFieldSample'
import { RockFieldSample } from './rockFieldSample'
import { getPreparedFishSurface } from './fishSurfaceText'
import { getPreparedGrassSurface } from './grassSurfaceText'
import { getPreparedRockSurface } from './rockSurfaceText'
import { applyPlaygroundAtmosphere, addPlaygroundLighting } from './playgroundEnvironment'
import {
  type PlayerAnimationState,
  ThirdPersonController,
  type ThirdPersonControllerFrame,
} from './thirdPersonController'
import {
  DEFAULT_FISH_SCALE_PARAMS,
  DEFAULT_GRASS_FIELD_PARAMS,
  type FishScaleParams,
  type GrassFieldParams,
} from './types'
import {
  FISH_SURFACE_LAYOUT,
  PLAYGROUND_BOUNDS,
  PLAYGROUND_CONTROLLER,
  PLAYGROUND_SPAWN,
  PLAYGROUND_ZOOM,
} from './playgroundWorld'

type ReticleHit = THREE.Intersection & {
  targetKind: 'fish' | 'grass'
}

export class PlaygroundRuntime {
  private readonly host: HTMLElement
  private readonly canvas = document.createElement('canvas')
  private readonly timer = new Timer()
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.2, 140)
  private readonly cameraFill = new THREE.PointLight('#fff4dc', 1.65, 26, 2)
  private readonly raycaster = new THREE.Raycaster()
  private readonly grassAimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private readonly grassFallbackPoint = new THREE.Vector3()
  private readonly playerForward = new THREE.Vector3()
  private readonly footstepPoint = new THREE.Vector3()
  private readonly ndcCenter = new THREE.Vector2(0, 0)
  private readonly fishScaleSample = new FishScaleSample(
    getPreparedFishSurface(),
    seedCursor,
    DEFAULT_FISH_SCALE_PARAMS,
  )
  private readonly grassFieldSample = new GrassFieldSample(
    getPreparedGrassSurface(),
    seedCursor,
    DEFAULT_GRASS_FIELD_PARAMS,
  )
  private readonly rockFieldSample = new RockFieldSample(
    getPreparedRockSurface(),
    seedCursor,
  )
  private readonly controller = new ThirdPersonController()
  private readonly shotAudio = new Audio('/gun_shot.mp3')
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
  private walkStampDistance = 0
  private pendingShoot = false
  private pendingJump = false
  private shootAnimationTimeRemaining = 0
  private activeFrame: ThirdPersonControllerFrame | null = null

  private fishScaleParams: FishScaleParams = { ...DEFAULT_FISH_SCALE_PARAMS }
  private grassFieldParams: GrassFieldParams = { ...DEFAULT_GRASS_FIELD_PARAMS }
  private zoomDistance = PLAYGROUND_ZOOM.current

  constructor(host: HTMLElement) {
    this.host = host
    this.canvas.className = 'canvas'
    this.canvas.tabIndex = 0
    this.camera.position.set(0, 2.2, 10.8)

    applyPlaygroundAtmosphere(this.scene)
    addPlaygroundLighting(this.scene)

    this.shotAudio.preload = 'auto'
    this.shotAudio.volume = 0.7

    this.cameraFill.position.set(0, 0.85, 2.6)
    this.camera.add(this.cameraFill)
    this.scene.add(this.camera)

    const fishWallGround = this.grassFieldSample.getWalkHeightAtWorld(FISH_SURFACE_LAYOUT.x, FISH_SURFACE_LAYOUT.z)
    this.fishScaleSample.group.position.set(
      FISH_SURFACE_LAYOUT.x,
      fishWallGround + FISH_SURFACE_LAYOUT.wallCenterHeight,
      FISH_SURFACE_LAYOUT.z,
    )

    this.scene.add(this.grassFieldSample.group)
    this.scene.add(this.fishScaleSample.group)
    this.scene.add(this.rockFieldSample.group)
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
    this.fishScaleSample.setParams(this.fishScaleParams)
  }

  setGrassFieldParams(params: Partial<GrassFieldParams>): void {
    this.grassFieldParams = { ...this.grassFieldParams, ...params }
    this.grassFieldSample.setParams(this.grassFieldParams)
  }

  clearFishWounds(): void {
    this.fishScaleSample.clearWounds()
  }

  clearGrassDisturbances(): void {
    this.grassFieldSample.clearDisturbances()
  }

  clearAllEffects(): void {
    this.clearFishWounds()
    this.clearGrassDisturbances()
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
    this.scene.remove(this.grassFieldSample.group)
    this.scene.remove(this.fishScaleSample.group)
    this.scene.remove(this.rockFieldSample.group)
    this.scene.remove(this.controller.player.group)
    this.camera.remove(this.controller.player.reticle)
    this.fishScaleSample.dispose()
    this.grassFieldSample.dispose()
    this.rockFieldSample.dispose()
    this.controller.player.dispose()
    this.shotAudio.pause()
    this.shotAudio.src = ''
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
      this.grassFieldSample.getGroundHeightAtWorld(PLAYGROUND_SPAWN.x, PLAYGROUND_SPAWN.z),
      PLAYGROUND_SPAWN.z,
    )

    this.walkStampDistance = 0
    this.pendingJump = false
    this.shootAnimationTimeRemaining = 0
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
    this.fishScaleSample.update(elapsed)
    this.grassFieldSample.update(elapsed)
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
    this.grassFieldSample.getGroundHeightAtWorld(x, z)

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
    this.shootAnimationTimeRemaining = 0
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
    if (frame?.isJumping) return 'jumping'
    if (!frame?.isMoving) {
      return this.shootAnimationTimeRemaining > 0 ? 'shooting' : 'idle'
    }
    if (frame.isSprinting) return 'running'
    if (this.shootAnimationTimeRemaining > 0) return 'shooting'
    return 'walking'
  }

  private stampGrassWalkDisturbance(frame: ThirdPersonControllerFrame): void {
    if (!frame.isMoving || frame.isJumping) {
      this.walkStampDistance = 0
      return
    }

    this.walkStampDistance += frame.movedDistance
    if (this.walkStampDistance < 0.4) return
    this.walkStampDistance = 0

    this.controller.player.group.getWorldDirection(this.playerForward)
    this.playerForward.y = 0
    if (this.playerForward.lengthSq() < 0.0001) {
      this.playerForward.set(0, 0, -1)
    } else {
      this.playerForward.normalize()
    }

    this.footstepPoint.copy(frame.playerPosition).addScaledVector(this.playerForward, -0.18)
    this.footstepPoint.y = this.grassFieldSample.getGroundHeightAtWorld(this.footstepPoint.x, this.footstepPoint.z)
    this.grassFieldSample.addDisturbanceFromWorldPoint(this.footstepPoint, {
      radiusScale: 0.42,
      strength: 0.38,
    })
  }

  private getCenterRayHit(): ReticleHit | null {
    this.raycaster.setFromCamera(this.ndcCenter, this.camera)
    this.raycaster.far = 140

    const hits = this.raycaster.intersectObjects(
      [this.fishScaleSample.interactionMesh, this.grassFieldSample.interactionMesh],
      false,
    )
    const hit = hits[0]
    if (!hit?.point) return null

    return {
      ...hit,
      targetKind: hit.object === this.fishScaleSample.interactionMesh ? 'fish' : 'grass',
    }
  }

  private getGrassFallbackHit(): ReticleHit | null {
    const referenceY = this.activeFrame?.playerPosition.y ?? this.grassFieldSample.getGroundHeightAtWorld(0, 0)
    this.grassAimPlane.constant = -referenceY
    const point = this.raycaster.ray.intersectPlane(this.grassAimPlane, this.grassFallbackPoint)
    if (!point) return null

    return {
      distance: this.raycaster.ray.origin.distanceTo(point),
      point: point.clone(),
      object: this.grassFieldSample.interactionMesh,
      targetKind: 'grass',
    } as ReticleHit
  }

  private fireShot(): void {
    this.playShotAudio()
    const hit = this.getCenterRayHit() ?? this.getGrassFallbackHit()
    if (!hit) return

    if (hit.targetKind === 'fish') {
      this.fishScaleSample.addWoundFromWorldPoint(hit.point, this.raycaster.ray.direction)
      return
    }

    this.grassFieldSample.addDisturbanceFromWorldPoint(hit.point, { radiusScale: 1.15, strength: 1.45 })
  }

  private playShotAudio(): void {
    this.shotAudio.currentTime = 0
    void this.shotAudio.play().catch(() => {})
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
      this.shootAnimationTimeRemaining = 1
    }

    this.shootAnimationTimeRemaining = Math.max(0, this.shootAnimationTimeRemaining - delta)
    this.controller.player.update(delta, this.getPlayerAnimationState(this.activeFrame))
    this.fishScaleSample.update(elapsed)
    // Grass update first — it deforms the ground geometry and advances disturbances.
    this.grassFieldSample.update(elapsed)
    // Rocks sample ground height after grass has settled for this frame, so they
    // sit flush on the deformed terrain including trample depressions.
    this.rockFieldSample.update(this.getGroundHeightAtWorld)
    this.updateReticleFromCamera()
    this.renderer.render(this.scene, this.camera)
    this.rafId = requestAnimationFrame(this.frame)
  }
}

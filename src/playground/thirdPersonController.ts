import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export type MovementBounds = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export type ThirdPersonControllerConfig = {
  moveSpeed: number
  sprintMultiplier: number
  jumpVelocity: number
  gravity: number
  turnLerp: number
  lookYawSpeed: number
  lookPitchSpeed: number
  minPitch: number
  maxPitch: number
  cameraDistance: number
  cameraHeight: number
  shoulderOffset: number
  reticleDistance: number
  cameraFollowLerp: number
}

export type ThirdPersonControllerInput = {
  moveForward: boolean
  moveBackward: boolean
  moveLeft: boolean
  moveRight: boolean
  sprint: boolean
  jump: boolean
  lookActive: boolean
  lookDeltaX: number
  lookDeltaY: number
}

export type PlayerAnimationState = 'idle' | 'walking' | 'running' | 'shooting' | 'jumping'

export type ThirdPersonControllerFrame = {
  movedDistance: number
  isMoving: boolean
  isSprinting: boolean
  isJumping: boolean
  playerPosition: THREE.Vector3
  aimOrigin: THREE.Vector3
  aimDirection: THREE.Vector3
}

const tmpForward = new THREE.Vector3()
const tmpRight = new THREE.Vector3()
const tmpMove = new THREE.Vector3()
const tmpLookTarget = new THREE.Vector3()
const tmpDesiredCamera = new THREE.Vector3()
const tmpShoulder = new THREE.Vector3()
const tmpCameraGroundProbe = new THREE.Vector3()
const tmpModelSize = new THREE.Vector3()
const tmpModelCenter = new THREE.Vector3()
const tmpModelBox = new THREE.Box3()
const RETICLE_LOCAL_DISTANCE = 1.8
const RETICLE_LOCAL_SCALE = 0.18
const CAMERA_GROUND_CLEARANCE = 0.22

const ANIMATION_ASSET_BY_STATE: Record<PlayerAnimationState, string> = {
  idle: '/Meshy_AI_WarHero_biped_Animation_Idle_withSkin.glb',
  walking: '/Meshy_AI_WarHero_biped_Animation_Walking_withSkin.glb',
  running: '/Meshy_AI_WarHero_biped_Animation_Running_withSkin.glb',
  shooting: '/Meshy_AI_WarHero_biped_Animation_Walk_Forward_While_Shooting_withSkin.glb',
  jumping: '/Meshy_AI_WarHero_biped_Animation_Regular_Jump_withSkin.glb',
}

function dampAngle(current: number, target: number, factor: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return current + delta * factor
}

export class PlayerActor {
  readonly group = new THREE.Group()
  readonly reticle = new THREE.Group()

  private readonly aimRing = new THREE.Mesh(
    new THREE.RingGeometry(0.022, 0.05, 40),
    new THREE.MeshBasicMaterial({
      color: '#c8ecff',
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      depthTest: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  )
  private readonly aimCore = new THREE.Mesh(
    new THREE.RingGeometry(0.004, 0.012, 24),
    new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      depthTest: false,
    }),
  )
  private readonly visualRoot = new THREE.Group()
  private readonly loader = new GLTFLoader()
  private readonly geometries = new Set<THREE.BufferGeometry>()
  private readonly materials = new Set<THREE.Material>([this.aimRing.material, this.aimCore.material])

  private mixer: THREE.AnimationMixer | null = null
  private activeAction: THREE.AnimationAction | null = null
  private desiredAnimationState: PlayerAnimationState = 'idle'
  private disposed = false

  private readonly animationActions: Partial<Record<PlayerAnimationState, THREE.AnimationAction>> = {}

  constructor() {
    this.reticle.add(this.aimRing)
    this.reticle.add(this.aimCore)
    this.reticle.renderOrder = 999
    this.reticle.position.set(0, 0, -RETICLE_LOCAL_DISTANCE)
    this.reticle.scale.setScalar(RETICLE_LOCAL_SCALE)
    this.group.add(this.visualRoot)
    this.loadModel()
  }

  setPose(position: THREE.Vector3, yaw: number): void {
    this.group.position.copy(position)
    this.group.rotation.y = yaw
  }

  update(delta: number, animationState: PlayerAnimationState): void {
    this.desiredAnimationState = animationState
    if (this.mixer) {
      this.playAnimation(animationState)
      this.mixer.update(delta)
    }
  }

  setReticleVisible(visible: boolean): void {
    this.reticle.visible = visible
  }

  dispose(): void {
    this.disposed = true
    this.aimRing.geometry.dispose()
    this.aimCore.geometry.dispose()
    this.mixer?.stopAllAction()
    this.geometries.forEach((geometry) => geometry.dispose())
    this.materials.forEach((material) => material.dispose())
  }

  private loadModel(): void {
    void this.loadModelAsync()
  }

  private async loadModelAsync(): Promise<void> {
    try {
      const loadedAnimations = await Promise.all(
        (Object.entries(ANIMATION_ASSET_BY_STATE) as [PlayerAnimationState, string][]).map(async ([state, assetPath]) => ({
          state,
          gltf: await this.loader.loadAsync(assetPath),
        })),
      )

      if (this.disposed) return

      const idleGltf = loadedAnimations.find((entry) => entry.state === 'idle')?.gltf
      if (!idleGltf) {
        throw new Error('Idle animation GLB did not load.')
      }

      const model = idleGltf.scene
      model.updateMatrixWorld(true)

      tmpModelBox.setFromObject(model)
      tmpModelBox.getSize(tmpModelSize)
      tmpModelBox.getCenter(tmpModelCenter)

      const targetHeight = 1.7
      const scale = tmpModelSize.y > 0.0001 ? targetHeight / tmpModelSize.y : 1
      model.scale.setScalar(scale)
      model.updateMatrixWorld(true)

      tmpModelBox.setFromObject(model)
      model.position.x -= tmpModelBox.getCenter(tmpModelCenter).x
      model.position.y -= tmpModelBox.min.y
      model.position.z -= tmpModelCenter.z
      model.updateMatrixWorld(true)

      model.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (!mesh.isMesh) return
        this.geometries.add(mesh.geometry)

        const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        meshMaterials.forEach((material) => this.materials.add(material))
      })

      this.visualRoot.add(model)
      this.mixer = new THREE.AnimationMixer(model)

      loadedAnimations.forEach(({ state, gltf }) => {
        const clip = gltf.animations[0]
        if (!clip || !this.mixer) return

        const action = this.mixer.clipAction(clip)
        action.enabled = true
        action.clampWhenFinished = state === 'jumping'
        action.setLoop(state === 'jumping' ? THREE.LoopOnce : THREE.LoopRepeat, state === 'jumping' ? 1 : Infinity)
        this.animationActions[state] = action
      })

      this.playAnimation(this.desiredAnimationState, true)
    } catch (error) {
      console.error('Failed to load player animation assets', error)
    }
  }

  private playAnimation(animationState: PlayerAnimationState, immediate = false): void {
    const nextAction = this.animationActions[animationState] ?? this.animationActions.idle
    if (!nextAction || nextAction === this.activeAction) return

    if (immediate) {
      Object.values(this.animationActions).forEach((action) => {
        if (!action) return
        action.stop()
        action.enabled = true
        action.setEffectiveWeight(1)
        action.setEffectiveTimeScale(1)
      })
      nextAction.reset().play()
    } else {
      Object.values(this.animationActions).forEach((action) => {
        if (!action || action === nextAction) return
        action.fadeOut(0.16)
      })
      nextAction.reset().fadeIn(animationState === 'jumping' ? 0.08 : 0.16).play()
    }

    this.activeAction = nextAction
  }
}

export class ThirdPersonController {
  readonly player = new PlayerActor()

  private readonly position = new THREE.Vector3()
  private readonly frame: ThirdPersonControllerFrame = {
    movedDistance: 0,
    isMoving: false,
    isSprinting: false,
    isJumping: false,
    playerPosition: new THREE.Vector3(),
    aimOrigin: new THREE.Vector3(),
    aimDirection: new THREE.Vector3(),
  }

  private yaw = 0
  private cameraYaw = 0
  private cameraPitch = -0.18
  private groundYSmooth = 0
  private groundYSmoothReady = false
  private jumpHeight = 0
  private jumpVelocity = 0
  private isJumping = false

  setSpawn(position: THREE.Vector3, yaw: number, cameraYaw = yaw, cameraPitch = this.cameraPitch): void {
    this.position.copy(position)
    this.yaw = yaw
    this.cameraYaw = cameraYaw
    this.cameraPitch = cameraPitch
    this.groundYSmoothReady = false
    this.jumpHeight = 0
    this.jumpVelocity = 0
    this.isJumping = false
    this.player.setPose(this.position, this.yaw)
  }

  update(
    camera: THREE.PerspectiveCamera,
    input: ThirdPersonControllerInput,
    config: ThirdPersonControllerConfig,
    bounds: MovementBounds,
    groundHeightAt: (x: number, z: number) => number,
    delta: number,
  ): ThirdPersonControllerFrame {
    if (input.lookActive) {
      this.cameraYaw += input.lookDeltaX * config.lookYawSpeed
      this.cameraPitch = THREE.MathUtils.clamp(
        this.cameraPitch - input.lookDeltaY * config.lookPitchSpeed,
        config.minPitch,
        config.maxPitch,
      )
    }

    const inputForward = (input.moveForward ? 1 : 0) - (input.moveBackward ? 1 : 0)
    const inputRight = (input.moveRight ? 1 : 0) - (input.moveLeft ? 1 : 0)

    tmpForward.set(Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw))
    tmpRight.set(Math.cos(this.cameraYaw), 0, Math.sin(this.cameraYaw))
    tmpMove.set(0, 0, 0)
    tmpMove.addScaledVector(tmpForward, inputForward)
    tmpMove.addScaledVector(tmpRight, inputRight)

    let movedDistance = 0
    if (tmpMove.lengthSq() > 0.0001) {
      tmpMove.normalize()
      movedDistance = config.moveSpeed * (input.sprint ? config.sprintMultiplier : 1) * delta
      this.position.addScaledVector(tmpMove, movedDistance)
      this.yaw = dampAngle(this.yaw, Math.atan2(tmpMove.x, tmpMove.z), Math.min(1, config.turnLerp * delta))
    }

    this.position.x = THREE.MathUtils.clamp(this.position.x, bounds.minX, bounds.maxX)
    this.position.z = THREE.MathUtils.clamp(this.position.z, bounds.minZ, bounds.maxZ)

    const targetGroundY = groundHeightAt(this.position.x, this.position.z)
    if (!this.groundYSmoothReady) {
      this.groundYSmooth = targetGroundY
      this.groundYSmoothReady = true
    } else {
      const yBlend = 1 - Math.exp(-38 * delta)
      this.groundYSmooth = THREE.MathUtils.lerp(this.groundYSmooth, targetGroundY, yBlend)
    }
    if (!this.isJumping && input.jump) {
      this.isJumping = true
      this.jumpVelocity = config.jumpVelocity
    }

    if (this.isJumping) {
      this.jumpVelocity -= config.gravity * delta
      this.jumpHeight = Math.max(0, this.jumpHeight + this.jumpVelocity * delta)

      if (this.jumpHeight === 0 && this.jumpVelocity <= 0) {
        this.jumpVelocity = 0
        this.isJumping = false
      }
    }

    this.position.y = this.groundYSmooth + this.jumpHeight

    this.player.setPose(this.position, this.yaw)

    const pitchCos = Math.cos(this.cameraPitch)
    this.frame.aimDirection.set(
      Math.sin(this.cameraYaw) * pitchCos,
      Math.sin(this.cameraPitch),
      -Math.cos(this.cameraYaw) * pitchCos,
    )
    this.frame.aimDirection.normalize()

    this.frame.aimOrigin.copy(this.position)
    this.frame.aimOrigin.y += config.cameraHeight * 0.84

    tmpShoulder.set(Math.cos(this.cameraYaw), 0, Math.sin(this.cameraYaw)).multiplyScalar(config.shoulderOffset)
    tmpDesiredCamera.copy(this.position)
    tmpDesiredCamera.y += config.cameraHeight
    tmpDesiredCamera.add(tmpShoulder)
    tmpDesiredCamera.addScaledVector(this.frame.aimDirection, -config.cameraDistance)
    tmpCameraGroundProbe.copy(tmpDesiredCamera)
    tmpDesiredCamera.y = Math.max(
      tmpDesiredCamera.y,
      groundHeightAt(tmpCameraGroundProbe.x, tmpCameraGroundProbe.z) + CAMERA_GROUND_CLEARANCE,
    )

    if (input.lookActive) {
      camera.position.copy(tmpDesiredCamera)
    } else {
      const followAlpha = Math.min(1, config.cameraFollowLerp * delta)
      camera.position.lerp(tmpDesiredCamera, followAlpha)
    }
    camera.position.y = Math.max(
      camera.position.y,
      groundHeightAt(camera.position.x, camera.position.z) + CAMERA_GROUND_CLEARANCE,
    )
    tmpLookTarget.copy(this.position)
    tmpLookTarget.y += config.cameraHeight * 0.86
    tmpLookTarget.addScaledVector(this.frame.aimDirection, config.reticleDistance * 0.42)
    camera.lookAt(tmpLookTarget)

    this.frame.movedDistance = movedDistance
    this.frame.isMoving = movedDistance > 0
    this.frame.isSprinting = this.frame.isMoving && input.sprint
    this.frame.isJumping = this.isJumping
    this.frame.playerPosition.copy(this.position)
    return this.frame
  }
}

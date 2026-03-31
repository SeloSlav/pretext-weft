import * as THREE from 'three'
import { PLAYGROUND_CONTROLLER } from '../playground/playgroundWorld'

export type FlightBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

export type FlightInput = {
  moveForward: boolean
  moveBackward: boolean
  moveLeft: boolean
  moveRight: boolean
  moveUp: boolean
  moveDown: boolean
  sprint: boolean
  lookActive: boolean
  lookDeltaX: number
  lookDeltaY: number
}

export type FlightControllerConfig = {
  moveSpeed: number
  sprintMultiplier: number
  turnLerp: number
  verticalSpeed: number
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

/** Match [`PLAYGROUND_CONTROLLER`](playgroundWorld.ts) for camera / look so Demo feels like the Playground. */
export const DEFAULT_FLIGHT_CONFIG: FlightControllerConfig = {
  moveSpeed: PLAYGROUND_CONTROLLER.moveSpeed * 1.35,
  sprintMultiplier: PLAYGROUND_CONTROLLER.sprintMultiplier,
  turnLerp: PLAYGROUND_CONTROLLER.turnLerp,
  verticalSpeed: 7.2,
  lookYawSpeed: PLAYGROUND_CONTROLLER.lookYawSpeed,
  lookPitchSpeed: PLAYGROUND_CONTROLLER.lookPitchSpeed,
  minPitch: PLAYGROUND_CONTROLLER.minPitch,
  maxPitch: 1.48,
  cameraDistance: PLAYGROUND_CONTROLLER.cameraDistance,
  cameraHeight: PLAYGROUND_CONTROLLER.cameraHeight,
  shoulderOffset: PLAYGROUND_CONTROLLER.shoulderOffset,
  reticleDistance: PLAYGROUND_CONTROLLER.reticleDistance,
  cameraFollowLerp: PLAYGROUND_CONTROLLER.cameraFollowLerp,
}

const tmpForward = new THREE.Vector3()
const tmpRight = new THREE.Vector3()
const tmpMove = new THREE.Vector3()
const tmpDesiredCamera = new THREE.Vector3()
const tmpShoulder = new THREE.Vector3()
const tmpLookTarget = new THREE.Vector3()
const aimDirection = new THREE.Vector3()

function dampAngle(current: number, target: number, factor: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return current + delta * factor
}

export type FlightFrame = {
  playerPosition: THREE.Vector3
  movedDistance: number
  isMoving: boolean
  isSprinting: boolean
}

export class FlightController {
  readonly playerPosition = new THREE.Vector3()

  private yaw = 0
  private cameraYaw = 0
  private cameraPitch = -0.22

  setSpawn(position: THREE.Vector3, yaw: number, cameraYaw = yaw, cameraPitch = -0.22): void {
    this.playerPosition.copy(position)
    this.yaw = yaw
    this.cameraYaw = cameraYaw
    this.cameraPitch = cameraPitch
  }

  update(
    camera: THREE.PerspectiveCamera,
    input: FlightInput,
    config: FlightControllerConfig,
    bounds: FlightBounds,
    delta: number,
  ): FlightFrame {
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
    const inputLift = (input.moveUp ? 1 : 0) - (input.moveDown ? 1 : 0)

    tmpForward.set(Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw))
    tmpRight.set(Math.cos(this.cameraYaw), 0, Math.sin(this.cameraYaw))
    tmpMove.set(0, 0, 0)
    tmpMove.addScaledVector(tmpForward, inputForward)
    tmpMove.addScaledVector(tmpRight, inputRight)

    let movedDistance = 0
    if (tmpMove.lengthSq() > 0.0001) {
      tmpMove.normalize()
      movedDistance = config.moveSpeed * (input.sprint ? config.sprintMultiplier : 1) * delta
      this.playerPosition.addScaledVector(tmpMove, movedDistance)
      this.yaw = dampAngle(this.yaw, Math.atan2(tmpMove.x, tmpMove.z), Math.min(1, config.turnLerp * delta))
    }

    this.playerPosition.x = THREE.MathUtils.clamp(this.playerPosition.x, bounds.minX, bounds.maxX)
    this.playerPosition.z = THREE.MathUtils.clamp(this.playerPosition.z, bounds.minZ, bounds.maxZ)

    this.playerPosition.y += inputLift * config.verticalSpeed * delta
    this.playerPosition.y = THREE.MathUtils.clamp(this.playerPosition.y, bounds.minY, bounds.maxY)

    const pitchCos = Math.cos(this.cameraPitch)
    aimDirection.set(
      Math.sin(this.cameraYaw) * pitchCos,
      Math.sin(this.cameraPitch),
      -Math.cos(this.cameraYaw) * pitchCos,
    )
    aimDirection.normalize()

    tmpShoulder.set(Math.cos(this.cameraYaw), 0, Math.sin(this.cameraYaw)).multiplyScalar(config.shoulderOffset)
    tmpDesiredCamera.copy(this.playerPosition)
    tmpDesiredCamera.y += config.cameraHeight
    tmpDesiredCamera.add(tmpShoulder)
    tmpDesiredCamera.addScaledVector(aimDirection, -config.cameraDistance)

    if (input.lookActive) {
      camera.position.copy(tmpDesiredCamera)
    } else {
      const followAlpha = Math.min(1, config.cameraFollowLerp * delta)
      camera.position.lerp(tmpDesiredCamera, followAlpha)
    }

    tmpLookTarget.copy(this.playerPosition)
    tmpLookTarget.y += config.cameraHeight * 0.86
    tmpLookTarget.addScaledVector(aimDirection, config.reticleDistance * 0.42)
    camera.lookAt(tmpLookTarget)

    return {
      playerPosition: this.playerPosition,
      movedDistance,
      isMoving: movedDistance > 0.02,
      isSprinting: input.sprint && movedDistance > 0.02,
    }
  }

  getYaw(): number {
    return this.yaw
  }
}
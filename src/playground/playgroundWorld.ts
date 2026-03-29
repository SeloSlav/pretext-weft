import type { MovementBounds, ThirdPersonControllerConfig } from './thirdPersonController'

export const PLAYGROUND_BOUNDS: MovementBounds = {
  minX: -20,
  maxX: 20,
  minZ: -20,
  maxZ: 20,
}

export const PLAYGROUND_CONTROLLER: ThirdPersonControllerConfig = {
  moveSpeed: 5.7,
  sprintMultiplier: 1.5,
  jumpVelocity: 6.1,
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
  max: 13.5,
  current: 6.7,
}

export const PLAYGROUND_SPAWN = {
  x: 0,
  z: 10.5,
  yaw: 0,
  pitch: -0.22,
}

export const FISH_SURFACE_LAYOUT = {
  x: 0,
  z: -14,
  wallCenterHeight: 2.45,
  wallWidth: 8.8,
  wallHeight: 7.2,
  wallDepth: 0.85,
}

import * as THREE from 'three'
import type { SurfaceLayoutSlot } from '../../core'

/** Optional camera-centered XZ disc to skip distant layout slots (open-field CPU savings). */
export type PresetLayoutViewCull = {
  cameraWorld: THREE.Vector3
  /** World-space radius on the XZ plane around the camera. */
  radius: number
  /** Extra world-space slack so slot-level culling does not pop visible clutter. */
  padding?: number
}

export function slotWorldDistSqFromFieldCenter(
  slot: SurfaceLayoutSlot,
  fieldCenterX: number,
  fieldCenterZ: number,
  cameraWorld: THREE.Vector3,
  padding = 0,
): number {
  const slotPadding = Math.max(0, padding)
  const spanStart = fieldCenterX + slot.spanStart - slotPadding
  const spanEnd = fieldCenterX + slot.spanEnd + slotPadding
  const lineZMin = fieldCenterZ + slot.lineCoord - slotPadding
  const lineZMax = fieldCenterZ + slot.lineCoord + slotPadding
  const nearestX = THREE.MathUtils.clamp(cameraWorld.x, spanStart, spanEnd)
  const nearestZ = THREE.MathUtils.clamp(cameraWorld.z, lineZMin, lineZMax)
  const dx = nearestX - cameraWorld.x
  const dz = nearestZ - cameraWorld.z
  return dx * dx + dz * dz
}

export function shouldVisitSlotForViewCull(
  slot: SurfaceLayoutSlot,
  fieldCenterX: number,
  fieldCenterZ: number,
  cull: PresetLayoutViewCull,
): boolean {
  const rSq = cull.radius * cull.radius
  const padding = (cull.padding ?? 0) + slot.sectorStep * 0.35
  return slotWorldDistSqFromFieldCenter(slot, fieldCenterX, fieldCenterZ, cull.cameraWorld, padding) <= rSq
}

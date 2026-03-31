import * as THREE from 'three'
import type { SurfaceLayoutSlot } from '../../core'

/** Optional camera-centered XZ disc to skip distant layout slots (open-field CPU savings). */
export type PresetLayoutViewCull = {
  cameraWorld: THREE.Vector3
  /** World-space radius on the XZ plane around the camera. */
  radius: number
  /** Extra world-space slack so slot-level culling does not pop visible clutter. */
  padding?: number
  /**
   * When set (e.g. first-person scenery), layout slots must also intersect this world-space frustum.
   * Skips work behind the camera and outside the view cone without waiting for distance falloff.
   */
  frustum?: THREE.Frustum
}

/** Per-effect scratch for `shouldVisitSlotForViewCull` frustum tests (not shared across nested calls). */
export type PresetLayoutViewCullFrustumContext = {
  group: THREE.Object3D
  tmpBox: THREE.Box3
  /** Half-thickness of the slot strip along row depth (world units in field space). */
  rowThickness: number
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

/**
 * World-space AABB for one layout slot strip, then tests against the camera frustum.
 * Caller must ensure `group.matrixWorld` is current (e.g. `group.updateMatrixWorld(true)` once per layout pass).
 */
export function slotIntersectsViewFrustum(
  slot: SurfaceLayoutSlot,
  fieldCenterX: number,
  fieldCenterZ: number,
  padding: number,
  rowThickness: number,
  frustum: THREE.Frustum,
  group: THREE.Object3D,
  box: THREE.Box3,
): boolean {
  const p = Math.max(0, padding)
  const rt = Math.max(0.02, rowThickness)
  box.min.set(fieldCenterX + slot.spanStart - p, -14, fieldCenterZ + slot.lineCoord - rt - p)
  box.max.set(fieldCenterX + slot.spanEnd + p, 22, fieldCenterZ + slot.lineCoord + rt + p)
  box.applyMatrix4(group.matrixWorld)
  return frustum.intersectsBox(box)
}

export function shouldVisitSlotForViewCull(
  slot: SurfaceLayoutSlot,
  fieldCenterX: number,
  fieldCenterZ: number,
  cull: PresetLayoutViewCull,
  frustumCtx?: PresetLayoutViewCullFrustumContext,
): boolean {
  const rSq = cull.radius * cull.radius
  const padding = (cull.padding ?? 0) + slot.sectorStep * 0.35
  if (slotWorldDistSqFromFieldCenter(slot, fieldCenterX, fieldCenterZ, cull.cameraWorld, padding) > rSq) {
    return false
  }
  if (cull.frustum && frustumCtx) {
    return slotIntersectsViewFrustum(
      slot,
      fieldCenterX,
      fieldCenterZ,
      padding,
      frustumCtx.rowThickness,
      cull.frustum,
      frustumCtx.group,
      frustumCtx.tmpBox,
    )
  }
  return true
}

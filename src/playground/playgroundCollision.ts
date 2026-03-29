import * as THREE from 'three'

/** Axis-aligned box in XZ (world). */
export type SolidAabb = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/**
 * Push a circle (center x,z, radius r) out of an AABB if it overlaps.
 * When the center is inside the box, exits toward the nearest face.
 */
export function pushCircleOutOfAabb(x: number, z: number, r: number, box: SolidAabb): { x: number; z: number } {
  const { minX, maxX, minZ, maxZ } = box
  const closestX = THREE.MathUtils.clamp(x, minX, maxX)
  const closestZ = THREE.MathUtils.clamp(z, minZ, maxZ)
  let dx = x - closestX
  let dz = z - closestZ
  const distSq = dx * dx + dz * dz
  if (distSq >= r * r - 1e-8) {
    return { x, z }
  }

  if (distSq < 1e-10) {
    const dLeft = x - minX
    const dRight = maxX - x
    const dDown = z - minZ
    const dUp = maxZ - z
    const m = Math.min(dLeft, dRight, dDown, dUp)
    if (m === dLeft) return { x: minX - r, z }
    if (m === dRight) return { x: maxX + r, z }
    if (m === dDown) return { x, z: minZ - r }
    return { x, z: maxZ + r }
  }

  const dist = Math.sqrt(distSq)
  dx /= dist
  dz /= dist
  return { x: closestX + dx * r, z: closestZ + dz * r }
}

export function circleOverlapsAabb(x: number, z: number, r: number, box: SolidAabb): boolean {
  const closestX = THREE.MathUtils.clamp(x, box.minX, box.maxX)
  const closestZ = THREE.MathUtils.clamp(z, box.minZ, box.maxZ)
  const dx = x - closestX
  const dz = z - closestZ
  return dx * dx + dz * dz < r * r
}

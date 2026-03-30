/**
 * Stylized crossroads mask for the town-edge playground.
 * Road bands are axis-aligned through the origin so grass can stay off asphalt.
 */

export const CROSS_HALF_WIDTH = 3.15
export const CROSS_EXTENT = 19.5

/** True if (x,z) lies on the asphalt cross (horizontal or vertical leg). */
export function isCrossRoadAsphalt(x: number, z: number): boolean {
  const horizontal = Math.abs(z) <= CROSS_HALF_WIDTH && Math.abs(x) <= CROSS_EXTENT
  const vertical = Math.abs(x) <= CROSS_HALF_WIDTH && Math.abs(z) <= CROSS_EXTENT
  return horizontal || vertical
}

/** Narrow strips beside the road where grass reads as "curb verge" (denser). */
export function isVergeStrip(x: number, z: number): boolean {
  const v = 2.4
  const hNear =
    Math.abs(z) <= CROSS_HALF_WIDTH + v &&
    Math.abs(z) > CROSS_HALF_WIDTH &&
    Math.abs(x) <= CROSS_EXTENT
  const vNear =
    Math.abs(x) <= CROSS_HALF_WIDTH + v &&
    Math.abs(x) > CROSS_HALF_WIDTH &&
    Math.abs(z) <= CROSS_EXTENT
  return hNear || vNear
}

/** Distance to the nearest verge-strip centerline; useful for band-style presets that hug the road edge. */
export function getVergeStripDistanceAtXZ(x: number, z: number): number {
  const centerOffset = CROSS_HALF_WIDTH + 1.2
  let best = Number.POSITIVE_INFINITY

  if (Math.abs(x) <= CROSS_EXTENT) {
    best = Math.min(best, Math.abs(z - centerOffset), Math.abs(z + centerOffset))
  }
  if (Math.abs(z) <= CROSS_EXTENT) {
    best = Math.min(best, Math.abs(x - centerOffset), Math.abs(x + centerOffset))
  }

  return best
}

/** Slightly above the grass ground plane so asphalt wins depth and hides green under the cross. */
export const TOWN_ROAD_SURFACE_Y = 0.12

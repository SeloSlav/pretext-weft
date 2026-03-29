import type { LayoutCursor, PreparedTextWithSegments } from '@chenglou/pretext'

export type SeedCursorFactory = (
  preparedText: PreparedTextWithSegments,
  advance: number,
) => LayoutCursor

export type FishScaleParams = {
  woundRadius: number
  woundNarrow: number
  woundDepth: number
  scaleLift: number
  surfaceFlex: number
  recoveryRate: number
}

export const DEFAULT_FISH_SCALE_PARAMS: FishScaleParams = {
  woundRadius: 0.68,
  woundNarrow: 0.26,
  woundDepth: 0.72,
  scaleLift: 0.55,
  surfaceFlex: 0.28,
  recoveryRate: 0.16,
}

export type GrassFieldParams = {
  disturbanceRadius: number
  disturbanceStrength: number
  trampleDepth: number
  wind: number
  recoveryRate: number
}

export const DEFAULT_GRASS_FIELD_PARAMS: GrassFieldParams = {
  disturbanceRadius: 1.15,
  disturbanceStrength: 0.78,
  trampleDepth: 0.68,
  wind: 0.62,
  recoveryRate: 0.18,
}

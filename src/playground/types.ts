export type SampleId = 'torus-wound' | 'plane-ribbon'

export type TorusSampleParams = {
  woundHalfAngle: number
  woundNarrow: number
  deform: number
}

export type RibbonSampleParams = {
  obstacleHalfWidth: number
  obstacleNarrow: number
  wave: number
}

export const DEFAULT_TORUS_PARAMS: TorusSampleParams = {
  woundHalfAngle: 0.55,
  woundNarrow: 0.22,
  deform: 1,
}

export const DEFAULT_RIBBON_PARAMS: RibbonSampleParams = {
  obstacleHalfWidth: 0.65,
  obstacleNarrow: 0.2,
  wave: 1,
}

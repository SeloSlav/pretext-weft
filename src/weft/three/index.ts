export {
  createSurfaceEffect,
  createSurfaceSource,
  fieldLayout,
  recoverableDamage,
  semanticStates,
  skyLayout,
  threeInstancedMeshRenderer,
  wallLayout,
} from './api.ts'
export type {
  RecoverableDamageConfig,
  SurfaceEffectConfig,
} from './api.ts'

export { createInstancedMesh } from './helpers/instancing.ts'
export type { ThreeInstancedMeshRendererConfig } from './helpers/instancing.ts'

export {
  createFishScaleEffect,
  DEFAULT_FISH_SCALE_PARAMS,
  FishScaleEffect,
} from './presets/fishScale.ts'
export type { CreateFishScaleEffectOptions, FishScaleAppearance, FishScaleParams } from './presets/fishScale.ts'
export { getPreparedFishSurface } from './presets/fishScaleSource.ts'
export { getPreparedIvySurface } from './presets/ivyScaleSource.ts'

export {
  createFireWallEffect,
  DEFAULT_FIRE_WALL_PARAMS,
  FireWallEffect,
} from './presets/fireWall.ts'
export type { CreateFireWallEffectOptions, FireWallParams } from './presets/fireWall.ts'
export { getPreparedFireSurface } from './presets/fireWallSource.ts'

export {
  createGrassEffect,
  DEFAULT_GRASS_FIELD_PARAMS,
  GrassFieldEffect,
} from './presets/grassField.ts'
export type {
  CreateGrassEffectOptions,
  GrassDisturbanceOptions,
  GrassFieldParams,
} from './presets/grassField.ts'
export {
  buildGrassStateSurface,
  getPreparedGrassSurface,
} from './presets/grassFieldSource.ts'

export {
  createRockFieldEffect,
  DEFAULT_ROCK_FIELD_PARAMS,
  RockFieldEffect,
} from './presets/rockField.ts'
export type { CreateRockFieldEffectOptions, RockFieldParams } from './presets/rockField.ts'
export { getPreparedRockSurface } from './presets/rockFieldSource.ts'

export {
  createStarSkyEffect,
  DEFAULT_STAR_SKY_PARAMS,
  StarSkyEffect,
} from './presets/starSky.ts'
export type { CreateStarSkyEffectOptions, StarSkyParams } from './presets/starSky.ts'
export { getPreparedStarSurface } from './presets/starSkySource.ts'

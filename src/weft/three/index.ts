export {
  createSurfaceEffect,
  createSurfaceSource,
  fieldLayout,
  recoverableDamage,
  semanticStates,
  skyLayout,
  threeInstancedMeshRenderer,
  wallLayout,
} from './api'
export type {
  RecoverableDamageConfig,
  SurfaceEffectConfig,
} from './api'

export { createInstancedMesh } from './helpers/instancing'
export type { ThreeInstancedMeshRendererConfig } from './helpers/instancing'

export {
  createFishScaleEffect,
  DEFAULT_FISH_SCALE_PARAMS,
  FishScaleEffect,
} from './presets/fishScale'
export type { CreateFishScaleEffectOptions, FishScaleParams } from './presets/fishScale'
export { getPreparedFishSurface } from './presets/fishScaleSource'

export {
  createFireWallEffect,
  DEFAULT_FIRE_WALL_PARAMS,
  FireWallEffect,
} from './presets/fireWall'
export type { CreateFireWallEffectOptions, FireWallParams } from './presets/fireWall'
export { getPreparedFireSurface } from './presets/fireWallSource'

export {
  createGrassEffect,
  DEFAULT_GRASS_FIELD_PARAMS,
  GrassFieldEffect,
} from './presets/grassField'
export type {
  CreateGrassEffectOptions,
  GrassDisturbanceOptions,
  GrassFieldParams,
} from './presets/grassField'
export {
  buildGrassStateSurface,
  getPreparedGrassSurface,
} from './presets/grassFieldSource'

export {
  createRockFieldEffect,
  DEFAULT_ROCK_FIELD_PARAMS,
  RockFieldEffect,
} from './presets/rockField'
export type { CreateRockFieldEffectOptions, RockFieldParams } from './presets/rockField'
export { getPreparedRockSurface } from './presets/rockFieldSource'

export {
  createStarSkyEffect,
  DEFAULT_STAR_SKY_PARAMS,
  StarSkyEffect,
} from './presets/starSky'
export type { CreateStarSkyEffectOptions, StarSkyParams } from './presets/starSky'
export { getPreparedStarSurface } from './presets/starSkySource'

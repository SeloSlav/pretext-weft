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
  createShellSurfaceEffect,
  DEFAULT_SHELL_SURFACE_PARAMS,
  ShellSurfaceEffect,
  createFishScaleEffect,
  DEFAULT_FISH_SCALE_PARAMS,
  FishScaleEffect,
} from './presets/fishScale.ts'
export type {
  CreateShellSurfaceEffectOptions,
  CreateFishScaleEffectOptions,
  ShellSurfaceAppearance,
  ShellSurfaceParams,
  FishScaleAppearance,
  FishScaleParams,
} from './presets/fishScale.ts'
export { getPreparedShellSurface, getPreparedFishSurface, getPreparedGlassSurface } from './presets/fishScaleSource.ts'
export { getPreparedIvySurface } from './presets/ivyScaleSource.ts'

export {
  createFireWallEffect,
  DEFAULT_FIRE_WALL_PARAMS,
  FireWallEffect,
} from './presets/fireWall.ts'
export type { CreateFireWallEffectOptions, FireWallParams } from './presets/fireWall.ts'
export { getPreparedFireSurface } from './presets/fireWallSource.ts'

export {
  createBandFieldEffect,
  DEFAULT_BAND_FIELD_PARAMS,
  BandFieldEffect,
} from './presets/bandField.ts'
export type {
  BandFieldAppearance,
  BandFieldBounds,
  BandFieldPlacementMask,
  BandFieldParams,
  CreateBandFieldEffectOptions,
} from './presets/bandField.ts'
export { getPreparedBandSurface, getPreparedFungusBandSurface } from './presets/bandFieldSource.ts'

export {
  createLeafPileBandEffect,
  DEFAULT_LEAF_PILE_BAND_PARAMS,
  LeafPileBandEffect,
} from './presets/leafPileBand.ts'
export type {
  CreateLeafPileBandEffectOptions,
  LeafPileDisturbanceOptions,
  LeafPileBandBounds,
  LeafPileBandPlacementMask,
  LeafPileBandParams,
} from './presets/leafPileBand.ts'
export {
  buildLeafPileSeasonSurface,
  getPreparedLeafPileSurface,
  LEAF_PILE_SEASONS,
} from './presets/leafPileBandSource.ts'
export type { LeafPileSeason, LeafPileTokenId, LeafPileTokenMeta } from './presets/leafPileBandSource.ts'

export {
  createFungusSeamEffect,
  DEFAULT_FUNGUS_SEAM_PARAMS,
  FungusSeamEffect,
} from './presets/fungusSeam.ts'
export type {
  CreateFungusSeamEffectOptions,
  FungusBurnOptions,
  FungusSeamBounds,
  FungusSeamPlacementMask,
  FungusSeamParams,
} from './presets/fungusSeam.ts'

export {
  createGrassEffect,
  DEFAULT_GRASS_FIELD_PARAMS,
  GrassFieldEffect,
} from './presets/grassField.ts'
export type {
  CreateGrassEffectOptions,
  GrassFieldBounds,
  GrassFieldPlacementMask,
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
export type {
  CreateRockFieldEffectOptions,
  RockFieldBounds,
  RockFieldPlacementMask,
  RockFieldParams,
} from './presets/rockField.ts'
export { getPreparedRockSurface } from './presets/rockFieldSource.ts'

export {
  createLogFieldEffect,
  DEFAULT_LOG_FIELD_PARAMS,
  LogFieldEffect,
} from './presets/logField.ts'
export type {
  CreateLogFieldEffectOptions,
  LogFieldBounds,
  LogFieldPlacementMask,
  LogFieldParams,
} from './presets/logField.ts'
export { getPreparedLogSurface } from './presets/logFieldSource.ts'

export {
  createStickFieldEffect,
  DEFAULT_STICK_FIELD_PARAMS,
  StickFieldEffect,
} from './presets/stickField.ts'
export type {
  CreateStickFieldEffectOptions,
  StickFieldBounds,
  StickFieldPlacementMask,
  StickFieldParams,
} from './presets/stickField.ts'
export { getPreparedStickSurface } from './presets/stickFieldSource.ts'

export {
  createNeedleLitterFieldEffect,
  DEFAULT_NEEDLE_LITTER_FIELD_PARAMS,
  NeedleLitterFieldEffect,
} from './presets/needleLitterField.ts'
export type {
  CreateNeedleLitterFieldEffectOptions,
  NeedleLitterFieldBounds,
  NeedleLitterFieldPlacementMask,
  NeedleLitterFieldParams,
  NeedleLitterBurnOptions,
} from './presets/needleLitterField.ts'
export { getPreparedNeedleLitterSurface } from './presets/needleLitterFieldSource.ts'

export {
  createStarSkyEffect,
  DEFAULT_STAR_SKY_PARAMS,
  StarSkyEffect,
} from './presets/starSky.ts'
export type { CreateStarSkyEffectOptions, StarSkyParams } from './presets/starSky.ts'
export { getPreparedStarSurface } from './presets/starSkySource.ts'

export {
  BookPageEffect,
  createBookPageEffect,
  DEFAULT_BOOK_PAGE_PARAMS,
} from './presets/bookPage.ts'
export type { BookPageParams, CreateBookPageEffectOptions } from './presets/bookPage.ts'
export { createBookPageSurface } from './presets/bookPageSource.ts'
export type { BookGlyphMeta } from './presets/bookPageSource.ts'

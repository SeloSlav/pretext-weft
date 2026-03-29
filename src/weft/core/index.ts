export {
  buildRepeatedUnitStream,
  buildWeightedPaletteStream,
  normalizeSurfacePalette,
  prepareCachedSurfaceText,
  prepareSemanticSurfaceText,
  prepareSurfaceText,
  seedCursor,
  WEFT_TEXT_FONT,
} from './text'
export type {
  PreparedSurfaceSource,
  ResolvedSurfaceGlyph,
  SeedCursorFactory,
  SurfaceGlyphUnits,
  SurfacePaletteEntry,
  SurfaceShorthandMeta,
} from './text'

export { SurfaceLayoutDriver, createBandSeeds } from './layout'
export type { SurfaceLayoutLine, SurfaceLayoutSlot } from './layout'

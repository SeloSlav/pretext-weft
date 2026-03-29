import {
  prepareSemanticSurfaceText,
  type PreparedSurfaceSource,
  SURFACE_TEXT_FONT,
  type SurfacePaletteEntry,
} from '../skinText'

export type GrassTokenId =
  | 'lean-left'
  | 'lean-right'
  | 'thin-stem'
  | 'mid-stem'
  | 'bold-stem'
  | 'wire-stem'
  | 'split-left'
  | 'split-right'
  | 'fork-left'
  | 'fork-right'
  | 'soft-cluster'

export type GrassTokenMeta = {
  heightBias: number
  widthBias: number
  hueShift: number
  lightShift: number
  satShift: number
}

const GRASS_FIELD_PALETTE: readonly SurfacePaletteEntry<GrassTokenId, GrassTokenMeta>[] = [
  { id: 'lean-left', glyph: '⟋', weight: 2, meta: { heightBias: 0.04, widthBias: 0.01, hueShift: -0.012, lightShift: 0.02, satShift: 0.03 } },
  { id: 'lean-right', glyph: '⟍', weight: 2, meta: { heightBias: 0.04, widthBias: 0.01, hueShift: 0.01, lightShift: 0.01, satShift: 0.02 } },
  { id: 'thin-stem', glyph: '❘', meta: { heightBias: -0.02, widthBias: -0.01, hueShift: -0.004, lightShift: -0.01, satShift: 0 } },
  { id: 'mid-stem', glyph: '❙', weight: 2, meta: { heightBias: 0.02, widthBias: 0.02, hueShift: 0.006, lightShift: 0.01, satShift: 0.02 } },
  { id: 'bold-stem', glyph: '❚', meta: { heightBias: 0.08, widthBias: 0.04, hueShift: 0.012, lightShift: -0.02, satShift: 0.03 } },
  { id: 'wire-stem', glyph: '∣', weight: 3, meta: { heightBias: -0.03, widthBias: -0.015, hueShift: -0.008, lightShift: -0.015, satShift: -0.02 } },
  { id: 'split-left', glyph: '⟊', meta: { heightBias: 0.03, widthBias: 0, hueShift: -0.006, lightShift: 0.015, satShift: 0.01 } },
  { id: 'split-right', glyph: '⟉', meta: { heightBias: 0.03, widthBias: 0, hueShift: 0.008, lightShift: 0.01, satShift: 0.01 } },
  { id: 'fork-left', glyph: '╽', meta: { heightBias: 0.06, widthBias: 0.015, hueShift: -0.003, lightShift: 0.025, satShift: 0.015 } },
  { id: 'fork-right', glyph: '╿', meta: { heightBias: 0.06, widthBias: 0.015, hueShift: 0.004, lightShift: 0.02, satShift: 0.02 } },
  { id: 'soft-cluster', glyph: '⋮', weight: 2, meta: { heightBias: -0.01, widthBias: -0.005, hueShift: 0, lightShift: 0.03, satShift: -0.01 } },
] as const

export function getPreparedGrassSurface(): PreparedSurfaceSource<GrassTokenId, GrassTokenMeta> {
  return prepareSemanticSurfaceText(
    'grass-surface',
    GRASS_FIELD_PALETTE,
    28,
    SURFACE_TEXT_FONT,
  )
}

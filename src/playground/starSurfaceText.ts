import {
  prepareSemanticSurfaceText,
  type PreparedSurfaceSource,
  SURFACE_TEXT_FONT,
  type SurfacePaletteEntry,
} from '../skinText'

export type StarTokenId =
  | 'distant-dust'
  | 'soft-ember'
  | 'small-burst'
  | 'bright-flare'
  | 'halo-flare'
  | 'cross-twinkle'
  | 'hero-star'

export type StarTokenMeta = {
  brightnessBias: number
  sizeBias: number
}

const STAR_PALETTE: readonly SurfacePaletteEntry<StarTokenId, StarTokenMeta>[] = [
  { id: 'distant-dust', glyph: '·', weight: 3, meta: { brightnessBias: -0.03, sizeBias: -0.08 } },
  { id: 'soft-ember', glyph: '•', weight: 2, meta: { brightnessBias: 0.01, sizeBias: -0.02 } },
  { id: 'small-burst', glyph: '⋆', meta: { brightnessBias: 0.04, sizeBias: 0.04 } },
  { id: 'bright-flare', glyph: '✦', meta: { brightnessBias: 0.08, sizeBias: 0.1 } },
  { id: 'halo-flare', glyph: '✧', meta: { brightnessBias: 0.05, sizeBias: 0.02 } },
  { id: 'cross-twinkle', glyph: '∗', meta: { brightnessBias: 0.02, sizeBias: 0.01 } },
  { id: 'hero-star', glyph: '⭑', meta: { brightnessBias: 0.1, sizeBias: 0.14 } },
] as const

export function getPreparedStarSurface(): PreparedSurfaceSource<StarTokenId, StarTokenMeta> {
  return prepareSemanticSurfaceText(
    'star-sky-surface',
    STAR_PALETTE,
    36,
    SURFACE_TEXT_FONT,
  )
}

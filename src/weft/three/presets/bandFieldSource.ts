import {
  prepareSemanticSurfaceText,
  type PreparedSurfaceSource,
  type SurfacePaletteEntry,
  WEFT_TEXT_FONT,
} from '../../core'

export type BandTokenId =
  | 'reed'
  | 'sprig'
  | 'tuft'
  | 'twig'
  | 'seed'
  | 'petal'
  | 'foam'
  | 'shard'

export type BandTokenMeta = {
  heightBias: number
  widthBias: number
  hueShift: number
  lightShift: number
}

const BAND_FIELD_PALETTE: readonly SurfacePaletteEntry<BandTokenId, BandTokenMeta>[] = [
  { id: 'reed', glyph: '∣', weight: 3, meta: { heightBias: 0.18, widthBias: -0.02, hueShift: -0.03, lightShift: -0.04 } },
  { id: 'sprig', glyph: '⟋', weight: 2, meta: { heightBias: 0.1, widthBias: -0.01, hueShift: -0.015, lightShift: 0.02 } },
  { id: 'tuft', glyph: '⋮', weight: 2, meta: { heightBias: 0.04, widthBias: 0.02, hueShift: 0.01, lightShift: 0.04 } },
  { id: 'twig', glyph: '╿', meta: { heightBias: 0.12, widthBias: 0.01, hueShift: 0.02, lightShift: -0.01 } },
  { id: 'seed', glyph: '•', weight: 2, meta: { heightBias: -0.16, widthBias: -0.04, hueShift: 0.05, lightShift: 0.06 } },
  { id: 'petal', glyph: '✦', meta: { heightBias: -0.04, widthBias: 0.03, hueShift: 0.08, lightShift: 0.08 } },
  { id: 'foam', glyph: '◦', weight: 2, meta: { heightBias: -0.12, widthBias: 0.01, hueShift: 0.12, lightShift: 0.12 } },
  { id: 'shard', glyph: '▱', meta: { heightBias: 0.02, widthBias: 0.04, hueShift: -0.02, lightShift: -0.02 } },
] as const

export function getPreparedBandSurface(): PreparedSurfaceSource<BandTokenId, BandTokenMeta> {
  return prepareSemanticSurfaceText(
    'band-surface',
    BAND_FIELD_PALETTE,
    24,
    WEFT_TEXT_FONT,
  )
}

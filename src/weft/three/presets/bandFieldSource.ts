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

const FUNGUS_BAND_PALETTE: readonly SurfacePaletteEntry<BandTokenId, BandTokenMeta>[] = [
  { id: 'reed', glyph: '◔', weight: 1, meta: { heightBias: -0.18, widthBias: 0.12, hueShift: 0.08, lightShift: 0.01 } },
  { id: 'sprig', glyph: '◑', weight: 1, meta: { heightBias: -0.12, widthBias: 0.1, hueShift: 0.06, lightShift: 0.03 } },
  { id: 'tuft', glyph: '◌', weight: 2, meta: { heightBias: -0.2, widthBias: 0.08, hueShift: 0.12, lightShift: 0.08 } },
  { id: 'twig', glyph: '◍', weight: 2, meta: { heightBias: -0.08, widthBias: 0.06, hueShift: 0.03, lightShift: 0.05 } },
  { id: 'seed', glyph: '•', weight: 3, meta: { heightBias: -0.24, widthBias: 0.02, hueShift: 0.16, lightShift: 0.12 } },
  { id: 'petal', glyph: '✦', weight: 2, meta: { heightBias: -0.1, widthBias: 0.14, hueShift: 0.19, lightShift: 0.16 } },
  { id: 'foam', glyph: '◦', weight: 3, meta: { heightBias: -0.22, widthBias: 0.1, hueShift: 0.2, lightShift: 0.18 } },
  { id: 'shard', glyph: '◇', weight: 1, meta: { heightBias: -0.06, widthBias: 0.05, hueShift: 0.09, lightShift: 0.02 } },
] as const

export function getPreparedBandSurface(): PreparedSurfaceSource<BandTokenId, BandTokenMeta> {
  return prepareSemanticSurfaceText(
    'band-surface',
    BAND_FIELD_PALETTE,
    24,
    WEFT_TEXT_FONT,
  )
}

export function getPreparedFungusBandSurface(): PreparedSurfaceSource<BandTokenId, BandTokenMeta> {
  return prepareSemanticSurfaceText(
    'fungus-band-surface',
    FUNGUS_BAND_PALETTE,
    24,
    WEFT_TEXT_FONT,
  )
}

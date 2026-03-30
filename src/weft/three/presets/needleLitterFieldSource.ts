import {
  prepareSemanticSurfaceText,
  type PreparedSurfaceSource,
  type SurfacePaletteEntry,
  WEFT_TEXT_FONT,
} from '../../core'

export type NeedleLitterTokenId =
  | 'needle-tight'
  | 'needle-loose'
  | 'needle-curved'
  | 'cone-small'
  | 'cone-open'
  | 'chip-dark'
  | 'chip-light'

export type NeedleLitterTokenMeta = {
  sizeBias: number
  warmth: number
  coneBias: number
}

const NEEDLE_LITTER_PALETTE: readonly SurfacePaletteEntry<
  NeedleLitterTokenId,
  NeedleLitterTokenMeta
>[] = [
  { id: 'needle-tight', glyph: '⁞', meta: { sizeBias: -0.1, warmth: 0.02, coneBias: -0.14 } },
  { id: 'needle-loose', glyph: '⫽', meta: { sizeBias: -0.08, warmth: 0.04, coneBias: -0.12 } },
  { id: 'needle-curved', glyph: '⟍', meta: { sizeBias: -0.04, warmth: 0.03, coneBias: -0.08 } },
  { id: 'cone-small', glyph: '▴', meta: { sizeBias: 0.05, warmth: 0.01, coneBias: 0.18 } },
  { id: 'cone-open', glyph: '△', meta: { sizeBias: 0.08, warmth: 0.05, coneBias: 0.24 } },
  { id: 'chip-dark', glyph: '·', meta: { sizeBias: -0.16, warmth: -0.03, coneBias: -0.2 } },
  { id: 'chip-light', glyph: '˙', meta: { sizeBias: -0.14, warmth: 0.06, coneBias: -0.18 } },
] as const

export function getPreparedNeedleLitterSurface(): PreparedSurfaceSource<
  NeedleLitterTokenId,
  NeedleLitterTokenMeta
> {
  return prepareSemanticSurfaceText(
    'needle-litter-surface',
    NEEDLE_LITTER_PALETTE,
    22,
    WEFT_TEXT_FONT,
  )
}

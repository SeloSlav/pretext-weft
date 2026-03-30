import {
  prepareSemanticSurfaceText,
  type PreparedSurfaceSource,
  type SurfacePaletteEntry,
  WEFT_TEXT_FONT,
} from '../../core'

export type StickTokenId =
  | 'twig-thin'
  | 'twig-mid'
  | 'twig-split'
  | 'branch-curved'
  | 'branch-bark'
  | 'needle-cluster'
  | 'chip-dark'
  | 'chip-light'

export type StickTokenMeta = {
  lengthBias: number
  radiusBias: number
  warmth: number
  spreadBias: number
}

const STICK_FIELD_PALETTE: readonly SurfacePaletteEntry<StickTokenId, StickTokenMeta>[] = [
  { id: 'twig-thin', glyph: '╌', meta: { lengthBias: -0.12, radiusBias: -0.08, warmth: 0.03, spreadBias: 0.08 } },
  { id: 'twig-mid', glyph: '╴', meta: { lengthBias: -0.02, radiusBias: -0.04, warmth: 0.01, spreadBias: 0.02 } },
  { id: 'twig-split', glyph: '╶', meta: { lengthBias: 0.06, radiusBias: -0.05, warmth: 0.04, spreadBias: 0.12 } },
  { id: 'branch-curved', glyph: '﹉', meta: { lengthBias: 0.14, radiusBias: -0.02, warmth: 0.02, spreadBias: -0.02 } },
  { id: 'branch-bark', glyph: '﹍', meta: { lengthBias: 0.18, radiusBias: 0, warmth: -0.01, spreadBias: -0.05 } },
  { id: 'needle-cluster', glyph: '⁞', meta: { lengthBias: -0.18, radiusBias: -0.1, warmth: 0.05, spreadBias: 0.14 } },
  { id: 'chip-dark', glyph: '·', meta: { lengthBias: -0.24, radiusBias: -0.12, warmth: -0.02, spreadBias: 0.18 } },
  { id: 'chip-light', glyph: '˙', meta: { lengthBias: -0.22, radiusBias: -0.12, warmth: 0.06, spreadBias: 0.2 } },
] as const

export function getPreparedStickSurface(): PreparedSurfaceSource<StickTokenId, StickTokenMeta> {
  return prepareSemanticSurfaceText(
    'stick-surface',
    STICK_FIELD_PALETTE,
    22,
    WEFT_TEXT_FONT,
  )
}

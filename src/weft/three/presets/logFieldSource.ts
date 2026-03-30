import {
  prepareSemanticSurfaceText,
  type PreparedSurfaceSource,
  type SurfacePaletteEntry,
  WEFT_TEXT_FONT,
} from '../../core'

export type LogTokenId =
  | 'trunk-heavy'
  | 'trunk-mid'
  | 'trunk-light'
  | 'branch-heavy'
  | 'branch-light'
  | 'split-dark'
  | 'split-light'
  | 'bark-heavy'
  | 'bark-light'

export type LogTokenMeta = {
  lengthBias: number
  radiusBias: number
  warmth: number
}

const LOG_FIELD_PALETTE: readonly SurfacePaletteEntry<LogTokenId, LogTokenMeta>[] = [
  { id: 'trunk-heavy', glyph: '═', meta: { lengthBias: 0.42, radiusBias: 0.18, warmth: -0.01 } },
  { id: 'trunk-mid', glyph: '━', meta: { lengthBias: 0.28, radiusBias: 0.1, warmth: 0.02 } },
  { id: 'trunk-light', glyph: '▬', meta: { lengthBias: 0.18, radiusBias: 0.04, warmth: 0.05 } },
  { id: 'branch-heavy', glyph: '▭', meta: { lengthBias: -0.02, radiusBias: -0.02, warmth: 0.03 } },
  { id: 'branch-light', glyph: '▱', meta: { lengthBias: -0.08, radiusBias: -0.06, warmth: 0.06 } },
  { id: 'split-dark', glyph: '╍', meta: { lengthBias: 0.08, radiusBias: -0.04, warmth: 0.01 } },
  { id: 'split-light', glyph: '┅', meta: { lengthBias: -0.04, radiusBias: -0.08, warmth: 0.07 } },
  { id: 'bark-heavy', glyph: '▰', meta: { lengthBias: 0.14, radiusBias: 0.08, warmth: -0.02 } },
  { id: 'bark-light', glyph: '▤', meta: { lengthBias: 0.02, radiusBias: -0.02, warmth: 0.04 } },
] as const

export function getPreparedLogSurface(): PreparedSurfaceSource<LogTokenId, LogTokenMeta> {
  return prepareSemanticSurfaceText(
    'log-surface',
    LOG_FIELD_PALETTE,
    14,
    WEFT_TEXT_FONT,
  )
}

import {
  prepareSemanticSurfaceText,
  type PreparedSurfaceSource,
  SURFACE_TEXT_FONT,
  type SurfacePaletteEntry,
} from '../skinText'

export type FireTokenId =
  | 'ember-dot'
  | 'ember-ring'
  | 'open-coal'
  | 'soft-cinder'
  | 'flash-core'
  | 'flash-outline'
  | 'hot-plus'
  | 'cross-spark'
  | 'asterisk-spark'
  | 'burst-spark'
  | 'dense-ember'
  | 'dotted-coal'
  | 'striped-coal'
  | 'bullseye-core'
  | 'dot-ring'
  | 'wide-ring'

export type FireTokenMeta = {
  heatBias: number
  sizeBias: number
}

const FIRE_PALETTE: readonly SurfacePaletteEntry<FireTokenId, FireTokenMeta>[] = [
  { id: 'ember-dot', glyph: '·', meta: { heatBias: 0.05, sizeBias: -0.1 } },
  { id: 'ember-ring', glyph: '∘', meta: { heatBias: -0.02, sizeBias: -0.02 } },
  { id: 'open-coal', glyph: '○', meta: { heatBias: -0.04, sizeBias: 0.02 } },
  { id: 'soft-cinder', glyph: '◦', meta: { heatBias: 0, sizeBias: -0.01 } },
  { id: 'flash-core', glyph: '✦', meta: { heatBias: 0.08, sizeBias: 0.08 } },
  { id: 'flash-outline', glyph: '✧', meta: { heatBias: 0.03, sizeBias: 0.04 } },
  { id: 'hot-plus', glyph: '⁺', meta: { heatBias: 0.07, sizeBias: -0.03 } },
  { id: 'cross-spark', glyph: '×', meta: { heatBias: 0.04, sizeBias: 0 } },
  { id: 'asterisk-spark', glyph: '∗', meta: { heatBias: 0.02, sizeBias: 0.01 } },
  { id: 'burst-spark', glyph: '⋆', meta: { heatBias: 0.06, sizeBias: 0.05 } },
  { id: 'dense-ember', glyph: '∙', meta: { heatBias: 0.01, sizeBias: -0.04 } },
  { id: 'dotted-coal', glyph: '◌', meta: { heatBias: -0.03, sizeBias: 0.03 } },
  { id: 'striped-coal', glyph: '◍', meta: { heatBias: -0.01, sizeBias: 0.06 } },
  { id: 'bullseye-core', glyph: '◎', meta: { heatBias: 0.02, sizeBias: 0.09 } },
  { id: 'dot-ring', glyph: '⊙', meta: { heatBias: 0.04, sizeBias: 0.07 } },
  { id: 'wide-ring', glyph: '⊚', meta: { heatBias: -0.02, sizeBias: 0.05 } },
] as const

export function getPreparedFireSurface(): PreparedSurfaceSource<FireTokenId, FireTokenMeta> {
  return prepareSemanticSurfaceText(
    'fire-surface',
    FIRE_PALETTE,
    20,
    SURFACE_TEXT_FONT,
  )
}

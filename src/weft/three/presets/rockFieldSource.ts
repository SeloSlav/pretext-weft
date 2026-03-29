import {
  prepareSemanticSurfaceText,
  type PreparedSurfaceSource,
  type SurfacePaletteEntry,
  WEFT_TEXT_FONT,
} from '../../core'

export type RockTokenId =
  | 'slab-dark'
  | 'slab-light'
  | 'block-dark'
  | 'block-light'
  | 'chip-dark'
  | 'chip-light'
  | 'pebble-dark'
  | 'pebble-light'
  | 'hex-flat'
  | 'hex-angled'
  | 'kite-dark'
  | 'kite-light'
  | 'diamond-dark'
  | 'diamond-light'
  | 'shard-dark'
  | 'shard-light'
  | 'pillar-dark'
  | 'pillar-light'
  | 'bullseye-dark'
  | 'bullseye-light'

export type RockTokenMeta = {
  sizeBias: number
  warmth: number
}

const ROCK_FIELD_PALETTE: readonly SurfacePaletteEntry<RockTokenId, RockTokenMeta>[] = [
  { id: 'slab-dark', glyph: '⬛', meta: { sizeBias: 0.18, warmth: -0.02 } },
  { id: 'slab-light', glyph: '⬜', meta: { sizeBias: 0.16, warmth: 0.04 } },
  { id: 'block-dark', glyph: '◼', meta: { sizeBias: 0.14, warmth: -0.01 } },
  { id: 'block-light', glyph: '◻', meta: { sizeBias: 0.12, warmth: 0.03 } },
  { id: 'chip-dark', glyph: '▪', meta: { sizeBias: -0.04, warmth: -0.02 } },
  { id: 'chip-light', glyph: '▫', meta: { sizeBias: -0.06, warmth: 0.02 } },
  { id: 'pebble-dark', glyph: '◾', meta: { sizeBias: 0.02, warmth: -0.01 } },
  { id: 'pebble-light', glyph: '◽', meta: { sizeBias: -0.01, warmth: 0.02 } },
  { id: 'hex-flat', glyph: '⬡', meta: { sizeBias: 0.08, warmth: 0.01 } },
  { id: 'hex-angled', glyph: '⬢', meta: { sizeBias: 0.1, warmth: -0.01 } },
  { id: 'kite-dark', glyph: '⬟', meta: { sizeBias: 0.05, warmth: 0 } },
  { id: 'kite-light', glyph: '⬠', meta: { sizeBias: 0.03, warmth: 0.03 } },
  { id: 'diamond-dark', glyph: '◆', meta: { sizeBias: 0.11, warmth: 0.02 } },
  { id: 'diamond-light', glyph: '◇', meta: { sizeBias: 0.04, warmth: 0.05 } },
  { id: 'shard-dark', glyph: '▲', meta: { sizeBias: 0.07, warmth: 0.01 } },
  { id: 'shard-light', glyph: '△', meta: { sizeBias: -0.02, warmth: 0.06 } },
  { id: 'pillar-dark', glyph: '▮', meta: { sizeBias: 0.09, warmth: -0.03 } },
  { id: 'pillar-light', glyph: '▯', meta: { sizeBias: 0.02, warmth: 0.02 } },
  { id: 'bullseye-dark', glyph: '◙', meta: { sizeBias: 0.13, warmth: -0.02 } },
  { id: 'bullseye-light', glyph: '◘', meta: { sizeBias: 0.06, warmth: 0.04 } },
] as const

export function getPreparedRockSurface(): PreparedSurfaceSource<RockTokenId, RockTokenMeta> {
  return prepareSemanticSurfaceText(
    'rock-surface',
    ROCK_FIELD_PALETTE,
    18,
    WEFT_TEXT_FONT,
  )
}

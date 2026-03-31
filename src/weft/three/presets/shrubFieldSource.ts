import {
  prepareSemanticSurfaceText,
  type PreparedSurfaceSource,
  type SurfacePaletteEntry,
  WEFT_TEXT_FONT,
} from '../../core'

export const SHRUB_FOLIAGE_SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const
export type ShrubFoliageSeason = (typeof SHRUB_FOLIAGE_SEASONS)[number]

export type ShrubTokenId =
  | 'shrub-round'
  | 'shrub-wide'
  | 'shrub-low'
  | 'fern-loose'
  | 'fern-tall'
  | 'berry-dense'

export type ShrubTokenMeta = {
  sizeBias: number
  heightBias: number
  spreadBias: number
  warmth: number
}

const SHRUB_FIELD_PALETTE: readonly SurfacePaletteEntry<ShrubTokenId, ShrubTokenMeta>[] = [
  { id: 'shrub-round', glyph: 'o', meta: { sizeBias: 0.08, heightBias: 0.02, spreadBias: 0.04, warmth: 0 } },
  { id: 'shrub-wide', glyph: '@', meta: { sizeBias: 0.12, heightBias: -0.08, spreadBias: 0.18, warmth: 0.01 } },
  { id: 'shrub-low', glyph: '*', meta: { sizeBias: -0.04, heightBias: -0.14, spreadBias: 0.1, warmth: 0.02 } },
  { id: 'fern-loose', glyph: '&', meta: { sizeBias: -0.08, heightBias: 0.12, spreadBias: -0.04, warmth: -0.01 } },
  { id: 'fern-tall', glyph: '%', meta: { sizeBias: -0.02, heightBias: 0.18, spreadBias: -0.08, warmth: -0.02 } },
  { id: 'berry-dense', glyph: '#', meta: { sizeBias: 0.04, heightBias: 0.04, spreadBias: 0.02, warmth: 0.04 } },
] as const

function seasonalMeta(meta: ShrubTokenMeta, season: ShrubFoliageSeason): ShrubTokenMeta {
  switch (season) {
    case 'spring':
      return { ...meta, warmth: meta.warmth - 0.18 }  // cool yellow-green
    case 'summer':
      return { ...meta, warmth: meta.warmth - 0.06 }  // deep green
    case 'autumn':
      return { ...meta, warmth: meta.warmth + 0.55 }  // vivid orange-red
    case 'winter':
    default:
      return { ...meta, warmth: meta.warmth - 0.72 }  // pale, near-desaturated
  }
}

export function getPreparedShrubSurface(): PreparedSurfaceSource<ShrubTokenId, ShrubTokenMeta> {
  return prepareSemanticSurfaceText(
    'shrub-field-surface',
    SHRUB_FIELD_PALETTE,
    18,
    WEFT_TEXT_FONT,
  )
}

export function buildShrubSeasonSurface(season: ShrubFoliageSeason): PreparedSurfaceSource<ShrubTokenId, ShrubTokenMeta> {
  const palette = SHRUB_FIELD_PALETTE.map((entry) => ({
    ...entry,
    weight: entry.weight ?? 1,
    meta: seasonalMeta(entry.meta, season),
  }))

  return prepareSemanticSurfaceText(
    `shrub-field-surface-${season}`,
    palette,
    18,
    WEFT_TEXT_FONT,
  )
}

import {
  prepareSemanticSurfaceText,
  type PreparedSurfaceSource,
  type SurfacePaletteEntry,
  WEFT_TEXT_FONT,
} from '../../core'

export const TREE_FOLIAGE_SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const
export type TreeFoliageSeason = (typeof TREE_FOLIAGE_SEASONS)[number]

export type TreeTokenId =
  | 'pine-spire'
  | 'pine-wide'
  | 'oak-round'
  | 'birch-light'
  | 'cedar-tall'
  | 'sapling-thin'

export type TreeTokenMeta = {
  trunkBias: number
  crownBias: number
  spreadBias: number
  warmth: number
  spireBias: number
}

const TREE_FIELD_PALETTE: readonly SurfacePaletteEntry<TreeTokenId, TreeTokenMeta>[] = [
  { id: 'pine-spire', glyph: 'T', meta: { trunkBias: 0.02, crownBias: 0.06, spreadBias: -0.08, warmth: -0.02, spireBias: 0.42 } },
  { id: 'pine-wide', glyph: 'Y', meta: { trunkBias: 0.04, crownBias: 0.12, spreadBias: 0.06, warmth: 0, spireBias: 0.24 } },
  { id: 'oak-round', glyph: 'O', meta: { trunkBias: 0.08, crownBias: 0.2, spreadBias: 0.22, warmth: 0.03, spireBias: -0.18 } },
  { id: 'birch-light', glyph: 'H', meta: { trunkBias: -0.04, crownBias: 0.02, spreadBias: 0.02, warmth: 0.05, spireBias: 0.08 } },
  { id: 'cedar-tall', glyph: 'A', meta: { trunkBias: 0.03, crownBias: 0.16, spreadBias: 0.04, warmth: -0.01, spireBias: 0.3 } },
  { id: 'sapling-thin', glyph: 'I', meta: { trunkBias: -0.1, crownBias: -0.06, spreadBias: -0.06, warmth: 0.02, spireBias: 0.12 } },
] as const

function seasonalMeta(meta: TreeTokenMeta, season: TreeFoliageSeason): TreeTokenMeta {
  switch (season) {
    case 'spring':
      return { ...meta, warmth: meta.warmth - 0.18 }  // cool yellow-green new growth
    case 'summer':
      return { ...meta, warmth: meta.warmth - 0.06 }  // rich deep green
    case 'autumn':
      return { ...meta, warmth: meta.warmth + 0.55 }  // strong orange-red shift
    case 'winter':
    default:
      return { ...meta, warmth: meta.warmth - 0.72 }  // near-desaturated, pale/grey
  }
}

export function getPreparedTreeSurface(): PreparedSurfaceSource<TreeTokenId, TreeTokenMeta> {
  return prepareSemanticSurfaceText(
    'tree-field-surface',
    TREE_FIELD_PALETTE,
    16,
    WEFT_TEXT_FONT,
  )
}

export function buildTreeSeasonSurface(season: TreeFoliageSeason): PreparedSurfaceSource<TreeTokenId, TreeTokenMeta> {
  const palette = TREE_FIELD_PALETTE.map((entry) => ({
    ...entry,
    weight: entry.weight ?? 1,
    meta: seasonalMeta(entry.meta, season),
  }))

  return prepareSemanticSurfaceText(
    `tree-field-surface-${season}`,
    palette,
    16,
    WEFT_TEXT_FONT,
  )
}

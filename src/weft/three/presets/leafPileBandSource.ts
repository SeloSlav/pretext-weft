import {
  prepareSemanticSurfaceText,
  type PreparedSurfaceSource,
  type SurfacePaletteEntry,
  WEFT_TEXT_FONT,
} from '../../core'

export const LEAF_PILE_SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const

export type LeafPileSeason = (typeof LEAF_PILE_SEASONS)[number]

export type LeafPileTokenId =
  | 'fresh-frond'
  | 'broad-leaf'
  | 'maple-leaf'
  | 'small-cluster'
  | 'curled-leaf'
  | 'dry-shard'
  | 'twig'
  | 'seed'

export type LeafPileTokenMeta = {
  heightBias: number
  widthBias: number
  hueShift: number
  lightShift: number
  liftBias: number
  curlBias: number
}

const LEAF_PILE_BASE_PALETTE: readonly SurfacePaletteEntry<LeafPileTokenId, LeafPileTokenMeta>[] = [
  {
    id: 'fresh-frond',
    glyph: '❦',
    weight: 2,
    meta: {
      heightBias: 0.06,
      widthBias: 0.1,
      hueShift: -0.02,
      lightShift: 0.04,
      liftBias: 0.08,
      curlBias: 0.05,
    },
  },
  {
    id: 'broad-leaf',
    glyph: '◖',
    weight: 3,
    meta: {
      heightBias: 0.02,
      widthBias: 0.14,
      hueShift: 0,
      lightShift: 0.02,
      liftBias: 0.03,
      curlBias: 0.02,
    },
  },
  {
    id: 'maple-leaf',
    glyph: '✦',
    weight: 2,
    meta: {
      heightBias: -0.01,
      widthBias: 0.16,
      hueShift: 0.05,
      lightShift: 0.06,
      liftBias: 0.02,
      curlBias: 0.08,
    },
  },
  {
    id: 'small-cluster',
    glyph: '◌',
    weight: 3,
    meta: {
      heightBias: -0.08,
      widthBias: 0.06,
      hueShift: 0.03,
      lightShift: 0.08,
      liftBias: -0.02,
      curlBias: -0.01,
    },
  },
  {
    id: 'curled-leaf',
    glyph: '◔',
    weight: 2,
    meta: {
      heightBias: 0.04,
      widthBias: 0.08,
      hueShift: 0.07,
      lightShift: -0.01,
      liftBias: 0.12,
      curlBias: 0.14,
    },
  },
  {
    id: 'dry-shard',
    glyph: '▱',
    weight: 1,
    meta: {
      heightBias: -0.06,
      widthBias: 0.04,
      hueShift: 0.1,
      lightShift: -0.04,
      liftBias: -0.03,
      curlBias: 0.11,
    },
  },
  {
    id: 'twig',
    glyph: '╿',
    weight: 1,
    meta: {
      heightBias: 0.16,
      widthBias: -0.08,
      hueShift: -0.03,
      lightShift: -0.1,
      liftBias: 0.06,
      curlBias: -0.05,
    },
  },
  {
    id: 'seed',
    glyph: '•',
    weight: 2,
    meta: {
      heightBias: -0.14,
      widthBias: -0.04,
      hueShift: 0.02,
      lightShift: 0.03,
      liftBias: -0.05,
      curlBias: 0,
    },
  },
] as const

export function getPreparedLeafPileSurface(): PreparedSurfaceSource<LeafPileTokenId, LeafPileTokenMeta> {
  return prepareSemanticSurfaceText(
    'leaf-pile-surface',
    LEAF_PILE_BASE_PALETTE,
    24,
    WEFT_TEXT_FONT,
  )
}

export function buildLeafPileSeasonSurface(
  season: LeafPileSeason,
): PreparedSurfaceSource<LeafPileTokenId, LeafPileTokenMeta> {
  const palette = LEAF_PILE_BASE_PALETTE.map((entry) => ({
    ...entry,
    weight: entry.weight ?? 1,
  }))

  return prepareSemanticSurfaceText(
    `leaf-pile-surface-${season}`,
    palette,
    24,
    WEFT_TEXT_FONT,
  )
}

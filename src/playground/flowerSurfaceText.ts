import {
  prepareSemanticSurfaceText,
  type PreparedSurfaceSource,
  SURFACE_TEXT_FONT,
  type SurfacePaletteEntry,
} from '../skinText'

export type FlowerTokenId =
  | 'rose-cluster'
  | 'cream-petal'
  | 'violet-aster'
  | 'magenta-bloom'
  | 'coral-star'
  | 'gold-bloom'
  | 'lavender-burst'
  | 'sky-open'
  | 'rose-open'
  | 'coral-five'
  | 'white-spray'
  | 'amber-diamond'
  | 'soft-yellow'
  | 'pale-violet'

export type FlowerTokenMeta = {
  hue: number
  stalkHue: number
  heightBias: number
  bloomBias: number
}

const FLOWER_PALETTE: readonly SurfacePaletteEntry<FlowerTokenId, FlowerTokenMeta>[] = [
  { id: 'rose-cluster', glyph: '✿', meta: { hue: 0.95, stalkHue: 0.29, heightBias: 0.1, bloomBias: 0.08 } },
  { id: 'cream-petal', glyph: '❀', meta: { hue: 0.12, stalkHue: 0.28, heightBias: -0.02, bloomBias: 0 } },
  { id: 'violet-aster', glyph: '✾', meta: { hue: 0.75, stalkHue: 0.31, heightBias: 0.04, bloomBias: 0.05 } },
  { id: 'magenta-bloom', glyph: '❁', meta: { hue: 0.9, stalkHue: 0.3, heightBias: 0.08, bloomBias: 0.09 } },
  { id: 'coral-star', glyph: '✽', meta: { hue: 0.04, stalkHue: 0.28, heightBias: 0.02, bloomBias: 0.04 } },
  { id: 'gold-bloom', glyph: '✼', meta: { hue: 0.14, stalkHue: 0.27, heightBias: 0.01, bloomBias: 0.06 } },
  { id: 'lavender-burst', glyph: '✻', meta: { hue: 0.72, stalkHue: 0.3, heightBias: 0.05, bloomBias: 0.05 } },
  { id: 'sky-open', glyph: '✺', meta: { hue: 0.58, stalkHue: 0.31, heightBias: -0.04, bloomBias: 0.03 } },
  { id: 'rose-open', glyph: '❃', meta: { hue: 0.98, stalkHue: 0.29, heightBias: 0.03, bloomBias: 0.04 } },
  { id: 'coral-five', glyph: '❋', meta: { hue: 0.02, stalkHue: 0.28, heightBias: 0.06, bloomBias: 0.07 } },
  { id: 'white-spray', glyph: '⚘', meta: { hue: 0.1, stalkHue: 0.33, heightBias: 0.12, bloomBias: -0.01 } },
  { id: 'amber-diamond', glyph: '✤', meta: { hue: 0.11, stalkHue: 0.27, heightBias: -0.03, bloomBias: 0.03 } },
  { id: 'soft-yellow', glyph: '✦', meta: { hue: 0.15, stalkHue: 0.29, heightBias: -0.02, bloomBias: 0.01 } },
  { id: 'pale-violet', glyph: '✧', meta: { hue: 0.69, stalkHue: 0.31, heightBias: -0.05, bloomBias: 0.02 } },
] as const

export function getPreparedFlowerSurface(): PreparedSurfaceSource<FlowerTokenId, FlowerTokenMeta> {
  return prepareSemanticSurfaceText(
    'flower-surface',
    FLOWER_PALETTE,
    14,
    SURFACE_TEXT_FONT,
  )
}

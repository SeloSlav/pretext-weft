import {
  prepareSemanticSurfaceText,
  type PreparedSurfaceSource,
  type SurfacePaletteEntry,
  WEFT_TEXT_FONT,
} from '../../core'

export type FishTokenId =
  | 'crest-left'
  | 'crest-right'
  | 'shadow-left'
  | 'shadow-right'
  | 'core-eye'
  | 'ribbed-eye'
  | 'halo-ring'
  | 'diamond-ring'
  | 'outline-diamond'
  | 'solid-diamond'
  | 'hex-scale'
  | 'open-ring'

export type FishTokenMeta = {
  widthBias: number
  heightBias: number
  depthBias: number
  hueBias: number
}

const FISH_SCALE_PALETTE: readonly SurfacePaletteEntry<FishTokenId, FishTokenMeta>[] = [
  { id: 'crest-left', glyph: '◓', weight: 3, meta: { widthBias: 0.02, heightBias: 0.08, depthBias: 0.02, hueBias: -0.01 } },
  { id: 'crest-right', glyph: '◒', weight: 2, meta: { widthBias: 0.01, heightBias: 0.06, depthBias: 0.02, hueBias: 0.01 } },
  { id: 'shadow-left', glyph: '◐', meta: { widthBias: 0.03, heightBias: 0.02, depthBias: 0.01, hueBias: -0.015 } },
  { id: 'shadow-right', glyph: '◑', meta: { widthBias: 0.03, heightBias: 0.02, depthBias: 0.01, hueBias: 0.012 } },
  { id: 'core-eye', glyph: '◉', meta: { widthBias: 0.05, heightBias: 0.04, depthBias: 0.03, hueBias: 0.02 } },
  { id: 'ribbed-eye', glyph: '◍', meta: { widthBias: 0.04, heightBias: 0.03, depthBias: 0.04, hueBias: 0.015 } },
  { id: 'halo-ring', glyph: '◎', meta: { widthBias: 0.06, heightBias: 0.01, depthBias: 0.02, hueBias: 0.03 } },
  { id: 'diamond-ring', glyph: '◈', meta: { widthBias: 0.01, heightBias: 0.05, depthBias: 0.04, hueBias: -0.005 } },
  { id: 'outline-diamond', glyph: '◇', meta: { widthBias: -0.01, heightBias: -0.02, depthBias: 0, hueBias: 0.01 } },
  { id: 'solid-diamond', glyph: '◆', meta: { widthBias: 0.02, heightBias: 0.01, depthBias: 0.05, hueBias: -0.008 } },
  { id: 'hex-scale', glyph: '⬡', meta: { widthBias: 0.03, heightBias: 0, depthBias: 0.03, hueBias: 0.018 } },
  { id: 'open-ring', glyph: '◌', meta: { widthBias: -0.02, heightBias: -0.03, depthBias: 0.01, hueBias: 0.006 } },
] as const

const GLASS_SCALE_PALETTE: readonly SurfacePaletteEntry<FishTokenId, FishTokenMeta>[] = [
  { id: 'crest-left', glyph: '◇', weight: 3, meta: { widthBias: -0.03, heightBias: 0.08, depthBias: -0.01, hueBias: -0.01 } },
  { id: 'crest-right', glyph: '◈', weight: 2, meta: { widthBias: -0.04, heightBias: 0.12, depthBias: 0.02, hueBias: 0.01 } },
  { id: 'shadow-left', glyph: '⬡', meta: { widthBias: 0, heightBias: 0.02, depthBias: 0.01, hueBias: -0.015 } },
  { id: 'shadow-right', glyph: '⬢', meta: { widthBias: -0.02, heightBias: 0.06, depthBias: 0.02, hueBias: 0.012 } },
  { id: 'core-eye', glyph: '△', meta: { widthBias: -0.06, heightBias: 0.16, depthBias: 0.01, hueBias: 0.004 } },
  { id: 'ribbed-eye', glyph: '▽', meta: { widthBias: -0.05, heightBias: 0.15, depthBias: 0.01, hueBias: -0.004 } },
  { id: 'halo-ring', glyph: '◬', meta: { widthBias: -0.01, heightBias: 0.1, depthBias: 0.01, hueBias: 0.01 } },
  { id: 'diamond-ring', glyph: '◭', meta: { widthBias: -0.02, heightBias: 0.08, depthBias: 0.02, hueBias: -0.01 } },
  { id: 'outline-diamond', glyph: '◮', meta: { widthBias: -0.03, heightBias: 0.1, depthBias: 0.02, hueBias: 0.008 } },
  { id: 'solid-diamond', glyph: '◆', meta: { widthBias: 0.02, heightBias: 0.03, depthBias: 0.03, hueBias: -0.008 } },
  { id: 'hex-scale', glyph: '▱', meta: { widthBias: 0.05, heightBias: -0.02, depthBias: 0.01, hueBias: 0.014 } },
  { id: 'open-ring', glyph: '✧', meta: { widthBias: -0.05, heightBias: 0.06, depthBias: -0.01, hueBias: 0.006 } },
] as const

export function getPreparedShellSurface(): PreparedSurfaceSource<FishTokenId, FishTokenMeta> {
  return prepareSemanticSurfaceText(
    'shell-surface',
    FISH_SCALE_PALETTE,
    22,
    WEFT_TEXT_FONT,
  )
}

export function getPreparedGlassSurface(): PreparedSurfaceSource<FishTokenId, FishTokenMeta> {
  return prepareSemanticSurfaceText(
    'glass-surface',
    GLASS_SCALE_PALETTE,
    20,
    WEFT_TEXT_FONT,
  )
}

export const getPreparedFishSurface = getPreparedShellSurface

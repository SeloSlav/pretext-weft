import {
  prepareSemanticSurfaceText,
  type PreparedSurfaceSource,
  type SurfacePaletteEntry,
  WEFT_TEXT_FONT,
} from '../../core'

export type TreeBarkTokenId =
  | 'bark-ridge'
  | 'bark-chip'
  | 'bark-split'
  | 'bark-light'
  | 'bark-knot'

export type TreeBarkTokenMeta = {
  widthBias: number
  heightBias: number
  depthBias: number
}

const TREE_BARK_SURFACE_PALETTE: readonly SurfacePaletteEntry<TreeBarkTokenId, TreeBarkTokenMeta>[] = [
  { id: 'bark-ridge', glyph: '▰', meta: { widthBias: 0.04, heightBias: 0.08, depthBias: 0.02 } },
  { id: 'bark-chip', glyph: '▥', meta: { widthBias: 0, heightBias: 0.02, depthBias: 0.01 } },
  { id: 'bark-split', glyph: '╎', meta: { widthBias: -0.04, heightBias: 0.1, depthBias: -0.01 } },
  { id: 'bark-light', glyph: '▤', meta: { widthBias: 0.02, heightBias: -0.02, depthBias: 0 } },
  { id: 'bark-knot', glyph: '◉', meta: { widthBias: -0.08, heightBias: -0.04, depthBias: 0.03 } },
] as const

export function getPreparedTreeBarkSurface(): PreparedSurfaceSource<TreeBarkTokenId, TreeBarkTokenMeta> {
  return prepareSemanticSurfaceText(
    'tree-bark-surface',
    TREE_BARK_SURFACE_PALETTE,
    18,
    WEFT_TEXT_FONT,
  )
}

import {
  prepareSemanticSurfaceText,
  type PreparedSurfaceSource,
  type SurfacePaletteEntry,
  WEFT_TEXT_FONT,
} from '../../core'
import type { FishTokenId, FishTokenMeta } from './fishScaleSource'

/**
 * Ivy facade uses the same token ids as the shell-surface wall so it can share ShellSurfaceEffect,
 * with glyphs and meta tuned for a vine/leaf read.
 */
const IVY_PALETTE: readonly SurfacePaletteEntry<FishTokenId, FishTokenMeta>[] = [
  { id: 'crest-left', glyph: '⌇', weight: 3, meta: { widthBias: 0.03, heightBias: 0.08, depthBias: 0.02, hueBias: -0.02 } },
  { id: 'crest-right', glyph: '⌈', weight: 2, meta: { widthBias: 0.02, heightBias: 0.06, depthBias: 0.02, hueBias: 0.01 } },
  { id: 'shadow-left', glyph: '❧', weight: 2, meta: { widthBias: 0.03, heightBias: 0.03, depthBias: 0.02, hueBias: -0.015 } },
  { id: 'shadow-right', glyph: '❦', weight: 2, meta: { widthBias: 0.03, heightBias: 0.03, depthBias: 0.02, hueBias: 0.012 } },
  { id: 'core-eye', glyph: '⬡', weight: 2, meta: { widthBias: 0.05, heightBias: 0.04, depthBias: 0.03, hueBias: 0.02 } },
  { id: 'ribbed-eye', glyph: '⬢', weight: 2, meta: { widthBias: 0.04, heightBias: 0.03, depthBias: 0.04, hueBias: 0.015 } },
  { id: 'halo-ring', glyph: '◎', weight: 2, meta: { widthBias: 0.05, heightBias: 0.02, depthBias: 0.02, hueBias: 0.02 } },
  { id: 'diamond-ring', glyph: '◇', weight: 2, meta: { widthBias: 0.02, heightBias: 0.04, depthBias: 0.03, hueBias: -0.005 } },
  { id: 'outline-diamond', glyph: '◈', weight: 2, meta: { widthBias: 0.01, heightBias: 0.02, depthBias: 0.02, hueBias: 0.01 } },
  { id: 'solid-diamond', glyph: '⎔', weight: 1, meta: { widthBias: 0.03, heightBias: 0.02, depthBias: 0.04, hueBias: -0.008 } },
  { id: 'hex-scale', glyph: '⬣', weight: 2, meta: { widthBias: 0.03, heightBias: 0.02, depthBias: 0.03, hueBias: 0.018 } },
  { id: 'open-ring', glyph: '◌', weight: 1, meta: { widthBias: -0.02, heightBias: -0.02, depthBias: 0.02, hueBias: 0.006 } },
] as const

export function getPreparedIvySurface(): PreparedSurfaceSource<FishTokenId, FishTokenMeta> {
  return prepareSemanticSurfaceText('ivy-facade', IVY_PALETTE, 22, WEFT_TEXT_FONT)
}

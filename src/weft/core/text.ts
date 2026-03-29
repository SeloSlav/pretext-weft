import {
  layoutNextLine,
  prepareWithSegments,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from '@chenglou/pretext'

export const WEFT_TEXT_FONT =
  '22px "Segoe UI Symbol", "Cascadia Code", "Noto Sans Symbols 2", sans-serif'

const preparedCache = new Map<string, PreparedTextWithSegments>()
const preparedSurfaceCache = new Map<string, PreparedSurfaceSource<string, unknown>>()

export type SurfacePaletteEntry<TokenId extends string = string, Meta = unknown> = {
  id: TokenId
  glyph: string
  weight?: number
  meta: Meta
}

export type SurfaceGlyphUnits = readonly string[]
export type SurfaceShorthandMeta = Record<string, never>

export type ResolvedSurfaceGlyph<TokenId extends string = string, Meta = unknown> = {
  id: TokenId
  glyph: string
  ordinal: number
  meta: Meta
}

export type PreparedSurfaceSource<TokenId extends string = string, Meta = unknown> = {
  cacheKey: string
  prepared: PreparedTextWithSegments
  palette: readonly SurfacePaletteEntry<TokenId, Meta>[]
  glyphLookup: ReadonlyMap<string, ResolvedSurfaceGlyph<TokenId, Meta>>
}

export type SeedCursorFactory = (
  preparedText: PreparedTextWithSegments,
  advance: number,
) => LayoutCursor

export function buildRepeatedUnitStream(units: readonly string[], repeat: number): string {
  const chunks: string[] = []
  for (let r = 0; r < repeat; r++) {
    for (let i = 0; i < units.length; i++) {
      chunks.push(units[i]!)
      chunks.push(' ')
    }
  }
  return chunks.join('')
}

export function prepareCachedSurfaceText(
  cacheKey: string,
  sourceText: string,
  font = WEFT_TEXT_FONT,
): PreparedTextWithSegments {
  const cached = preparedCache.get(cacheKey)
  if (cached) return cached

  const prepared = prepareWithSegments(sourceText, font)
  preparedCache.set(cacheKey, prepared)
  return prepared
}

export function buildWeightedPaletteStream<TokenId extends string, Meta>(
  palette: readonly SurfacePaletteEntry<TokenId, Meta>[],
  repeat: number,
): string {
  const chunks: string[] = []
  for (let r = 0; r < repeat; r++) {
    for (let i = 0; i < palette.length; i++) {
      const entry = palette[i]!
      const weight = Math.max(1, Math.floor(entry.weight ?? 1))
      for (let count = 0; count < weight; count++) {
        chunks.push(entry.glyph)
        chunks.push(' ')
      }
    }
  }
  return chunks.join('')
}

function glyphTokenId(glyph: string): string {
  const codePoints = Array.from(glyph, (char) => char.codePointAt(0)?.toString(16) ?? '0')
  return `glyph-${codePoints.join('-')}`
}

export function normalizeSurfacePalette(
  units: SurfaceGlyphUnits,
): readonly SurfacePaletteEntry<string, SurfaceShorthandMeta>[] {
  const counts = new Map<string, number>()
  const order: string[] = []

  for (let i = 0; i < units.length; i++) {
    const glyph = units[i]!
    if (!counts.has(glyph)) {
      counts.set(glyph, 0)
      order.push(glyph)
    }
    counts.set(glyph, (counts.get(glyph) ?? 0) + 1)
  }

  return order.map((glyph) => ({
    id: glyphTokenId(glyph),
    glyph,
    weight: counts.get(glyph),
    meta: {},
  }))
}

function prepareSurfaceFromPalette<TokenId extends string, Meta>(
  cacheKey: string,
  palette: readonly SurfacePaletteEntry<TokenId, Meta>[],
  repeat: number,
  font = WEFT_TEXT_FONT,
): PreparedSurfaceSource<TokenId, Meta> {
  if (palette.length === 0) {
    throw new Error(`Surface palette "${cacheKey}" cannot be empty`)
  }

  const cached = preparedSurfaceCache.get(cacheKey) as PreparedSurfaceSource<TokenId, Meta> | undefined
  if (cached) return cached

  const seenIds = new Set<string>()
  const seenGlyphs = new Set<string>()
  const glyphLookup = new Map<string, ResolvedSurfaceGlyph<TokenId, Meta>>()

  for (let i = 0; i < palette.length; i++) {
    const entry = palette[i]!
    if (seenIds.has(entry.id)) {
      throw new Error(`Duplicate surface token id "${entry.id}" in ${cacheKey}`)
    }
    if (seenGlyphs.has(entry.glyph)) {
      throw new Error(`Duplicate surface glyph "${entry.glyph}" in ${cacheKey}`)
    }

    seenIds.add(entry.id)
    seenGlyphs.add(entry.glyph)
    glyphLookup.set(entry.glyph, {
      id: entry.id,
      glyph: entry.glyph,
      ordinal: i,
      meta: entry.meta,
    })
  }

  const preparedSurface: PreparedSurfaceSource<TokenId, Meta> = {
    cacheKey,
    prepared: prepareCachedSurfaceText(
      cacheKey,
      buildWeightedPaletteStream(palette, repeat),
      font,
    ),
    palette,
    glyphLookup,
  }

  preparedSurfaceCache.set(cacheKey, preparedSurface as PreparedSurfaceSource<string, unknown>)
  return preparedSurface
}

export function prepareSurfaceText(
  cacheKey: string,
  units: SurfaceGlyphUnits,
  repeat: number,
  font?: string,
): PreparedSurfaceSource<string, SurfaceShorthandMeta>
export function prepareSurfaceText<TokenId extends string, Meta>(
  cacheKey: string,
  palette: readonly SurfacePaletteEntry<TokenId, Meta>[],
  repeat: number,
  font?: string,
): PreparedSurfaceSource<TokenId, Meta>
export function prepareSurfaceText<TokenId extends string, Meta>(
  cacheKey: string,
  paletteOrUnits: SurfaceGlyphUnits | readonly SurfacePaletteEntry<TokenId, Meta>[],
  repeat: number,
  font = WEFT_TEXT_FONT,
): PreparedSurfaceSource<string, SurfaceShorthandMeta> | PreparedSurfaceSource<TokenId, Meta> {
  if (paletteOrUnits.length === 0 || typeof paletteOrUnits[0] === 'string') {
    return prepareSurfaceFromPalette(
      cacheKey,
      normalizeSurfacePalette(paletteOrUnits as SurfaceGlyphUnits),
      repeat,
      font,
    )
  }

  return prepareSurfaceFromPalette(
    cacheKey,
    paletteOrUnits as readonly SurfacePaletteEntry<TokenId, Meta>[],
    repeat,
    font,
  )
}

export function prepareSemanticSurfaceText<TokenId extends string, Meta>(
  cacheKey: string,
  palette: readonly SurfacePaletteEntry<TokenId, Meta>[],
  repeat: number,
  font = WEFT_TEXT_FONT,
): PreparedSurfaceSource<TokenId, Meta> {
  return prepareSurfaceFromPalette(cacheKey, palette, repeat, font)
}

export function seedCursor(prepared: PreparedTextWithSegments, advance: number): LayoutCursor {
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  for (let i = 0; i < advance; i++) {
    const line = layoutNextLine(prepared, cursor, 400)
    if (line === null) {
      cursor = { segmentIndex: 0, graphemeIndex: 0 }
      continue
    }
    cursor = line.end
  }
  return cursor
}

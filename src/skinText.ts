import {
  layoutNextLine,
  prepareWithSegments,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from '@chenglou/pretext'

export const SURFACE_TEXT_FONT =
  '22px "Segoe UI Symbol", "Cascadia Code", "Noto Sans Symbols 2", sans-serif'

const preparedCache = new Map<string, PreparedTextWithSegments>()

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
  font = SURFACE_TEXT_FONT,
): PreparedTextWithSegments {
  const cached = preparedCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const prepared = prepareWithSegments(sourceText, font)
  preparedCache.set(cacheKey, prepared)
  return prepared
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

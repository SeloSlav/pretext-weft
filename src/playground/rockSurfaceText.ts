import type { PreparedTextWithSegments } from '@chenglou/pretext'
import {
  buildRepeatedUnitStream,
  prepareCachedSurfaceText,
  SURFACE_TEXT_FONT,
} from '../skinText'

// Blocky, angular, and rounded Unicode shapes that read as stones when
// scattered flat on the ground. Heavier glyphs become larger rocks.
const ROCK_FIELD_UNITS = [
  '⬛',
  '⬜',
  '◼',
  '◻',
  '▪',
  '▫',
  '◾',
  '◽',
  '⬡',
  '⬢',
  '⬟',
  '⬠',
  '◆',
  '◇',
  '▲',
  '△',
  '▮',
  '▯',
  '◙',
  '◘',
] as const

export function getPreparedRockSurface(): PreparedTextWithSegments {
  return prepareCachedSurfaceText(
    'rock-surface',
    buildRepeatedUnitStream(ROCK_FIELD_UNITS, 18),
    SURFACE_TEXT_FONT,
  )
}

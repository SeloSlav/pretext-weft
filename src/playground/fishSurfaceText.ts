import type { PreparedTextWithSegments } from '@chenglou/pretext'
import {
  buildRepeatedUnitStream,
  prepareCachedSurfaceText,
  SURFACE_TEXT_FONT,
} from '../skinText'

const FISH_SCALE_UNITS = [
  '◓',
  '◒',
  '◐',
  '◑',
  '◓',
  '◒',
  '◉',
  '◍',
  '◎',
  '◈',
  '◇',
  '◆',
  '⬡',
  '◌',
  '◓',
] as const

export function getPreparedFishSurface(): PreparedTextWithSegments {
  return prepareCachedSurfaceText(
    'fish-surface',
    buildRepeatedUnitStream(FISH_SCALE_UNITS, 22),
    SURFACE_TEXT_FONT,
  )
}

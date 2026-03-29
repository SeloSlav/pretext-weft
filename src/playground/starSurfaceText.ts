import type { PreparedTextWithSegments } from '@chenglou/pretext'
import {
  buildRepeatedUnitStream,
  prepareCachedSurfaceText,
  SURFACE_TEXT_FONT,
} from '../skinText'

const STAR_UNITS = [
  '·',
  '•',
  '⋆',
  '✦',
  '✧',
  '∗',
  '⭑',
  '·',
  '•',
  '·',
] as const

export function getPreparedStarSurface(): PreparedTextWithSegments {
  return prepareCachedSurfaceText(
    'star-sky-surface',
    buildRepeatedUnitStream(STAR_UNITS, 36),
    SURFACE_TEXT_FONT,
  )
}

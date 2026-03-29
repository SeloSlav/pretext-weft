import type { PreparedTextWithSegments } from '@chenglou/pretext'
import {
  buildRepeatedUnitStream,
  prepareCachedSurfaceText,
  SURFACE_TEXT_FONT,
} from '../skinText'

// Each glyph maps to a distinct petal silhouette and, via code-point hash,
// a distinct hue family. The character identity IS the flower color identity.
const FLOWER_UNITS = [
  '✿', // filled 4-petal — warm pink
  '❀', // outlined 4-petal — pale cream
  '✾', // 6-petal asterisk — violet
  '❁', // 8-petal — deep magenta
  '✽', // 8-point star — orange-red
  '✼', // 4-petal bold — golden yellow
  '✻', // 6-point asterisk — lavender
  '✺', // 6-point open — sky blue
  '❃', // outlined 6-petal — rose
  '❋', // 5-petal — coral
  '⚘', // flower on stem — white
  '✤', // 4-diamond — amber
  '✦', // 4-point star — soft yellow
  '✧', // outlined 4-point — pale violet
] as const

export function getPreparedFlowerSurface(): PreparedTextWithSegments {
  return prepareCachedSurfaceText(
    'flower-surface',
    buildRepeatedUnitStream(FLOWER_UNITS, 14),
    SURFACE_TEXT_FONT,
  )
}

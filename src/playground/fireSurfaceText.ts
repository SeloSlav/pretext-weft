import type { PreparedTextWithSegments } from '@chenglou/pretext'
import {
  buildRepeatedUnitStream,
  prepareCachedSurfaceText,
  SURFACE_TEXT_FONT,
} from '../skinText'

// Ember and spark shapes. Each glyph maps to a distinct particle silhouette
// and, via code-point hash, a distinct position in the fire color gradient.
const FIRE_UNITS = [
  '·',  // tiny ember
  '∘',  // open small
  '○',  // open circle
  '◦',  // bullet open
  '✦',  // 4-point star
  '✧',  // outlined star
  '⁺',  // superscript plus
  '×',  // multiply — cross spark
  '∗',  // asterisk operator
  '⋆',  // star operator
  '∙',  // bullet
  '◌',  // dotted circle
  '◍',  // circle with vertical fill
  '◎',  // bullseye
  '⊙',  // circled dot
  '⊚',  // circled ring
] as const

export function getPreparedFireSurface(): PreparedTextWithSegments {
  return prepareCachedSurfaceText(
    'fire-surface',
    buildRepeatedUnitStream(FIRE_UNITS, 20),
    SURFACE_TEXT_FONT,
  )
}

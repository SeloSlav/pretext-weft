import {
  prepareSurfaceText,
  type PreparedSurfaceSource,
  WEFT_TEXT_FONT,
} from '../../core'

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

export function getPreparedStarSurface(): PreparedSurfaceSource {
  return prepareSurfaceText(
    'star-sky-surface',
    STAR_UNITS,
    36,
    WEFT_TEXT_FONT,
  )
}

import type { PreparedTextWithSegments } from '@chenglou/pretext'
import {
  buildRepeatedUnitStream,
  prepareCachedSurfaceText,
  SURFACE_TEXT_FONT,
} from '../skinText'

const GRASS_FIELD_UNITS = [
  '⟋',
  '⟍',
  '∣',
  '❘',
  '❙',
  '❚',
  '⟊',
  '⟉',
  '╽',
  '╿',
  '⋮',
  '⫽',
] as const

export function getPreparedGrassSurface(): PreparedTextWithSegments {
  return prepareCachedSurfaceText(
    'grass-surface',
    buildRepeatedUnitStream(GRASS_FIELD_UNITS, 24),
    SURFACE_TEXT_FONT,
  )
}

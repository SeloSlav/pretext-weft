import * as THREE from 'three'
import {
  prepareSemanticSurfaceText,
  type PreparedSurfaceSource,
  type SurfacePaletteEntry,
  WEFT_TEXT_FONT,
} from '../../core'

export type GrassTokenId =
  | 'lean-left'
  | 'lean-right'
  | 'thin-stem'
  | 'mid-stem'
  | 'bold-stem'
  | 'wire-stem'
  | 'split-left'
  | 'split-right'
  | 'fork-left'
  | 'fork-right'
  | 'soft-cluster'

export type GrassTokenMeta = {
  heightBias: number
  widthBias: number
  hueShift: number
  lightShift: number
  satShift: number
}

const GRASS_FIELD_PALETTE: readonly SurfacePaletteEntry<GrassTokenId, GrassTokenMeta>[] = [
  { id: 'lean-left', glyph: '⟋', weight: 2, meta: { heightBias: 0.04, widthBias: 0.01, hueShift: -0.012, lightShift: 0.02, satShift: 0.03 } },
  { id: 'lean-right', glyph: '⟍', weight: 2, meta: { heightBias: 0.04, widthBias: 0.01, hueShift: 0.01, lightShift: 0.01, satShift: 0.02 } },
  { id: 'thin-stem', glyph: '❘', meta: { heightBias: -0.02, widthBias: -0.01, hueShift: -0.004, lightShift: -0.01, satShift: 0 } },
  { id: 'mid-stem', glyph: '❙', weight: 2, meta: { heightBias: 0.02, widthBias: 0.02, hueShift: 0.006, lightShift: 0.01, satShift: 0.02 } },
  { id: 'bold-stem', glyph: '❚', meta: { heightBias: 0.08, widthBias: 0.04, hueShift: 0.012, lightShift: -0.02, satShift: 0.03 } },
  { id: 'wire-stem', glyph: '∣', weight: 3, meta: { heightBias: -0.03, widthBias: -0.015, hueShift: -0.008, lightShift: -0.015, satShift: -0.02 } },
  { id: 'split-left', glyph: '⟊', meta: { heightBias: 0.03, widthBias: 0, hueShift: -0.006, lightShift: 0.015, satShift: 0.01 } },
  { id: 'split-right', glyph: '⟉', meta: { heightBias: 0.03, widthBias: 0, hueShift: 0.008, lightShift: 0.01, satShift: 0.01 } },
  { id: 'fork-left', glyph: '╽', meta: { heightBias: 0.06, widthBias: 0.015, hueShift: -0.003, lightShift: 0.025, satShift: 0.015 } },
  { id: 'fork-right', glyph: '╿', meta: { heightBias: 0.06, widthBias: 0.015, hueShift: 0.004, lightShift: 0.02, satShift: 0.02 } },
  { id: 'soft-cluster', glyph: '⋮', weight: 2, meta: { heightBias: -0.01, widthBias: -0.005, hueShift: 0, lightShift: 0.03, satShift: -0.01 } },
] as const

const GRASS_STATE_NAMES = ['healthy', 'dry', 'corrupted', 'dead'] as const

const GRASS_STATE_WEIGHTS: Readonly<Record<(typeof GRASS_STATE_NAMES)[number], Readonly<Record<GrassTokenId, number>>>> = {
  healthy: {
    'lean-left': 4,
    'lean-right': 4,
    'thin-stem': 1,
    'mid-stem': 3,
    'bold-stem': 1,
    'wire-stem': 1,
    'split-left': 3,
    'split-right': 3,
    'fork-left': 2,
    'fork-right': 2,
    'soft-cluster': 4,
  },
  dry: {
    'lean-left': 1,
    'lean-right': 1,
    'thin-stem': 1,
    'mid-stem': 2,
    'bold-stem': 4,
    'wire-stem': 1,
    'split-left': 1,
    'split-right': 1,
    'fork-left': 3,
    'fork-right': 3,
    'soft-cluster': 3,
  },
  corrupted: {
    'lean-left': 1,
    'lean-right': 1,
    'thin-stem': 1,
    'mid-stem': 1,
    'bold-stem': 2,
    'wire-stem': 4,
    'split-left': 4,
    'split-right': 4,
    'fork-left': 3,
    'fork-right': 3,
    'soft-cluster': 2,
  },
  dead: {
    'lean-left': 1,
    'lean-right': 1,
    'thin-stem': 4,
    'mid-stem': 1,
    'bold-stem': 1,
    'wire-stem': 4,
    'split-left': 1,
    'split-right': 1,
    'fork-left': 1,
    'fork-right': 1,
    'soft-cluster': 1,
  },
}

function grassStateIndex(state: number): number {
  return THREE.MathUtils.clamp(Math.round(state), 0, GRASS_STATE_NAMES.length - 1)
}

export function getPreparedGrassSurface(): PreparedSurfaceSource<GrassTokenId, GrassTokenMeta> {
  return prepareSemanticSurfaceText(
    'grass-surface',
    GRASS_FIELD_PALETTE,
    28,
    WEFT_TEXT_FONT,
  )
}

export function buildGrassStateSurface(state: number): PreparedSurfaceSource<GrassTokenId, GrassTokenMeta> {
  const step = grassStateIndex(state)
  const stateName = GRASS_STATE_NAMES[step]
  const weights = GRASS_STATE_WEIGHTS[stateName]
  const palette = GRASS_FIELD_PALETTE.map((entry) => ({
    ...entry,
    weight: Math.max(1, weights[entry.id] ?? entry.weight ?? 1),
  }))

  return prepareSemanticSurfaceText(
    `grass-surface-${stateName}`,
    palette,
    28,
    WEFT_TEXT_FONT,
  )
}

import type {
  PreparedSurfaceSource,
  SeedCursorFactory,
  SurfaceGlyphUnits,
  SurfacePaletteEntry,
} from '../core'
import {
  prepareSemanticSurfaceText,
  prepareSurfaceText,
} from '../core'
import {
  createSemanticStateSet,
  type SurfaceBehavior,
  type SurfacePreset,
} from '../runtime'
import { fieldLayout, skyLayout, wallLayout } from './helpers/layouts'
import { threeInstancedMeshRenderer } from './helpers/instancing'

type SurfaceSourceOptions<TokenId extends string = string, Meta = unknown> =
  | {
      cacheKey: string
      units: SurfaceGlyphUnits
      repeat: number
      font?: string
    }
  | {
      cacheKey: string
      palette: readonly SurfacePaletteEntry<TokenId, Meta>[]
      repeat: number
      font?: string
      semantic?: true
    }

export function createSurfaceSource(
  options: {
    cacheKey: string
    units: SurfaceGlyphUnits
    repeat: number
    font?: string
  },
): PreparedSurfaceSource<string, Record<string, never>>
export function createSurfaceSource<TokenId extends string, Meta>(
  options: {
    cacheKey: string
    palette: readonly SurfacePaletteEntry<TokenId, Meta>[]
    repeat: number
    font?: string
    semantic?: true
  },
): PreparedSurfaceSource<TokenId, Meta>
export function createSurfaceSource<TokenId extends string, Meta>(
  options: SurfaceSourceOptions<TokenId, Meta>,
): PreparedSurfaceSource<string, Record<string, never>> | PreparedSurfaceSource<TokenId, Meta> {
  if ('units' in options) {
    return prepareSurfaceText(options.cacheKey, options.units, options.repeat, options.font)
  }

  return options.semantic
    ? prepareSemanticSurfaceText(options.cacheKey, options.palette, options.repeat, options.font)
    : prepareSurfaceText(options.cacheKey, options.palette, options.repeat, options.font)
}

export type RecoverableDamageConfig = {
  recoveryRate: number
  radius: number
  strength?: number
}

export function recoverableDamage(
  config: RecoverableDamageConfig,
): SurfaceBehavior<RecoverableDamageConfig> {
  return {
    kind: 'recoverable-damage',
    config,
  }
}

export function semanticStates<const TState extends string>(states: readonly TState[]) {
  return createSemanticStateSet(states)
}

export type SurfaceEffectConfig = {
  id: string
  source: PreparedSurfaceSource<any, any>
  layout: ReturnType<typeof fieldLayout> | ReturnType<typeof wallLayout> | ReturnType<typeof skyLayout>
  renderer?: ReturnType<typeof threeInstancedMeshRenderer>
  behaviors?: readonly SurfaceBehavior[]
  preset?: SurfacePreset
  seedCursor?: SeedCursorFactory
}

export function createSurfaceEffect<TConfig extends SurfaceEffectConfig>(config: TConfig): TConfig {
  return config
}

export {
  fieldLayout,
  skyLayout,
  threeInstancedMeshRenderer,
  wallLayout,
}

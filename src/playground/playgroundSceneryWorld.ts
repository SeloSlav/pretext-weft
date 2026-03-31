import { createWorldField } from '../weft/core'
import type { MovementBounds } from './thirdPersonController'

/**
 * Open-field bounds for the Scenery demo: same movement model as the town playground,
 * but a much larger walkable grass surface driven by deterministic world fields.
 */
export const SCENERY_BOUNDS: MovementBounds = {
  minX: -88,
  maxX: 88,
  minZ: -88,
  maxZ: 88,
}

export const SCENERY_SPAWN = {
  x: -2,
  z: 18,
  yaw: 0,
  pitch: -0.22,
} as const

export type SceneryWorldFieldParams = {
  seed: number
  scale: number
  strength: number
  warp: number
  roughness: number
  affectGrass: boolean
  affectFloor: boolean
  affectRocks: boolean
  affectLogs: boolean
  affectSticks: boolean
  affectNeedles: boolean
  affectTrees: boolean
  affectShrubs: boolean
}

export const DEFAULT_SCENERY_WORLD_FIELD_PARAMS: SceneryWorldFieldParams = {
  seed: 17,
  scale: 24,
  strength: 0.58,
  warp: 0.42,
  roughness: 0.56,
  affectGrass: true,
  affectFloor: true,
  affectRocks: true,
  affectLogs: true,
  affectSticks: true,
  affectNeedles: true,
  affectTrees: true,
  affectShrubs: true,
}

/** Slower smoldering burn for leaf litter and needle field in the scenery demo. */
export const SCENERY_LEAF_PILE_BURN_PARAMS = {
  recoveryRate: 0.028,
  burnSpreadSpeed: 0.52,
} as const

export const SCENERY_NEEDLE_LITTER_BURN_PARAMS = {
  recoveryRate: 0.026,
  burnSpreadSpeed: 0.48,
} as const

export type SceneryWorldAuthoring = {
  getGrassCoverageMultiplierAtXZ: (x: number, z: number) => number
  isInsideUnderstoryZone: (x: number, z: number) => boolean
  getUnderstoryDistanceAtXZ: (x: number, z: number) => number
  isInsideLeafLitterZone: (x: number, z: number) => boolean
  getLeafLitterDistanceAtXZ: (x: number, z: number) => number
  isInsideRockZone: (x: number, z: number) => boolean
  isInsideLogZone: (x: number, z: number) => boolean
  isInsideStickZone: (x: number, z: number) => boolean
  isInsideNeedleZone: (x: number, z: number) => boolean
  isInsideTreeZone: (x: number, z: number) => boolean
  isInsideShrubZone: (x: number, z: number) => boolean
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function remapSigned01(value: number): number {
  return value * 2 - 1
}

function createLayerField(seed: number, params: SceneryWorldFieldParams, seedOffset: number, scaleMultiplier: number) {
  return createWorldField(seed + seedOffset, {
    scale: Math.max(2, params.scale * scaleMultiplier),
    octaves: 4,
    roughness: params.roughness,
    warpAmplitude: params.scale * params.warp * 0.42,
    warpScale: Math.max(2, params.scale * 0.72),
    contrast: 1.08,
  })
}

function fieldDistance(value: number, worldSpan: number): number {
  return remapSigned01(value) * worldSpan
}

export function createSceneryWorldAuthoring(
  params: SceneryWorldFieldParams = DEFAULT_SCENERY_WORLD_FIELD_PARAMS,
): SceneryWorldAuthoring {
  const grassField = createLayerField(params.seed, params, 0, 1)
  const understoryField = createLayerField(params.seed, params, 137, 0.84)
  const litterField = createLayerField(params.seed, params, 271, 0.62)
  const rockField = createLayerField(params.seed, params, 389, 0.56)
  const logField = createLayerField(params.seed, params, 521, 0.94)
  const stickField = createLayerField(params.seed, params, 613, 0.74)
  const needleField = createLayerField(params.seed, params, 727, 0.68)
  const treeField = createLayerField(params.seed, params, 811, 1.18)
  const shrubField = createLayerField(params.seed, params, 907, 0.9)
  const strength = clamp01(params.strength)
  const grassStrength = params.affectGrass ? strength : 0
  const floorStrength = params.affectFloor ? strength : 0
  const rockStrength = params.affectRocks ? strength : 0
  const logStrength = params.affectLogs ? strength : 0
  const stickStrength = params.affectSticks ? strength : 0
  const needleStrength = params.affectNeedles ? strength : 0
  const treeStrength = params.affectTrees ? strength : 0
  const shrubStrength = params.affectShrubs ? strength : 0

  return {
    getGrassCoverageMultiplierAtXZ(x, z) {
      if (grassStrength <= 1e-6) return 1
      const largePatch = grassField(x, z)
      const thinned = 0.08 + Math.pow(largePatch, 1.35) * 1.15
      return Math.max(0.06, lerp(1, thinned, grassStrength))
    },

    isInsideUnderstoryZone(x, z) {
      if (floorStrength <= 1e-6) return true
      const signal = understoryField(x, z)
      const density = litterField(x * 0.8, z * 0.8)
      return signal > 0.26 || density > 0.62
    },

    getUnderstoryDistanceAtXZ(x, z) {
      if (floorStrength <= 1e-6) return 0
      const signal = understoryField(x, z)
      const offset = remapSigned01(litterField(x * 0.9, z * 0.9)) * (0.8 + floorStrength * 1.6)
      return Math.abs(fieldDistance(signal, 4.8 + floorStrength * 3.4) + offset)
    },

    isInsideLeafLitterZone(x, z) {
      if (floorStrength <= 1e-6) return true
      const signal = litterField(x, z)
      const understorySupport = understoryField(x * 0.85, z * 0.85)
      const treeSupport = treeField(x * 0.88, z * 0.88)
      const threshold = lerp(0.58, 0.44, floorStrength)
      return signal + treeSupport * 0.34 + understorySupport * 0.08 >= threshold
    },

    getLeafLitterDistanceAtXZ(x, z) {
      if (floorStrength <= 1e-6) return 0
      const signal = litterField(x, z)
      const wobble = remapSigned01(understoryField(x * 0.95, z * 0.95)) * (0.25 + floorStrength * 0.8)
      const treeBias = remapSigned01(treeField(x * 0.92, z * 0.92)) * (0.9 + floorStrength * 1.5)
      return Math.abs(fieldDistance(signal, 2.1 + floorStrength * 1.4) + wobble - treeBias)
    },

    isInsideRockZone(x, z) {
      if (rockStrength <= 1e-6) return true
      const signal = rockField(x, z)
      const grassSuppression = grassField(x * 0.9, z * 0.9)
      const threshold = lerp(0.7, 0.52, rockStrength)
      return signal - grassSuppression * 0.22 >= threshold
    },

    isInsideLogZone(x, z) {
      if (logStrength <= 1e-6) return true
      const signal = logField(x, z)
      const litterSupport = litterField(x * 0.72, z * 0.72)
      const rockSupport = rockField(x * 0.88, z * 0.88)
      const threshold = lerp(0.78, 0.6, logStrength)
      return signal + litterSupport * 0.18 + rockSupport * 0.12 >= threshold
    },

    isInsideStickZone(x, z) {
      if (stickStrength <= 1e-6) return true
      const signal = stickField(x, z)
      const logSupport = logField(x * 0.9, z * 0.9)
      const litterSupport = litterField(x * 0.8, z * 0.8)
      const threshold = lerp(0.74, 0.52, stickStrength)
      return signal + logSupport * 0.24 + litterSupport * 0.18 >= threshold
    },

    isInsideNeedleZone(x, z) {
      if (needleStrength <= 1e-6) return true
      const signal = needleField(x, z)
      const floorSupport = understoryField(x * 0.82, z * 0.82)
      const litterSupport = litterField(x * 0.74, z * 0.74)
      const treeSupport = treeField(x * 0.86, z * 0.86)
      const threshold = lerp(0.8, 0.58, needleStrength)
      return signal + floorSupport * 0.16 + litterSupport * 0.08 + treeSupport * 0.32 >= threshold
    },

    isInsideTreeZone(x, z) {
      if (treeStrength <= 1e-6) return true
      const signal = treeField(x, z)
      const needleSupport = needleField(x * 0.72, z * 0.72)
      const logSupport = logField(x * 0.82, z * 0.82)
      const litterSupport = litterField(x * 0.78, z * 0.78)
      const rockResistance = rockField(x * 0.94, z * 0.94)
      const threshold = lerp(0.76, 0.5, treeStrength)
      return signal + needleSupport * 0.24 + logSupport * 0.12 + litterSupport * 0.08 - rockResistance * 0.06 >= threshold
    },

    isInsideShrubZone(x, z) {
      if (shrubStrength <= 1e-6) return true
      const signal = shrubField(x, z)
      const floorSupport = understoryField(x * 0.84, z * 0.84)
      const litterSupport = litterField(x * 0.78, z * 0.78)
      const treeSupport = treeField(x * 0.9, z * 0.9)
      const needleSupport = needleField(x * 0.76, z * 0.76)
      const threshold = lerp(0.6, 0.34, shrubStrength)
      return (
        signal +
        floorSupport * 0.28 +
        litterSupport * 0.22 +
        treeSupport * 0.12 +
        needleSupport * 0.12 >=
        threshold
      )
    },
  }
}

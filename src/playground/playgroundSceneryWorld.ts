import { createWorldField } from '../weft/core'
import {
  DEFAULT_TERRAIN_RELIEF_PARAMS,
  type TerrainHeightSampler,
  type TerrainReliefParams,
} from '../weft/three'
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

export type SceneryTerrainReliefParams = TerrainReliefParams

export const DEFAULT_SCENERY_TERRAIN_RELIEF_PARAMS: SceneryTerrainReliefParams = {
  ...DEFAULT_TERRAIN_RELIEF_PARAMS,
  seed: 29,
  scale: 30,
  relief: 1.35,
  warp: 0.46,
  roughness: 0.58,
  ridge: 0.34,
}

/** Slower smoldering burn for leaf litter and needle field in the scenery demo. */
export const SCENERY_LEAF_PILE_BURN_PARAMS = {
  recoveryRate: 0.017,
  burnSpreadSpeed: 0.3,
} as const

export const SCENERY_NEEDLE_LITTER_BURN_PARAMS = {
  recoveryRate: 0.016,
  burnSpreadSpeed: 0.28,
} as const

export type SceneryWorldAuthoring = {
  getGrassCoverageMultiplierAtXZ: (x: number, z: number) => number
  isInsideUnderstoryZone: (x: number, z: number) => boolean
  getUnderstoryDistanceAtXZ: (x: number, z: number) => number
  isInsideLeafLitterZone: (x: number, z: number) => boolean
  getLeafLitterDistanceAtXZ: (x: number, z: number) => number
  isInsideFungusSeamZone: (x: number, z: number) => boolean
  getFungusSeamDistanceAtXZ: (x: number, z: number) => number
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

function inverseLerp(a: number, b: number, value: number): number {
  if (Math.abs(b - a) <= 1e-6) return 0
  return (value - a) / (b - a)
}

function remapSigned01(value: number): number {
  return value * 2 - 1
}

function triangle01(value: number, center: number, width: number): number {
  if (width <= 1e-6) return 0
  return clamp01(1 - Math.abs(value - center) / width)
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

export type TerrainAuthoringRead = {
  altitude01: number
  basin01: number
  ridge01: number
  slope01: number
  flat01: number
  midslope01: number
  upland01: number
}

export function sampleSceneryTerrainAuthoringRead(
  x: number,
  z: number,
  terrainHeight?: TerrainHeightSampler,
  terrainParams: TerrainReliefParams = DEFAULT_SCENERY_TERRAIN_RELIEF_PARAMS,
): TerrainAuthoringRead {
  if (!terrainHeight || terrainParams.relief <= 1e-6) {
    return {
      altitude01: 0.5,
      basin01: 0,
      ridge01: 0,
      slope01: 0,
      flat01: 1,
      midslope01: 0,
      upland01: 0.5,
    }
  }

  const sampleStep = Math.max(0.45, terrainParams.scale * 0.028)
  const center = terrainHeight.sampleHeightAtXZ(x, z)
  const dx = terrainHeight.sampleHeightAtXZ(x + sampleStep, z) - terrainHeight.sampleHeightAtXZ(x - sampleStep, z)
  const dz = terrainHeight.sampleHeightAtXZ(x, z + sampleStep) - terrainHeight.sampleHeightAtXZ(x, z - sampleStep)
  const gradient = Math.hypot(dx, dz) / (2 * sampleStep)
  const heightRange = Math.max(0.4, terrainParams.relief * (1.85 + terrainParams.ridge * 0.35))
  const altitude01 = clamp01(inverseLerp(-heightRange, heightRange, center))
  const slopeRange = Math.max(0.03, 0.018 + (terrainParams.relief / Math.max(terrainParams.scale, 1)) * 2.4)
  const slope01 = clamp01(gradient / slopeRange)
  const flat01 = 1 - slope01
  const basin01 = clamp01((0.54 - altitude01) * 1.85 + flat01 * 0.12)
  const ridge01 = clamp01((altitude01 - 0.46) * 1.7 + slope01 * 0.18)
  const midslope01 = triangle01(slope01, 0.34, 0.28)
  const upland01 = triangle01(altitude01, 0.6, 0.34)

  return {
    altitude01,
    basin01,
    ridge01,
    slope01,
    flat01,
    midslope01,
    upland01,
  }
}

export function createSceneryWorldAuthoring(
  params: SceneryWorldFieldParams = DEFAULT_SCENERY_WORLD_FIELD_PARAMS,
  terrainHeight?: TerrainHeightSampler,
  terrainParams: TerrainReliefParams = DEFAULT_SCENERY_TERRAIN_RELIEF_PARAMS,
): SceneryWorldAuthoring {
  const grassField = createLayerField(params.seed, params, 0, 1)
  const understoryField = createLayerField(params.seed, params, 137, 0.84)
  const litterField = createLayerField(params.seed, params, 271, 0.62)
  const fungusField = createLayerField(params.seed, params, 331, 0.58)
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
  const terrainAt = (x: number, z: number) => sampleSceneryTerrainAuthoringRead(x, z, terrainHeight, terrainParams)
  /**
   * Same model as leaf-litter bands: `fieldDistance` on a slow 0–1 blend so
   * `smoothBandCoverage(|d|, halfWidth, edge)` yields **wide** ribbons (town-like),
   * not sparse points where an arbitrary sum happened to be near zero.
   */
  const fungusSeamDistanceAt = (x: number, z: number) => {
    if (floorStrength <= 1e-6) return 999
    const terrain = terrainAt(x, z)
    const a = fungusField(x * 0.24, z * 0.24)
    const b = litterField(x * 0.28, z * 0.28)
    const c = understoryField(x * 0.26, z * 0.26)
    const d = logField(x * 0.2, z * 0.2)
    const e = treeField(x * 0.18, z * 0.18)
    const seamBlend = clamp01(
      a * 0.38 +
        b * 0.26 +
        c * 0.16 +
        d * 0.12 +
        e * 0.08 +
        terrain.midslope01 * 0.07 +
        terrain.flat01 * 0.05 -
        terrain.basin01 * 0.06 -
        terrain.slope01 * 0.05 +
        Math.sin(x * 0.0088 + z * 0.0076) * 0.045 +
        Math.cos(x * 0.0054 - z * 0.0092) * 0.035,
    )
    const span = 11 + floorStrength * 8
    let dist = fieldDistance(seamBlend, span)
    const meander =
      Math.sin(x * 0.0135 + z * 0.0118) * (3.2 + floorStrength * 2.4) +
      Math.cos(x * 0.0078 - z * 0.0145) * (2.6 + floorStrength * 2) +
      Math.sin((x + z) * 0.0105) * (1.9 + floorStrength * 1.5) +
      Math.cos(x * 0.0042 + z * 0.0048) * (1.4 + floorStrength * 1.1)
    dist += meander * 0.32
    return dist
  }
  /**
   * Must follow the **same** low-frequency seam as `fungusSeamDistanceAt`. The old mask used
   * high-frequency `fungusField(x,z)` while the band distance used `fungusField(x*0.24, …)` —
   * that mismatch made the seam look like scattered dots instead of continuous ribbons.
   */
  const isInsideFungusSeamAt = (x: number, z: number) => {
    if (floorStrength <= 1e-6) return false
    const absD = Math.abs(fungusSeamDistanceAt(x, z))
    const span = 11 + floorStrength * 8
    /** Superset of where `smoothBandCoverage` can be visible for typical band widths + edge + glyph jitter. */
    const corridor = span * 0.42 + 7 + floorStrength * 5
    if (absD > corridor) return false
    const terrain = terrainAt(x, z)
    if (terrain.slope01 > 0.92) return false
    return true
  }

  return {
    getGrassCoverageMultiplierAtXZ(x, z) {
      if (grassStrength <= 1e-6) return 1
      const largePatch = grassField(x, z)
      const terrain = terrainAt(x, z)
      const terrainBias =
        1 +
        terrain.basin01 * 0.24 +
        terrain.flat01 * 0.12 -
        terrain.ridge01 * 0.18 -
        terrain.slope01 * 0.34
      const thinned = (0.08 + Math.pow(largePatch, 1.35) * 1.15) * terrainBias
      return Math.max(0.05, lerp(1, thinned, grassStrength))
    },

    isInsideUnderstoryZone(x, z) {
      if (floorStrength <= 1e-6) return true
      const signal = understoryField(x, z)
      const density = litterField(x * 0.8, z * 0.8)
      const terrain = terrainAt(x, z)
      return signal + density * 0.32 + terrain.basin01 * 0.26 + terrain.flat01 * 0.08 - terrain.slope01 * 0.34 >= 0.42
    },

    getUnderstoryDistanceAtXZ(x, z) {
      if (floorStrength <= 1e-6) return 0
      const signal = understoryField(x, z)
      const terrain = terrainAt(x, z)
      const offset = remapSigned01(litterField(x * 0.9, z * 0.9)) * (0.8 + floorStrength * 1.6)
      const terrainShift = (terrain.ridge01 - terrain.basin01) * (0.8 + floorStrength * 1.1)
      return Math.abs(fieldDistance(signal, 4.8 + floorStrength * 3.4) + offset + terrainShift)
    },

    isInsideLeafLitterZone(x, z) {
      if (floorStrength <= 1e-6) return true
      const signal = litterField(x, z)
      const understorySupport = understoryField(x * 0.85, z * 0.85)
      const treeSupport = treeField(x * 0.88, z * 0.88)
      const terrain = terrainAt(x, z)
      const threshold = lerp(0.58, 0.44, floorStrength)
      return (
        signal +
        treeSupport * 0.34 +
        understorySupport * 0.08 +
        terrain.basin01 * 0.16 +
        terrain.flat01 * 0.08 -
        terrain.slope01 * 0.18 >=
        threshold
      )
    },

    getLeafLitterDistanceAtXZ(x, z) {
      if (floorStrength <= 1e-6) return 0
      const signal = litterField(x, z)
      const terrain = terrainAt(x, z)
      const wobble = remapSigned01(understoryField(x * 0.95, z * 0.95)) * (0.25 + floorStrength * 0.8)
      const treeBias = remapSigned01(treeField(x * 0.92, z * 0.92)) * (0.9 + floorStrength * 1.5)
      const terrainBias = (terrain.ridge01 - terrain.basin01) * (0.5 + floorStrength * 0.7)
      return Math.abs(fieldDistance(signal, 2.1 + floorStrength * 1.4) + wobble - treeBias + terrainBias)
    },

    isInsideFungusSeamZone(x, z) {
      return isInsideFungusSeamAt(x, z)
    },

    getFungusSeamDistanceAtXZ(x, z) {
      return fungusSeamDistanceAt(x, z)
    },

    isInsideRockZone(x, z) {
      if (rockStrength <= 1e-6) return true
      const signal = rockField(x, z)
      const grassSuppression = grassField(x * 0.9, z * 0.9)
      const terrain = terrainAt(x, z)
      const threshold = lerp(0.7, 0.52, rockStrength)
      return signal + terrain.ridge01 * 0.26 + terrain.slope01 * 0.34 - grassSuppression * 0.22 >= threshold
    },

    isInsideLogZone(x, z) {
      if (logStrength <= 1e-6) return true
      const signal = logField(x, z)
      const litterSupport = litterField(x * 0.72, z * 0.72)
      const rockSupport = rockField(x * 0.88, z * 0.88)
      const terrain = terrainAt(x, z)
      const threshold = lerp(0.78, 0.6, logStrength)
      return (
        signal +
        litterSupport * 0.18 +
        rockSupport * 0.12 +
        terrain.basin01 * 0.12 +
        terrain.flat01 * 0.22 -
        terrain.slope01 * 0.4 >=
        threshold
      )
    },

    isInsideStickZone(x, z) {
      if (stickStrength <= 1e-6) return true
      const signal = stickField(x, z)
      const logSupport = logField(x * 0.9, z * 0.9)
      const litterSupport = litterField(x * 0.8, z * 0.8)
      const terrain = terrainAt(x, z)
      const threshold = lerp(0.74, 0.52, stickStrength)
      return signal + logSupport * 0.24 + litterSupport * 0.18 + terrain.flat01 * 0.14 + terrain.midslope01 * 0.08 - terrain.slope01 * 0.14 >= threshold
    },

    isInsideNeedleZone(x, z) {
      if (needleStrength <= 1e-6) return true
      const signal = needleField(x, z)
      const floorSupport = understoryField(x * 0.82, z * 0.82)
      const litterSupport = litterField(x * 0.74, z * 0.74)
      const treeSupport = treeField(x * 0.86, z * 0.86)
      const terrain = terrainAt(x, z)
      const threshold = lerp(0.8, 0.58, needleStrength)
      return (
        signal +
        floorSupport * 0.16 +
        litterSupport * 0.08 +
        treeSupport * 0.32 +
        terrain.upland01 * 0.08 +
        terrain.basin01 * 0.04 -
        terrain.slope01 * 0.14 >=
        threshold
      )
    },

    isInsideTreeZone(x, z) {
      if (treeStrength <= 1e-6) return true
      const signal = treeField(x, z)
      const needleSupport = needleField(x * 0.72, z * 0.72)
      const logSupport = logField(x * 0.82, z * 0.82)
      const litterSupport = litterField(x * 0.78, z * 0.78)
      const rockResistance = rockField(x * 0.94, z * 0.94)
      const terrain = terrainAt(x, z)
      const threshold = lerp(0.76, 0.5, treeStrength)
      return (
        signal +
        needleSupport * 0.24 +
        logSupport * 0.12 +
        litterSupport * 0.08 +
        terrain.upland01 * 0.12 +
        terrain.midslope01 * 0.1 +
        terrain.flat01 * 0.05 -
        terrain.slope01 * 0.22 -
        terrain.basin01 * 0.08 -
        rockResistance * 0.06 >=
        threshold
      )
    },

    isInsideShrubZone(x, z) {
      if (shrubStrength <= 1e-6) return true
      const signal = shrubField(x, z)
      const floorSupport = understoryField(x * 0.84, z * 0.84)
      const litterSupport = litterField(x * 0.78, z * 0.78)
      const treeSupport = treeField(x * 0.9, z * 0.9)
      const needleSupport = needleField(x * 0.76, z * 0.76)
      const terrain = terrainAt(x, z)
      const threshold = lerp(0.6, 0.34, shrubStrength)
      return (
        signal +
        floorSupport * 0.28 +
        litterSupport * 0.22 +
        treeSupport * 0.12 +
        needleSupport * 0.12 +
        terrain.ridge01 * 0.16 +
        terrain.midslope01 * 0.1 -
        terrain.basin01 * 0.1 >=
        threshold
      )
    },
  }
}

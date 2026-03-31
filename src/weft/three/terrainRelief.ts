import { createWorldField, type WorldField2 } from '../core'

export type TerrainHeightSampler = {
  sampleHeightAtXZ: (x: number, z: number) => number
}

export type TerrainReliefParams = {
  seed: number
  scale: number
  relief: number
  warp: number
  roughness: number
  ridge: number
}

export const DEFAULT_TERRAIN_RELIEF_PARAMS: TerrainReliefParams = {
  seed: 29,
  scale: 30,
  relief: 0,
  warp: 0.46,
  roughness: 0.58,
  ridge: 0.34,
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function centered(value: number): number {
  return value * 2 - 1
}

export class TerrainReliefField implements TerrainHeightSampler {
  private params: TerrainReliefParams
  private basinField: WorldField2 = () => 0.5
  private detailField: WorldField2 = () => 0.5
  private ridgeField: WorldField2 = () => 0.5

  constructor(initialParams: TerrainReliefParams = DEFAULT_TERRAIN_RELIEF_PARAMS) {
    this.params = { ...initialParams }
    this.rebuildFields()
  }

  setParams(params: Partial<TerrainReliefParams>): void {
    this.params = { ...this.params, ...params }
    this.rebuildFields()
  }

  getParams(): TerrainReliefParams {
    return { ...this.params }
  }

  sampleHeightAtXZ(x: number, z: number): number {
    const relief = Math.max(0, this.params.relief)
    if (relief <= 1e-6) return 0

    const basin = centered(this.basinField(x, z))
    const detail = centered(this.detailField(x, z))
    const ridgeSignal = this.ridgeField(x, z)
    const ridgeLift = Math.max(0, (ridgeSignal - 0.38) / 0.62)
    const shoulderLift = ridgeLift * ridgeLift

    return basin * relief * 0.92 + detail * relief * 0.34 + shoulderLift * relief * (0.28 + this.params.ridge * 0.7)
  }

  private rebuildFields(): void {
    const seed = this.params.seed | 0
    const scale = Math.max(4, this.params.scale)
    const warp = clamp01(this.params.warp)
    const roughness = Math.max(0.2, Math.min(0.86, this.params.roughness))
    const ridge = clamp01(this.params.ridge)

    this.basinField = createWorldField(seed + 11, {
      scale: scale * 1.35,
      octaves: 3,
      roughness: Math.max(0.2, roughness * 0.82),
      warpAmplitude: scale * warp * 0.34,
      warpScale: scale * 0.96,
      contrast: 0.92,
    })

    this.detailField = createWorldField(seed + 97, {
      scale: scale * 0.56,
      octaves: 4,
      roughness,
      warpAmplitude: scale * warp * 0.22,
      warpScale: scale * 0.7,
      contrast: 1.16,
    })

    this.ridgeField = createWorldField(seed + 173, {
      scale: scale * 0.82,
      octaves: 4,
      roughness: Math.min(0.86, roughness + 0.08),
      warpAmplitude: scale * warp * 0.18,
      warpScale: scale * 0.64,
      ridge: 0.18 + ridge * 0.72,
      contrast: 1.1 + ridge * 0.22,
    })
  }
}

export function createTerrainReliefField(
  initialParams: TerrainReliefParams = DEFAULT_TERRAIN_RELIEF_PARAMS,
): TerrainReliefField {
  return new TerrainReliefField(initialParams)
}

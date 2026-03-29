export type FieldLayoutConfig = {
  kind: 'field'
  rows: number
  sectors: number
  advanceForRow: (row: number) => number
  staggerFactor?: number
  minSpanFactor?: number
}

export type WallLayoutConfig = {
  kind: 'wall'
  rows: number
  sectors: number
  advanceForRow: (row: number) => number
  staggerFactor?: number
  minSpanFactor?: number
}

export type SkyLayoutConfig = {
  kind: 'sky'
  rows: number
  sectors: number
  advanceForRow: (row: number) => number
  staggerFactor?: number
  minSpanFactor?: number
}

export function fieldLayout(config: Omit<FieldLayoutConfig, 'kind'>): FieldLayoutConfig {
  return { kind: 'field', ...config }
}

export function wallLayout(config: Omit<WallLayoutConfig, 'kind'>): WallLayoutConfig {
  return { kind: 'wall', ...config }
}

export function skyLayout(config: Omit<SkyLayoutConfig, 'kind'>): SkyLayoutConfig {
  return { kind: 'sky', ...config }
}

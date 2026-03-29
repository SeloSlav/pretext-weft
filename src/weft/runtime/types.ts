export type SurfaceStateField<T> = {
  get(): T
  set(next: T): void
}

export function createSurfaceStateField<T>(initial: T): SurfaceStateField<T> {
  let current = initial
  return {
    get: () => current,
    set: (next) => {
      current = next
    },
  }
}

export type SemanticStateSet<TState extends string> = {
  readonly states: readonly TState[]
  clampIndex(index: number): number
  at(index: number): TState
}

export function createSemanticStateSet<const TState extends string>(
  states: readonly TState[],
): SemanticStateSet<TState> {
  if (states.length === 0) {
    throw new Error('Semantic state sets require at least one state')
  }

  return {
    states,
    clampIndex(index) {
      return Math.max(0, Math.min(states.length - 1, Math.round(index)))
    },
    at(index) {
      return states[Math.max(0, Math.min(states.length - 1, Math.round(index)))]!
    },
  }
}

export type SurfaceRendererAdapter<TConfig = unknown> = {
  kind: string
  config: TConfig
}

export type SurfaceBehavior<TConfig = unknown> = {
  kind: string
  config: TConfig
}

export type SurfacePreset<TConfig = unknown> = {
  kind: string
  config: TConfig
}

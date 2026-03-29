export type RecoveringImpact = {
  strength: number
}

export function decayRecoveringStrength(strength: number, recoveryRate: number, delta: number): number {
  if (delta <= 0 || strength <= 0) return strength

  const normalized = Math.min(Math.max(strength, 0), 1)
  const acceleration = 0.22 + (1 - normalized) * (1 - normalized) * 2.35
  return Math.max(0, strength - recoveryRate * acceleration * delta)
}

export function updateRecoveringImpacts<T extends RecoveringImpact>(
  impacts: T[],
  recoveryRate: number,
  delta: number,
  removeThreshold = 0.015,
): void {
  if (delta <= 0 || impacts.length === 0) return

  const safeRate = Math.max(0.001, recoveryRate)
  for (let i = impacts.length - 1; i >= 0; i--) {
    const impact = impacts[i]!
    impact.strength = decayRecoveringStrength(impact.strength, safeRate, delta)
    if (impact.strength <= removeThreshold) {
      impacts.splice(i, 1)
    }
  }
}

export function smoothPulse(n: number): number {
  if (n >= 1) return 0
  const t = 1 - n * n
  return t * t
}

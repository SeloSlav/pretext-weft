export type WorldField2 = (x: number, z: number) => number

export type ValueNoiseFieldOptions = {
  seed?: number
  scale?: number
}

export type FbmFieldOptions = ValueNoiseFieldOptions & {
  octaves?: number
  gain?: number
  lacunarity?: number
}

export type DomainWarpFieldOptions = {
  seed?: number
  amplitude?: number
  scale?: number
}

export type ThresholdFieldOptions = {
  threshold?: number
  softness?: number
}

export type RemapFieldOptions = {
  inMin?: number
  inMax?: number
  outMin?: number
  outMax?: number
  clamp?: boolean
}

export type CreateWorldFieldOptions = {
  scale?: number
  octaves?: number
  roughness?: number
  lacunarity?: number
  warpAmplitude?: number
  warpScale?: number
  ridge?: number
  bias?: number
  contrast?: number
}

const GOLDEN_HASH = 0x9e3779b9
const HASH_B = 0x85ebca6b
const HASH_C = 0xc2b2ae35

function saturate(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function smoothstep01(t: number): number {
  return t * t * (3 - 2 * t)
}

function signedSeed(seed = 0): number {
  return seed | 0
}

function hashUint32(a: number, b: number, c = 0): number {
  let n = signedSeed(a) ^ Math.imul(signedSeed(b), GOLDEN_HASH) ^ Math.imul(signedSeed(c), HASH_B)
  n ^= n >>> 16
  n = Math.imul(n, HASH_C)
  n ^= n >>> 13
  n = Math.imul(n, HASH_B)
  n ^= n >>> 16
  return n >>> 0
}

export function hash01(a: number, b: number, c = 0): number {
  return hashUint32(a, b, c) / 4294967295
}

function valueNoise(x: number, z: number, seed: number, scale: number): number {
  const safeScale = Math.max(1e-4, scale)
  const sx = x / safeScale
  const sz = z / safeScale
  const cx = Math.floor(sx)
  const cz = Math.floor(sz)
  const tx = smoothstep01(sx - cx)
  const tz = smoothstep01(sz - cz)

  const v00 = hash01(cx, cz, seed)
  const v10 = hash01(cx + 1, cz, seed)
  const v01 = hash01(cx, cz + 1, seed)
  const v11 = hash01(cx + 1, cz + 1, seed)

  return lerp(lerp(v00, v10, tx), lerp(v01, v11, tx), tz)
}

export function createValueNoiseField({
  seed = 0,
  scale = 1,
}: ValueNoiseFieldOptions = {}): WorldField2 {
  const fieldSeed = signedSeed(seed)
  const fieldScale = Math.max(1e-4, scale)
  return (x, z) => valueNoise(x, z, fieldSeed, fieldScale)
}

export function createFbmField({
  seed = 0,
  scale = 1,
  octaves = 4,
  gain = 0.5,
  lacunarity = 2,
}: FbmFieldOptions = {}): WorldField2 {
  const fieldSeed = signedSeed(seed)
  const fieldScale = Math.max(1e-4, scale)
  const octaveCount = Math.max(1, Math.floor(octaves))
  const octaveGain = Math.max(0, gain)
  const octaveLacunarity = Math.max(1.01, lacunarity)

  return (x, z) => {
    let sum = 0
    let amplitude = 1
    let amplitudeSum = 0
    let frequency = 1

    for (let octave = 0; octave < octaveCount; octave++) {
      const octaveSeed = fieldSeed + octave * 7919
      sum += valueNoise(x * frequency, z * frequency, octaveSeed, fieldScale) * amplitude
      amplitudeSum += amplitude
      amplitude *= octaveGain
      frequency *= octaveLacunarity
    }

    return amplitudeSum <= 1e-6 ? 0 : sum / amplitudeSum
  }
}

export function remapField(
  field: WorldField2,
  {
    inMin = 0,
    inMax = 1,
    outMin = 0,
    outMax = 1,
    clamp = true,
  }: RemapFieldOptions = {},
): WorldField2 {
  const range = Math.abs(inMax - inMin) <= 1e-6 ? 1 : inMax - inMin
  return (x, z) => {
    let t = (field(x, z) - inMin) / range
    if (clamp) t = saturate(t)
    return lerp(outMin, outMax, t)
  }
}

export function ridgeField(field: WorldField2, strength = 1): WorldField2 {
  const ridgeStrength = Math.max(0, strength)
  return (x, z) => {
    const v = saturate(field(x, z))
    const ridge = 1 - Math.abs(v * 2 - 1)
    return ridgeStrength >= 1 ? ridge : lerp(v, ridge, ridgeStrength)
  }
}

export function thresholdField(
  field: WorldField2,
  {
    threshold = 0.5,
    softness = 0,
  }: ThresholdFieldOptions = {},
): WorldField2 {
  const edge = Math.max(0, softness)
  if (edge <= 1e-6) {
    return (x, z) => (field(x, z) >= threshold ? 1 : 0)
  }
  return (x, z) => {
    const min = threshold - edge
    const max = threshold + edge
    return saturate((field(x, z) - min) / (max - min))
  }
}

export function domainWarpField(
  field: WorldField2,
  {
    seed = 0,
    amplitude = 0,
    scale = 1,
  }: DomainWarpFieldOptions = {},
): WorldField2 {
  const warpAmplitude = Math.max(0, amplitude)
  if (warpAmplitude <= 1e-6) return field

  const xWarp = createValueNoiseField({ seed: seed + 1013, scale })
  const zWarp = createValueNoiseField({ seed: seed + 2027, scale })
  return (x, z) => {
    const dx = (xWarp(x, z) * 2 - 1) * warpAmplitude
    const dz = (zWarp(x, z) * 2 - 1) * warpAmplitude
    return field(x + dx, z + dz)
  }
}

export function createWorldField(seed = 0, options: CreateWorldFieldOptions = {}): WorldField2 {
  const {
    scale = 18,
    octaves = 4,
    roughness = 0.55,
    lacunarity = 2,
    warpAmplitude = 0,
    warpScale = scale * 0.85,
    ridge = 0,
    bias = 0,
    contrast = 1,
  } = options

  let field = createFbmField({
    seed,
    scale,
    octaves,
    gain: roughness,
    lacunarity,
  })

  field = domainWarpField(field, {
    seed: seed + 4001,
    amplitude: warpAmplitude,
    scale: Math.max(1e-4, warpScale),
  })

  if (ridge > 1e-6) {
    field = ridgeField(field, ridge)
  }

  const safeContrast = Math.max(0.01, contrast)
  return (x, z) => {
    const centered = (field(x, z) - 0.5) * safeContrast + 0.5 + bias
    return saturate(centered)
  }
}

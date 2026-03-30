export type SurfaceMotionFieldBounds = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export type SurfaceMotionFieldSample = {
  offsetX: number
  offsetZ: number
  flowX: number
  flowZ: number
  occupancy: number
  angular: number
}

export type SurfaceMotionFieldOptions = {
  cellSize?: number
  drag?: number
  diffusion?: number
  spinDrag?: number
  occupancyDecay?: number
  maxSpeed?: number
  maxOffset?: number
}

export type SurfaceMotionImpulseOptions = {
  radius: number
  strength: number
  directionX?: number
  directionZ?: number
  tangentialStrength?: number
  spin?: number
  occupancy?: number
}

export type SurfaceMotionField = {
  readonly bounds: SurfaceMotionFieldBounds
  clear(): void
  getOptions(): Required<SurfaceMotionFieldOptions>
  hasActivity(): boolean
  sample(x: number, z: number): SurfaceMotionFieldSample
  update(delta: number): void
  writeImpulse(x: number, z: number, options: SurfaceMotionImpulseOptions): void
}

const DEFAULT_OPTIONS: Required<SurfaceMotionFieldOptions> = {
  cellSize: 1.5,
  drag: 2.1,
  diffusion: 3.2,
  spinDrag: 2.6,
  occupancyDecay: 0.08,
  maxSpeed: 3.8,
  maxOffset: Number.POSITIVE_INFINITY,
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function smoothstep(value: number, edge0: number, edge1: number): number {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1
  }
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function length2(x: number, z: number): number {
  return Math.hypot(x, z)
}

type MotionPacket = {
  x: number
  z: number
  radius: number
  offsetX: number
  offsetZ: number
  flowX: number
  flowZ: number
  angular: number
  occupancy: number
}

const MAX_MOTION_PACKETS = 64

export function createSurfaceMotionField(
  bounds: SurfaceMotionFieldBounds,
  options: SurfaceMotionFieldOptions = {},
): SurfaceMotionField {
  const config = { ...DEFAULT_OPTIONS, ...options }
  const packets: MotionPacket[] = []
  let active = false

  const clampOffset = (packet: MotionPacket): void => {
    if (!Number.isFinite(config.maxOffset)) return
    const offsetLength = length2(packet.offsetX, packet.offsetZ)
    if (offsetLength <= config.maxOffset) return
    const s = config.maxOffset / Math.max(offsetLength, 1e-6)
    packet.offsetX *= s
    packet.offsetZ *= s
  }

  const removeWeakestPacket = (): void => {
    if (packets.length < MAX_MOTION_PACKETS) return
    let weakestIndex = 0
    let weakestScore = Number.POSITIVE_INFINITY
    for (let i = 0; i < packets.length; i++) {
      const packet = packets[i]!
      const score =
        length2(packet.flowX, packet.flowZ) +
        Math.abs(packet.angular) * 0.5 +
        packet.occupancy * 0.35
      if (score < weakestScore) {
        weakestScore = score
        weakestIndex = i
      }
    }
    packets.splice(weakestIndex, 1)
  }

  const packetWithinBounds = (packet: MotionPacket): boolean => {
    const pad = Math.max(packet.radius * 2.5, config.cellSize * 2)
    return !(
      packet.x < bounds.minX - pad ||
      packet.x > bounds.maxX + pad ||
      packet.z < bounds.minZ - pad ||
      packet.z > bounds.maxZ + pad
    )
  }

  const sampleAt = (x: number, z: number): SurfaceMotionFieldSample => {
    let offsetX = 0
    let offsetZ = 0
    let flowX = 0
    let flowZ = 0
    let angular = 0
    let occupancy = 0
    let totalWeight = 0

    for (const packet of packets) {
      const dx = x - packet.x
      const dz = z - packet.z
      const distance = length2(dx, dz)
      if (distance > packet.radius) continue
      const falloff = 1 - smoothstep(distance, 0, packet.radius)
      const weight = falloff * falloff
      offsetX += packet.offsetX * weight
      offsetZ += packet.offsetZ * weight
      flowX += packet.flowX * weight
      flowZ += packet.flowZ * weight
      angular += packet.angular * weight
      occupancy = Math.max(occupancy, packet.occupancy * falloff)
      totalWeight += weight
    }

    if (totalWeight <= 1e-5) {
      return {
        offsetX: 0,
        offsetZ: 0,
        flowX: 0,
        flowZ: 0,
        occupancy: 0,
        angular: 0,
      }
    }

    const normalization = totalWeight > 1 ? 1 / totalWeight : 1
    return {
      offsetX: offsetX * normalization,
      offsetZ: offsetZ * normalization,
      flowX: flowX * normalization,
      flowZ: flowZ * normalization,
      occupancy,
      angular: angular * normalization,
    }
  }

  return {
    bounds,

    clear() {
      packets.length = 0
      active = false
    },

    getOptions() {
      return config
    },

    hasActivity() {
      return active
    },

    sample(x, z) {
      return sampleAt(x, z)
    },

    update(delta) {
      if (delta <= 0) return
      const dt = Math.min(0.05, Math.max(0, delta))
      const dragFactor = Math.exp(-config.drag * dt)
      const spinFactor = Math.exp(-config.spinDrag * dt)
      const occupancyFactor = Math.exp(-config.occupancyDecay * dt)
      const diffusionScale = Math.max(0, config.diffusion) * dt * 0.22

      let stillActive = false
      for (let i = packets.length - 1; i >= 0; i--) {
        const packet = packets[i]!
        packet.x += packet.flowX * dt
        packet.z += packet.flowZ * dt
        packet.offsetX += packet.flowX * dt
        packet.offsetZ += packet.flowZ * dt
        clampOffset(packet)

        const vx = packet.flowX * dragFactor
        const vz = packet.flowZ * dragFactor
        const speed = length2(vx, vz)
        const speedScale = speed > config.maxSpeed ? config.maxSpeed / speed : 1
        packet.flowX = vx * speedScale
        packet.flowZ = vz * speedScale
        packet.angular *= spinFactor
        packet.occupancy = clamp(packet.occupancy * occupancyFactor, 0, 1)
        packet.radius = Math.min(packet.radius + diffusionScale, packet.radius * 1.3 + config.cellSize * 0.35)

        const score =
          length2(packet.flowX, packet.flowZ) +
          Math.abs(packet.angular) * 0.5 +
          packet.occupancy * 0.3
        if (score <= 0.012 || !packetWithinBounds(packet)) {
          packets.splice(i, 1)
          continue
        }
        stillActive = true
      }
      active = stillActive
    },

    writeImpulse(x, z, options) {
      const radius = Math.max(0.01, options.radius)
      const strength = Math.max(0, options.strength)
      if (strength <= 1e-6) return

      const providedLength = length2(options.directionX ?? 0, options.directionZ ?? 0)
      const hasProvidedDirection = providedLength > 1e-6
      const baseDirX = hasProvidedDirection ? (options.directionX ?? 0) / providedLength : 0
      const baseDirZ = hasProvidedDirection ? (options.directionZ ?? 0) / providedLength : 0
      const tangentialStrength = options.tangentialStrength ?? 0
      const spinStrength = options.spin ?? 0
      const occupancyStrength = options.occupancy ?? 0
      let dirX = baseDirX
      let dirZ = baseDirZ
      if (!hasProvidedDirection) {
        const sampled = sampleAt(x, z)
        const sampledLength = length2(sampled.flowX, sampled.flowZ)
        if (sampledLength > 1e-6) {
          dirX = sampled.flowX / sampledLength
          dirZ = sampled.flowZ / sampledLength
        }
      }
      const tangentX = -dirZ
      const tangentZ = dirX

      let merged = false
      const mergeDistance = Math.max(radius * 0.75, config.cellSize * 1.5)
      for (const packet of packets) {
        const distance = length2(packet.x - x, packet.z - z)
        if (distance > mergeDistance) continue
        packet.x = lerp(packet.x, x, 0.35)
        packet.z = lerp(packet.z, z, 0.35)
        packet.radius = Math.max(packet.radius, radius)
        packet.flowX += dirX * strength + tangentX * strength * tangentialStrength
        packet.flowZ += dirZ * strength + tangentZ * strength * tangentialStrength
        packet.angular += (spinStrength + tangentialStrength * 0.35) * strength
        packet.occupancy = clamp(packet.occupancy + occupancyStrength * 0.45, 0, 1)
        clampOffset(packet)
        merged = true
        break
      }

      if (!merged) {
        removeWeakestPacket()
        packets.push({
          x,
          z,
          radius,
          offsetX: 0,
          offsetZ: 0,
          flowX: dirX * strength + tangentX * strength * tangentialStrength,
          flowZ: dirZ * strength + tangentZ * strength * tangentialStrength,
          angular: (spinStrength + tangentialStrength * 0.35) * strength,
          occupancy: clamp(occupancyStrength * 0.45, 0, 1),
        })
      }

      active = true
    },
  }
}

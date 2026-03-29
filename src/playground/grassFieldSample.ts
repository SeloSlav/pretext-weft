import type { PreparedTextWithSegments } from '@chenglou/pretext'
import * as THREE from 'three'
import { PLAYGROUND_BOUNDS } from './playgroundWorld'
import { smoothPulse } from './mathUtils'
import { updateRecoveringImpacts } from './recovery'
import { SurfaceLayoutDriver, type SurfaceLayoutSlot } from './surfaceLayoutCore'
import type { GrassFieldParams, SeedCursorFactory } from './types'

const ROWS = 52
const SECTORS = 68
const BLADES_PER_SLOT = 2
const MAX_INSTANCES = 72_000
const FIELD_WIDTH = PLAYGROUND_BOUNDS.maxX - PLAYGROUND_BOUNDS.minX
const FIELD_DEPTH = PLAYGROUND_BOUNDS.maxZ - PLAYGROUND_BOUNDS.minZ
const LAYOUT_PX_PER_WORLD = 16
const DISTURBANCE_RADIUS_MULTIPLIER = 2.35

const tmpPos = new THREE.Vector3()
const tmpColor = new THREE.Color()
const tmpLocalPoint = new THREE.Vector3()
const dummy = new THREE.Object3D()
const groundBaseColor = new THREE.Color('#8cab72')
const groundDarkColor = new THREE.Color('#587044')

// Each Unicode blade glyph gets its own color identity so the typographic
// origin is visible in the field. Hue 0.27 = yellow-green, 0.32 = warm gold.
function glyphColorIdentity(code: number): { hueShift: number; lightShift: number; satShift: number } {
  // Map code point to a stable slot in [0,1) using a cheap mix
  const t = ((code * 2654435761) >>> 0) / 4294967296
  // Spread hue across a narrow yellow-green to warm-gold band
  const hueShift = (t - 0.5) * 0.072
  // Some glyphs are paler (tips), some richer (stems)
  const lightShift = (t - 0.5) * 0.14
  const satShift = (t - 0.5) * 0.18
  return { hueShift, lightShift, satShift }
}

type Disturbance = {
  x: number
  z: number
  radius: number
  strength: number
}

type DisturbanceOptions = {
  radiusScale?: number
  strength?: number
}

/** Chunky stem, soft mid, long tapered tip — reads closer to hand-painted / Ghibli grass cards. */
function makeBladeGeometry(): THREE.BufferGeometry {
  const bladeHeight = 1.58
  const baseHalfWidth = 0.19
  const geometry = new THREE.PlaneGeometry(baseHalfWidth * 2, bladeHeight, 4, 18)
  const position = geometry.attributes.position
  const halfH = bladeHeight * 0.5
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const y01 = THREE.MathUtils.clamp((y + halfH) / bladeHeight, 0, 1)
    let widthScale: number
    if (y01 < 0.24) {
      widthScale = 1
    } else {
      const u = (y01 - 0.24) / 0.76
      widthScale = 0.045 + 0.955 * Math.pow(1 - u, 1.92)
    }
    const ribbon = Math.sin(y01 * Math.PI * 1.05) * 0.022 * (1 - y01 * 0.85)
    position.setXYZ(i, x * widthScale + ribbon, y, 0)
  }
  position.needsUpdate = true
  geometry.translate(0, halfH - 0.065, 0)
  return geometry
}

function createGroundTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 1024
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas)
    fallback.colorSpace = THREE.SRGBColorSpace
    return fallback
  }

  ctx.fillStyle = '#5f8744'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (let i = 0; i < 16000; i++) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    const radius = 1.2 + Math.random() * 7.5
    const alpha = 0.05 + Math.random() * 0.12
    const hue = 78 + Math.random() * 16
    const sat = 28 + Math.random() * 28
    const light = 22 + Math.random() * 10
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < 5200; i++) {
    ctx.strokeStyle = `hsla(${86 + Math.random() * 14}, ${24 + Math.random() * 18}%, ${18 + Math.random() * 9}%, ${0.06 + Math.random() * 0.1})`
    ctx.lineWidth = 0.7 + Math.random() * 2.1
    ctx.beginPath()
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    ctx.moveTo(x, y)
    ctx.lineTo(x + (Math.random() - 0.5) * 56, y + (Math.random() - 0.5) * 80)
    ctx.stroke()
  }

  for (let i = 0; i < 900; i++) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    const radius = 18 + Math.random() * 60
    const alpha = 0.04 + Math.random() * 0.08
    ctx.fillStyle = `hsla(${88 + Math.random() * 18}, ${16 + Math.random() * 14}%, ${30 + Math.random() * 10}%, ${alpha})`
    ctx.beginPath()
    ctx.ellipse(x, y, radius, radius * (0.45 + Math.random() * 0.5), Math.random() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < 90; i++) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    const radius = 46 + Math.random() * 120
    const alpha = 0.08 + Math.random() * 0.1
    const broadPatch = ctx.createRadialGradient(x, y, radius * 0.1, x, y, radius)
    broadPatch.addColorStop(0, `rgba(124, 164, 74, ${alpha})`)
    broadPatch.addColorStop(0.55, `rgba(90, 125, 54, ${alpha * 0.82})`)
    broadPatch.addColorStop(1, 'rgba(90, 125, 54, 0)')
    ctx.fillStyle = broadPatch
    ctx.beginPath()
    ctx.ellipse(x, y, radius, radius * (0.5 + Math.random() * 0.28), Math.random() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < 360; i++) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    const radius = 3 + Math.random() * 10
    const alpha = 0.03 + Math.random() * 0.06
    ctx.fillStyle = `hsla(${102 + Math.random() * 14}, 20%, ${58 + Math.random() * 8}%, ${alpha})`
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < 110; i++) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    const radius = 56 + Math.random() * 90
    const alpha = 0.05 + Math.random() * 0.08
    const grassPatch = ctx.createRadialGradient(x, y, radius * 0.16, x, y, radius)
    grassPatch.addColorStop(0, `rgba(92, 128, 58, ${alpha})`)
    grassPatch.addColorStop(0.55, `rgba(124, 162, 78, ${alpha * 0.82})`)
    grassPatch.addColorStop(1, 'rgba(124, 162, 78, 0)')
    ctx.fillStyle = grassPatch
    ctx.beginPath()
    ctx.ellipse(x, y, radius, radius * (0.55 + Math.random() * 0.3), Math.random() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < 36; i++) {
    const y = Math.random() * canvas.height
    const thickness = 18 + Math.random() * 40
    const alpha = 0.03 + Math.random() * 0.05
    const band = ctx.createLinearGradient(0, y - thickness, 0, y + thickness)
    band.addColorStop(0, 'rgba(0,0,0,0)')
    band.addColorStop(0.5, `rgba(68, 97, 43, ${alpha})`)
    band.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = band
    ctx.fillRect(0, y - thickness, canvas.width, thickness * 2)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(4.8, 4.8)
  texture.needsUpdate = true
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function fieldNoise(x: number, z: number): number {
  const a = Math.sin(x * 0.21 + z * 0.07)
  const b = Math.sin(x * 0.08 - z * 0.17 + 1.3)
  const c = Math.sin((x + z) * 0.05 - 0.9)
  return THREE.MathUtils.clamp(0.5 + a * 0.22 + b * 0.18 + c * 0.1, 0, 1)
}

function lineSignature(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

function glyphScatter(code: number, lineSeed: number, index: number): number {
  const waveA = Math.sin(code * 0.073 + lineSeed * 6.1 + index * 1.7)
  const waveB = Math.sin(code * 0.031 + lineSeed * 11.3 + index * 0.83)
  return THREE.MathUtils.clamp(waveA * 0.7 + waveB * 0.3, -1, 1)
}

export class GrassFieldSample {
  readonly group = new THREE.Group()
  readonly interactionMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>

  private readonly bladeGeometry = makeBladeGeometry()
  private readonly bladeMaterial = new THREE.MeshPhysicalMaterial({
    color: '#c9f288',
    emissive: '#3d5a28',
    emissiveIntensity: 0.09,
    side: THREE.DoubleSide,
    roughness: 0.52,
    metalness: 0,
    clearcoat: 0.14,
    clearcoatRoughness: 0.55,
    sheen: 0.35,
    sheenRoughness: 0.62,
    sheenColor: new THREE.Color('#e8ffc8'),
  })
  private readonly bladeMesh = new THREE.InstancedMesh(this.bladeGeometry, this.bladeMaterial, MAX_INSTANCES)
  private readonly groundTexture = createGroundTexture()
  private readonly groundGeometry = new THREE.PlaneGeometry(FIELD_WIDTH, FIELD_DEPTH, 64, 52)
  private readonly groundMaterial = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    map: this.groundTexture,
    side: THREE.DoubleSide,
  })
  private readonly interactionMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  private readonly groundSurfaceMesh = new THREE.Mesh(this.groundGeometry, this.groundMaterial)
  private readonly baseGroundPositions = Float32Array.from(this.groundGeometry.attributes.position.array as ArrayLike<number>)
  private readonly layoutDriver: SurfaceLayoutDriver
  private readonly disturbances: Disturbance[] = []
  private lastElapsedTime = 0

  private params: GrassFieldParams

  constructor(
    prepared: PreparedTextWithSegments,
    seedCursor: SeedCursorFactory,
    initialParams: GrassFieldParams,
  ) {
    this.params = { ...initialParams }
    this.layoutDriver = new SurfaceLayoutDriver({
      prepared,
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 13 + 5,
      seedCursor,
      staggerFactor: 0.45,
      minSpanFactor: 0.33,
    })

    this.bladeMesh.frustumCulled = false
    this.bladeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.interactionMesh = new THREE.Mesh(this.groundGeometry, this.interactionMaterial)
    this.interactionMesh.rotation.x = -Math.PI / 2
    this.groundSurfaceMesh.rotation.x = -Math.PI / 2
    this.groundSurfaceMesh.position.y = 0.01
    this.groundSurfaceMesh.renderOrder = -1

    this.group.add(this.groundSurfaceMesh)
    this.group.add(this.interactionMesh)
    this.group.add(this.bladeMesh)
  }

  setParams(params: Partial<GrassFieldParams>): void {
    this.params = { ...this.params, ...params }
    for (const disturbance of this.disturbances) {
      disturbance.radius = this.params.disturbanceRadius * DISTURBANCE_RADIUS_MULTIPLIER
    }
  }

  clearDisturbances(): void {
    this.disturbances.length = 0
  }

  addDisturbanceFromWorldPoint(worldPoint: THREE.Vector3, options: DisturbanceOptions = {}): void {
    tmpLocalPoint.copy(worldPoint)
    this.group.worldToLocal(tmpLocalPoint)
    this.disturbances.unshift({
      x: THREE.MathUtils.clamp(tmpLocalPoint.x, -FIELD_WIDTH * 0.46, FIELD_WIDTH * 0.46),
      z: THREE.MathUtils.clamp(tmpLocalPoint.z, -FIELD_DEPTH * 0.46, FIELD_DEPTH * 0.46),
      radius: this.params.disturbanceRadius * DISTURBANCE_RADIUS_MULTIPLIER * (options.radiusScale ?? 1),
      strength: options.strength ?? 1,
    })
  }

  getGroundHeightAtWorld(x: number, z: number): number {
    tmpLocalPoint.set(x, 0, z)
    this.group.worldToLocal(tmpLocalPoint)
    tmpLocalPoint.set(tmpLocalPoint.x, this.groundY(tmpLocalPoint.x, tmpLocalPoint.z), tmpLocalPoint.z)
    this.group.localToWorld(tmpLocalPoint)
    return tmpLocalPoint.y
  }

  getWalkHeightAtWorld(x: number, z: number): number {
    tmpLocalPoint.set(x, 0, z)
    this.group.worldToLocal(tmpLocalPoint)
    tmpLocalPoint.set(tmpLocalPoint.x, this.baseGroundY(tmpLocalPoint.x, tmpLocalPoint.z), tmpLocalPoint.z)
    this.group.localToWorld(tmpLocalPoint)
    return tmpLocalPoint.y
  }

  update(elapsedTime: number): void {
    const delta = this.lastElapsedTime === 0 ? 0 : Math.max(0, elapsedTime - this.lastElapsedTime)
    this.lastElapsedTime = elapsedTime
    this.updateDisturbances(delta)
    this.updateGround()
    this.updateBlades(elapsedTime)
  }

  dispose(): void {
    this.bladeGeometry.dispose()
    this.bladeMaterial.dispose()
    this.groundTexture.dispose()
    this.groundGeometry.dispose()
    this.groundMaterial.dispose()
    this.interactionMaterial.dispose()
  }

  private disturbanceAt(x: number, z: number): number {
    let disturbance = 0
    for (const hit of this.disturbances) {
      const dx = x - hit.x
      const dz = z - hit.z
      const n = Math.sqrt(dx * dx + dz * dz) / Math.max(hit.radius, 0.0001)
      disturbance = Math.max(disturbance, Math.pow(smoothPulse(n), 0.45) * hit.strength)
    }
    return THREE.MathUtils.clamp(disturbance, 0, 1)
  }

  private updateDisturbances(delta: number): void {
    updateRecoveringImpacts(this.disturbances, this.params.recoveryRate, delta)
  }

  private baseGroundY(x: number, z: number): number {
    return 0.12 * Math.sin(x * 0.22) * Math.cos(z * 0.18) + 0.03 * Math.sin((x + z) * 0.65)
  }

  private groundY(x: number, z: number): number {
    let depth = this.baseGroundY(x, z)
    for (const hit of this.disturbances) {
      const dx = x - hit.x
      const dz = z - hit.z
      const n = Math.sqrt(dx * dx + dz * dz) / Math.max(hit.radius, 0.0001)
      depth -= Math.pow(smoothPulse(n), 0.55) * this.params.trampleDepth * 0.44 * hit.strength
    }
    return depth
  }

  private updateGround(): void {
    const position = this.groundGeometry.attributes.position
    for (let i = 0; i < position.count; i++) {
      const x = this.baseGroundPositions[i * 3]
      // PlaneGeometry lies in XY (normal +Z); depth of the field is local Y, not Z (Z is always 0).
      // After rotation.x = -π/2, local Y becomes world -Z, so height samples use groundY(x, -yPlane).
      const yPlane = this.baseGroundPositions[i * 3 + 1]
      const h = this.groundY(x, -yPlane)
      position.setXYZ(i, x, yPlane, h)
    }
    position.needsUpdate = true
    this.groundGeometry.computeVertexNormals()
  }

  private updateBlades(elapsedTime: number): void {
    const rowStep = FIELD_DEPTH / (ROWS + 1.1)
    const backZ = FIELD_DEPTH * 0.48
    let instanceIndex = 0

    this.layoutDriver.forEachLaidOutLine({
      spanMin: -FIELD_WIDTH * 0.5,
      spanMax: FIELD_WIDTH * 0.5,
      lineCoordAtRow: (row) => backZ - row * rowStep,
      getMaxWidth: (slot) => this.getSlotMaxWidth(slot),
      onLine: ({ slot, glyphs, lineText }) => {
        instanceIndex = this.projectLine(slot, glyphs, lineText, rowStep, elapsedTime, instanceIndex)
      },
    })

    this.bladeMesh.count = instanceIndex
    this.bladeMesh.instanceMatrix.needsUpdate = true
    if (this.bladeMesh.instanceColor) {
      this.bladeMesh.instanceColor.needsUpdate = true
    }
  }

  private getSlotMaxWidth(slot: SurfaceLayoutSlot): number {
    const disturbance = this.disturbanceAt(slot.spanCenter, slot.lineCoord)
    return (
      slot.spanSize *
      LAYOUT_PX_PER_WORLD *
      THREE.MathUtils.lerp(1, 1 - this.params.disturbanceStrength * 0.98, disturbance)
    )
  }

  private projectLine(
    slot: SurfaceLayoutSlot,
    glyphs: readonly string[],
    lineText: string,
    rowStep: number,
    elapsedTime: number,
    instanceIndex: number,
  ): number {
    const n = glyphs.length
    const lineSeed = lineSignature(lineText)
    const lineLateralShift = (lineSeed - 0.5) * slot.sectorStep * 0.28
    const lineDepthShift = (lineSeed - 0.5) * rowStep * 0.18
    const lineClusterStrength = 0.035 + lineSeed * 0.05

    for (let k = 0; k < n; k++) {
      if (instanceIndex >= MAX_INSTANCES) break

      const glyph = glyphs[k]!
      const code = glyph.codePointAt(0) ?? 0
      for (let blade = 0; blade < BLADES_PER_SLOT; blade++) {
        if (instanceIndex >= MAX_INSTANCES) break

        const pretextScatter = glyphScatter(code, lineSeed, k * BLADES_PER_SLOT + blade)
        const fieldRandom = fieldNoise(
          slot.spanCenter + k * 0.37 + blade * 1.9 + pretextScatter * 0.9,
          slot.lineCoord + blade * 0.23 + lineDepthShift,
        )
        const t01 = (k + 0.18 + blade * 0.34) / (n + BLADES_PER_SLOT * 0.2)
        const clusteredT = THREE.MathUtils.clamp(
          t01 +
            pretextScatter * lineClusterStrength +
            Math.sin((t01 + lineSeed * 0.4) * Math.PI * 2) * 0.02,
          0.04,
          0.96,
        )
        const x =
          slot.spanStart +
          clusteredT * slot.spanSize +
          lineLateralShift +
          (blade - 0.5) * slot.sectorStep * 0.14 +
          (fieldRandom - 0.5) * slot.sectorStep * 0.2 +
          pretextScatter * slot.sectorStep * 0.11
        const zJitter =
          (blade - 0.5) * rowStep * 0.24 +
          (fieldRandom - 0.5) * rowStep * 0.18 +
          pretextScatter * rowStep * 0.12
        const localZ = slot.lineCoord + lineDepthShift + zJitter
        const localDisturbance = this.disturbanceAt(x, localZ)
        const baseY = this.groundY(x, localZ)
        const organicNoise = fieldNoise(x, localZ)

        let awayX = 0
        let awayZ = 1
        let strongest = 0
        for (const hit of this.disturbances) {
          const dx = x - hit.x
          const dz = localZ - hit.z
          const n = Math.sqrt(dx * dx + dz * dz) / Math.max(hit.radius, 0.0001)
          const influence = smoothPulse(n) * hit.strength
          if (influence > strongest) {
            strongest = influence
            awayX = dx
            awayZ = dz
          }
        }

        const bendDirection = Math.atan2(awayX, awayZ) + (organicNoise - 0.5) * 0.35
        const gust =
          Math.sin(elapsedTime * 1.55 + x * 0.52 + localZ * 0.34) +
          0.55 * Math.sin(elapsedTime * 2.8 + x * 1.1 - localZ * 0.62)
        const windYaw = gust * this.params.wind * 0.14
        const windBend = (0.24 + Math.abs(gust) * 0.18) * this.params.wind
        const trampleBend = localDisturbance * 1.15
        const height = 0.88 + (code % 7) * 0.1 + organicNoise * 0.14 + blade * 0.07
        const width = 0.072 + ((code >> 2) % 5) * 0.01 + organicNoise * 0.015 + blade * 0.006

        tmpPos.set(
          x + awayX * localDisturbance * 0.22,
          baseY + 0.16 + localDisturbance * 0.05,
          localZ + awayZ * localDisturbance * 0.22,
        )
        dummy.position.copy(tmpPos)
        dummy.rotation.set(0, bendDirection + windYaw, 0)
        dummy.rotateX((organicNoise - 0.5) * 0.12)
        dummy.rotateZ((windBend + trampleBend) * Math.sign(awayX || 1))
        dummy.scale.set(
          width * (1 - localDisturbance * 0.42),
          Math.max(height * (1 - localDisturbance * 0.88), 0.18),
          1,
        )
        dummy.updateMatrix()
        this.bladeMesh.setMatrixAt(instanceIndex, dummy.matrix)

        const identity = glyphColorIdentity(code)
        // Base hue drifts with field noise; glyph identity shifts it further so
        // each distinct blade character reads as a slightly different colour family.
        const hue = 0.275 + organicNoise * 0.038 + identity.hueShift
        // Blades taller in the slot (blade index 1) are slightly paler — tip effect.
        const tipFade = blade * 0.055
        const sat = THREE.MathUtils.clamp(
          THREE.MathUtils.lerp(0.78, 0.18, localDisturbance) + identity.satShift,
          0.1, 1,
        )
        const light = THREE.MathUtils.clamp(
          THREE.MathUtils.lerp(0.41, 0.68, 0.3 + organicNoise * 0.7) + identity.lightShift + tipFade,
          0.28, 0.78,
        )
        tmpColor.setHSL(hue, sat, light)
        tmpColor.lerp(groundBaseColor, localDisturbance * 0.06)
        tmpColor.lerp(groundDarkColor, localDisturbance * 0.28)
        this.bladeMesh.setColorAt(instanceIndex, tmpColor)

        instanceIndex++
      }
    }

    return instanceIndex
  }
}
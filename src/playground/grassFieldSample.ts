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
const groundDarkColor = new THREE.Color('#5b4a2a')
const groundHealthyColor = new THREE.Color('#8faf6f')
const groundDryGrassColor = new THREE.Color('#98b67b')
const groundDirtColor = new THREE.Color('#a98458')
const groundDirtDarkColor = new THREE.Color('#7b5a34')

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

  ctx.fillStyle = '#96b579'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (let i = 0; i < 14000; i++) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    const radius = 0.8 + Math.random() * 6
    const alpha = 0.025 + Math.random() * 0.08
    const hue = 62 + Math.random() * 22
    const sat = 14 + Math.random() * 16
    const light = 28 + Math.random() * 12
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < 2400; i++) {
    ctx.strokeStyle = `hsla(${54 + Math.random() * 16}, ${10 + Math.random() * 8}%, ${28 + Math.random() * 10}%, ${0.02 + Math.random() * 0.04})`
    ctx.lineWidth = 0.3 + Math.random() * 1.1
    ctx.beginPath()
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    ctx.moveTo(x, y)
    ctx.lineTo(x + (Math.random() - 0.5) * 48, y + (Math.random() - 0.5) * 48)
    ctx.stroke()
  }

  for (let i = 0; i < 520; i++) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    const radius = 14 + Math.random() * 52
    const alpha = 0.02 + Math.random() * 0.04
    ctx.fillStyle = `hsla(${72 + Math.random() * 16}, ${8 + Math.random() * 8}%, ${34 + Math.random() * 8}%, ${alpha})`
    ctx.beginPath()
    ctx.ellipse(x, y, radius, radius * (0.45 + Math.random() * 0.5), Math.random() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < 240; i++) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    const radius = 3 + Math.random() * 14
    const alpha = 0.04 + Math.random() * 0.08
    ctx.fillStyle = `hsla(${34 + Math.random() * 12}, 22%, ${52 + Math.random() * 8}%, ${alpha})`
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < 28; i++) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    const radius = 48 + Math.random() * 82
    const alpha = 0.08 + Math.random() * 0.08
    const dirtPatch = ctx.createRadialGradient(x, y, radius * 0.16, x, y, radius)
    dirtPatch.addColorStop(0, `rgba(162, 136, 94, ${alpha})`)
    dirtPatch.addColorStop(0.55, `rgba(181, 156, 116, ${alpha * 0.76})`)
    dirtPatch.addColorStop(1, 'rgba(181, 156, 116, 0)')
    ctx.fillStyle = dirtPatch
    ctx.beginPath()
    ctx.ellipse(x, y, radius, radius * (0.55 + Math.random() * 0.3), Math.random() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2.2, 2.2)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function createDirtBaseTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 1024
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas)
    fallback.colorSpace = THREE.SRGBColorSpace
    return fallback
  }

  ctx.fillStyle = '#95b373'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (let i = 0; i < 16000; i++) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    const radius = 0.5 + Math.random() * 3.4
    const alpha = 0.025 + Math.random() * 0.08
    ctx.fillStyle = `hsla(${66 + Math.random() * 18}, ${12 + Math.random() * 12}%, ${30 + Math.random() * 14}%, ${alpha})`
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < 180; i++) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    const radius = 40 + Math.random() * 120
    const alpha = 0.08 + Math.random() * 0.1
    const patch = ctx.createRadialGradient(x, y, radius * 0.15, x, y, radius)
    patch.addColorStop(0, `rgba(124, 150, 84, ${alpha})`)
    patch.addColorStop(0.5, `rgba(150, 176, 106, ${alpha * 0.85})`)
    patch.addColorStop(1, 'rgba(150, 176, 106, 0)')
    ctx.fillStyle = patch
    ctx.beginPath()
    ctx.ellipse(x, y, radius, radius * (0.45 + Math.random() * 0.35), Math.random() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < 2200; i++) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    ctx.strokeStyle = `hsla(${68 + Math.random() * 18}, 10%, ${24 + Math.random() * 10}%, ${0.03 + Math.random() * 0.04})`
    ctx.lineWidth = 0.5 + Math.random() * 2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + (Math.random() - 0.5) * 44, y + (Math.random() - 0.5) * 20)
    ctx.stroke()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(1.7, 1.7)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function fieldNoise(x: number, z: number): number {
  const a = Math.sin(x * 0.21 + z * 0.07)
  const b = Math.sin(x * 0.08 - z * 0.17 + 1.3)
  const c = Math.sin((x + z) * 0.05 - 0.9)
  return THREE.MathUtils.clamp(0.5 + a * 0.22 + b * 0.18 + c * 0.1, 0, 1)
}

export class GrassFieldSample {
  readonly group = new THREE.Group()
  readonly interactionMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>

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
  private readonly dirtBaseTexture = createDirtBaseTexture()
  private readonly dirtBaseGeometry = new THREE.PlaneGeometry(FIELD_WIDTH * 1.08, FIELD_DEPTH * 1.08, 1, 1)
  private readonly dirtBaseMaterial = new THREE.MeshStandardMaterial({
    color: '#9ab879',
    map: this.dirtBaseTexture,
    roughness: 0.98,
    metalness: 0,
    side: THREE.DoubleSide,
  })
  private readonly dirtBaseMesh = new THREE.Mesh(this.dirtBaseGeometry, this.dirtBaseMaterial)
  private readonly groundTexture = createGroundTexture()
  private readonly groundGeometry = new THREE.PlaneGeometry(FIELD_WIDTH, FIELD_DEPTH, 64, 52)
  private readonly groundMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.96,
    metalness: 0.01,
    side: THREE.DoubleSide,
    vertexColors: true,
  })
  private readonly baseGroundPositions = Float32Array.from(this.groundGeometry.attributes.position.array as ArrayLike<number>)
  private readonly groundColors = new Float32Array(this.groundGeometry.attributes.position.count * 3)
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
    this.groundGeometry.setAttribute('color', new THREE.BufferAttribute(this.groundColors, 3))
    this.dirtBaseMesh.rotation.x = -Math.PI / 2
    this.dirtBaseMesh.position.y = -0.26
    this.interactionMesh = new THREE.Mesh(this.groundGeometry, this.groundMaterial)
    this.interactionMesh.rotation.x = -Math.PI / 2

    this.group.add(this.dirtBaseMesh)
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
    this.dirtBaseTexture.dispose()
    this.dirtBaseGeometry.dispose()
    this.dirtBaseMaterial.dispose()
    this.groundTexture.dispose()
    this.groundGeometry.dispose()
    this.groundMaterial.dispose()
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
    const color = this.groundGeometry.getAttribute('color') as THREE.BufferAttribute
    for (let i = 0; i < position.count; i++) {
      const x = this.baseGroundPositions[i * 3]
      const z = this.baseGroundPositions[i * 3 + 2]
      const disturbance = this.disturbanceAt(x, z)
      const organicNoise = fieldNoise(x, z)
      position.setXYZ(i, x, this.groundY(x, z), z)

      tmpColor.copy(groundHealthyColor)
      tmpColor.lerp(groundDryGrassColor, organicNoise * 0.35)
      const exposedDirt = THREE.MathUtils.smoothstep(disturbance, 0.03, 0.24)
      tmpColor.lerp(groundDirtColor, exposedDirt)
      tmpColor.lerp(groundDirtDarkColor, exposedDirt * exposedDirt * 0.68)
      color.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b)
    }
    position.needsUpdate = true
    color.needsUpdate = true
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
      onLine: ({ slot, glyphs }) => {
        instanceIndex = this.projectLine(slot, glyphs, rowStep, elapsedTime, instanceIndex)
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
    rowStep: number,
    elapsedTime: number,
    instanceIndex: number,
  ): number {
    const n = glyphs.length
    for (let k = 0; k < n; k++) {
      if (instanceIndex >= MAX_INSTANCES) break

      const glyph = glyphs[k]!
      const code = glyph.codePointAt(0) ?? 0
      for (let blade = 0; blade < BLADES_PER_SLOT; blade++) {
        if (instanceIndex >= MAX_INSTANCES) break

        const fieldRandom = fieldNoise(slot.spanCenter + k * 0.37 + blade * 1.9, slot.lineCoord + blade * 0.23)
        const t01 = (k + 0.18 + blade * 0.34) / (n + BLADES_PER_SLOT * 0.2)
        const x =
          slot.spanStart +
          t01 * slot.spanSize +
          (blade - 0.5) * slot.sectorStep * 0.14 +
          (fieldRandom - 0.5) * slot.sectorStep * 0.2
        const zJitter = (blade - 0.5) * rowStep * 0.24 + (fieldRandom - 0.5) * rowStep * 0.18
        const localZ = slot.lineCoord + zJitter
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

        const hue = 0.27 + organicNoise * 0.04 + (code % 9) * 0.002
        const sat = THREE.MathUtils.lerp(0.74, 0.2, localDisturbance)
        const light = THREE.MathUtils.lerp(0.44, 0.66, 0.35 + organicNoise * 0.65)
        tmpColor.setHSL(hue, sat, light)
        tmpColor.lerp(groundBaseColor, localDisturbance * 0.04)
        tmpColor.lerp(groundDirtColor, localDisturbance * 0.52)
        tmpColor.lerp(groundDarkColor, localDisturbance * 0.32)
        this.bladeMesh.setColorAt(instanceIndex, tmpColor)

        instanceIndex++
      }
    }

    return instanceIndex
  }
}
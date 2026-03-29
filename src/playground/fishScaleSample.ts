import type { PreparedTextWithSegments } from '@chenglou/pretext'
import * as THREE from 'three'
import { smoothPulse } from './mathUtils'
import { updateRecoveringImpacts } from './recovery'
import { SurfaceLayoutDriver, type SurfaceLayoutSlot } from './surfaceLayoutCore'
import type { FishScaleParams, SeedCursorFactory } from './types'

const ROWS = 16
const SECTORS = 28
const MAX_INSTANCES = 9_000
const PATCH_WIDTH = 5.8
const PATCH_HEIGHT = 4.4
const LAYOUT_PX_PER_WORLD = 33
const BASE_SCALE_LIFT = 0.055
const WOUND_MERGE_RADIUS = 0.46
const WOUND_MAX_STRENGTH = 2.1

const tmpPos = new THREE.Vector3()
const tmpTangentX = new THREE.Vector3()
const tmpTangentY = new THREE.Vector3()
const tmpNormal = new THREE.Vector3()
const tmpMatrix = new THREE.Matrix4()
const tmpColor = new THREE.Color()
const tmpLocalPoint = new THREE.Vector3()
const dummy = new THREE.Object3D()

type Wound = {
  x: number
  y: number
  strength: number
}

type SurfaceFrame = {
  position: THREE.Vector3
  tangentX: THREE.Vector3
  tangentY: THREE.Vector3
  normal: THREE.Vector3
}

function createScaleGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0.58)
  shape.bezierCurveTo(-0.28, 0.52, -0.44, 0.18, -0.28, -0.08)
  shape.quadraticCurveTo(-0.1, -0.5, 0, -0.76)
  shape.quadraticCurveTo(0.1, -0.5, 0.28, -0.08)
  shape.bezierCurveTo(0.44, 0.18, 0.28, 0.52, 0, 0.58)

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelThickness: 0.045,
    bevelSize: 0.04,
    curveSegments: 18,
  })

  geometry.center()
  geometry.rotateX(Math.PI)
  geometry.computeVertexNormals()
  return geometry
}

function createScaleMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: '#86aaa0',
    roughness: 0.62,
    metalness: 0.03,
    clearcoat: 0.42,
    clearcoatRoughness: 0.54,
    sheen: 0.18,
    sheenRoughness: 0.5,
    iridescence: 0.16,
    iridescenceIOR: 1.22,
  })
}

function createPatchMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#475a62',
    roughness: 0.88,
    metalness: 0.02,
    side: THREE.DoubleSide,
  })
}

export class FishScaleSample {
  readonly group = new THREE.Group()
  readonly interactionMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>

  private readonly scaleMesh: THREE.InstancedMesh
  private readonly scaleGeometry = createScaleGeometry()
  private readonly scaleMaterial = createScaleMaterial()
  private readonly patchGeometry = new THREE.PlaneGeometry(PATCH_WIDTH, PATCH_HEIGHT, 72, 54)
  private readonly patchMaterial = createPatchMaterial()
  private readonly basePatchPositions = Float32Array.from(this.patchGeometry.attributes.position.array as ArrayLike<number>)
  private readonly layoutDriver: SurfaceLayoutDriver
  private readonly wounds: Wound[] = []
  private lastElapsedTime = 0

  private params: FishScaleParams

  constructor(
    prepared: PreparedTextWithSegments,
    seedCursor: SeedCursorFactory,
    initialParams: FishScaleParams,
  ) {
    this.params = { ...initialParams }
    this.layoutDriver = new SurfaceLayoutDriver({
      prepared,
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 17 + 9,
      seedCursor,
      staggerFactor: 0.5,
      minSpanFactor: 0.35,
    })

    this.scaleMesh = new THREE.InstancedMesh(this.scaleGeometry, this.scaleMaterial, MAX_INSTANCES)
    this.scaleMesh.frustumCulled = false

    this.interactionMesh = new THREE.Mesh(this.patchGeometry, this.patchMaterial)
    this.interactionMesh.renderOrder = -1

    this.group.add(this.interactionMesh)
    this.group.add(this.scaleMesh)
  }

  setParams(params: Partial<FishScaleParams>): void {
    this.params = { ...this.params, ...params }
  }

  clearWounds(): void {
    this.wounds.length = 0
  }

  addWoundFromWorldPoint(worldPoint: THREE.Vector3): void {
    tmpLocalPoint.copy(worldPoint)
    this.group.worldToLocal(tmpLocalPoint)

    const x = THREE.MathUtils.clamp(tmpLocalPoint.x, -PATCH_WIDTH * 0.48, PATCH_WIDTH * 0.48)
    const y = THREE.MathUtils.clamp(tmpLocalPoint.y, -PATCH_HEIGHT * 0.48, PATCH_HEIGHT * 0.48)
    const mergeIndex = this.findNearbyWoundIndex(x, y)

    if (mergeIndex >= 0) {
      const wound = this.wounds[mergeIndex]!
      wound.x = THREE.MathUtils.lerp(wound.x, x, 0.22)
      wound.y = THREE.MathUtils.lerp(wound.y, y, 0.22)
      wound.strength = Math.min(WOUND_MAX_STRENGTH, wound.strength + 0.32)
      this.wounds.splice(mergeIndex, 1)
      this.wounds.unshift(wound)
    } else {
      this.wounds.unshift({ x, y, strength: 1 })
    }
  }

  update(elapsedTime: number): void {
    const delta = this.lastElapsedTime === 0 ? 0 : Math.max(0, elapsedTime - this.lastElapsedTime)
    this.lastElapsedTime = elapsedTime
    this.updateWounds(delta)
    this.updatePatch(elapsedTime)
    this.updateScales(elapsedTime)
  }

  dispose(): void {
    this.scaleGeometry.dispose()
    this.scaleMaterial.dispose()
    this.patchGeometry.dispose()
    this.patchMaterial.dispose()
  }

  private damageAt(x: number, y: number): number {
    let damage = 0

    for (const wound of this.wounds) {
      const dx = x - wound.x
      const dy = (y - wound.y) * 1.14
      const normalized = Math.sqrt(dx * dx + dy * dy) / Math.max(0.0001, this.woundRadiusFor(wound))
      const woundStrength = THREE.MathUtils.lerp(1, 1.2, this.woundIntensity01(wound))
      damage = Math.max(damage, smoothPulse(normalized) * woundStrength * this.woundPresence01(wound))
    }

    return THREE.MathUtils.clamp(damage, 0, 1)
  }

  private findNearbyWoundIndex(x: number, y: number): number {
    const mergeRadius = this.params.woundRadius * WOUND_MERGE_RADIUS
    const mergeRadiusSq = mergeRadius * mergeRadius

    for (let i = 0; i < this.wounds.length; i++) {
      const wound = this.wounds[i]!
      const dx = x - wound.x
      const dy = y - wound.y
      if (dx * dx + dy * dy <= mergeRadiusSq) {
        return i
      }
    }

    return -1
  }

  private woundIntensity01(wound: Wound): number {
    return THREE.MathUtils.clamp((wound.strength - 1) / (WOUND_MAX_STRENGTH - 1), 0, 1)
  }

  private woundPresence01(wound: Wound): number {
    return THREE.MathUtils.clamp(wound.strength, 0, 1)
  }

  private woundRadiusFor(wound: Wound): number {
    return (
      this.params.woundRadius *
      THREE.MathUtils.lerp(0.72, 1, this.woundPresence01(wound)) *
      THREE.MathUtils.lerp(1, 1.18, this.woundIntensity01(wound))
    )
  }

  private updateWounds(delta: number): void {
    updateRecoveringImpacts(this.wounds, this.params.recoveryRate, delta)
  }

  private surfaceZ(x: number, y: number, elapsedTime: number): number {
    const xNorm = x / (PATCH_WIDTH * 0.5)
    const yNorm = y / (PATCH_HEIGHT * 0.5)
    const baseBulge = 0.34 * Math.cos(xNorm * Math.PI * 0.5) - 0.06 * yNorm * yNorm
    const sway =
      this.params.surfaceFlex *
      (0.05 * Math.sin(elapsedTime * 0.55 + x * 0.9) + 0.03 * Math.cos(elapsedTime * 0.35 + y * 1.1))

    let woundDepth = 0
    let woundRidge = 0

    for (const wound of this.wounds) {
      const dx = x - wound.x
      const dy = (y - wound.y) * 1.18
      const dist = Math.sqrt(dx * dx + dy * dy)
      const radius = Math.max(0.0001, this.woundRadiusFor(wound))
      const n = dist / radius
      if (n >= 1.25) continue

      const crater = smoothPulse(Math.min(n, 1))
      const intensity = this.woundIntensity01(wound)
      const presence = this.woundPresence01(wound)
      woundDepth += crater * this.params.woundDepth * THREE.MathUtils.lerp(0.34, 0.54, intensity) * presence

      const ridgeT = THREE.MathUtils.clamp(1 - Math.abs(n - 0.92) / 0.22, 0, 1)
      woundRidge += ridgeT * ridgeT * this.params.woundDepth * THREE.MathUtils.lerp(0.1, 0.16, intensity) * presence
    }

    return baseBulge + sway - woundDepth + woundRidge
  }

  private sampleSurface(x: number, y: number, elapsedTime: number): SurfaceFrame {
    const eps = 0.02

    const z = this.surfaceZ(x, y, elapsedTime)
    const zx0 = this.surfaceZ(x - eps, y, elapsedTime)
    const zx1 = this.surfaceZ(x + eps, y, elapsedTime)
    const zy0 = this.surfaceZ(x, y - eps, elapsedTime)
    const zy1 = this.surfaceZ(x, y + eps, elapsedTime)

    tmpPos.set(x, y, z)
    tmpTangentX.set(2 * eps, 0, zx1 - zx0).normalize()
    tmpTangentY.set(0, 2 * eps, zy1 - zy0).normalize()
    tmpNormal.crossVectors(tmpTangentX, tmpTangentY).normalize()

    return {
      position: tmpPos,
      tangentX: tmpTangentX,
      tangentY: tmpTangentY,
      normal: tmpNormal,
    }
  }

  private updatePatch(elapsedTime: number): void {
    const position = this.patchGeometry.attributes.position

    for (let i = 0; i < position.count; i++) {
      const x = this.basePatchPositions[i * 3]
      const y = this.basePatchPositions[i * 3 + 1]
      position.setXYZ(i, x, y, this.surfaceZ(x, y, elapsedTime))
    }

    position.needsUpdate = true
    this.patchGeometry.computeVertexNormals()
  }

  private updateScales(elapsedTime: number): void {
    const rowStep = PATCH_HEIGHT / (ROWS + 2.6)
    const topY = PATCH_HEIGHT * 0.42
    let instanceIndex = 0

    this.layoutDriver.forEachLaidOutLine({
      spanMin: -PATCH_WIDTH * 0.5,
      spanMax: PATCH_WIDTH * 0.5,
      lineCoordAtRow: (row) => topY - row * rowStep,
      getMaxWidth: (slot) => this.getSlotMaxWidth(slot, elapsedTime),
      onLine: ({ slot, glyphs }) => {
        instanceIndex = this.projectLine(slot, glyphs, elapsedTime, instanceIndex)
      },
    })

    this.scaleMesh.count = instanceIndex
    this.scaleMesh.instanceMatrix.needsUpdate = true
    if (this.scaleMesh.instanceColor) {
      this.scaleMesh.instanceColor.needsUpdate = true
    }
  }

  private getSlotMaxWidth(slot: SurfaceLayoutSlot, elapsedTime: number): number {
    const damage = this.damageAt(slot.spanCenter, slot.lineCoord)
    const surface = this.sampleSurface(slot.spanCenter, slot.lineCoord, elapsedTime)
    const arcWorld = slot.spanSize * Math.max(1, surface.tangentX.length())
    const widthMultiplier = THREE.MathUtils.lerp(1, this.params.woundNarrow, damage)
    return arcWorld * LAYOUT_PX_PER_WORLD * widthMultiplier
  }

  private projectLine(
    slot: SurfaceLayoutSlot,
    glyphs: readonly string[],
    elapsedTime: number,
    instanceIndex: number,
  ): number {
    const n = glyphs.length
    for (let k = 0; k < n; k++) {
      if (instanceIndex >= MAX_INSTANCES) break

      const glyph = glyphs[k]!
      const code = glyph.codePointAt(0) ?? 0
      const t01 = (k + 0.5) / n
      const x = slot.spanStart + t01 * slot.spanSize
      const y = slot.lineCoord
      const localDamage = this.damageAt(x, y)
      const frame = this.sampleSurface(x, y, elapsedTime)
      const scaleWidth = 0.145 + ((code >> 3) % 5) * 0.014
      const scaleHeight = 0.2 + (code % 7) * 0.016
      const scaleDepth = 0.05 + ((code >> 5) % 4) * 0.004
      const lift = BASE_SCALE_LIFT + localDamage * this.params.scaleLift * 0.18

      dummy.position.copy(frame.position).addScaledVector(frame.normal, lift)

      tmpMatrix.makeBasis(frame.tangentX, frame.tangentY, frame.normal)
      dummy.quaternion.setFromRotationMatrix(tmpMatrix)
      dummy.rotateX(0.28 + localDamage * 0.5)
      dummy.rotateZ(((code % 17) / 17 - 0.5) * 0.24)
      dummy.scale.set(
        scaleWidth * (1 - localDamage * 0.08),
        scaleHeight * (1 - localDamage * 0.12),
        scaleDepth * (1 + localDamage * 0.28),
      )
      dummy.updateMatrix()
      this.scaleMesh.setMatrixAt(instanceIndex, dummy.matrix)

      const hue = 0.44 + slot.row * 0.008 + (code % 11) * 0.003
      const saturation = THREE.MathUtils.lerp(0.22, 0.46, 1 - localDamage)
      const lightness = THREE.MathUtils.lerp(
        0.28,
        0.56,
        0.5 + Math.sin(slot.row * 0.35 + k * 0.3) * 0.25,
      )
      tmpColor.setHSL(hue, saturation, lightness)
      tmpColor.lerp(new THREE.Color('#3f332f'), localDamage * 0.72)
      this.scaleMesh.setColorAt(instanceIndex, tmpColor)

      instanceIndex++
    }

    return instanceIndex
  }
}

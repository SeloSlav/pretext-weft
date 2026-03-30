import * as THREE from 'three'
import type { PreparedSurfaceSource, SeedCursorFactory } from '../../core'
import { SurfaceLayoutDriver } from '../../core'
import { updateRecoveringImpacts } from '../../runtime'
import { createSurfaceEffect, recoverableDamage, skyLayout } from '../api'
import { getPreparedStarSurface } from './starSkySource'

export type StarSkyParams = {
  layoutDensity: number
  recoveryRate: number
}

export const DEFAULT_STAR_SKY_PARAMS: StarSkyParams = {
  layoutDensity: 1,
  recoveryRate: 0.38,
}

const SKY_RADIUS = 180
const ROWS = 18
const SECTORS = 64
const MAX_PER_SLOT = 2
const MAX_STARS = ROWS * SECTORS * MAX_PER_SLOT
const MIN_POLAR = 0.12
const MAX_POLAR = Math.PI * 0.48
const BASE_LAYOUT_PX = 48
const WOUND_RADIUS = 0.14
const MAX_WOUNDS = 8
const WOUND_PUSH = 0.42

const dummy = new THREE.Object3D()
const tmpColor = new THREE.Color()
const tmpDir = new THREE.Vector3()
const tmpLocal = new THREE.Vector3()
const tmpPush = new THREE.Vector3()
const tmpFallback = new THREE.Vector3()
const tmpInward = new THREE.Vector3()
const tmpForward = new THREE.Vector3(0, 0, 1)

type SkyWound = {
  x: number
  y: number
  z: number
  strength: number
}

function uhash(n: number): number {
  n = (n ^ 61) ^ (n >>> 16)
  n = Math.imul(n, 0x45d9f3b)
  n ^= n >>> 4
  n = Math.imul(n, 0xd3833e2d)
  n ^= n >>> 15
  return (n >>> 0) / 4294967296
}

function glyphHash(a: number, b: number, c = 0): number {
  return uhash(a ^ Math.imul(b, 0x9e3779b9) ^ Math.imul(c, 0x85ebca6b))
}

function starDensity(azimuth: number, polar: number): number {
  const band = Math.sin(azimuth * 1.35 + polar * 4.2) * 0.5 + 0.5
  const haze = Math.sin((azimuth - 1.1) * 0.75) * 0.5 + 0.5
  const horizonFade = THREE.MathUtils.smoothstep(MAX_POLAR, MIN_POLAR, polar)
  return 0.45 + band * 0.55 + haze * 0.25 + horizonFade * 0.15
}

function starColor(identity: number, twinkle: number, polar: number): THREE.Color {
  const t = uhash(identity * 2654435761)
  const hue = THREE.MathUtils.lerp(0.58, 0.12, t * 0.22)
  const sat = 0.18 + t * 0.22
  const zenithBoost = THREE.MathUtils.smoothstep(MAX_POLAR, MIN_POLAR, polar)
  const light = 0.72 + twinkle * 0.18 + zenithBoost * 0.12 + (identity % 7 - 3) * 0.012
  return tmpColor.setHSL(hue, sat, light)
}

export class StarSkyEffect {
  readonly group = new THREE.Group()

  private readonly geometry = new THREE.CircleGeometry(1, 6)
  private readonly material = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  private readonly starMesh = new THREE.InstancedMesh(this.geometry, this.material, MAX_STARS)
  private readonly layoutDriver: SurfaceLayoutDriver
  private readonly wounds: SkyWound[] = []
  private lastElapsed = 0
  private params: StarSkyParams

  constructor(
    surface: PreparedSurfaceSource,
    seedCursor: SeedCursorFactory,
    initialParams: StarSkyParams,
  ) {
    this.params = { ...initialParams }
    this.layoutDriver = new SurfaceLayoutDriver({
      surface,
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 9 + 3,
      seedCursor,
      staggerFactor: 0.5,
      minSpanFactor: 0.2,
    })

    this.starMesh.frustumCulled = false
    this.starMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.group.add(this.starMesh)
  }

  setParams(params: Partial<StarSkyParams>): void {
    this.params = { ...this.params, ...params }
  }

  addWoundFromWorldDirection(worldDirection: THREE.Vector3): void {
    tmpLocal.copy(worldDirection).normalize()
    for (const wound of this.wounds) {
      const dot = wound.x * tmpLocal.x + wound.y * tmpLocal.y + wound.z * tmpLocal.z
      if (dot > Math.cos(WOUND_RADIUS * 0.7)) {
        wound.x = THREE.MathUtils.lerp(wound.x, tmpLocal.x, 0.3)
        wound.y = THREE.MathUtils.lerp(wound.y, tmpLocal.y, 0.3)
        wound.z = THREE.MathUtils.lerp(wound.z, tmpLocal.z, 0.3)
        tmpDir.set(wound.x, wound.y, wound.z).normalize()
        wound.x = tmpDir.x
        wound.y = tmpDir.y
        wound.z = tmpDir.z
        wound.strength = 1
        return
      }
    }

    this.wounds.unshift({
      x: tmpLocal.x,
      y: tmpLocal.y,
      z: tmpLocal.z,
      strength: 1,
    })
    if (this.wounds.length > MAX_WOUNDS) this.wounds.length = MAX_WOUNDS
  }

  clearWounds(): void {
    this.wounds.length = 0
  }

  hasWounds(): boolean {
    return this.wounds.length > 0
  }

  update(elapsedTime: number): void {
    const delta = this.lastElapsed === 0 ? 0 : Math.min(0.05, elapsedTime - this.lastElapsed)
    this.lastElapsed = elapsedTime
    updateRecoveringImpacts(this.wounds, this.params.recoveryRate, delta)
    this.updateStars(elapsedTime)
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }

  private deformDirection(dir: THREE.Vector3): THREE.Vector3 {
    for (const wound of this.wounds) {
      const s = THREE.MathUtils.clamp(wound.strength, 0, 1)
      const dot = THREE.MathUtils.clamp(wound.x * dir.x + wound.y * dir.y + wound.z * dir.z, -1, 1)
      const radius = WOUND_RADIUS * Math.max(s, 0.001)
      // angle >= radius  <=>  dot <= cos(radius); skip cheaply before acos
      if (dot <= Math.cos(radius)) continue

      const angle = Math.acos(dot)
      const t = 1 - angle / radius
      const push = t * t * WOUND_PUSH * s
      tmpPush.set(
        dir.x - wound.x * dot,
        dir.y - wound.y * dot,
        dir.z - wound.z * dot,
      )

      if (tmpPush.lengthSq() < 1e-6) {
        tmpFallback.set(0, 1, 0)
        if (Math.abs(wound.y) > 0.95) tmpFallback.set(1, 0, 0)
        tmpPush.crossVectors(tmpFallback, dir)
      }

      tmpPush.normalize()
      dir.addScaledVector(tmpPush, push).normalize()
    }
    return dir
  }

  private updateStars(elapsedTime: number): void {
    let instanceIndex = 0
    const hasWounds = this.wounds.length > 0
    const polarJitterScale = ((MAX_POLAR - MIN_POLAR) / ROWS) * 0.55

    this.layoutDriver.forEachLaidOutLine({
      spanMin: 0,
      spanMax: Math.PI * 2,
      lineCoordAtRow: (row) => THREE.MathUtils.lerp(MIN_POLAR, MAX_POLAR, row / (ROWS - 1)),
      getMaxWidth: (slot) => BASE_LAYOUT_PX * this.params.layoutDensity * starDensity(slot.spanCenter, slot.lineCoord),
      onLine: ({ slot, resolvedGlyphs }) => {
        const n = resolvedGlyphs.length
        for (let k = 0; k < n && k < MAX_PER_SLOT; k++) {
          if (instanceIndex >= MAX_STARS) break
          const token = resolvedGlyphs[k]!
          const identity = token.ordinal + 1
          const hashA = glyphHash(identity, slot.row, k)
          const hashB = glyphHash(identity + 1, slot.sector, k ^ 0xa7)
          const azimuth = slot.spanStart + (hashA * 0.84 + 0.08) * slot.spanSize
          const polar = slot.lineCoord + (hashB - 0.5) * polarJitterScale

          const sinP = Math.sin(polar)
          tmpDir.set(
            Math.cos(azimuth) * sinP,
            Math.cos(polar),
            Math.sin(azimuth) * sinP,
          )
          if (hasWounds) this.deformDirection(tmpDir)

          const radius = SKY_RADIUS - hashB * 6
          const twinkle = Math.sin(elapsedTime * (1.1 + hashA * 1.7) + hashB * Math.PI * 2) * 0.5 + 0.5
          const size = (0.18 + hashA * 0.48 + (identity % 5) * 0.03 + (identity % 4) * 0.02 - 0.03) * (0.7 + twinkle * 0.6)

          dummy.position.copy(tmpDir).multiplyScalar(radius)
          tmpInward.copy(tmpDir).multiplyScalar(-1)
          dummy.quaternion.setFromUnitVectors(tmpForward, tmpInward)
          dummy.rotateZ(hashB * Math.PI * 2)
          dummy.scale.setScalar(size)
          dummy.updateMatrix()

          this.starMesh.setMatrixAt(instanceIndex, dummy.matrix)
          this.starMesh.setColorAt(instanceIndex, starColor(identity, twinkle, polar))
          instanceIndex++
        }
      },
    })

    this.starMesh.count = instanceIndex
    this.starMesh.instanceMatrix.needsUpdate = true
    if (this.starMesh.instanceColor) {
      this.starMesh.instanceColor.needsUpdate = true
    }
  }
}

export type CreateStarSkyEffectOptions = {
  seedCursor: SeedCursorFactory
  surface?: PreparedSurfaceSource
  initialParams?: StarSkyParams
}

export function createStarSkyEffect({
  seedCursor,
  surface = getPreparedStarSurface(),
  initialParams = DEFAULT_STAR_SKY_PARAMS,
}: CreateStarSkyEffectOptions): StarSkyEffect {
  const effect = createSurfaceEffect({
    id: 'star-sky',
    source: surface,
    layout: skyLayout({
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 9 + 3,
      staggerFactor: 0.5,
      minSpanFactor: 0.2,
    }),
    behaviors: [
      recoverableDamage({
        radius: WOUND_RADIUS,
        recoveryRate: initialParams.recoveryRate,
        strength: 1,
      }),
    ],
    seedCursor,
  })

  return new StarSkyEffect(effect.source, seedCursor, initialParams)
}

import * as THREE from 'three'
import type { PreparedSurfaceSource } from '../skinText'
import type { FireTokenId, FireTokenMeta } from './fireSurfaceText'
import { updateRecoveringImpacts } from './recovery'
import { SurfaceLayoutDriver } from './surfaceLayoutCore'
import type { SeedCursorFactory } from './types'

// Fire wall: a wide rectangular curtain of flame particles.
// Rows = height bands, sectors = horizontal slices across the wall width.
// Shooting punches a 2D hole (x, y) in the wall that recovers over time.
//
// This is the showcase: a dense field of particles where suppression is
// immediately visible as a clean gap, demonstrating the pretext scatter system.

const WALL_WIDTH = 14       // world units wide
const WALL_HEIGHT = 4.5     // world units tall
const WALL_DEPTH = 0.55     // thickness — particles scatter in Z
const ROWS = 18
const SECTORS = 40
const MAX_PER_SLOT = 4
const MAX_PARTICLES = ROWS * SECTORS * MAX_PER_SLOT  // 2880
const LAYOUT_PX_PER_SLOT = 120

// Wound is a 2D circle in (x, y) wall space.
const BASE_LIFETIME = 1.6
const LIFETIME_VARIANCE = 1.0
const PARTICLE_BASE_SIZE = 0.22
const PARTICLE_SIZE_VARIANCE = 0.14

export type FireWallParams = {
  recoveryRate: number   // how fast holes close [0.01 = very slow, 0.3 = fast]
  holeSize: number       // radius multiplier for punched holes [0.5 = small, 2.0 = huge]
}

export const DEFAULT_FIRE_WALL_PARAMS: FireWallParams = {
  recoveryRate: 0.35,
  holeSize: 1.0,
}

const dummy = new THREE.Object3D()
const tmpColor = new THREE.Color()
const tmpLocalPoint = new THREE.Vector3()

// ─── hash utilities ───────────────────────────────────────────────────────────

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

function lineSignature(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967296
}

// ─── fire color ───────────────────────────────────────────────────────────────
// White-yellow core at base → orange mid → deep red at top tip.

function fireColor(age01: number, rowNorm: number, identity: number, meta: FireTokenMeta): THREE.Color {
  // Hot white core at base, transitioning to yellow, then orange, then deep red.
  const baseHue = THREE.MathUtils.lerp(0.12, 0.02, rowNorm) + meta.heatBias * 0.06
  const hue = THREE.MathUtils.lerp(baseHue, 0.0, age01 * 0.7)
  const sat = 1.0
  // Brightness: base is very bright (white-ish), tip is dark.
  const light = THREE.MathUtils.lerp(0.9, 0.15, age01 * 0.9 + rowNorm * 0.1)
  const nudge = (uhash(identity * 2654435761) - 0.5) * 0.03
  return tmpColor.setHSL(hue + nudge, sat, light).clone()
}

// ─── wound type ───────────────────────────────────────────────────────────────

type FireWound = {
  // Position in wall-local space (x = horizontal, y = vertical).
  wx: number
  wy: number
  strength: number
}

// ─── geometry ─────────────────────────────────────────────────────────────────

function makeParticleGeometry(): THREE.BufferGeometry {
  return new THREE.CircleGeometry(1.0, 7)
}

function makeInteractionGeometry(): THREE.BufferGeometry {
  // Flat box the raycaster hits — covers the full wall face.
  return new THREE.PlaneGeometry(WALL_WIDTH, WALL_HEIGHT)
}

// ─── sample class ─────────────────────────────────────────────────────────────

export class FireParticleSample {
  readonly group = new THREE.Group()
  readonly interactionMesh: THREE.Mesh

  private readonly particleGeometry = makeParticleGeometry()
  private readonly interactionGeometry = makeInteractionGeometry()

  private readonly particleMaterial = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  })
  private readonly interactionMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  })

  private readonly particleMesh = new THREE.InstancedMesh(
    this.particleGeometry,
    this.particleMaterial,
    MAX_PARTICLES,
  )
  private readonly baseGeometry = new THREE.CylinderGeometry(0.36, 0.42, 0.24, 8, 1)
  private readonly baseMaterial = new THREE.MeshStandardMaterial({
    color: '#2e1f10',
    roughness: 0.95,
    metalness: 0.0,
  })
  private readonly baseMesh = new THREE.Mesh(this.baseGeometry, this.baseMaterial)
  private readonly layoutDriver: SurfaceLayoutDriver<FireTokenId, FireTokenMeta>
  private readonly wounds: FireWound[] = []
  private params: FireWallParams = { ...DEFAULT_FIRE_WALL_PARAMS }

  // Age indexed by (row * SECTORS + sector) * MAX_PER_SLOT + k.
  private readonly particleAge = new Float32Array(MAX_PARTICLES)
  private readonly particleLifetime = new Float32Array(MAX_PARTICLES)
  private readonly particlePhase = new Float32Array(MAX_PARTICLES)

  private lastElapsed = 0

  constructor(surface: PreparedSurfaceSource<FireTokenId, FireTokenMeta>, seedCursor: SeedCursorFactory) {
    this.layoutDriver = new SurfaceLayoutDriver({
      surface,
      rows: ROWS,
      sectors: SECTORS,
      advanceForRow: (row) => row * 7 + 3,
      seedCursor,
      staggerFactor: 0.5,
      minSpanFactor: 0.1,
    })

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const lt = BASE_LIFETIME + uhash(i * 7919) * LIFETIME_VARIANCE
      this.particleLifetime[i] = lt
      this.particleAge[i] = uhash(i * 3571) * lt
      this.particlePhase[i] = uhash(i * 1234567) * Math.PI * 2
    }

    this.particleMesh.frustumCulled = false
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

    this.baseMesh.position.y = 0.12
    // Interaction plane faces the player (toward +Z).
    this.interactionMesh = new THREE.Mesh(this.interactionGeometry, this.interactionMaterial)
    this.interactionMesh.position.y = WALL_HEIGHT * 0.5

    this.group.add(this.baseMesh)
    this.group.add(this.particleMesh)
    this.group.add(this.interactionMesh)
  }

  setParams(params: Partial<FireWallParams>): void {
    this.params = { ...this.params, ...params }
  }

  addWoundFromWorldPoint(worldPoint: THREE.Vector3): void {
    tmpLocalPoint.copy(worldPoint)
    this.group.worldToLocal(tmpLocalPoint)
    // Wall-local coords: x = horizontal, y = vertical above group origin.
    const wx = tmpLocalPoint.x
    const wy = tmpLocalPoint.y
    const rx = 2.2 * this.params.holeSize
    const ry = 1.8 * this.params.holeSize
    for (const w of this.wounds) {
      const dx = (w.wx - wx) / rx
      const dy = (w.wy - wy) / ry
      if (dx * dx + dy * dy < 1.0) {
        w.strength = Math.min(1.0, w.strength + 0.4)
        return
      }
    }
    this.wounds.unshift({ wx, wy, strength: 1.0 })
    if (this.wounds.length > 6) this.wounds.pop()
  }

  clearWounds(): void {
    this.wounds.length = 0
  }

  update(elapsedTime: number): void {
    const delta = this.lastElapsed === 0 ? 0 : Math.min(0.05, elapsedTime - this.lastElapsed)
    this.lastElapsed = elapsedTime
    updateRecoveringImpacts(this.wounds, this.params.recoveryRate, delta)
    this.updateParticles(elapsedTime, delta)
  }

  dispose(): void {
    this.particleGeometry.dispose()
    this.baseGeometry.dispose()
    this.interactionGeometry.dispose()
    this.particleMaterial.dispose()
    this.baseMaterial.dispose()
    this.interactionMaterial.dispose()
  }

  // ─── wound test ───────────────────────────────────────────────────────────
  // Returns false if (px, py) in wall-local space is inside any active wound.
  private woundSuppresses(px: number, py: number): boolean {
    const baseRx = 2.2 * this.params.holeSize
    const baseRy = 1.8 * this.params.holeSize
    for (const w of this.wounds) {
      const s = THREE.MathUtils.clamp(w.strength, 0, 1)
      const dx = (px - w.wx) / (baseRx * s)
      const dy = (py - w.wy) / (baseRy * s)
      if (dx * dx + dy * dy < 1.0) return true
    }
    return false
  }

  // ─── layout + projection ──────────────────────────────────────────────────

  private updateParticles(elapsedTime: number, delta: number): void {
    let instanceIndex = 0

    // spanMin/spanMax map to horizontal wall extent [-W/2, +W/2].
    // lineCoordAtRow maps row → height [0, WALL_HEIGHT].
    this.layoutDriver.forEachLaidOutLine({
      spanMin: -WALL_WIDTH * 0.5,
      spanMax:  WALL_WIDTH * 0.5,
      lineCoordAtRow: (row) => (row / (ROWS - 1)) * WALL_HEIGHT,
      getMaxWidth: () => LAYOUT_PX_PER_SLOT,
      onLine: ({ slot, resolvedGlyphs, tokenLineKey }) => {
        const lineSeed = lineSignature(tokenLineKey)
        const n = resolvedGlyphs.length
        for (let k = 0; k < n && k < MAX_PER_SLOT; k++) {
          if (instanceIndex >= MAX_PARTICLES) break

          const ageIdx = (slot.row * SECTORS + slot.sector) * MAX_PER_SLOT + k
          const token = resolvedGlyphs[k]!
          const identity = token.ordinal + 1

          // Advance age, respawn when expired.
          const lifetime = this.particleLifetime[ageIdx] ?? BASE_LIFETIME
          let age = (this.particleAge[ageIdx] ?? 0) + delta
          if (age >= lifetime) {
            age = 0
            this.particleLifetime[ageIdx] = BASE_LIFETIME + uhash((ageIdx ^ (elapsedTime * 100 | 0)) * 7919) * LIFETIME_VARIANCE
          }
          this.particleAge[ageIdx] = age
          const age01 = age / lifetime

          const hashLat = glyphHash(identity, slot.row, k)
          const hashDep = glyphHash(identity + 1, slot.sector, k ^ 0xef)
          const hashR   = glyphHash(identity + 3, slot.row ^ slot.sector, k ^ 0x1f)

          // Horizontal position within this sector slot.
          const px = slot.spanStart + (hashLat * 0.84 + 0.08) * slot.spanSize

          // Vertical: base row height + upward drift over lifetime.
          const driftRange = (WALL_HEIGHT / ROWS) * (0.7 + (slot.row / (ROWS - 1)) * 0.5)
          const py = slot.lineCoord + age01 * driftRange * (0.5 + hashDep * 0.9)

          // Skip if inside a wound — particle simply doesn't exist.
          if (this.woundSuppresses(px, py)) continue

          const rowNorm = slot.row / (ROWS - 1)
          const phase = this.particlePhase[ageIdx] ?? 0

          // Depth scatter — particles billow toward viewer as they age.
          const pz = (hashR - 0.5) * WALL_DEPTH + age01 * WALL_DEPTH * 0.6
          const wobbleX = Math.sin(elapsedTime * 2.8 + phase + lineSeed * 3.1) * 0.06
          const wobbleY = Math.cos(elapsedTime * 2.1 + phase * 0.7) * 0.04

          const baseSize = PARTICLE_BASE_SIZE + token.meta.sizeBias + uhash(identity * 987654) * PARTICLE_SIZE_VARIANCE
          const rowShrink = 1.0 - rowNorm * 0.5
          const ageFade = Math.max(0, 1 - age01 * age01)
          const size = baseSize * ageFade * rowShrink * (0.85 + Math.sin(phase + elapsedTime * 4.5) * 0.15)

          dummy.position.set(px + wobbleX, py + wobbleY, pz)
          dummy.rotation.set(0, 0, age01 * Math.PI * (hashR > 0.5 ? 1 : -1))
          dummy.scale.setScalar(size)
          dummy.updateMatrix()
          this.particleMesh.setMatrixAt(instanceIndex, dummy.matrix)
          this.particleMesh.setColorAt(instanceIndex, fireColor(age01, rowNorm, identity, token.meta))

          instanceIndex++
        }
      },
    })

    this.particleMesh.count = instanceIndex
    this.particleMesh.instanceMatrix.needsUpdate = true
    if (this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true
    }
  }
}

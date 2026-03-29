import * as THREE from 'three'
import { CROSS_EXTENT, CROSS_HALF_WIDTH, TOWN_ROAD_SURFACE_Y } from './townRoadMask'
import { WINDOW_GLASS_LAYOUTS } from './playgroundWorld'

/** Lamp foot positions (world XZ); used by the playground for Weft lamp targets. */
export const STREET_LIGHT_XZ = [
  { x: -9, z: 9 },
  { x: 9, z: 9 },
  { x: -9, z: -9 },
  { x: 9, z: -9 },
] as const

/** Bulb center height above `TOWN_ROAD_SURFACE_Y` (matches pole + lamp geometry). */
export const STREET_LAMP_BULB_Y_OFFSET = 5.1

export type TownIntersectionScene = {
  root: THREE.Group
  /** One point light per street lamp; intensity driven by glass damage in the runtime. */
  lampLights: THREE.PointLight[]
  /** Emissive globe meshes paired with `lampLights` by index. */
  lampGlobes: THREE.Mesh[]
}

function createAsphaltTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 1024
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }

  const base = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  base.addColorStop(0, '#1a1f28')
  base.addColorStop(0.38, '#252a35')
  base.addColorStop(0.62, '#1e232d')
  base.addColorStop(1, '#2a3140')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (let i = 0; i < 140000; i++) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    const g = 8 + Math.random() * 22
    ctx.fillStyle = `rgba(${g},${g + 8},${g + 14},${0.02 + Math.random() * 0.06})`
    ctx.fillRect(x, y, 1.2, 1.2)
  }

  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    const w = 1 + Math.random() * 2.5
    ctx.strokeStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.04})`
    ctx.lineWidth = w
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40)
    ctx.stroke()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(6, 6)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function createRoadStripeTexture(): THREE.CanvasTexture {
  const w = 256
  const h = 64
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }
  ctx.fillStyle = 'rgba(0,0,0,0)'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#f2d65c'
  const dash = 22
  const gap = 14
  for (let x = 0; x < w; x += dash + gap) {
    ctx.fillRect(x, 12, dash, 40)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/**
 * Edge-of-town intersection: cross asphalt, yellow markings, curbs, simple blocks, poles.
 */
export function createTownIntersectionScene(): TownIntersectionScene {
  const root = new THREE.Group()
  root.name = 'townIntersection'
  const lampLights: THREE.PointLight[] = []
  const lampGlobes: THREE.Mesh[] = []

  const asphaltMap = createAsphaltTexture()
  const asphaltMat = new THREE.MeshStandardMaterial({
    map: asphaltMap,
    roughness: 0.88,
    metalness: 0.08,
    color: '#ffffff',
  })

  const leg = CROSS_EXTENT + 1.5
  const halfW = CROSS_HALF_WIDTH
  const roadY = TOWN_ROAD_SURFACE_Y

  const hRoad = new THREE.Mesh(new THREE.PlaneGeometry(leg * 2, halfW * 2), asphaltMat)
  hRoad.rotation.x = -Math.PI / 2
  hRoad.position.set(0, roadY, 0)
  root.add(hRoad)

  const vRoad = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, leg * 2), asphaltMat.clone())
  vRoad.material.map = asphaltMap
  vRoad.rotation.x = -Math.PI / 2
  vRoad.position.set(0, roadY + 0.001, 0)
  root.add(vRoad)

  const stripeTex = createRoadStripeTexture()
  const stripeMat = new THREE.MeshBasicMaterial({
    map: stripeTex,
    transparent: true,
    depthWrite: false,
    color: '#fff8c8',
  })
  stripeMat.map!.repeat.set(14, 1)

  const centerStripe = new THREE.Mesh(new THREE.PlaneGeometry(leg * 2 - 4, 0.35), stripeMat)
  centerStripe.rotation.x = -Math.PI / 2
  centerStripe.position.set(0, roadY + 0.004, 0)
  root.add(centerStripe)

  const edgeStripeN = new THREE.Mesh(new THREE.PlaneGeometry(leg * 2 - 4, 0.22), stripeMat.clone())
  edgeStripeN.material = stripeMat.clone()
  edgeStripeN.rotation.x = -Math.PI / 2
  edgeStripeN.position.set(0, roadY + 0.004, -halfW + 0.35)
  root.add(edgeStripeN)

  const edgeStripeS = edgeStripeN.clone()
  edgeStripeS.position.set(0, roadY + 0.004, halfW - 0.35)
  root.add(edgeStripeS)

  const curbMat = new THREE.MeshStandardMaterial({ color: '#3a3f48', roughness: 0.92, metalness: 0.05 })
  const curbH = 0.14
  const curbT = 0.38
  const curbLen = leg * 2 + 2

  const curbN = new THREE.Mesh(new THREE.BoxGeometry(curbLen, curbH, curbT), curbMat)
  curbN.position.set(0, roadY - curbH * 0.35, -halfW - curbT * 0.45)
  root.add(curbN)
  const curbS = curbN.clone()
  curbS.position.set(0, roadY - curbH * 0.35, halfW + curbT * 0.45)
  root.add(curbS)

  const curbE = new THREE.Mesh(new THREE.BoxGeometry(curbT, curbH, curbLen), curbMat)
  curbE.position.set(halfW + curbT * 0.45, roadY - curbH * 0.35, 0)
  root.add(curbE)
  const curbW = curbE.clone()
  curbW.position.set(-halfW - curbT * 0.45, roadY - curbH * 0.35, 0)
  root.add(curbW)

  const buildingMat = new THREE.MeshStandardMaterial({
    color: '#2c3544',
    emissive: '#1a2230',
    emissiveIntensity: 0.15,
    roughness: 0.78,
    metalness: 0.12,
  })
  const trimMat = new THREE.MeshStandardMaterial({ color: '#4a5a6e', roughness: 0.65, metalness: 0.25 })

  const north = new THREE.Mesh(new THREE.BoxGeometry(26, 9, 4.5), buildingMat)
  north.position.set(0, 4.2, -17.5)
  root.add(north)
  const northTrim = new THREE.Mesh(new THREE.BoxGeometry(26.2, 0.35, 4.7), trimMat)
  northTrim.position.set(0, 7.8, -17.5)
  root.add(northTrim)

  const west = new THREE.Mesh(new THREE.BoxGeometry(4.5, 7, 14), buildingMat)
  west.position.set(-14.5, 3.4, 2)
  root.add(west)

  const east = new THREE.Mesh(new THREE.BoxGeometry(4.5, 6, 12), buildingMat)
  east.position.set(15, 3, -4)
  root.add(east)

  const windowPaneMat = new THREE.MeshStandardMaterial({
    color: '#8cb7d2',
    emissive: '#27465f',
    emissiveIntensity: 0.24,
    roughness: 0.14,
    metalness: 0.02,
    transparent: true,
    opacity: 0.5,
  })
  const windowFrameMat = new THREE.MeshStandardMaterial({
    color: '#516270',
    roughness: 0.62,
    metalness: 0.22,
  })

  for (const layout of WINDOW_GLASS_LAYOUTS) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 4.4), windowPaneMat.clone())
    pane.position.set(layout.x, layout.y, layout.z)
    pane.rotation.y = layout.rotationY
    pane.scale.set(layout.scaleX * 0.9, layout.scaleY * 0.9, 1)
    pane.translateZ(-0.05)
    root.add(pane)

    const frame = new THREE.Mesh(new THREE.BoxGeometry(5.8, 4.4, 0.08), windowFrameMat)
    frame.position.set(layout.x, layout.y, layout.z)
    frame.rotation.y = layout.rotationY
    frame.scale.set(layout.scaleX, layout.scaleY, layout.scaleZ * 0.5)
    frame.translateZ(-0.08)
    root.add(frame)
  }

  const poleMat = new THREE.MeshStandardMaterial({ color: '#3a4555', roughness: 0.55, metalness: 0.4 })
  const lampMat = new THREE.MeshStandardMaterial({
    color: '#ffe8b8',
    emissive: '#ffd080',
    emissiveIntensity: 0.85,
    roughness: 0.35,
  })

  function addStreetlight(x: number, z: number): void {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.2, 8), poleMat)
    pole.position.set(x, 2.6 + roadY, z)
    root.add(pole)
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 12), lampMat.clone())
    const bulbY = STREET_LAMP_BULB_Y_OFFSET + roadY
    lamp.position.set(x, bulbY, z)
    root.add(lamp)
    lampGlobes.push(lamp)

    const glow = new THREE.PointLight('#fff6e8', 2.35, 17, 1.65)
    glow.position.set(x, bulbY, z)
    root.add(glow)
    lampLights.push(glow)
  }

  for (const { x, z } of STREET_LIGHT_XZ) {
    addStreetlight(x, z)
  }

  return { root, lampLights, lampGlobes }
}

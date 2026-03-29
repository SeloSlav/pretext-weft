import * as THREE from 'three'
import { FISH_SCALE_PATCH_HEIGHT, FISH_SCALE_PATCH_WIDTH } from '../weft/three/presets/fishScale'
import { CROSS_EXTENT, CROSS_HALF_WIDTH, TOWN_ROAD_SURFACE_Y } from './townRoadMask'
import {
  HOLLOW_BUILDING_WALL_THICKNESS,
  INTERIOR_FLOOR_Y,
  STREET_LAMP_GLOBE_EMISSIVE_MAX,
  STREET_LAMP_POINT_INTENSITY_MAX,
  IVY_WALL_LAYOUT,
  SHUTTER_WALL_LAYOUT,
  WINDOW_GLASS_LAYOUTS,
} from './playgroundWorld'

/** Lamp foot positions (world XZ); used by the playground for Weft lamp targets. */
export const STREET_LIGHT_XZ = [
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
  /** Wall and roof shell meshes used for third-person camera obstruction. */
  cameraObstacles: THREE.Object3D[]
}

type HollowBuildingOptions = {
  x: number
  y: number
  z: number
  width: number
  height: number
  depth: number
  wallThickness?: number
  roofThickness?: number
  floorThickness?: number
  lightRange?: number
  floorWorldY?: number
  southOpening?: WallOpening
  eastOpening?: WallOpening
}

type WallOpening = {
  centerAlong: number
  width: number
  centerWorldY: number
  height: number
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

function createInteriorConcreteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 768
  canvas.height = 768
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }

  const base = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  base.addColorStop(0, '#5e646b')
  base.addColorStop(0.5, '#747a82')
  base.addColorStop(1, '#4f565d')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (let i = 0; i < 70000; i++) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    const shade = 95 + Math.random() * 55
    ctx.fillStyle = `rgba(${shade},${shade},${shade + 4},${0.03 + Math.random() * 0.08})`
    ctx.fillRect(x, y, 1.4, 1.4)
  }

  for (let i = 0; i < 1800; i++) {
    const x = Math.random() * canvas.width
    const y = Math.random() * canvas.height
    const length = 8 + Math.random() * 26
    ctx.strokeStyle = `rgba(30, 34, 40, ${0.025 + Math.random() * 0.05})`
    ctx.lineWidth = 0.8 + Math.random() * 1.8
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + (Math.random() - 0.5) * length, y + (Math.random() - 0.5) * length)
    ctx.stroke()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(2.2, 2.2)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function addHollowBuilding(
  root: THREE.Group,
  options: HollowBuildingOptions,
  wallMat: THREE.Material,
  floorMat: THREE.Material,
): { group: THREE.Group; cameraObstacles: THREE.Object3D[] } {
  const {
    x,
    y,
    z,
    width,
    height,
    depth,
    wallThickness = HOLLOW_BUILDING_WALL_THICKNESS,
    roofThickness = 0.24,
    floorThickness = 0.12,
    lightRange = 14,
    floorWorldY = INTERIOR_FLOOR_Y,
    southOpening,
    eastOpening,
  } = options

  const group = new THREE.Group()
  group.position.set(x, y, z)

  const halfW = width * 0.5
  const halfH = height * 0.5
  const halfD = depth * 0.5
  const innerDepth = Math.max(0.2, depth - wallThickness * 2)

  const cameraObstacles: THREE.Object3D[] = []
  const minPanel = 0.04

  const addObstacleMesh = (geometry: THREE.BufferGeometry, px: number, py: number, pz: number): void => {
    const mesh = new THREE.Mesh(geometry, wallMat)
    mesh.position.set(px, py, pz)
    group.add(mesh)
    cameraObstacles.push(mesh)
  }

  const getClampedOpening = (
    opening: WallOpening | undefined,
    spanHalf: number,
    wallHalfHeight: number,
  ): { minAlong: number; maxAlong: number; minY: number; maxY: number } | null => {
    if (!opening) return null
    const minAlong = THREE.MathUtils.clamp(opening.centerAlong - opening.width * 0.5, -spanHalf, spanHalf)
    const maxAlong = THREE.MathUtils.clamp(opening.centerAlong + opening.width * 0.5, -spanHalf, spanHalf)
    const localCenterY = opening.centerWorldY - y
    const minY = THREE.MathUtils.clamp(localCenterY - opening.height * 0.5, -wallHalfHeight, wallHalfHeight)
    const maxY = THREE.MathUtils.clamp(localCenterY + opening.height * 0.5, -wallHalfHeight, wallHalfHeight)
    if (maxAlong - minAlong <= minPanel || maxY - minY <= minPanel) return null
    return { minAlong, maxAlong, minY, maxY }
  }

  addObstacleMesh(new THREE.BoxGeometry(width, height, wallThickness), 0, 0, -halfD + wallThickness * 0.5)

  const southZ = halfD - wallThickness * 0.5
  const southCutout = getClampedOpening(southOpening, halfW, halfH)
  if (!southCutout) {
    addObstacleMesh(new THREE.BoxGeometry(width, height, wallThickness), 0, 0, southZ)
  } else {
    const leftWidth = southCutout.minAlong + halfW
    if (leftWidth > minPanel) {
      addObstacleMesh(
        new THREE.BoxGeometry(leftWidth, height, wallThickness),
        -halfW + leftWidth * 0.5,
        0,
        southZ,
      )
    }
    const rightWidth = halfW - southCutout.maxAlong
    if (rightWidth > minPanel) {
      addObstacleMesh(
        new THREE.BoxGeometry(rightWidth, height, wallThickness),
        southCutout.maxAlong + rightWidth * 0.5,
        0,
        southZ,
      )
    }
    const topHeight = halfH - southCutout.maxY
    if (topHeight > minPanel) {
      addObstacleMesh(
        new THREE.BoxGeometry(southCutout.maxAlong - southCutout.minAlong, topHeight, wallThickness),
        (southCutout.minAlong + southCutout.maxAlong) * 0.5,
        southCutout.maxY + topHeight * 0.5,
        southZ,
      )
    }
    const bottomHeight = southCutout.minY + halfH
    if (bottomHeight > minPanel) {
      addObstacleMesh(
        new THREE.BoxGeometry(southCutout.maxAlong - southCutout.minAlong, bottomHeight, wallThickness),
        (southCutout.minAlong + southCutout.maxAlong) * 0.5,
        -halfH + bottomHeight * 0.5,
        southZ,
      )
    }
  }

  addObstacleMesh(new THREE.BoxGeometry(wallThickness, height, innerDepth), -halfW + wallThickness * 0.5, 0, 0)

  const eastX = halfW - wallThickness * 0.5
  const eastCutout = getClampedOpening(eastOpening, halfD - wallThickness, halfH)
  if (!eastCutout) {
    addObstacleMesh(new THREE.BoxGeometry(wallThickness, height, innerDepth), eastX, 0, 0)
  } else {
    const northDepth = eastCutout.minAlong + (halfD - wallThickness)
    if (northDepth > minPanel) {
      addObstacleMesh(
        new THREE.BoxGeometry(wallThickness, height, northDepth),
        eastX,
        0,
        -(halfD - wallThickness) + northDepth * 0.5,
      )
    }
    const southDepth = (halfD - wallThickness) - eastCutout.maxAlong
    if (southDepth > minPanel) {
      addObstacleMesh(
        new THREE.BoxGeometry(wallThickness, height, southDepth),
        eastX,
        0,
        eastCutout.maxAlong + southDepth * 0.5,
      )
    }
    const topHeight = halfH - eastCutout.maxY
    if (topHeight > minPanel) {
      addObstacleMesh(
        new THREE.BoxGeometry(wallThickness, topHeight, eastCutout.maxAlong - eastCutout.minAlong),
        eastX,
        eastCutout.maxY + topHeight * 0.5,
        (eastCutout.minAlong + eastCutout.maxAlong) * 0.5,
      )
    }
    const bottomHeight = eastCutout.minY + halfH
    if (bottomHeight > minPanel) {
      addObstacleMesh(
        new THREE.BoxGeometry(wallThickness, bottomHeight, eastCutout.maxAlong - eastCutout.minAlong),
        eastX,
        -halfH + bottomHeight * 0.5,
        (eastCutout.minAlong + eastCutout.maxAlong) * 0.5,
      )
    }
  }

  const roof = new THREE.Mesh(new THREE.BoxGeometry(width, roofThickness, depth), wallMat)
  roof.position.set(0, halfH - roofThickness * 0.5, 0)
  group.add(roof)
  cameraObstacles.push(roof)

  const floor = new THREE.Mesh(new THREE.BoxGeometry(width - wallThickness * 2, floorThickness, depth - wallThickness * 2), floorMat)
  floor.position.set(0, floorWorldY - y + floorThickness * 0.5, 0)
  group.add(floor)

  const interiorLight = new THREE.PointLight('#d8e3ff', 0.42, lightRange, 2)
  interiorLight.position.set(0, Math.max(1.2, halfH - 1.1), 0)
  group.add(interiorLight)

  root.add(group)
  return {
    group,
    cameraObstacles,
  }
}

/**
 * Edge-of-town intersection: cross asphalt, yellow markings, curbs, simple blocks, poles.
 */
export function createTownIntersectionScene(): TownIntersectionScene {
  const root = new THREE.Group()
  root.name = 'townIntersection'
  const lampLights: THREE.PointLight[] = []
  const lampGlobes: THREE.Mesh[] = []
  const cameraObstacles: THREE.Object3D[] = []

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
    // Hollow shells use outward normals; from inside the room the interior faces read as back faces without this.
    side: THREE.DoubleSide,
  })
  const trimMat = new THREE.MeshStandardMaterial({
    color: '#4a5a6e',
    roughness: 0.65,
    metalness: 0.25,
    side: THREE.DoubleSide,
  })
  const interiorConcreteMap = createInteriorConcreteTexture()
  const interiorFloorMat = new THREE.MeshStandardMaterial({
    map: interiorConcreteMap,
    color: '#d6dbe0',
    emissive: '#0f141a',
    emissiveIntensity: 0.08,
    roughness: 0.97,
    metalness: 0.03,
  })

  const northShell = addHollowBuilding(root, {
    x: 0,
    y: 4.2,
    z: -19.5,
    width: 26,
    height: 9,
    depth: 8.5,
    lightRange: 18,
    southOpening: {
      centerAlong: SHUTTER_WALL_LAYOUT.x,
      width: FISH_SCALE_PATCH_WIDTH,
      centerWorldY: SHUTTER_WALL_LAYOUT.wallCenterHeight,
      height: FISH_SCALE_PATCH_HEIGHT,
    },
  }, buildingMat, interiorFloorMat)
  cameraObstacles.push(...northShell.cameraObstacles)
  const northTrim = new THREE.Mesh(new THREE.BoxGeometry(26.2, 0.35, 8.7), trimMat)
  northTrim.position.set(0, 7.8, -19.5)
  root.add(northTrim)

  const westShell = addHollowBuilding(root, {
    x: -16.5,
    y: 3.4,
    z: 2,
    width: 8.5,
    height: 7,
    depth: 14,
    lightRange: 14,
    eastOpening: {
      centerAlong: IVY_WALL_LAYOUT.z - 2,
      width: FISH_SCALE_PATCH_WIDTH,
      centerWorldY: IVY_WALL_LAYOUT.wallCenterHeight,
      height: FISH_SCALE_PATCH_HEIGHT,
    },
  }, buildingMat, interiorFloorMat)
  cameraObstacles.push(...westShell.cameraObstacles)

  const eastShell = addHollowBuilding(root, {
    x: 17,
    y: 3.5,
    z: -4,
    width: 8.5,
    height: 7,
    depth: 12,
    lightRange: 13,
  }, buildingMat, interiorFloorMat)
  cameraObstacles.push(...eastShell.cameraObstacles)

  const windowPaneMat = new THREE.MeshStandardMaterial({
    color: '#d9edf6',
    emissive: '#122230',
    emissiveIntensity: 0.08,
    roughness: 0.08,
    metalness: 0.05,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const windowFrameMat = new THREE.MeshStandardMaterial({
    color: '#516270',
    roughness: 0.62,
    metalness: 0.22,
    side: THREE.DoubleSide,
  })
  /** Solid “room interior” read behind glass — buildings are uncut boxes, so without this, holes show the wall shader. */
  const windowBackingMat = new THREE.MeshStandardMaterial({
    color: '#2a3848',
    emissive: '#141c28',  
    emissiveIntensity: 0.45,
    roughness: 1,
    metalness: 0,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    side: THREE.DoubleSide,
  })

  for (const layout of WINDOW_GLASS_LAYOUTS) {
    const backing = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 4.4), windowBackingMat)
    backing.position.set(layout.x, layout.y, layout.z)
    backing.rotation.y = layout.rotationY
    backing.scale.set(layout.scaleX * 0.88, layout.scaleY * 0.88, 1)
    // North (rotation ≈ 0): inset along −Z between pane (−0.05) and wall.
    // East (−π/2): local +Z is −world X. Pane ends at layout.x + 0.05; wall ~ +0.11 past layout.
    // Backing must sit *behind* the pane but *in front* of the wall — same idea as north, so use a
    // similar inset magnitude (~−0.08…−0.09), not −0.006 (that put the backing *in front of* the pane).
    if (Math.abs(layout.rotationY) < 0.01) {
      backing.translateZ(-0.14)
    } else {
      backing.translateZ(-0.088)
    }
    root.add(backing)

    const pane = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 4.4), windowPaneMat)
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
    emissiveIntensity: STREET_LAMP_GLOBE_EMISSIVE_MAX,
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

    const glow = new THREE.PointLight('#fff6e8', STREET_LAMP_POINT_INTENSITY_MAX, 22, 1.65)
    glow.position.set(x, bulbY, z)
    root.add(glow)
    lampLights.push(glow)
  }

  for (const { x, z } of STREET_LIGHT_XZ) {
    addStreetlight(x, z)
  }

  return {
    root,
    lampLights,
    lampGlobes,
    cameraObstacles,
  }
}

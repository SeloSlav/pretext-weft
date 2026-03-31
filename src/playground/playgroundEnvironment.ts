import * as THREE from 'three'

export type SkyMode = 'night' | 'day'

const SKY_RADIUS = 400
const BODY_RADIUS = SKY_RADIUS * 0.9

function directionFromUv(u: number, v: number, radius = BODY_RADIUS): THREE.Vector3 {
  const longitude = (u - 0.5) * Math.PI * 2
  const latitude = (0.5 - v) * Math.PI
  const cosLatitude = Math.cos(latitude)
  return new THREE.Vector3(
    Math.sin(longitude) * cosLatitude * radius,
    Math.sin(latitude) * radius,
    Math.cos(longitude) * cosLatitude * radius,
  )
}

function createCelestialDiscTexture(
  coreColor: string,
  glowStops: Array<[number, string]>,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace

  if (!ctx) {
    return texture
  }

  const cx = canvas.width * 0.5
  const cy = canvas.height * 0.5
  const glow = ctx.createRadialGradient(cx, cy, 8, cx, cy, canvas.width * 0.5)
  for (const [stop, color] of glowStops) {
    glow.addColorStop(stop, color)
  }
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = coreColor
  ctx.beginPath()
  ctx.arc(cx, cy, canvas.width * 0.12, 0, Math.PI * 2)
  ctx.fill()

  texture.needsUpdate = true
  return texture
}

function createCelestialDisc(
  texture: THREE.Texture,
  position: THREE.Vector3,
  diameter: number,
): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: false,
  })
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(diameter * 0.5, 48), material)
  mesh.position.copy(position)
  mesh.lookAt(0, 0, 0)
  return mesh
}

export type PlaygroundAtmosphere = {
  group: THREE.Group
  skybox: THREE.Mesh
  sun: THREE.Mesh
  moon: THREE.Mesh
}

function createNightSkyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 2048
  canvas.height = 1024
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas)
    fallback.colorSpace = THREE.SRGBColorSpace
    fallback.mapping = THREE.EquirectangularReflectionMapping
    return fallback
  }

  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height)
  grad.addColorStop(0, '#040916')
  grad.addColorStop(0.38, '#0b1730')
  grad.addColorStop(0.72, '#13284c')
  grad.addColorStop(1, '#24446c')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (let i = 0; i < 10; i++) {
    const y = canvas.height * (0.55 + i * 0.03)
    const haze = ctx.createLinearGradient(0, y, 0, y + canvas.height * 0.08)
    haze.addColorStop(0, 'rgba(130,170,255,0)')
    haze.addColorStop(1, `rgba(130,170,255,${0.015 + i * 0.003})`)
    ctx.fillStyle = haze
    ctx.fillRect(0, y, canvas.width, canvas.height * 0.08)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.mapping = THREE.EquirectangularReflectionMapping
  return texture
}

function createDaySkyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 2048
  canvas.height = 1024
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas)
    fallback.colorSpace = THREE.SRGBColorSpace
    fallback.mapping = THREE.EquirectangularReflectionMapping
    return fallback
  }

  // Blue sky gradient — deep azure at zenith fading to pale horizon
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height)
  grad.addColorStop(0, '#1a6fc4')
  grad.addColorStop(0.35, '#3a9de8')
  grad.addColorStop(0.72, '#7ec8f0')
  grad.addColorStop(1, '#c8e8f8')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Soft horizon haze
  for (let i = 0; i < 8; i++) {
    const y = canvas.height * (0.62 + i * 0.025)
    const haze = ctx.createLinearGradient(0, y, 0, y + canvas.height * 0.07)
    haze.addColorStop(0, 'rgba(200,230,255,0)')
    haze.addColorStop(1, `rgba(200,230,255,${0.018 + i * 0.004})`)
    ctx.fillStyle = haze
    ctx.fillRect(0, y, canvas.width, canvas.height * 0.07)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.mapping = THREE.EquirectangularReflectionMapping
  return texture
}

function createSkyboxMesh(mode: SkyMode): THREE.Mesh {
  const tex = mode === 'day' ? createDaySkyTexture() : createNightSkyTexture()
  const geometry = new THREE.SphereGeometry(SKY_RADIUS, 24, 16)
  const material = new THREE.MeshBasicMaterial({
    map: tex,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.renderOrder = -1
  return mesh
}

function createSunDisc(): THREE.Mesh {
  const texture = createCelestialDiscTexture('#fffde8', [
    [0, 'rgba(255,255,220,1)'],
    [0.12, 'rgba(255,240,160,0.85)'],
    [0.34, 'rgba(255,220,80,0.35)'],
    [0.7, 'rgba(255,200,60,0.08)'],
    [1, 'rgba(255,180,40,0)'],
  ])
  return createCelestialDisc(texture, directionFromUv(0.72, 0.18), 120)
}

function createMoonDisc(): THREE.Mesh {
  const texture = createCelestialDiscTexture('#dff0ff', [
    [0, 'rgba(225,240,255,0.95)'],
    [0.18, 'rgba(190,220,255,0.5)'],
    [1, 'rgba(120,170,255,0)'],
  ])
  return createCelestialDisc(texture, directionFromUv(0.18, 0.2), 90)
}

export function applyPlaygroundAtmosphere(scene: THREE.Scene): PlaygroundAtmosphere {
  const group = new THREE.Group()
  group.name = 'playground-atmosphere'
  group.frustumCulled = false

  const skybox = createSkyboxMesh('night')
  const sun = createSunDisc()
  const moon = createMoonDisc()
  sun.visible = false

  group.add(skybox, sun, moon)
  scene.add(group)
  scene.fog = new THREE.Fog('#0a1022', 28, 260)
  return { group, skybox, sun, moon }
}

export type PlaygroundLighting = {
  ambient: THREE.AmbientLight
  hemi: THREE.HemisphereLight
  key: THREE.DirectionalLight
  fill: THREE.DirectionalLight
  rim: THREE.DirectionalLight
}

export function addPlaygroundLighting(scene: THREE.Scene): PlaygroundLighting {
  const ambient = new THREE.AmbientLight('#8fa8e8', 0.52)
  const hemi = new THREE.HemisphereLight('#4a6ab8', '#2a3448', 0.82)

  const key = new THREE.DirectionalLight('#b8d4ff', 0.48)
  key.position.set(-22, 34, 14)

  const fill = new THREE.DirectionalLight('#ffd9a8', 0.4)
  fill.position.set(8, 14, 28)

  const rim = new THREE.DirectionalLight('#6080ff', 0.2)
  rim.position.set(18, 6, -16)

  scene.add(ambient, hemi, key, fill, rim)
  return { ambient, hemi, key, fill, rim }
}

export function applySkyMode(
  mode: SkyMode,
  atmosphere: PlaygroundAtmosphere,
  scene: THREE.Scene,
  lighting: PlaygroundLighting,
): void {
  const { skybox, sun, moon } = atmosphere
  const mat = skybox.material as THREE.MeshBasicMaterial
  const oldTex = mat.map

  if (mode === 'day') {
    const tex = createDaySkyTexture()
    mat.map = tex
    mat.needsUpdate = true
    sun.visible = true
    moon.visible = false
    // Don't use the sky texture as IBL — it washes out saturation
    scene.environment = null
    scene.fog = new THREE.Fog('#a8d4f0', 60, 340)

    // Strong warm sun as the dominant source
    lighting.key.color.set('#ffe8b0')
    lighting.key.intensity = 2.2
    lighting.key.position.set(28, 60, 18)
    // Dim sky bounce — just enough to lift shadows without flattening
    lighting.hemi.color.set('#6ab0d8')
    lighting.hemi.groundColor.set('#a8b870')
    lighting.hemi.intensity = 0.55
    // Low ambient — keeps shadows readable but lifts the floor
    lighting.ambient.color.set('#c8dff0')
    lighting.ambient.intensity = 0.32
    // Subtle cool fill from opposite side
    lighting.fill.color.set('#b0d0f0')
    lighting.fill.intensity = 0.22
    // Warm rim to separate objects from background
    lighting.rim.color.set('#ffd080')
    lighting.rim.intensity = 0.28
  } else {
    const tex = createNightSkyTexture()
    mat.map = tex
    mat.needsUpdate = true
    sun.visible = false
    moon.visible = true
    scene.environment = null
    scene.fog = new THREE.Fog('#0a1022', 28, 260)

    lighting.ambient.color.set('#8fa8e8')
    lighting.ambient.intensity = 0.52
    lighting.hemi.color.set('#4a6ab8')
    lighting.hemi.groundColor.set('#2a3448')
    lighting.hemi.intensity = 0.82
    lighting.key.color.set('#b8d4ff')
    lighting.key.intensity = 0.48
    lighting.key.position.set(-22, 34, 14)
    lighting.fill.color.set('#ffd9a8')
    lighting.fill.intensity = 0.4
    lighting.rim.color.set('#6080ff')
    lighting.rim.intensity = 0.2
  }

  oldTex?.dispose()
}

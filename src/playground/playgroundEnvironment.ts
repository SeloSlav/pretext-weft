import * as THREE from 'three'

export type SkyMode = 'night' | 'day'

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

  const moonX = canvas.width * 0.18
  const moonY = canvas.height * 0.2
  const moonGlow = ctx.createRadialGradient(moonX, moonY, 6, moonX, moonY, canvas.width * 0.09)
  moonGlow.addColorStop(0, 'rgba(225,240,255,0.95)')
  moonGlow.addColorStop(0.18, 'rgba(190,220,255,0.5)')
  moonGlow.addColorStop(1, 'rgba(120,170,255,0)')
  ctx.fillStyle = moonGlow
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = '#dff0ff'
  ctx.beginPath()
  ctx.arc(moonX, moonY, canvas.width * 0.022, 0, Math.PI * 2)
  ctx.fill()

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

  // Sun disc
  const sunX = canvas.width * 0.72
  const sunY = canvas.height * 0.18
  const sunGlow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, canvas.width * 0.14)
  sunGlow.addColorStop(0, 'rgba(255,255,220,1.0)')
  sunGlow.addColorStop(0.06, 'rgba(255,240,160,0.85)')
  sunGlow.addColorStop(0.22, 'rgba(255,220,80,0.35)')
  sunGlow.addColorStop(0.55, 'rgba(255,200,60,0.08)')
  sunGlow.addColorStop(1, 'rgba(255,180,40,0)')
  ctx.fillStyle = sunGlow
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = '#fffde8'
  ctx.beginPath()
  ctx.arc(sunX, sunY, canvas.width * 0.028, 0, Math.PI * 2)
  ctx.fill()

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
  const geometry = new THREE.SphereGeometry(400, 24, 16)
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

export function applyPlaygroundAtmosphere(scene: THREE.Scene): THREE.Mesh {
  const skybox = createSkyboxMesh('night')
  scene.add(skybox)
  scene.fog = new THREE.Fog('#0a1022', 28, 260)
  return skybox
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
  skybox: THREE.Mesh,
  scene: THREE.Scene,
  lighting: PlaygroundLighting,
): void {
  const mat = skybox.material as THREE.MeshBasicMaterial
  const oldTex = mat.map

  if (mode === 'day') {
    const tex = createDaySkyTexture()
    mat.map = tex
    mat.needsUpdate = true
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

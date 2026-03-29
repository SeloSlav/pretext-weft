import * as THREE from 'three'

function createSkyTexture(): THREE.CanvasTexture {
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

function createSkyboxMesh(): THREE.Mesh {
  const tex = createSkyTexture()
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
  const skybox = createSkyboxMesh()
  const skyMaterial = skybox.material as THREE.MeshBasicMaterial
  if (skyMaterial.map) {
    skyMaterial.map.mapping = THREE.EquirectangularReflectionMapping
    scene.environment = skyMaterial.map
  }
  scene.add(skybox)
  scene.fog = new THREE.Fog('#050a1a', 40, 300)
  return skybox
}

export function addPlaygroundLighting(scene: THREE.Scene): void {
  scene.add(new THREE.AmbientLight('#c2d4f0', 0.62))
  scene.add(new THREE.HemisphereLight('#6d8fd4', '#111111', 0.58))

  const moonLight = new THREE.DirectionalLight('#cce0ff', 1.25)
  moonLight.position.set(-15, 30, 20)
  scene.add(moonLight)

  const frontFill = new THREE.DirectionalLight('#ffe8cc', 0.42)
  frontFill.position.set(0, 8, 30)
  scene.add(frontFill)
}

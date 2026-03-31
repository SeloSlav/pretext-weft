import * as THREE from 'three'

function uhash(n: number): number {
  n = (n ^ 61) ^ (n >>> 16)
  n = Math.imul(n, 0x45d9f3b)
  n ^= n >>> 4
  n = Math.imul(n, 0xd3833e2d)
  n ^= n >>> 15
  return (n >>> 0) / 4294967296
}

export function warmBarkColor(
  identity: number,
  noise: number,
  warmth: number,
  target: THREE.Color,
): THREE.Color {
  const t = uhash(identity * 2246822519)
  return target.setHSL(0.07 + warmth * 0.06 + t * 0.02, 0.38 + noise * 0.12, 0.42 + t * 0.12)
}

export function createBarkGrainTexture(): THREE.CanvasTexture {
  const w = 768
  const h = 1024
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas)
    fallback.colorSpace = THREE.SRGBColorSpace
    fallback.wrapS = THREE.RepeatWrapping
    fallback.wrapT = THREE.RepeatWrapping
    fallback.repeat.set(2.2, 3.2)
    return fallback
  }

  ctx.fillStyle = '#dcd0c8'
  ctx.fillRect(0, 0, w, h)

  for (let g = 0; g < 140; g++) {
    const gx = Math.random() * w
    const gy = Math.random() * h
    const gw = 8 + Math.random() * 38
    const gh = h * (0.12 + Math.random() * 0.35)
    const rot = (Math.random() - 0.5) * 0.08
    ctx.save()
    ctx.translate(gx, gy)
    ctx.rotate(rot)
    const patch = ctx.createLinearGradient(-gw, 0, gw, 0)
    const a = 0.04 + Math.random() * 0.1
    const v = 28 + Math.random() * 22
    patch.addColorStop(0, 'rgba(220,208,200,0)')
    patch.addColorStop(0.5, `rgba(${v},${v},${v},${a})`)
    patch.addColorStop(1, 'rgba(220,208,200,0)')
    ctx.fillStyle = patch
    ctx.fillRect(-gw, -gh * 0.5, gw * 2, gh)
    ctx.restore()
  }

  for (let i = 0; i < 2200; i++) {
    const x = Math.random() * w
    const y = Math.random() * h
    const len = 18 + Math.random() * 120
    const wobble = (Math.random() - 0.5) * 6
    const v = 55 + Math.random() * 55
    ctx.strokeStyle = `rgba(${v},${v},${v},${0.1 + Math.random() * 0.18})`
    ctx.lineWidth = 0.4 + Math.random() * 1.8
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + wobble * 0.3, y + len)
    ctx.stroke()
  }

  for (let i = 0; i < 480; i++) {
    const x = Math.random() * w
    const y = Math.random() * h
    const v = 100 + Math.random() * 60
    ctx.strokeStyle = `rgba(${v},${v},${v},${0.07 + Math.random() * 0.12})`
    ctx.lineWidth = 0.8 + Math.random() * 2.4
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + (Math.random() - 0.5) * 3, y + 8 + Math.random() * 40)
    ctx.stroke()
  }

  for (let k = 0; k < 28; k++) {
    const kx = Math.random() * w
    const ky = Math.random() * h
    const kr = 12 + Math.random() * 36
    const ring = ctx.createRadialGradient(kx, ky, kr * 0.05, kx, ky, kr)
    const v0 = 40 + Math.random() * 30
    const v1 = 85 + Math.random() * 40
    ring.addColorStop(0, `rgba(${v0},${v0},${v0},${0.12 + Math.random() * 0.16})`)
    ring.addColorStop(0.55, `rgba(${v1},${v1},${v1},${0.05 + Math.random() * 0.08})`)
    ring.addColorStop(1, 'rgba(200,200,200,0)')
    ctx.fillStyle = ring
    ctx.beginPath()
    ctx.ellipse(kx, ky, kr, kr * (0.75 + Math.random() * 0.35), Math.random() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < 35_000; i++) {
    const x = Math.random() * w
    const y = Math.random() * h
    const s = Math.random() * 2.2
    const v = 130 + Math.random() * 80
    ctx.fillStyle = `rgba(${v},${v},${v},${0.035 + Math.random() * 0.09})`
    ctx.fillRect(x, y, s, s)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2.4, 3.6)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

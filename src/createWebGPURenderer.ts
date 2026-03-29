import { WebGPURenderer } from 'three/webgpu'

type RendererWithFallback = { _getFallback: (() => unknown) | null }

export async function createWebGPURenderer(canvas: HTMLCanvasElement): Promise<WebGPURenderer> {
  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
    logarithmicDepthBuffer: true,
  })

  ;(renderer as unknown as RendererWithFallback)._getFallback = null

  await renderer.init()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

  return renderer
}

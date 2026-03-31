import * as THREE from 'three'
import { RenderPipeline } from 'three/webgpu'
import type UniformNode from 'three/src/nodes/core/UniformNode.js'
import {
  pass,
  uniform,
  Fn,
  vec2,
  vec4,
  vec3,
  float,
  posterize,
  screenUV,
  screenSize,
  abs,
  toneMapping,
  toneMappingExposure,
  workingToColorSpace,
} from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import type { WebGPURenderer } from 'three/webgpu'

export interface ToonShadingConfig {
  /** Number of color bands for posterization (2–8). Default 5. */
  bands?: number
  /** Edge line darkness 0–1. Default 0.75. */
  edgeStrength?: number
  /**
   * Depth edge sensitivity. Higher = only the sharpest silhouette edges show.
   * Default 0.15. Good range: 0.05–0.5.
   */
  edgeThreshold?: number
}

const DEFAULT_CONFIG: Required<ToonShadingConfig> = {
  bands: 8,
  edgeStrength: 0.6,
  edgeThreshold: 0.15,
}

/**
 * Screen-space toon shading post-processing pipeline.
 *
 * Renders the scene to an offscreen pass, then applies:
 *   1. ACES tone mapping + sRGB conversion
 *   2. Posterization — quantizes the sRGB color into discrete bands
 *   3. Depth-discontinuity edge detection — lines only at silhouettes, not on textures
 *
 * Uses Three.js RenderPipeline + TSL so it works with WebGPURenderer.
 */
export class ToonShadingPipeline {
  private readonly pipeline: RenderPipeline
  readonly uBands: UniformNode<'float', number>
  readonly uEdgeStrength: UniformNode<'float', number>
  readonly uEdgeThreshold: UniformNode<'float', number>

  constructor(
    renderer: WebGPURenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    config: ToonShadingConfig = {},
  ) {
    const cfg = { ...DEFAULT_CONFIG, ...config }

    this.uBands = uniform(cfg.bands)
    this.uEdgeStrength = uniform(cfg.edgeStrength)
    this.uEdgeThreshold = uniform(cfg.edgeThreshold)

    const scenePass = pass(scene, camera)
    const colorTex = scenePass.getTextureNode('output')
    // Raw depth texture (non-linear, 0=near 1=far) — good for discontinuity detection
    const depthTex = scenePass.getTextureNode('depth')

    const uBands = this.uBands
    const uEdgeStrength = this.uEdgeStrength
    const uEdgeThreshold = this.uEdgeThreshold

    // Apply ACES + sRGB to a raw HDR sample
    const toSrgb = (rawRgb: ReturnType<typeof vec3>): Node<'vec3'> =>
      workingToColorSpace(
        toneMapping(THREE.ACESFilmicToneMapping, toneMappingExposure, rawRgb),
        THREE.SRGBColorSpace,
      ) as unknown as Node<'vec3'>

    const toonEffect = Fn(() => {
      const uv = screenUV.toVar()

      const px = float(1.0).div(screenSize.x).toVar()
      const py = float(1.0).div(screenSize.y).toVar()

      // Tone-map center pixel and posterize
      const rawCenter = colorTex.sample(uv).rgb.toVar()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const srgbCenter = (toSrgb(rawCenter) as any).toVar()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const posterized = (posterize(srgbCenter, uBands) as any).toVar()

      // Depth-discontinuity edge detection.
      // Compare each neighbour's depth to the center depth.
      // On a flat surface all neighbours match → zero gradient → no edge.
      // At a silhouette one or more neighbours jump sharply → large gradient → edge.
      const dCenter = depthTex.sample(uv).r.toVar()

      const d00 = depthTex.sample(uv.add(vec2(px.negate(), py.negate()))).r
      const d20 = depthTex.sample(uv.add(vec2(px,           py.negate()))).r
      const d01 = depthTex.sample(uv.add(vec2(px.negate(), float(0.0)))).r
      const d21 = depthTex.sample(uv.add(vec2(px,           float(0.0)))).r
      const d02 = depthTex.sample(uv.add(vec2(px.negate(), py))).r
      const d22 = depthTex.sample(uv.add(vec2(px,           py))).r
      const d10 = depthTex.sample(uv.add(vec2(float(0.0),  py.negate()))).r
      const d12 = depthTex.sample(uv.add(vec2(float(0.0),  py))).r

      // Sobel on depth
      const gx = d00.negate().add(d20)
        .add(d01.mul(-2.0)).add(d21.mul(2.0))
        .add(d02.negate()).add(d22)
      const gy = d00.negate().add(d02)
        .add(d10.mul(-2.0)).add(d12.mul(2.0))
        .add(d20.negate()).add(d22)

      const depthEdge = abs(gx).add(abs(gy))

      // Also gate by whether the center pixel is actually geometry (depth < 1).
      // Sky pixels have depth = 1.0 so we never draw edges there.
      const isSky = dCenter.greaterThanEqual(float(0.9999))

      // Relative threshold: scale by center depth so distant objects don't
      // produce thinner edges than nearby ones.
      const relThreshold = uEdgeThreshold.mul(dCenter.add(float(0.01)))

      const isEdge = depthEdge.greaterThan(relThreshold).and(isSky.not())

      const edgeFactor = isEdge.select(
        float(1.0).sub(uEdgeStrength),
        float(1.0),
      )

      const finalColor = posterized.mul(edgeFactor)

      return vec4(finalColor, float(1.0))
    })

    this.pipeline = new RenderPipeline(renderer, toonEffect())
    this.pipeline.outputColorTransform = false
  }

  setConfig(config: Partial<ToonShadingConfig>): void {
    if (config.bands !== undefined) this.uBands.value = config.bands
    if (config.edgeStrength !== undefined) this.uEdgeStrength.value = config.edgeStrength
    if (config.edgeThreshold !== undefined) this.uEdgeThreshold.value = config.edgeThreshold
  }

  render(): void {
    this.pipeline.render()
  }

  dispose(): void {
    this.pipeline.dispose()
  }
}

import { seedCursor, getPreparedSkin } from '../skinText'
import { createWebGPURenderer } from '../createWebGPURenderer'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import * as THREE from 'three'
import { createRibbonBandSeeds, createRibbonMesh, updateRibbonMesh } from './ribbonSample'
import { createTorusBandSeeds, createTorusMesh, updateTorusMesh } from './torusSample'
import {
  DEFAULT_RIBBON_PARAMS,
  DEFAULT_TORUS_PARAMS,
  type RibbonSampleParams,
  type SampleId,
  type TorusSampleParams,
} from './types'

function disposeMesh(mesh: THREE.InstancedMesh): void {
  mesh.geometry.dispose()
  const { material } = mesh
  if (Array.isArray(material)) {
    material.forEach((m) => m.dispose())
    return
  }
  material.dispose()
}

export class PlaygroundRuntime {
  private readonly host: HTMLElement
  private readonly canvas = document.createElement('canvas')
  private readonly clock = new THREE.Clock()
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.22, 36)
  private readonly torusMesh = createTorusMesh()
  private readonly ribbonMesh = createRibbonMesh()
  private readonly prepared = getPreparedSkin()
  private readonly torusBandSeeds = createTorusBandSeeds(this.prepared, seedCursor)
  private readonly ribbonBandSeeds = createRibbonBandSeeds(this.prepared, seedCursor)

  private renderer: Awaited<ReturnType<typeof createWebGPURenderer>> | null = null
  private controls: OrbitControls | null = null
  private resizeObserver: ResizeObserver | null = null
  private rafId = 0
  private disposed = false

  private sampleId: SampleId = 'torus-wound'
  private torusParams: TorusSampleParams = { ...DEFAULT_TORUS_PARAMS }
  private ribbonParams: RibbonSampleParams = { ...DEFAULT_RIBBON_PARAMS }

  constructor(host: HTMLElement) {
    this.host = host
    this.canvas.className = 'canvas'
    this.camera.position.set(4.2, 2.4, 4.8)
    this.scene.background = new THREE.Color('#0a0d12')

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.48))
    this.scene.add(new THREE.HemisphereLight('#e4eaf5', '#2a323c', 0.62))

    const key = new THREE.DirectionalLight(0xffffff, 1.85)
    key.position.set(6, 8, 4)
    this.scene.add(key)

    const rim = new THREE.DirectionalLight('#b8ccff', 0.42)
    rim.position.set(-4, -2, -6)
    this.scene.add(rim)

    const fill = new THREE.DirectionalLight('#fff5eb', 0.55)
    fill.position.set(0, 1.5, 7)
    this.scene.add(fill)

    this.scene.add(this.torusMesh)
    this.scene.add(this.ribbonMesh)
    this.syncVisibleSample()
  }

  async initialize(): Promise<void> {
    this.host.appendChild(this.canvas)
    this.renderer = await createWebGPURenderer(this.canvas)

    if (this.disposed) {
      this.renderer.dispose()
      return
    }

    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0

    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.06
    this.controls.minDistance = 1.8
    this.controls.maxDistance = 16
    this.controls.target.set(0, 0, 0)

    this.resize()
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.host)

    this.clock.start()
    this.frame()
  }

  setSample(sampleId: SampleId): void {
    this.sampleId = sampleId
    this.syncVisibleSample()
  }

  setTorusParams(params: Partial<TorusSampleParams>): void {
    this.torusParams = { ...this.torusParams, ...params }
  }

  setRibbonParams(params: Partial<RibbonSampleParams>): void {
    this.ribbonParams = { ...this.ribbonParams, ...params }
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.rafId)
    this.resizeObserver?.disconnect()
    this.controls?.dispose()
    this.renderer?.dispose()
    disposeMesh(this.torusMesh)
    disposeMesh(this.ribbonMesh)
    this.canvas.remove()
  }

  private syncVisibleSample(): void {
    this.torusMesh.visible = this.sampleId === 'torus-wound'
    this.ribbonMesh.visible = this.sampleId === 'plane-ribbon'
  }

  private resize(): void {
    if (!this.renderer) return

    const width = this.host.clientWidth
    const height = this.host.clientHeight
    if (width <= 0 || height <= 0) return

    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setSize(width, height, false)
  }

  private frame = (): void => {
    if (this.disposed || !this.renderer) return

    const elapsedTime = this.clock.getElapsedTime()

    if (this.sampleId === 'torus-wound') {
      updateTorusMesh(this.torusMesh, this.prepared, this.torusBandSeeds, this.torusParams, elapsedTime)
    } else {
      updateRibbonMesh(
        this.ribbonMesh,
        this.prepared,
        this.ribbonBandSeeds,
        this.ribbonParams,
        elapsedTime,
      )
    }

    this.controls?.update()
    this.renderer.render(this.scene, this.camera)
    this.rafId = requestAnimationFrame(this.frame)
  }
}

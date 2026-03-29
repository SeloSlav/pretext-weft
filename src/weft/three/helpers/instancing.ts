import * as THREE from 'three'
import type { SurfaceRendererAdapter } from '../../runtime'

export type ThreeInstancedMeshRendererConfig = {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  maxInstances: number
  dynamic?: boolean
}

export function threeInstancedMeshRenderer(
  config: ThreeInstancedMeshRendererConfig,
): SurfaceRendererAdapter<ThreeInstancedMeshRendererConfig> {
  return {
    kind: 'three-instanced-mesh',
    config,
  }
}

export function createInstancedMesh(config: ThreeInstancedMeshRendererConfig): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(config.geometry, config.material, config.maxInstances)
  mesh.frustumCulled = false
  if (config.dynamic !== false) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  }
  return mesh
}

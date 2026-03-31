import * as THREE from 'three'

/** Instanced float 0–1: burn intensity driving neon orange view-space rim (additive emissive). */
export function createBurnRimInstancedAttribute(maxInstances: number): THREE.InstancedBufferAttribute {
  const data = new Float32Array(maxInstances)
  return new THREE.InstancedBufferAttribute(data, 1)
}

/** Fragment snippet: expects `vBurnRim`, `normal`, `vViewPosition`, `diffuseColor`, `totalEmissiveRadiance`. */
export const BURN_NEON_RIM_COLOR_FRAGMENT = `{
  float br = clamp( vBurnRim, 0.0, 1.0 );
  if ( br > 0.001 ) {
    vec3 viewDir = normalize( -vViewPosition );
    float ndv = max( dot( normalize( normal ), viewDir ), 0.0 );
    float rim = pow( 1.0 - ndv, 2.35 );
    vec3 neon = vec3( 1.0, 0.32, 0.04 );
    float glow = rim * br;
    diffuseColor.rgb += neon * glow * 0.95;
    totalEmissiveRadiance += neon * glow * 4.2;
  }
}
`

/**
 * MeshStandardMaterial with no existing `onBeforeCompile`: adds `burnRim` instanced attribute + rim.
 */
export function patchMeshStandardBurnNeonRim(
  material: THREE.MeshStandardMaterial,
  programCacheKey: string,
): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
attribute float burnRim;
varying float vBurnRim;
`,
    )

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
vBurnRim = burnRim;
`,
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
varying float vBurnRim;
`,
    )

    /** After normals + emissive map so `normal` and `vViewPosition` are valid. */
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
${BURN_NEON_RIM_COLOR_FRAGMENT}`,
    )
  }

  material.customProgramCacheKey = () => `burn-neon-${programCacheKey}`
  material.needsUpdate = true
}

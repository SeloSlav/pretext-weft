import * as THREE from 'three'
import type { FishScaleEffect } from '../weft/three'

/** Same half-extents as fish-scale patch clamp in `fishScale.ts` (PATCH * 0.48). */
const PATCH_HALF_W = 5.8 * 0.48
const PATCH_HALF_H = 4.4 * 0.48

export type BreachingWallUniforms = {
  uFishInvWorldMatrix: { value: THREE.Matrix4 }
  uWoundCount: { value: number }
  uWoundXY: { value: Float32Array }
  uWoundRadius: { value: Float32Array }
  uWoundStrength: { value: Float32Array }
  uPatchHalfW: { value: number }
  uPatchHalfH: { value: number }
  uHoleThreshold: { value: number }
}

/**
 * Shell wall stays a full box; fragments align with the Weft patch in fish local space and discard
 * where wounds are (like seeing through the neon wall’s suppressed region, but driven by fish wounds).
 */
export function applyBreachingWallShader(mesh: THREE.Mesh, fishEffect: FishScaleEffect): void {
  const base = mesh.material as THREE.MeshStandardMaterial
  const mat = base.clone()

  const uniforms: BreachingWallUniforms = {
    uFishInvWorldMatrix: { value: new THREE.Matrix4() },
    uWoundCount: { value: 0 },
    uWoundXY: { value: new Float32Array(16) },
    uWoundRadius: { value: new Float32Array(8) },
    uWoundStrength: { value: new Float32Array(8) },
    uPatchHalfW: { value: PATCH_HALF_W },
    uPatchHalfH: { value: PATCH_HALF_H },
    uHoleThreshold: { value: 0.38 },
  }

  mat.userData.fishEffect = fishEffect
  mat.userData.breachUniforms = uniforms
  mat.side = THREE.DoubleSide

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vWorldPosBreach;
      `,
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
      vWorldPosBreach = worldPosition.xyz;
      `,
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      uniform mat4 uFishInvWorldMatrix;
      uniform int uWoundCount;
      uniform float uWoundXY[ 16 ];
      uniform float uWoundRadius[ 8 ];
      uniform float uWoundStrength[ 8 ];
      uniform float uPatchHalfW;
      uniform float uPatchHalfH;
      uniform float uHoleThreshold;
      varying vec3 vWorldPosBreach;

      float breachPulse( float n ) {
        if ( n >= 1.0 ) return 0.0;
        float t = 1.0 - n * n;
        return t * t;
      }

      float breachDamageAt( vec2 pointXY ) {
        float damage = 0.0;
        for ( int i = 0; i < 8; i ++ ) {
          if ( i >= uWoundCount ) break;
          vec2 woundXY = vec2( uWoundXY[ i * 2 ], uWoundXY[ i * 2 + 1 ] );
          float radius = max( 0.0001, uWoundRadius[ i ] );
          float strength = uWoundStrength[ i ];
          float presence = clamp( strength, 0.0, 1.0 );
          float intensity = clamp( ( strength - 1.0 ) / 1.1, 0.0, 1.0 );
          vec2 delta = vec2( pointXY.x - woundXY.x, ( pointXY.y - woundXY.y ) * 1.14 );
          float normalized = length( delta ) / radius;
          float woundStrength = mix( 1.0, 1.2, intensity );
          damage = max( damage, breachPulse( normalized ) * woundStrength * presence );
        }
        return clamp( damage, 0.0, 1.0 );
      }
      `,
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
      {
        vec4 localPoint = uFishInvWorldMatrix * vec4( vWorldPosBreach, 1.0 );
        vec2 pointXY = vec2(
          clamp( localPoint.x, -uPatchHalfW, uPatchHalfW ),
          clamp( localPoint.y, -uPatchHalfH, uPatchHalfH )
        );
        if ( abs( localPoint.x ) <= uPatchHalfW && abs( localPoint.y ) <= uPatchHalfH ) {
          float damage = breachDamageAt( pointXY );
          if ( damage >= uHoleThreshold ) discard;
        }
      }
      `,
    )
  }
  mat.customProgramCacheKey = () => 'playground-breaching-wall-v2'

  mat.needsUpdate = true
  mesh.material = mat
}

export function updateBreachingWallShaderUniforms(material: THREE.MeshStandardMaterial): void {
  const fish = material.userData.fishEffect as FishScaleEffect | undefined
  const u = material.userData.breachUniforms as BreachingWallUniforms | undefined
  if (!fish || !u) return

  fish.group.updateMatrixWorld(true)
  u.uFishInvWorldMatrix.value.copy(fish.group.matrixWorld).invert()

  const wounds = fish.getWoundsForBreachingShader(8)
  u.uWoundCount.value = wounds.length
  u.uWoundXY.value.fill(0)
  u.uWoundRadius.value.fill(0)
  u.uWoundStrength.value.fill(0)
  const xy = u.uWoundXY.value
  const rad = u.uWoundRadius.value
  const st = u.uWoundStrength.value
  for (let i = 0; i < wounds.length; i++) {
    const w = wounds[i]!
    xy[i * 2] = w.x
    xy[i * 2 + 1] = w.y
    rad[i] = w.radius
    st[i] = w.strength
  }
}

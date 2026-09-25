import * as THREE from 'three';

// Uniforms shared by every custom shader in the town.
export const shared = {
  uTime: { value: 0 },
  uNight: { value: 0 }, // 0 = full day, 1 = full night
  uWind: { value: 1 },
};

function gradientMap(steps) {
  const data = new Uint8Array(steps.map((s) => Math.round(s * 255)));
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

export const toonRamp = gradientMap([0.42, 0.68, 0.86, 1.0]);
export const cloudRamp = gradientMap([0.72, 0.9, 1.0]);

export function solidMaterial() {
  return new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp });
}

// Foliage sways in the wind. The `sway` attribute scales motion per vertex
// (0 for trunks, ~1 for canopy tops).
export function foliageMaterial() {
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uWind = shared.uWind;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float sway;\nuniform float uTime;\nuniform float uWind;'
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float phase = position.x * 0.35 + position.z * 0.27;
        float gust = 0.6 + 0.4 * sin(uTime * 0.37 + position.x * 0.05);
        transformed.x += sin(uTime * 1.7 + phase) * 0.045 * sway * uWind * gust;
        transformed.z += cos(uTime * 1.3 + phase * 1.3) * 0.03 * sway * uWind * gust;`
      );
  };
  return mat;
}

// Glass, lamps and signs: flat colour by day, glowing `emit` colour at night
// when `lit` is 1. Unlit glass darkens after sunset.
export function glowMaterial() {
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = shared.uNight;
    shader.uniforms.uTime = shared.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float lit;\nattribute vec3 emit;\nvarying float vLit;\nvarying vec3 vEmit;'
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLit = lit;\nvEmit = emit;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uNight;\nuniform float uTime;\nvarying float vLit;\nvarying vec3 vEmit;'
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float dayShade = mix(1.0, 0.28, uNight);
        diffuseColor.rgb *= dayShade;
        float on = smoothstep(0.25, 0.7, uNight) * step(0.5, vLit);
        diffuseColor.rgb = mix(diffuseColor.rgb, vEmit, on);`
      );
  };
  return mat;
}

export function color(hex) {
  return new THREE.Color(hex);
}

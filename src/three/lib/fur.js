// Shell fur: the shape is repeated in layers along its normals, and each layer keeps only the
// hairs that are at least that long. Ported from spot-fetch (same author, MIT).
import * as THREE from 'three';

const HASH = `float furHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float furNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(furHash(i), furHash(i + vec2(1, 0)), f.x), mix(furHash(i + vec2(0, 1)), furHash(i + vec2(1, 1)), f.x), f.y); }`;

// size: [circumference, length] of the shape in metres, so hair density is the same everywhere.
// rootShade: how dark the coat is at the skin (shadow between the hairs).
export function furMesh(geometry, { color, sheen = 0x000000, length, cell, layers, size, map = null, rough = 0.66, droop = 0.3, rootShade = 0.3 }) {
  const base = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: color, map, roughness: 0.9 }));
  base.material.color.multiplyScalar(rootShade + 0.15); // the skin under the coat is in shadow
  base.castShadow = true;

  const mat = new THREE.MeshPhysicalMaterial({
    color: color, map, roughness: rough,
    sheen: sheen ? 0.3 : 0, sheenColor: sheen, sheenRoughness: 0.5, envMapIntensity: 0.45,
    anisotropy: sheen ? 0.35 : 0, anisotropyRotation: Math.PI / 2, // sheen stretched across the hair direction
  });
  mat.defines.USE_UV = '';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.furLen = { value: length };
    sh.uniforms.furLayers = { value: layers };
    sh.uniforms.furDroop = { value: droop };
    sh.uniforms.furRoot = { value: rootShade };
    sh.uniforms.furCell = { value: new THREE.Vector2(size[0] / cell, size[1] / cell) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float furLen, furLayers, furDroop;\nvarying float vLayer;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLayer = (float(gl_InstanceID) + 1.0) / furLayers;
        transformed += normalize(objectNormal) * furLen * vLayer;
        transformed.y -= furLen * furDroop * vLayer * vLayer;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec2 furCell;\nuniform float furRoot;\nvarying float vLayer;\n${HASH}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 fuv = vUv * furCell;
        vec2 cell = floor(fuv);
        float hairLen = 0.45 + 0.55 * furHash(cell); // one hair per cell, with varying length
        vec2 mid = 0.5 + 0.3 * (vec2(furHash(cell + 7.3), furHash(cell + 3.1)) - 0.5);
        float hair = step(vLayer, hairLen) * step(length(fract(fuv) - mid), 0.75 * (1.0 - 0.8 * vLayer / hairLen)); // tapered
        // Far away, hairs are smaller than a pixel: draw a solid layer instead, or it flickers.
        float far = smoothstep(0.6, 1.4, max(fwidth(fuv.x), fwidth(fuv.y)));
        if (mix(hair, step(vLayer, 0.45), far) < 0.5) discard;
        // Tufts and streaks along the hair, so the coat doesn't look like smooth plastic from afar.
        float tuft = 0.72 + 0.4 * furNoise(fuv * vec2(0.5, 0.04)) + 0.2 * furNoise(fuv * 0.1);
        diffuseColor.rgb *= mix(furRoot, 1.0, vLayer) * tuft;`);
  };
  const coat = new THREE.InstancedMesh(geometry, mat, layers);
  coat.receiveShadow = true;

  const g = new THREE.Group();
  g.add(base, coat);
  return g;
}

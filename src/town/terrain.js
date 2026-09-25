import * as THREE from 'three';
import { fbm, lerp, smoothstep } from './rng.js';
import { shared } from './materials.js';

// World layout (camera looks toward -Z, like the source panorama):
//   z > -7   flat town level (y = 0): junction, shrine terrace, station
//   z = -7   railway running along X, into tunnels at both hills
//   z < -8   town slopes down to the harbour; sea level at SEA
//   |x| big  wooded hills that wrap the bay

export const SEA = -3.2;
export const TRACK_Z = -7;
export const PORTAL_L = -23; // portals sit on terrain grid lines
export const PORTAL_R = 28;
export const EXTENT = { x0: -70, x1: 204, z0: -48, z1: 60 };

// East of the town, road B runs through a tunnel in the ridge and comes out
// in Yamate, a farming valley sitting VALLEY units above sea level.
export const VALLEY = 3.2;
export const ROAD_TUNNEL = { x0: 38, x1: 62 };
export const RURAL_Y = VALLEY + 0.02;
// The railway climbs through the east tunnel and runs on into Yamate,
// ending just past Yamate station.
export const RAIL_EXIT = 62;
export const RAIL_END = 97;
export const RAIL_V = VALLEY + 0.02;
export function railY(x) {
  return smoothstep(PORTAL_R + 1, RAIL_EXIT - 2, x) * RAIL_V;
}
export const RURAL_ROAD = [[62, -1.9], [96, -1.9], [112, 4], [122, 14], [128, 22], [140, 30], [178, 32]];

export function riverZ(x) {
  return 14 + 7 * Math.sin((x - 64) / 16) + 2 * Math.sin(x / 7.3);
}

export function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

export function rawHeight(x, z) {
  const town = 1 - smoothstep(44, 60, x);
  const valley = smoothstep(52, 66, x);
  let h = 0;
  const slope = smoothstep(-8.6, -31, z) * town;
  h -= slope * 4.3;
  // gentle undulation on the slope and hills
  h += (fbm(x * 0.07 + 11, z * 0.07 - 3, 3) - 0.5) * 1.4 * slope;
  const left = smoothstep(-17, -34, x);
  const ridge = smoothstep(20, 37, x) * (1 - smoothstep(55, 66, x));
  const hillNoise = fbm(x * 0.05, z * 0.05 + 40, 4);
  h += left * (9 + hillNoise * 7) * smoothstep(-44, -24, z);
  h += ridge * (9 + hillNoise * 8) * smoothstep(-44, -22, z);
  // a knoll behind the shrine
  h += 3.6 * Math.exp(-(((x + 23) / 6) ** 2) - (((z + 1) / 7) ** 2));
  // seabed drops away
  h -= smoothstep(-30, -44, z) * 5 * town;
  // Yamate valley: a broad floor with wooded walls on three sides
  h += valley * (VALLEY + (fbm(x * 0.035 + 5, z * 0.035, 3) - 0.5) * 0.9);
  h += valley * smoothstep(-20, -40, z) * (10 + hillNoise * 9);
  h += valley * smoothstep(38, 56, z) * (12 + hillNoise * 10);
  h += smoothstep(182, 200, x) * (12 + hillNoise * 8);
  return h;
}

// Terrain must stay clear of tunnel tubes so their interiors read as holes.
export const RAIL_COVER = 4.4;
export const ROAD_COVER = RURAL_Y + 5.4;
function tunnelCover(x, z, h) {
  const railBand = Math.abs(z - TRACK_Z) < 3.2;
  if (railBand && x <= PORTAL_L - 1 && x > PORTAL_L - 17) return Math.max(h, RAIL_COVER);
  if (railBand && x >= PORTAL_R + 1 && x <= RAIL_EXIT - 1) return Math.max(h, railY(x) + RAIL_COVER);
  if (Math.abs(z - ROAD_B_Z) < 4.2 && x >= ROAD_TUNNEL.x0 + 1 && x <= ROAD_TUNNEL.x1 - 1) return Math.max(h, ROAD_COVER);
  return h;
}

// One-cell holes in the terrain right behind each portal (the terrain can't
// be vertical there); a lid box covers them from above.
export const TERRAIN_HOLES = [
  { x0: PORTAL_L - 1, x1: PORTAL_L, zc: TRACK_Z, hz: 2, top: RAIL_COVER },
  { x0: PORTAL_R, x1: PORTAL_R + 1, zc: TRACK_Z, hz: 2, top: RAIL_COVER },
  { x0: RAIL_EXIT - 1, x1: RAIL_EXIT, zc: TRACK_Z, hz: 2, top: RAIL_COVER },
  { x0: ROAD_TUNNEL.x0, x1: ROAD_TUNNEL.x0 + 1, zc: -1.9, hz: 3, top: ROAD_COVER },
  { x0: ROAD_TUNNEL.x1 - 1, x1: ROAD_TUNNEL.x1, zc: -1.9, hz: 3, top: ROAD_COVER },
];

export function heightAt(x, z) {
  let h = rawHeight(x, z);
  // railway cutting between the tunnel portals
  if (x >= PORTAL_L && x <= PORTAL_R) {
    const band = 1 - smoothstep(1.5, 3.2, Math.abs(z - TRACK_Z));
    h = lerp(h, Math.min(h, 0), band);
  }
  // keep the road to the harbour on a clean line
  const road = 1 - smoothstep(2.2, 4.2, Math.abs(x));
  if (z < -7 && z > -31) h = lerp(h, roadHeight(z) - 0.14, road);
  // road B climbs gently east ("yuunagi-zaka") up to the road tunnel
  if (x > 2 && x <= ROAD_TUNNEL.x0) {
    const band = 1 - smoothstep(1.9, 3.6, Math.abs(z - ROAD_B_Z));
    h = lerp(h, roadBHeight(x) - 0.14, band);
  }
  if (x >= ROAD_TUNNEL.x1) {
    const d = distToPolyline(x, z, RURAL_ROAD);
    const band = 1 - smoothstep(1.9, 3.6, d);
    if (band > 0) h = lerp(h, RURAL_Y - 0.14, band);
    // the river carves a shallow bed through the valley
    if (x > 66 && x < 190) {
      const carve = (1 - smoothstep(1.7, 3.4, Math.abs(z - riverZ(x)))) * smoothstep(66, 72, x) * (1 - smoothstep(184, 190, x));
      h = lerp(h, VALLEY - 1.15, carve);
    }
  }
  // railway cutting across the valley floor
  if (x >= RAIL_EXIT && x <= RAIL_END + 4) {
    const band = 1 - smoothstep(1.5, 3.2, Math.abs(z - TRACK_Z));
    h = lerp(h, RAIL_V - 0.08, band);
  }
  // harbour quay
  if (z < -16) {
    const q = (1 - smoothstep(8, 10.5, Math.abs(x))) * smoothstep(-31.4, -30.6, z);
    h = lerp(h, Math.max(h, QUAY), q);
  }
  return tunnelCover(x, z, h);
}

export const QUAY = SEA + 0.6;
export const ROAD_B_Z = -1.9;

export function roadBHeight(x) {
  return smoothstep(17, 44, x) * 3.2 + 0.02;
}

// The main road descends smoothly from the crossing to the harbour quay.
export function roadHeight(z) {
  return Math.max(-smoothstep(-8.6, -31, z) * 4.3 * 0.94, QUAY) + 0.02;
}

const GRASS = [0x6fa64a, 0x5d9a42, 0x7fb455, 0x4f8a3c];
const HILL = [0x3f7d3a, 0x356f35, 0x4d8c40, 0x2f6431];
const SAND = 0xe5d3a0;
const ROCK = 0x8a8f82;

export function buildTerrain() {
  const step = 1;
  const { x0, x1, z0, z1 } = EXTENT;
  const nx = Math.round((x1 - x0) / step);
  const nz = Math.round((z1 - z0) / step);
  const positions = [];
  const colors = [];
  const c = new THREE.Color();
  const cache = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j += 1) for (let i = 0; i <= nx; i += 1) cache[j * (nx + 1) + i] = heightAt(x0 + i * step, z0 + j * step);
  const H = (i, j) => cache[j * (nx + 1) + i];

  const pushTri = (a, b, d) => {
    const cx = (a[0] + b[0] + d[0]) / 3;
    const cz = (a[2] + b[2] + d[2]) / 3;
    const cy = (a[1] + b[1] + d[1]) / 3;
    const hi = Math.max(a[1], b[1], d[1]);
    const lo = Math.min(a[1], b[1], d[1]);
    const steep = (hi - lo) / step;
    const n = fbm(cx * 0.21, cz * 0.21, 2);
    const rural = cx > ROAD_TUNNEL.x1;
    if (cy < SEA + 0.35) c.set(SAND);
    else if (steep > 1.45) c.set(ROCK);
    else if (rural && cy < VALLEY - 0.6) c.set(n > 0.5 ? 0xa8a290 : 0x948e7c);
    else if (rural ? steep > 0.5 || cy > VALLEY + 2 : cy > 1.2 || Math.abs(cx) > 22) c.set(HILL[Math.floor(n * 3.99)]);
    else c.set(GRASS[Math.floor(n * 3.99)]);
    const shade = 0.94 + ((Math.sin(cx * 12.9898 + cz * 78.233) * 43758.5453) % 1) * 0.06;
    c.multiplyScalar(shade);
    positions.push(...a, ...b, ...d);
    for (let k = 0; k < 3; k += 1) colors.push(c.r, c.g, c.b);
  };

  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const xa = x0 + i * step;
      const za = z0 + j * step;
      const p00 = [xa, H(i, j), za];
      const p10 = [xa + step, H(i + 1, j), za];
      const p01 = [xa, H(i, j + 1), za + step];
      const p11 = [xa + step, H(i + 1, j + 1), za + step];
      const cxm = xa + step / 2;
      const czm = za + step / 2;
      if (TERRAIN_HOLES.some((o) => cxm > o.x0 && cxm < o.x1 && Math.abs(czm - o.zc) < o.hz)) continue;
      if ((i + j) % 2 === 0) {
        pushTri(p00, p01, p11);
        pushTri(p00, p11, p10);
      } else {
        pushTri(p00, p01, p10);
        pushTri(p10, p01, p11);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// Height texture over the terrain extent so the sea shader knows where the
// shallows and shoreline are.
function heightTexture() {
  const size = 256;
  const data = new Uint16Array(size * size);
  const { x0, x1, z0, z1 } = EXTENT;
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      const x = x0 + ((i + 0.5) / size) * (x1 - x0);
      const z = z0 + ((j + 0.5) / size) * (z1 - z0);
      data[j * size + i] = THREE.DataUtils.toHalfFloat(heightAt(x, z));
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function buildSea() {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      tHeight: { value: null },
      uExtent: { value: new THREE.Vector4(EXTENT.x0, EXTENT.z0, EXTENT.x1 - EXTENT.x0, EXTENT.z1 - EXTENT.z0) },
      uSea: { value: SEA },
      uDeep: { value: new THREE.Color(0x1f63b8) },
      uShallow: { value: new THREE.Color(0x3fb8d8) },
      uSky: { value: new THREE.Color(0x9ad8f5) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(0xffffff) },
    },
  ]);
  uniforms.tHeight.value = heightTexture();
  uniforms.uTime = shared.uTime;
  uniforms.uNight = shared.uNight;

  const material = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D tHeight;
      uniform vec4 uExtent;
      uniform float uSea, uTime, uNight;
      uniform vec3 uDeep, uShallow, uSky, uSunDir, uSunColor;
      varying vec3 vWorld;

      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

      void main() {
        vec2 uv = (vWorld.xz - uExtent.xy) / uExtent.zw;
        float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        float ground = mix(-40.0, texture2D(tHeight, clamp(uv, 0.0, 1.0)).r, inside);
        float depth = uSea - ground;
        float shallow = 1.0 - smoothstep(0.0, 3.2, depth);
        vec3 col = mix(uDeep, uShallow, shallow);

        // banded swell, quantised for the pixel look
        float w = sin(vWorld.x * 0.35 + uTime * 0.8 + sin(vWorld.z * 0.2 + uTime * 0.3) * 2.0)
                + sin(vWorld.z * 0.9 - uTime * 1.1 + vWorld.x * 0.15);
        col *= 0.92 + 0.08 * floor((w * 0.5 + 0.5) * 3.0) / 3.0;

        // horizon reflection of the sky
        vec3 view = normalize(vWorld - cameraPosition);
        float fres = pow(1.0 - abs(view.y), 4.0);
        col = mix(col, uSky, fres * 0.55);

        // sun glitter path
        vec3 refl = reflect(view, vec3(0.0, 1.0, 0.0));
        float sun = pow(max(dot(refl, normalize(uSunDir)), 0.0), 60.0);
        vec2 cell = floor(vWorld.xz * vec2(1.4, 3.0));
        float sparkle = step(0.96, h21(cell + floor(uTime * 2.0)));
        col += uSunColor * sun * (0.35 + sparkle * 1.6) * (1.0 - uNight * 0.6);

        // scattered whitecaps
        float cap = step(0.993, h21(floor(vWorld.xz * vec2(0.8, 2.2)) + floor(uTime * 0.7)));
        col = mix(col, vec3(0.92, 0.97, 1.0), cap * 0.45 * (1.0 - shallow));

        // shoreline foam that breathes
        float foam = smoothstep(0.55, 0.0, depth + sin(uTime * 1.3 + vWorld.x * 0.4) * 0.12);
        col = mix(col, vec3(0.95, 0.98, 1.0), foam * 0.85);

        col *= mix(1.0, 0.32, uNight);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(900, 900, 1, 1), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = SEA;
  mesh.name = 'sea';
  return mesh;
}

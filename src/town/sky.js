import * as THREE from 'three';
import { makeRng } from './rng.js';
import { cloudRamp, shared } from './materials.js';

// Colour keyframes across a 24h day. Each row: hour, sky top, horizon,
// sun colour, sun intensity, hemi sky, hemi ground, ambient night factor.
const KEYS = [
  [0.0, 0x0b1430, 0x1d2b52, 0x8fa8ff, 0.25, 0x3a4a7a, 0x141a28, 1],
  [4.6, 0x0f1a3a, 0x2a3765, 0x8fa8ff, 0.2, 0x3a4a7a, 0x141a28, 1],
  [5.6, 0x3a4f8a, 0xf2a48c, 0xffb27a, 0.7, 0x8a8fb8, 0x3c3a3a, 0.55],
  [6.6, 0x4f9fe0, 0xffd6a8, 0xffd8a0, 1.6, 0xb8d8f0, 0x5c6e4f, 0.1],
  [8.5, 0x2f8fe8, 0xa8e2fa, 0xfff1d0, 2.4, 0xbfeeff, 0x5c6e4f, 0],
  [13.0, 0x1f86ea, 0x98dcf8, 0xfffae8, 2.6, 0xc6f0ff, 0x60734f, 0],
  [16.6, 0x3a8fe0, 0xb8e0f0, 0xffe0b0, 2.2, 0xc0e4f5, 0x5c6e4f, 0],
  [18.1, 0x5a70c0, 0xffb07a, 0xff9a5a, 1.4, 0xd0a8a8, 0x4a4a42, 0.2],
  [19.0, 0x2e3a78, 0xe0708a, 0xff7050, 0.6, 0x7a6a98, 0x2a2a38, 0.6],
  [20.0, 0x121c42, 0x33406e, 0x8fa8ff, 0.25, 0x3a4a7a, 0x141a28, 1],
  [24.0, 0x0b1430, 0x1d2b52, 0x8fa8ff, 0.25, 0x3a4a7a, 0x141a28, 1],
];

const ca = new THREE.Color();
const cb = new THREE.Color();
function mixHex(a, b, t, out) {
  ca.set(a);
  cb.set(b);
  return out.copy(ca).lerp(cb, t);
}

export function sampleSky(hour) {
  let i = 0;
  while (i < KEYS.length - 2 && hour >= KEYS[i + 1][0]) i += 1;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = THREE.MathUtils.clamp((hour - a[0]) / (b[0] - a[0]), 0, 1);
  const s = t * t * (3 - 2 * t);
  return {
    top: mixHex(a[1], b[1], s, new THREE.Color()),
    horizon: mixHex(a[2], b[2], s, new THREE.Color()),
    sun: mixHex(a[3], b[3], s, new THREE.Color()),
    sunIntensity: THREE.MathUtils.lerp(a[4], b[4], s),
    hemiSky: mixHex(a[5], b[5], s, new THREE.Color()),
    hemiGround: mixHex(a[6], b[6], s, new THREE.Color()),
    night: THREE.MathUtils.lerp(a[7], b[7], s),
  };
}

// Sun travels east (+X) to west (-X), arcing over the sea behind the town so
// the town is softly back-lit like the panorama.
export function sunDirection(hour, out = new THREE.Vector3()) {
  const a = ((hour - 6) / 12) * Math.PI;
  return out.set(Math.cos(a) * 0.9, Math.sin(a), -0.45).normalize();
}

export function buildSkyDome() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() },
      uNight: shared.uNight,
      uTime: shared.uTime,
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHorizon, uSunDir, uSunColor;
      uniform float uNight, uTime;
      varying vec3 vDir;
      float h31(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float y = max(d.y, -0.1);
        float t = pow(smoothstep(-0.05, 0.75, y), 0.7);
        vec3 col = mix(uHorizon, uTop, t);
        vec3 sd = normalize(uSunDir);
        float sd0 = dot(d, sd);
        // sun disc + glow
        col += uSunColor * smoothstep(0.9975, 0.9985, sd0) * (1.0 - uNight) * 1.4;
        col += uSunColor * pow(max(sd0, 0.0), 12.0) * 0.28;
        // moon opposite the sun
        float md = dot(d, -sd);
        col = mix(col, vec3(0.96, 0.94, 0.85), smoothstep(0.9988, 0.9993, md) * uNight);
        col += vec3(0.5, 0.6, 0.9) * pow(max(md, 0.0), 40.0) * 0.25 * uNight;
        // twinkling stars
        vec3 cell = floor(d * 180.0);
        float star = step(0.9965, h31(cell));
        float tw = 0.6 + 0.4 * sin(uTime * 3.0 + h31(cell + 7.0) * 40.0);
        col += vec3(1.0) * star * tw * uNight * smoothstep(0.02, 0.2, d.y);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), material);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

// Chunky cumulus clouds built from flat-shaded puffs.
export function buildClouds() {
  const rng = makeRng(42);
  const group = new THREE.Group();
  const material = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: cloudRamp, fog: false });
  const puff = new THREE.IcosahedronGeometry(1, 1);
  const clouds = [];
  for (let i = 0; i < 16; i += 1) {
    const cloud = new THREE.Group();
    const size = rng.range(3.5, 9);
    const puffs = rng.int(4, 8);
    for (let p = 0; p < puffs; p += 1) {
      const m = new THREE.Mesh(puff, material);
      const s = size * rng.range(0.35, 0.65) * (1 - Math.abs(p - puffs / 2) / puffs);
      m.scale.set(s * 1.1, s * 0.85, s);
      m.position.set((p - puffs / 2) * size * 0.28, s * 0.3 + rng.range(0, size * 0.18), rng.range(-1, 1) * size * 0.15);
      cloud.add(m);
    }
    // flat bottoms like the source art
    const base = new THREE.Mesh(puff, material);
    base.scale.set(size * 0.95, size * 0.18, size * 0.35);
    cloud.add(base);
    cloud.position.set(rng.range(-190, 190), rng.range(13, 27), rng.range(-210, -85));
    cloud.userData.speed = rng.range(0.4, 1.1);
    group.add(cloud);
    clouds.push(cloud);
  }
  group.userData.material = material;
  group.userData.update = (dt) => {
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 190) c.position.x = -190;
    }
  };
  return group;
}

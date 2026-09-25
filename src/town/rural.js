import * as THREE from 'three';
import { gableGeometry, hipGeometry, mat4 } from './batcher.js';
import { distToPolyline, EXTENT, heightAt, riverZ, RURAL_ROAD, RURAL_Y, VALLEY } from './terrain.js';
import { groundRange, house, PALETTE, solids, stoneLantern, torii } from './buildings.js';
import { bush, hydrangea, paddyCell, pineTree, roundTree, utilityPole, vendingMachine } from './props.js';
import { makeSign } from './signs.js';
import { shared } from './materials.js';
import { DENSITY } from './quality.js';

// Yamate (山手): the farming valley beyond the road tunnel. Thatched minka,
// paddies, a river with a water wheel, a torii path, a pagoda and cedar
// forest on the valley walls.

const cyl6 = new THREE.CylinderGeometry(1, 1, 1, 6);
const cyl8 = new THREE.CylinderGeometry(1, 1, 1, 8);
const cone6 = new THREE.ConeGeometry(1, 1, 6);
const blob = new THREE.IcosahedronGeometry(1, 0);

const THATCH = 0xa88e5c;
const DARK_WOOD = 0x4e3322;
const PLASTER = 0xefe8d6;
const TILE = 0x4a5260;

export const BRIDGE = (() => {
  // where the road crosses the river
  let best = null;
  for (let i = 0; i < RURAL_ROAD.length - 1; i += 1) {
    const [ax, az] = RURAL_ROAD[i];
    const [bx, bz] = RURAL_ROAD[i + 1];
    for (let t = 0; t <= 1; t += 0.002) {
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const d = Math.abs(z - riverZ(x));
      if (x > 70 && (!best || d < best.d)) best = { x, z, d, ry: Math.atan2(-(bz - az), bx - ax) };
    }
  }
  return best;
})();

function minka(B, rng, x, z, ry = 0) {
  const w = rng.range(4.2, 5.2);
  const d = rng.range(3.0, 3.6);
  const { hi } = groundRange(x, z, w + 1, d + 1, ry);
  solids.push({ x, z, w: w + 0.4, d: d + 0.4, ry });
  B.at(x, hi, z, ry, () => {
    B.block('solid', w + 0.6, 0.35, d + 0.6, 0, -0.2, 0, 0x9a9a8e, { jitter: 0.06 });
    B.block('solid', w, 1.3, d, 0, 0.15, 0, PLASTER);
    // timber frame
    for (let i = 0; i <= 5; i += 1) {
      const px = -w / 2 + (i / 5) * w;
      B.block('solid', 0.12, 1.3, d + 0.04, px, 0.15, 0, DARK_WOOD);
    }
    B.box('solid', w + 0.04, 0.12, d + 0.04, 0, 1.4, 0, DARK_WOOD);
    B.box('solid', w + 0.04, 0.1, d + 0.04, 0, 0.2, 0, DARK_WOOD);
    // shoji along the front, glowing at night
    for (let i = 0; i < 4; i += 1) {
      B.box('glow', w / 5 - 0.14, 0.9, 0.04, -w / 2 + ((i + 1.5) / 5) * w - w / 10, 0.72, d / 2 + 0.02, 0xf4eedc, { lit: 1, emit: 0xffd898 });
    }
    // engawa veranda
    B.block('solid', w, 0.08, 0.6, 0, 0.2, d / 2 + 0.3, 0x9a7048);
    for (const px of [-w / 2 + 0.1, 0, w / 2 - 0.1]) B.block('solid', 0.08, 0.3, 0.08, px, -0.1, d / 2 + 0.55, DARK_WOOD);
    // tall thatched hip roof with a dark ridge cap and crossed chigi
    B.geo('solid', hipGeometry(w + 1.3, d + 1.4, 2.3), 0, 1.45, 0, THATCH, { jitter: 0.05 });
    B.box('solid', w + 1.34, 0.12, d + 1.44, 0, 1.47, 0, 0x8a7448);
    const ridge = Math.max(0.6, w + 1.3 - (d + 1.4) * 0.9);
    B.box('solid', ridge + 0.4, 0.34, 0.6, 0, 3.72, 0, 0x3e3a34);
    for (let i = 0; i < 4; i += 1) {
      const px = -ridge / 2 + (i / 3) * ridge;
      B.box('solid', 0.08, 0.6, 0.08, px, 3.9, 0.12, 0x3e3a34, { rx: 0.5 });
      B.box('solid', 0.08, 0.6, 0.08, px, 3.9, -0.12, 0x3e3a34, { rx: -0.5 });
    }
  });
}

function kura(B, x, z, ry = 0) {
  const w = 2.2;
  const d = 2.6;
  const { hi } = groundRange(x, z, w, d, ry);
  solids.push({ x, z, w: w + 0.3, d: d + 0.3, ry });
  B.at(x, hi, z, ry, () => {
    B.block('solid', w + 0.2, 0.5, d + 0.2, 0, -0.3, 0, 0x2e2e30);
    B.block('solid', w, 2.4, d, 0, 0.2, 0, 0xf2eee4);
    B.box('solid', w + 0.04, 0.5, d + 0.04, 0, 0.45, 0, 0x2e2e30);
    for (let i = 0; i < 6; i += 1) B.box('solid', 0.02, 0.5, d + 0.06, -w / 2 + 0.2 + i * 0.36, 0.45, 0, 0xe8e4da);
    B.box('solid', 0.5, 0.5, 0.06, 0, 1.9, d / 2 + 0.02, 0x2e2e30);
    B.block('solid', 0.8, 1.2, 0.08, 0, 0.2, d / 2 + 0.03, 0x3a3a3c);
    B.geo('solid', gableGeometry(d + 0.6, w + 0.6, 0.8), 0, 2.6, 0, TILE, { ry: Math.PI / 2 });
    B.box('solid', 0.24, 0.16, d + 0.8, 0, 3.4, 0, 0x2e2e30);
  });
}

function sugi(B, x, z, s, y = heightAt(x, z)) {
  const sway = (bx, by) => Math.max(0, (by - y) / (4 * s)) * 0.7;
  B.geo('foliage', cyl6, x, y + 0.8 * s, z, 0x5a3a26, { sx: 0.12 * s, sy: 1.6 * s, sz: 0.12 * s, sway: 0 });
  const greens = [0x234f2c, 0x2a5a32, 0x31663a];
  for (let i = 0; i < 4; i += 1) {
    const r = (0.62 - i * 0.12) * s;
    B.geo('foliage', cone6, x, y + (1.4 + i * 0.7) * s, z, greens[i % 3], { sx: r, sy: 1.3 * s, sz: r, ry: i * 0.7, sway });
  }
}

function persimmon(B, rng, x, z) {
  const y = heightAt(x, z);
  roundTree(B, rng, x, z, 1.1, y);
  for (let i = 0; i < 9; i += 1) {
    const a = rng.next() * Math.PI * 2;
    const r = rng.range(0.3, 0.6);
    B.geo('foliage', blob, x + Math.cos(a) * r, y + rng.range(1.0, 1.7), z + Math.sin(a) * r, 0xf07a28, { sx: 0.07, sy: 0.07, sz: 0.07, sway: 0.8 });
  }
}

function bamboo(B, rng, x, z) {
  const y = heightAt(x, z);
  const h = rng.range(3.4, 5.2);
  const lean = rng.range(-0.08, 0.08);
  const sway = (bx, by) => Math.max(0, (by - y) / h) * 1.6;
  B.geo('foliage', cyl6, x, y + h / 2, z, rng.pick([0x7aa84a, 0x86b454, 0x6a9a42]), { sx: 0.05, sy: h, sz: 0.05, rz: lean, sway });
  for (let k = 1; k < 5; k += 1) B.geo('foliage', cyl6, x - lean * h * (k / 5), y + (k / 5) * h, z, 0x5a8a36, { sx: 0.065, sy: 0.04, sz: 0.065, sway });
  for (let k = 0; k < 4; k += 1) {
    B.geo('foliage', blob, x - lean * h + rng.range(-0.4, 0.4), y + h * rng.range(0.7, 1.0), z + rng.range(-0.4, 0.4), rng.pick([0x5a9a3a, 0x6aaa44, 0x4a8a34]), {
      sx: 0.36, sy: 0.14, sz: 0.3, ry: rng.next() * 3, sway,
    });
  }
}

function greenhouse(B, x, z, len = 6) {
  const y = heightAt(x, z);
  const R = 1.2;
  solids.push({ x, z, w: len, d: 2 * R + 0.2, ry: 0 });
  // vinyl skin: arched quads along X, both windings
  const verts = [];
  const n = 10;
  for (let i = 0; i < n; i += 1) {
    const a0 = (i / n) * Math.PI;
    const a1 = ((i + 1) / n) * Math.PI;
    const p = (a, xx) => [xx, Math.sin(a) * R * 1.1, Math.cos(a) * R];
    const q = [p(a0, -len / 2), p(a0, len / 2), p(a1, len / 2), p(a1, -len / 2)];
    for (const tri of [[0, 1, 2], [0, 2, 3], [0, 2, 1], [0, 3, 2]]) for (const k of tri) verts.push(...q[k]);
  }
  // end walls
  for (const ex of [-len / 2, len / 2]) {
    for (let i = 0; i < n; i += 1) {
      const a0 = (i / n) * Math.PI;
      const a1 = ((i + 1) / n) * Math.PI;
      const c = [ex, 0, 0];
      const p0 = [ex, Math.sin(a0) * R * 1.1, Math.cos(a0) * R];
      const p1 = [ex, Math.sin(a1) * R * 1.1, Math.cos(a1) * R];
      verts.push(...c, ...p0, ...p1, ...c, ...p1, ...p0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  B.geo('glow', g, x, y, z, 0xe4eeec, { lit: 0 });
  for (let i = 0; i <= 4; i += 1) {
    B.geo('solid', new THREE.TorusGeometry(R + 0.02, 0.03, 4, 10, Math.PI), x - len / 2 + (i / 4) * len, y, z, 0x8a9090, { ry: Math.PI / 2, sy: 1.1 });
  }
  // rows of seedlings inside
  for (let r = -1; r <= 1; r += 1) B.box('solid', len - 0.4, 0.14, 0.3, x, y + 0.07, z + r * 0.6, 0x5aa040);
}

function hazakake(B, rng, x, z, ry) {
  const y = heightAt(x, z);
  B.at(x, y, z, ry, () => {
    for (let i = 0; i < 4; i += 1) {
      const px = -2.4 + i * 1.6;
      B.box('solid', 0.05, 1.5, 0.05, px, 0.7, 0.12, 0x8a6a44, { rx: 0.18 });
      B.box('solid', 0.05, 1.5, 0.05, px, 0.7, -0.12, 0x8a6a44, { rx: -0.18 });
    }
    B.box('solid', 5.2, 0.05, 0.05, 0, 1.28, 0, 0x8a6a44);
    for (let i = 0; i < 16; i += 1) {
      B.box('foliage', 0.28, 0.6, 0.16, -2.3 + i * 0.3, 1.02, 0, rng.pick([0xd8b860, 0xc8a850, 0xe0c470]), { sway: 0.3 });
    }
  });
}

function scarecrow(B, x, z, ry) {
  const y = heightAt(x, z) + 0.1;
  B.at(x, y, z, ry, () => {
    B.block('solid', 0.05, 1.2, 0.05, 0, 0, 0, 0x8a6a44);
    B.box('solid', 0.9, 0.05, 0.05, 0, 0.9, 0, 0x8a6a44);
    B.box('foliage', 0.4, 0.45, 0.2, 0, 0.8, 0, 0x3a6ab8, { sway: 0.4 });
    B.geo('solid', blob, 0, 1.18, 0, 0xf2eee0, { sx: 0.14, sy: 0.14, sz: 0.14 });
    B.geo('solid', cone6, 0, 1.36, 0, 0xd8b860, { sx: 0.3, sy: 0.16, sz: 0.3 });
  });
}

function jizo(B, x, z, ry) {
  const y = heightAt(x, z);
  B.at(x, y, z, ry, () => {
    B.block('solid', 0.34, 0.1, 0.3, 0, 0, 0, 0x8e8e84);
    B.geo('solid', cyl8, 0, 0.3, 0, 0xaeaea2, { sx: 0.12, sy: 0.4, sz: 0.11 });
    B.geo('solid', blob, 0, 0.58, 0, 0xb4b4a8, { sx: 0.1, sy: 0.11, sz: 0.1 });
    B.box('solid', 0.26, 0.14, 0.04, 0, 0.4, 0.1, 0xd8322a, { rx: 0.2 });
    B.geo('solid', cone6, 0, 0.72, 0, 0xd8322a, { sx: 0.11, sy: 0.1, sz: 0.11 });
  });
}

function busStop(B, decor, rng, x, z) {
  const y = RURAL_Y;
  solids.push({ x, z: z + 0.2, w: 2.2, d: 1.2, ry: 0 });
  B.at(x, y, z, 0, () => {
    B.block('solid', 2.2, 0.08, 1.2, 0, 0, 0.2, 0xb8b4a8);
    for (const px of [-1, 1]) B.block('solid', 0.08, 1.4, 0.08, px, 0, 0.7, 0x6a6a64);
    B.block('solid', 2.1, 1.3, 0.06, 0, 0, 0.75, 0x9a7048);
    B.geo('solid', gableGeometry(2.6, 1.6, 0.4), 0, 1.4, 0.3, 0x8a3a2a);
    B.block('solid', 1.6, 0.06, 0.34, 0, 0.42, 0.52, 0xa8733c);
    B.block('solid', 0.05, 1.6, 0.05, -1.5, 0, -0.2, 0x888888);
    B.box('glow', 0.5, 0.5, 0.04, -1.5, 1.75, -0.2, 0xe8e8e0, { lit: 1, emit: 0xfff4d8 });
  });
  const sign = makeSign({ lines: [['山手', 1], ['YAMATE', 0.6]], width: 0.46, height: 0.46, bg: '#1f5fa8', fg: '#ffffff', border: '#ffffff', pxPerUnit: 96 });
  sign.position.set(x - 1.5, y + 1.75, z - 0.17);
  decor.add(sign);
  vendingMachine(B, rng, x + 1.7, z + 0.55, 0, 0xd83a3a);
}

function pagoda(B, x, z) {
  const y = heightAt(x, z);
  solids.push({ x, z, w: 3.2, d: 3.2, ry: 0 });
  B.at(x, y, z, 0.2, () => {
    B.block('solid', 3.2, 0.5, 3.2, 0, -0.3, 0, 0x9a9a90);
    let base = 0.2;
    for (let t = 0; t < 3; t += 1) {
      const s = 1 - t * 0.17;
      const bw = 1.9 * s;
      B.block('solid', bw, 1.0, bw, 0, base, 0, 0xb8462c);
      B.box('glow', bw * 0.4, 0.5, 0.04, 0, base + 0.5, bw / 2 + 0.02, 0x3a2418, { lit: 1, emit: 0xffb060 });
      B.box('solid', bw + 0.1, 0.1, bw + 0.1, 0, base + 1.0, 0, 0xf0e8d0);
      B.geo('solid', hipGeometry(3.2 * s, 3.2 * s, 0.55), 0, base + 1.05, 0, 0x3c3e44);
      B.box('solid', 3.2 * s, 0.06, 3.2 * s, 0, base + 1.06, 0, 0x5a5e66);
      base += 1.45 * s;
    }
    B.geo('solid', cyl6, 0, base + 1.0, 0, 0xc8a038, { sx: 0.06, sy: 2.0, sz: 0.06 });
    for (let i = 0; i < 6; i += 1) B.geo('solid', cyl8, 0, base + 0.3 + i * 0.26, 0, 0xd8b048, { sx: 0.16, sy: 0.05, sz: 0.16 });
  });
}

function templeHall(B, decor, x, z) {
  const y = heightAt(x, z);
  solids.push({ x, z, w: 6, d: 4.6, ry: 0 });
  B.at(x, y, z, Math.PI, () => {
    B.block('solid', 6.4, 0.7, 5.0, 0, -0.4, 0, 0x9a9a90, { jitter: 0.05 });
    B.block('solid', 5.0, 1.8, 3.6, 0, 0.3, 0, 0x6a4a30);
    for (let i = 0; i < 5; i += 1) B.box('glow', 0.8, 1.2, 0.04, -1.8 + i * 0.9, 1.0, 1.82, 0xf2ead4, { lit: 1, emit: 0xffcc80 });
    B.block('solid', 5.8, 0.1, 1.0, 0, 0.3, 2.3, 0x8a6040);
    for (let i = 0; i < 4; i += 1) B.block('solid', 1.6, 0.3 - i * 0.02, 0.3, 0, -0.4 + i * 0.18, 3.2 - i * 0.3, 0x9a9a90);
    B.geo('solid', hipGeometry(7.4, 5.6, 1.7), 0, 2.1, 0, 0x44484f);
    B.box('solid', 7.4, 0.08, 5.6, 0, 2.12, 0, 0x5c6068);
    B.box('solid', 3.4, 0.3, 0.3, 0, 3.8, 0, 0x2c2e34);
  });
  const plaque = makeSign({ lines: ['山手寺'], width: 1.1, height: 0.38, bg: '#3a2616', fg: '#f2d27a', border: '#c8a038', pxPerUnit: 96 });
  plaque.position.set(x, y + 1.95, z - 1.86);
  plaque.rotation.y = Math.PI;
  decor.add(plaque);
  // bell tower
  B.at(x - 5, heightAt(x - 5, z + 1), z + 1, 0, () => {
    for (const sx of [-0.6, 0.6]) for (const sz of [-0.6, 0.6]) B.block('solid', 0.12, 2.2, 0.12, sx, 0, sz, 0x6a4a30);
    B.geo('solid', hipGeometry(2.0, 2.0, 0.7), 0, 2.2, 0, 0x44484f);
    B.geo('solid', cyl8, 0, 1.6, 0, 0x5a6a5a, { sx: 0.35, sy: 0.8, sz: 0.35 });
  });
}

// Water ribbon along the river with a flowing, quantised shader.
function riverWater() {
  const verts = [];
  const uvs = [];
  const y = VALLEY - 0.72;
  for (let x = 64; x < 192; x += 0.5) {
    const z1 = riverZ(x);
    const z2 = riverZ(x + 0.5);
    const hw = 1.9;
    verts.push(x, y, z1 - hw, x, y, z1 + hw, x + 0.5, y, z2 + hw, x, y, z1 - hw, x + 0.5, y, z2 + hw, x + 0.5, y, z2 - hw);
    uvs.push(x, 0, x, 1, x + 0.5, 1, x, 0, x + 0.5, 1, x + 0.5, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const material = new THREE.ShaderMaterial({
    fog: true,
    side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime, uNight;
      varying vec2 vUv;
      void main() {
        float edge = 1.0 - smoothstep(0.0, 0.18, min(vUv.y, 1.0 - vUv.y));
        vec3 col = mix(vec3(0.16, 0.5, 0.62), vec3(0.3, 0.68, 0.72), 0.5 + 0.5 * sin(vUv.y * 6.28));
        float flow = sin(vUv.x * 1.3 + uTime * 2.2 + sin(vUv.y * 9.0) * 0.8);
        col += vec3(0.5, 0.6, 0.6) * step(0.93, flow) * 0.5;
        col = mix(col, vec3(0.85, 0.92, 0.9), edge * 0.6);
        col *= mix(1.0, 0.3, uNight);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  material.uniforms.uTime = shared.uTime;
  material.uniforms.uNight = shared.uNight;
  const mesh = new THREE.Mesh(g, material);
  mesh.name = 'river';
  return mesh;
}

function waterWheel(parent, x, z) {
  const wheel = new THREE.Group();
  const wood = new THREE.MeshToonMaterial({ color: 0x7a5234 });
  const dark = new THREE.MeshToonMaterial({ color: 0x4e3322 });
  const R = 1.3;
  for (const sz of [-0.3, 0.3]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.06, 4, 16), dark);
    rim.position.z = sz;
    wheel.add(rim);
  }
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.66), wood);
    paddle.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    paddle.rotation.z = a + Math.PI / 2;
    wheel.add(paddle);
    if (i % 3 === 0) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(2 * R, 0.06, 0.06), dark);
      spoke.rotation.z = a;
      wheel.add(spoke);
    }
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.9, 8), dark);
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);
  wheel.traverse((m) => { m.castShadow = true; });
  const holder = new THREE.Group();
  holder.position.set(x, VALLEY - 0.35, z);
  holder.rotation.y = Math.PI / 2;
  holder.add(wheel);
  parent.add(holder);
  return (t) => { wheel.rotation.z = -t * 0.6; };
}

function egrets(parent, rng, spots) {
  const white = new THREE.MeshToonMaterial({ color: 0xf8f8f4 });
  const beak = new THREE.MeshToonMaterial({ color: 0xe8b030 });
  const birds = spots.map(([x, z]) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.14), white);
    body.position.y = 0.42;
    g.add(body);
    const neck = new THREE.Group();
    neck.position.set(0.14, 0.46, 0);
    const n = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), white);
    n.position.y = 0.15;
    neck.add(n);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.06), white);
    head.position.set(0.04, 0.3, 0);
    neck.add(head);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.02), beak);
    b.position.set(0.14, 0.3, 0);
    neck.add(b);
    g.add(neck);
    for (const sz of [-0.03, 0.03]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.36, 0.02), beak);
      leg.position.set(0, 0.18, sz);
      g.add(leg);
    }
    g.position.set(x, heightAt(x, z) + 0.05, z);
    g.rotation.y = rng.next() * 6;
    parent.add(g);
    return { g, neck, phase: rng.next() * 10 };
  });
  return (t) => {
    for (const b of birds) {
      const p = (t * 0.4 + b.phase) % 6;
      b.neck.rotation.z = p < 1 ? -Math.sin(p * Math.PI) * 1.4 : 0;
      b.g.rotation.y += p > 5.9 ? 0.02 : 0;
    }
  };
}

export function buildRural(B, decor, rng, parent) {
  const claims = [];
  const free = (x, z, r) => claims.every(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) > r + cr);
  const claim = (x, z, r) => claims.push([x, z, r]);
  const nearRoad = (x, z, r) => distToPolyline(x, z, RURAL_ROAD) < r;
  const nearRiver = (x, z, r) => Math.abs(z - riverZ(x)) < r;

  // --- road
  const pts = [];
  for (let i = 0; i < RURAL_ROAD.length - 1; i += 1) {
    const [ax, az] = RURAL_ROAD[i];
    const [bx, bz] = RURAL_ROAD[i + 1];
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5);
    for (let k = 0; k < n; k += 1) pts.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  pts.push(RURAL_ROAD[RURAL_ROAD.length - 1]);
  const ribbonAt = (offset, width, hex, dy) => {
    const verts = [];
    for (let i = 0; i < pts.length - 1; i += 1) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const lx = (bz - az) / len;
      const lz = -(bx - ax) / len;
      const o1 = offset - width / 2;
      const o2 = offset + width / 2;
      const y = RURAL_Y + dy;
      verts.push(
        ax + lx * o1, y, az + lz * o1, bx + lx * o2, y, bz + lz * o2, ax + lx * o2, y, az + lz * o2,
        ax + lx * o1, y, az + lz * o1, bx + lx * o1, y, bz + lz * o1, bx + lx * o2, y, bz + lz * o2,
      );
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i += 3) {
        const t = [p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)];
        p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
        p.setXYZ(i + 2, ...t);
      }
    }
    B.add('solid', g, new THREE.Matrix4(), hex);
  };
  ribbonAt(0, 3.0, 0x5e676d, 0);
  ribbonAt(1.38, 0.08, 0xf2f4f0, 0.012);
  ribbonAt(-1.38, 0.08, 0xf2f4f0, 0.012);
  for (let i = 0; i < pts.length - 1; i += 4) {
    if (i % 8) continue;
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    B.box('solid', 0.5, 0.02, 0.08, ax, RURAL_Y + 0.012, az, 0xf2f4f0, { ry: Math.atan2(-(bz - az), bx - ax) });
  }
  for (const p of pts) if (pts.indexOf(p) % 2 === 0) claim(p[0], p[1], 2.2);

  // --- bridge over the river
  B.at(BRIDGE.x, RURAL_Y, BRIDGE.z, BRIDGE.ry, () => {
    const L = 8;
    B.box('solid', L, 0.45, 3.4, 0, -0.24, 0, 0xb8b4aa);
    for (const sz of [-1, 1]) {
      B.box('solid', L, 0.12, 0.24, 0, 0.62, sz * 1.62, 0x2f5fa8);
      for (let i = 0; i <= 10; i += 1) B.block('solid', 0.07, 0.6, 0.07, -L / 2 + (i / 10) * L, 0, sz * 1.62, 0x2f5fa8);
      B.block('solid', 0.3, 0.8, 0.3, -L / 2, 0, sz * 1.62, 0x9a9a90);
      B.block('solid', 0.3, 0.8, 0.3, L / 2, 0, sz * 1.62, 0x9a9a90);
    }
    B.block('solid', 0.6, 1.6, 3.0, 0, -2.0, 0, 0x9a9a90);
  });
  const bridgeSign = makeSign({ lines: [['せせらぎ橋', 1]], width: 0.9, height: 0.26, bg: '#e8e6dc', fg: '#2a2a2a', pxPerUnit: 96 });
  bridgeSign.position.set(BRIDGE.x - Math.cos(BRIDGE.ry) * 4.05, RURAL_Y + 0.62, BRIDGE.z + Math.sin(BRIDGE.ry) * 4.05 + 1.62);
  bridgeSign.rotation.y = BRIDGE.ry;
  decor.add(bridgeSign);
  claim(BRIDGE.x, BRIDGE.z, 5);

  // stepping stones further upstream
  for (let i = 0; i < 6; i += 1) {
    const x = 146 + i * 0.1;
    const z = riverZ(146) - 1.8 + i * 0.72;
    B.geo('solid', blob, x, VALLEY - 0.65, z, 0xa8a89c, { sx: 0.34, sy: 0.14, sz: 0.3 });
  }

  // --- landmarks
  const features = [];
  // keep the railway and Yamate station clear
  for (let x = 60; x <= 100; x += 2) claim(x, -7, 3.2);
  // farm by the tunnel exit with a water wheel on the river
  minka(B, rng, 84, 7.5, Math.PI + 0.1);
  kura(B, 79.5, 9.5, Math.PI + 0.1);
  claim(83, 8, 5);
  const wheelZ = riverZ(89) - 2.3;
  features.push(waterWheel(parent, 89, wheelZ));
  B.block('solid', 0.3, 1.4, 1.6, 89.9, VALLEY - 1.2, wheelZ, 0x7a5234);
  B.box('solid', 0.3, 0.3, 6, 89, VALLEY + 0.9, wheelZ - 3.3, 0x7a5234);
  claim(89, wheelZ, 2);
  persimmon(B, rng, 88.5, 4.4);
  persimmon(B, rng, 79, 5);

  // farm south of the road
  minka(B, rng, 78, -13.5, -0.05);
  claim(78, -13.5, 4.5);
  persimmon(B, rng, 83.5, -12);
  hydrangea(B, rng, 75.4, -10.8, 1.1);
  hydrangea(B, rng, 76.4, -10.7, 1.0);

  // farm with greenhouses
  minka(B, rng, 112, -9, 0.05);
  kura(B, 116.5, -10.5, 0);
  claim(113, -9.5, 5.5);
  for (let i = 0; i < 3; i += 1) {
    greenhouse(B, 108 + i * 0.1, 22 + i * 3.1, 7);
    claim(108, 22 + i * 3.1, 3.8);
  }

  // jizo by the tunnel mouth and a bus stop
  for (let i = 0; i < 5; i += 1) jizo(B, 65 + i * 0.5, 0.9, Math.PI);
  claim(66, 1, 2);
  busStop(B, decor, rng, 94, 0.95);
  claim(94.5, 1, 2.6);

  // senbon torii path up the south slope to a small shrine
  const tx = 100;
  for (let z = -8.5; z > -29; z -= 1.05) {
    torii(B, tx, heightAt(tx, z), z, 0.72);
  }
  const sy = heightAt(tx, -31);
  B.at(tx, sy, -31, Math.PI, () => {
    B.block('solid', 2.4, 0.3, 2.2, 0, -0.2, 0, 0x9a9a90);
    B.block('solid', 1.4, 1.1, 1.2, 0, 0.1, 0, 0xb8462c);
    B.geo('solid', gableGeometry(2.0, 1.8, 0.7), 0, 1.2, 0, 0x3c3e44, { ry: Math.PI / 2 });
  });
  stoneLantern(B, tx - 1.2, heightAt(tx - 1.2, -29.6), -29.6, 0.8);
  stoneLantern(B, tx + 1.2, heightAt(tx + 1.2, -29.6), -29.6, 0.8);
  for (let z = -8; z > -31; z -= 1) claim(tx, z, 1.4);

  // temple, pagoda and village at the head of the valley
  templeHall(B, decor, 164, 41.5);
  claim(164, 41.5, 5);
  pagoda(B, 154, 42.5);
  claim(154, 42.5, 3);
  for (let i = 0; i < 6; i += 1) {
    const z = 34 + i * 1.2;
    B.block('solid', 1.6, 0.3, 1.2, 160, heightAt(160, z) - 0.2, z, 0x9a9a90);
  }
  stoneLantern(B, 158.6, heightAt(158.6, 36), 36, 0.9);
  stoneLantern(B, 161.4, heightAt(161.4, 36), 36, 0.9);
  claim(160, 37, 2.4);

  for (const [x, z, ry] of [[146, 24, 0.1], [156, 22, -0.1], [168, 25, 0.05], [174, 20, 0.2]]) {
    minka(B, rng, x, z, ry);
    claim(x, z, 4.6);
  }
  kura(B, 151, 27.5, 0);
  claim(151, 27.5, 2);
  for (const [x, z] of [[130, 30], [135, 35], [171, 36.5], [176, 36]]) {
    if (!free(x, z, 1.8)) continue;
    house(B, rng, { x, z, ry: rng.range(-0.1, 0.1), floors: rng.pick([1, 2]), style: rng.pick(['hip', 'gable']) });
    claim(x, z, 2);
  }
  persimmon(B, rng, 150, 20.5);
  persimmon(B, rng, 162, 27);

  // bamboo grove on the north bank
  for (let i = 0; i < 160 * DENSITY; i += 1) {
    const x = rng.range(68, 84);
    const z = rng.range(riverZ(76) + 3.6, 34);
    if (!free(x, z, 0.1)) continue;
    bamboo(B, rng, x, z);
  }
  claim(76, 28, 7);

  // --- fields: paddies, vegetable rows, drying racks, scarecrows
  const cell = 3.6;
  const paddies = [];
  for (let x = 66; x < 184; x += cell) {
    for (let z = -19; z < 38; z += cell) {
      const cx = x + cell / 2;
      const cz = z + cell / 2;
      if (nearRoad(cx, cz, 3.8) || nearRiver(cx, cz, 4.4) || !free(cx, cz, 2.2)) continue;
      const { lo, hi } = groundRange(cx, cz, cell, cell);
      if (hi - lo > 0.6 || hi > VALLEY + 1.4) continue;
      if (rng.chance(0.12)) {
        // vegetable plot
        const y = heightAt(cx, cz);
        B.block('solid', cell - 0.2, 0.12, cell - 0.2, cx, y - 0.04, cz, 0x7a5a3a);
        for (let r = 0; r < 5; r += 1) {
          for (let k = 0; k < 5; k += 1) {
            B.geo('foliage', blob, cx - 1.3 + k * 0.65, y + 0.16, cz - 1.3 + r * 0.65, rng.pick([0x6ab84a, 0x8ac858, 0x5aa040]), { sx: 0.18, sy: 0.12, sz: 0.18, sway: 0.2 });
          }
        }
      } else {
        paddyCell(B, rng, x, z, cell);
        paddies.push([cx, cz]);
      }
      claim(cx, cz, 1.6);
    }
  }
  for (let i = 0; i < 6; i += 1) {
    const [x, z] = rng.pick(paddies);
    hazakake(B, rng, x, z + 1.9, rng.range(-0.2, 0.2));
  }
  for (let i = 0; i < 5; i += 1) {
    const [x, z] = rng.pick(paddies);
    scarecrow(B, x + 0.4, z, rng.range(0, 6));
  }
  features.push(egrets(parent, rng, Array.from({ length: 6 }, () => rng.pick(paddies))));

  // --- utility poles along the road
  const chain = [];
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    acc += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    if (acc < 11) continue;
    acc = 0;
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const lx = (bz - az) / len;
    const lz = -(bx - ax) / len;
    const px = ax - lx * 2.3;
    const pz = az - lz * 2.3;
    if (Math.abs(pz - riverZ(px)) < 3) continue;
    chain.push(utilityPole(B, px, pz, Math.atan2(-(bz - az), bx - ax) + Math.PI / 2, { lamp: chain.length % 3 === 0 }));
  }

  // --- cedar forest on the valley walls, broadleaf trees on the floor edges
  for (let i = 0; i < 2600 * DENSITY; i += 1) {
    const x = rng.range(58, EXTENT.x1 - 2);
    const z = rng.range(EXTENT.z0 + 2, EXTENT.z1 - 2);
    const h = heightAt(x, z);
    if (h < VALLEY + 0.9 && rng.chance(0.93)) continue;
    if (nearRoad(x, z, 3.8) || nearRiver(x, z, 3) || !free(x, z, 0.9)) continue;
    if (x < 64 && Math.abs(z + 1.9) < 5) continue;
    if (h > VALLEY + 1.6 && rng.chance(0.75)) sugi(B, x, z, rng.range(0.9, 1.5), h);
    else if (rng.chance(0.5)) roundTree(B, rng, x, z, rng.range(0.9, 1.4), h);
    else pineTree(B, rng, x, z, rng.range(0.9, 1.3), h);
    claim(x, z, 0.6);
  }
  // riverside bushes
  for (let x = 70; x < 184; x += rng.range(2.5, 6)) {
    const z = riverZ(x) + rng.pick([-1, 1]) * rng.range(2.6, 3.4);
    if (!free(x, z, 0.4) || nearRoad(x, z, 2.6)) continue;
    bush(B, rng, x, z, rng.range(0.8, 1.2));
  }

  parent.add(riverWater());
  const fireflySpots = [];
  for (let i = 0; i < 70; i += 1) {
    const x = rng.range(70, 182);
    fireflySpots.push([x, VALLEY + rng.range(-0.2, 1.4), riverZ(x) + rng.range(-3, 3), rng.range(0, 10)]);
  }

  return {
    chain,
    fireflySpots,
    lights: [[0xfff4d8, 94 - 1.5, RURAL_Y + 1.6, 0.8, 7], [0xffcc80, 164, heightAt(164, 44) + 1.2, 44.5, 9]],
    update(t) {
      for (const f of features) f(t);
    },
  };
}

export { mat4 };

import * as THREE from 'three';
import { gableGeometry, hipGeometry } from './batcher.js';
import {
  BASIN, closestOnPolyline, heightAt, MOUNTAIN_ROAD, MOUNTAIN_ROAD_LENGTH, mountainRoadY, RAIL,
} from './terrain.js';
import { solids, stoneLantern, torii } from './buildings.js';
import { curveMirror } from './props.js';
import { footpath } from './paths.js';
import { makeSign } from './signs.js';
import { shared, toonRamp } from './materials.js';
import { makeRng } from './rng.js';

// 山の湯温泉 (Yama-no-yu Onsen): a hot-spring village in a high basin.

const cyl6 = new THREE.CylinderGeometry(1, 1, 1, 6);
const cyl8 = new THREE.CylinderGeometry(1, 1, 1, 8);
const blob = new THREE.IcosahedronGeometry(1, 0);
const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: toonRamp });

const WOOD = 0x5a3a26;
const WOOD_LIGHT = 0x8a6040;
const TILE = 0x3c3e44;
const HOT = 0x8fd8c8;

// ---------------------------------------------------------------- steam

// GPU particles: each puff rises, drifts and fades on a loop; no CPU work.
export function createSteam(parent) {
  const sources = [];
  return {
    add(x, y, z, spread = 1, count = 12, height = 2.5) {
      sources.push({ x, y, z, spread, count, height });
    },
    build() {
      const n = sources.reduce((a, s) => a + s.count, 0);
      const base = new Float32Array(n * 3);
      const params = new Float32Array(n * 4);
      const rng = makeRng(77);
      let k = 0;
      for (const s of sources) {
        for (let i = 0; i < s.count; i += 1) {
          base[k * 3] = s.x + rng.range(-s.spread, s.spread);
          base[k * 3 + 1] = s.y;
          base[k * 3 + 2] = s.z + rng.range(-s.spread, s.spread) * 0.8;
          params[k * 4] = rng.next(); // phase
          params[k * 4 + 1] = rng.range(0.12, 0.25); // speed
          params[k * 4 + 2] = s.height * rng.range(0.7, 1.2);
          params[k * 4 + 3] = rng.range(0.6, 1.2); // size
          k += 1;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(base, 3));
      g.setAttribute('params', new THREE.BufferAttribute(params, 4));
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: shared.uTime, uNight: shared.uNight, uScale: { value: 300 } },
        vertexShader: /* glsl */ `
          attribute vec4 params;
          uniform float uTime, uScale;
          varying float vAlpha;
          void main() {
            float t = fract(uTime * params.y + params.x);
            vec3 p = position;
            p.y += t * params.z;
            p.x += sin(uTime * 0.7 + params.x * 20.0) * 0.4 * t + t * 0.6;
            p.z += cos(uTime * 0.5 + params.x * 13.0) * 0.3 * t;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = params.w * (0.6 + t * 1.8) * uScale / -mv.z;
            vAlpha = sin(t * 3.14159) * 0.55;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uNight;
          varying float vAlpha;
          void main() {
            vec2 c = gl_PointCoord - 0.5;
            float d = dot(c, c);
            if (d > 0.25) discard;
            vec3 col = mix(vec3(0.96, 0.97, 0.98), vec3(0.55, 0.6, 0.75), uNight);
            gl_FragColor = vec4(col, vAlpha * (1.0 - d * 3.0));
          }
        `,
      });
      const points = new THREE.Points(g, mat);
      points.layers.set(1);
      points.frustumCulled = false;
      points.name = 'steam';
      parent.add(points);
      return mat;
    },
  };
}

// ---------------------------------------------------------------- road

function mountainRoad(B) {
  const pts = [];
  const n = Math.ceil(MOUNTAIN_ROAD_LENGTH / 0.5);
  // sample the polyline, rounding the hairpins a little
  const seg = [];
  let acc = 0;
  for (let i = 0; i < MOUNTAIN_ROAD.length - 1; i += 1) {
    const [ax, az] = MOUNTAIN_ROAD[i];
    const [bx, bz] = MOUNTAIN_ROAD[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    seg.push({ ax, az, bx, bz, len, s0: acc });
    acc += len;
  }
  for (let i = 0; i <= n; i += 1) {
    const s = (i / n) * acc;
    const sg = seg.find((q) => s <= q.s0 + q.len + 1e-6) ?? seg[seg.length - 1];
    const t = (s - sg.s0) / sg.len;
    pts.push({ x: sg.ax + (sg.bx - sg.ax) * t, z: sg.az + (sg.bz - sg.az) * t, y: mountainRoadY(s), tx: (sg.bx - sg.ax) / sg.len, tz: (sg.bz - sg.az) / sg.len });
  }
  const road = [];
  const edge = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    const q = (p, w, dy) => [p.x - p.tz * w, p.y + dy, p.z + p.tx * w];
    for (const [arr, w0, w1, dy] of [[road, -1.5, 1.5, 0], [edge, -1.4, -1.33, 0.012], [edge, 1.33, 1.4, 0.012]]) {
      const v = [q(a, w0, dy), q(b, w0, dy), q(b, w1, dy), q(a, w1, dy)];
      for (const k of [0, 2, 1, 0, 3, 2]) arr.push(...v[k]);
    }
  }
  for (const [arr, hex] of [[road, 0x5e676d], [edge, 0xf2f4f0]]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    B.add('solid', g, new THREE.Matrix4(), hex);
  }
  // guardrails on the downhill side, snow poles, mirrors at hairpins
  for (let i = 4; i < pts.length - 4; i += 3) {
    const p = pts[i];
    for (const side of [-1, 1]) {
      const ox = p.x - p.tz * side * 1.75;
      const oz = p.z + p.tx * side * 1.75;
      if (heightAt(ox + (-p.tz * side) * 1.5, oz + p.tx * side * 1.5) > p.y) continue; // uphill side
      B.block('solid', 0.06, 0.55, 0.06, ox, p.y, oz, 0xf2f2ea);
      B.box('solid', 1.55, 0.14, 0.04, ox, p.y + 0.45, oz, 0xf6f6f0, { ry: Math.atan2(-p.tz, p.tx) });
      if (i % 12 === 0) {
        B.block('solid', 0.05, 1.6, 0.05, ox, p.y, oz, 0xf2f2ea);
        B.box('solid', 0.06, 0.2, 0.06, ox, p.y + 1.5, oz, 0xd83a2a);
      }
    }
  }
  for (let i = 1; i < MOUNTAIN_ROAD.length - 1; i += 1) {
    const [x, z] = MOUNTAIN_ROAD[i];
    const [px, pz] = MOUNTAIN_ROAD[i - 1];
    const [nx, nz] = MOUNTAIN_ROAD[i + 1];
    const out = [x - (px + nx) / 2, z - (pz + nz) / 2];
    const len = Math.hypot(...out) || 1;
    curveMirror(B, x + (out[0] / len) * 2.4, z + (out[1] / len) * 2.4, Math.atan2(out[0], out[1]) + Math.PI, heightAt(x, z) + 0.1);
  }
  return pts;
}

// ---------------------------------------------------------------- buildings

function ryokan(B, decor, x, z, ry, floors, name) {
  const y = heightAt(x, z);
  const w = 7.5;
  const d = 4.6;
  solids.push({ x, z, w: w + 0.4, d: d + 0.4, ry });
  B.at(x, y, z, ry, () => {
    B.block('solid', w + 0.6, 0.5, d + 0.6, 0, -0.35, 0, 0x8e8c82, { jitter: 0.05 });
    for (let f = 0; f < floors; f += 1) {
      const fy = 0.15 + f * 1.25;
      B.block('solid', w, 1.15, d, 0, fy, 0, f === 0 ? WOOD : 0xefe6d0);
      for (let i = 0; i < 8; i += 1) {
        B.block('solid', 0.1, 1.15, d + 0.04, -w / 2 + (i / 7) * w, fy, 0, WOOD);
        if (i < 7) B.box('glow', w / 7 - 0.2, 0.62, 0.04, -w / 2 + ((i + 0.5) / 7) * w, fy + 0.6, d / 2 + 0.02, 0xf4eedc, { lit: 1, emit: 0xffcc80 });
      }
      B.box('solid', w + 0.6, 0.08, d + 0.6, 0, fy + 1.18, 0, TILE);
      if (f > 0) {
        B.box('solid', w, 0.05, 0.4, 0, fy, d / 2 + 0.2, WOOD_LIGHT);
        B.box('solid', w, 0.05, 0.05, 0, fy + 0.45, d / 2 + 0.4, 0x7a4a2a);
      }
    }
    const H = 0.15 + floors * 1.25;
    B.geo('solid', hipGeometry(w + 1.3, d + 1.3, 1.3), 0, H, 0, TILE);
    B.box('solid', w * 0.55, 0.2, 0.3, 0, H + 1.3, 0, 0x2a2c30);
    // entrance porch with noren and lanterns
    B.geo('solid', gableGeometry(2.4, 1.4, 0.5), 0, 1.35, d / 2 + 0.6, TILE);
    for (const px of [-1.0, 1.0]) B.block('solid', 0.1, 1.35, 0.1, px, 0, d / 2 + 1.1, WOOD);
    B.block('solid', 1.6, 0.7, 0.05, 0, 0.55, d / 2 + 0.05, 0x2a3a6a);
    for (const px of [-1.35, 1.35]) B.geo('glow', cyl8, px, 1.0, d / 2 + 1.15, 0xf2e8d0, { sx: 0.16, sy: 0.34, sz: 0.16, lit: 1, emit: 0xff9a50 });
  });
  const sign = makeSign({ lines: [[name, 1]], width: 1.2, height: 0.36, bg: '#2a1a10', fg: '#f2d27a', border: '#c8a038', pxPerUnit: 96 });
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  sign.position.set(x + s * (d / 2 + 1.25), y + 1.55, z + c * (d / 2 + 1.25));
  sign.rotation.y = ry;
  decor.add(sign);
  return [x + s * (d / 2 + 1.8), z + c * (d / 2 + 1.8)];
}

function shop(B, rng, x, z, ry) {
  const y = heightAt(x, z);
  solids.push({ x, z, w: 3.2, d: 2.6, ry });
  const awning = rng.pick([0xc8402e, 0x2f5fa8, 0x3f7d4a, 0xe8a030]);
  B.at(x, y, z, ry, () => {
    B.block('solid', 3.0, 1.2, 2.4, 0, 0, 0, 0xe8dcc0);
    B.block('solid', 3.0, 0.9, 2.4, 0, 1.2, 0, 0x6a4a30);
    B.geo('solid', gableGeometry(3.6, 3.0, 0.7), 0, 2.1, 0, TILE);
    B.box('solid', 3.1, 0.06, 0.8, 0, 1.15, 1.55, awning, { rx: 0.25 });
    B.box('glow', 2.4, 0.8, 0.04, 0, 0.55, 1.21, 0xf2ead4, { lit: 1, emit: 0xffd898 });
    // goods on a bench out front
    B.block('solid', 2.0, 0.35, 0.5, 0, 0, 1.6, WOOD_LIGHT);
    for (let i = 0; i < 5; i += 1) B.box('solid', 0.26, 0.18, 0.26, -0.8 + i * 0.4, 0.44, 1.6, rng.pick([0xf2e2c0, 0xe07a3a, 0xf6f6f0, 0x8ac858]));
  });
}

function bathhouse(B, decor, x, z, ry, steam) {
  const y = heightAt(x, z);
  solids.push({ x, z, w: 5.6, d: 4, ry });
  B.at(x, y, z, ry, () => {
    B.block('solid', 5.4, 1.8, 3.8, 0, 0, 0, 0xefe6d0);
    for (let i = 0; i < 6; i += 1) B.block('solid', 0.1, 1.8, 3.84, -2.7 + i * 1.08, 0, 0, WOOD);
    B.geo('solid', hipGeometry(6.4, 4.8, 1.2), 0, 1.8, 0, TILE);
    // two entrances: blue (men) and red (women) noren
    B.block('solid', 1.0, 0.8, 0.05, -1.1, 0.5, 1.93, 0x2a3a8a);
    B.block('solid', 1.0, 0.8, 0.05, 1.1, 0.5, 1.93, 0xb83a3a);
    // chimney
    B.block('solid', 0.6, 4.5, 0.6, 2.2, 0, -1.4, 0xb8a898);
  });
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  steam.add(x + 2.2 * c + -1.4 * s, y + 4.6, z - 2.2 * s + -1.4 * c, 0.2, 10, 3.5);
  const sign = makeSign({ lines: [['♨ ゆ', 1]], width: 0.8, height: 0.4, bg: '#f6f0e0', fg: '#b83a3a', border: '#5a3a26', pxPerUnit: 96 });
  sign.position.set(x + s * 1.95, y + 1.6, z + c * 1.95);
  sign.rotation.y = ry;
  decor.add(sign);
}

// Yubatake: a field of wooden troughs cooling the spring water.
function yubatake(B, x, z, steam) {
  const y = heightAt(x, z) + 0.05;
  B.block('solid', 11, 0.3, 6, x, y - 0.3, z, 0x9a9a90, { jitter: 0.05 });
  for (let i = 0; i < 7; i += 1) {
    const tz = z - 2.4 + i * 0.8;
    B.block('solid', 9.6, 0.26, 0.62, x, y, tz, WOOD_LIGHT);
    B.box('glow', 9.4, 0.02, 0.46, x, y + 0.27, tz, HOT, { lit: 0 });
    for (let k = 0; k < 8; k += 1) B.box('solid', 0.06, 0.28, 0.66, x - 4.6 + k * 1.3, y + 0.13, tz, WOOD);
  }
  // hot pool at the end, rimmed with fence posts
  B.box('glow', 3.4, 0.05, 5.4, x + 6.8, y + 0.05, z, 0x6ac8c0, { lit: 0 });
  for (let k = 0; k < 10; k += 1) B.block('solid', 0.08, 0.7, 0.08, x + 5.1, y, z - 2.7 + k * 0.6, WOOD);
  steam.add(x, y + 0.3, z, 4.5, 36, 2.8);
  steam.add(x + 6.8, y + 0.1, z, 1.5, 14, 2.4);
}

// Rock-rimmed outdoor pool; returns the water surface centre.
function rotenburo(B, rng, x, z, r, steam, { roof = false, fence = true } = {}) {
  const y = heightAt(x, z);
  const wy = y + 0.25;
  B.geo('glow', new THREE.CylinderGeometry(r, r, 0.05, 12), x, wy, z, HOT, { lit: 0 });
  for (let a = 0; a < Math.PI * 2; a += 0.42) {
    const rr = r + rng.range(0.05, 0.3);
    B.geo('solid', blob, x + Math.cos(a) * rr, y + 0.2, z + Math.sin(a) * rr, rng.pick([0x8a8a80, 0x7a7a72, 0x9a9a90]), {
      sx: rng.range(0.35, 0.55), sy: rng.range(0.25, 0.4), sz: rng.range(0.35, 0.55), ry: a,
    });
  }
  if (fence) {
    for (let a = Math.PI * 0.1; a < Math.PI * 0.9; a += 0.12) {
      B.block('solid', 0.06, 1.4, 0.06, x + Math.cos(a) * (r + 1.1), y, z - Math.sin(a) * (r + 1.1), 0x9aa858);
    }
  }
  if (roof) {
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.block('solid', 0.1, 2.0, 0.1, x + dx * r * 0.8, y, z + dz * r * 0.8, WOOD);
    B.geo('solid', hipGeometry(r * 2.2, r * 2.2, 0.7), x, y + 2.0, z, TILE);
  }
  steam.add(x, wy, z, r * 0.6, Math.round(8 + r * 5), 2.2);
  solids.push({ x, z, w: r * 2, d: r * 2, ry: 0 });
  return [x, wy, z];
}

function snowMonkeys(parent, spots) {
  const fur = toon(0x9a8a78);
  const face = toon(0xe87a72);
  const monkeys = spots.map(([x, y, z, sitting], i) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.3), fur);
    body.position.y = 0.15;
    g.add(body);
    const head = new THREE.Group();
    head.position.set(0.1, 0.38, 0);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.22), fur);
    head.add(skull);
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.14), face);
    f.position.set(0.11, -0.01, 0);
    head.add(f);
    g.add(head);
    g.position.set(x, y - (sitting ? 0 : 0.18), z);
    g.rotation.y = i * 1.7;
    parent.add(g);
    return { g, head, y: g.position.y, phase: i * 1.3 };
  });
  return (t) => {
    for (const m of monkeys) {
      m.head.rotation.y = Math.sin(t * 0.4 + m.phase) > 0.7 ? 0.7 : Math.sin(t * 0.2 + m.phase) * 0.2;
      m.head.rotation.z = Math.sin(t * 0.3 + m.phase) * 0.12;
      m.g.position.y = m.y + Math.sin(t * 0.9 + m.phase) * 0.015;
    }
  };
}

// Waterfall: an animated ribbon draped down the slope from top to bottom.
function waterfall(parent, top, bottom, width) {
  const n = 18;
  const verts = [];
  const uvs = [];
  const dx = bottom[0] - top[0];
  const dz = bottom[1] - top[1];
  const len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len;
  const nz = dx / len;
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const x = top[0] + dx * t;
    const z = top[1] + dz * t;
    pts.push([x, heightAt(x, z) + 0.25 + (1 - t) * 0.15, z, t]);
  }
  for (let i = 0; i < n; i += 1) {
    const [ax, ay, az, at] = pts[i];
    const [bx, by, bz, bt] = pts[i + 1];
    const w = width / 2;
    const q = [[ax - nx * w, ay, az - nz * w, 0, at], [bx - nx * w, by, bz - nz * w, 0, bt], [bx + nx * w, by, bz + nz * w, 1, bt], [ax + nx * w, ay, az + nz * w, 1, at]];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      verts.push(q[k][0], q[k][1], q[k][2]);
      uvs.push(q[k][3], q[k][4]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uTime: shared.uTime, uNight: shared.uNight },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uTime, uNight;
      varying vec2 vUv;
      void main() {
        float streak = step(0.6, fract(vUv.y * 9.0 - uTime * 2.2 + sin(vUv.x * 17.0) * 0.4));
        vec3 col = mix(vec3(0.62, 0.82, 0.9), vec3(0.95, 0.98, 1.0), streak * 0.8);
        col *= mix(1.0, 0.35, uNight);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'waterfall';
  parent.add(mesh);
}

// Pedestrian suspension bridge with sagging deck and hand ropes.
function suspensionBridge(B, parent, a, b) {
  const ya = heightAt(a[0], a[1]) + 0.1;
  const yb = heightAt(b[0], b[1]) + 0.1;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ry = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
  const n = Math.ceil(len / 0.4);
  const sag = len * 0.07;
  const rope = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const x = a[0] + (b[0] - a[0]) * t;
    const z = a[1] + (b[1] - a[1]) * t;
    const y = ya + (yb - ya) * t - Math.sin(t * Math.PI) * sag;
    if (i < n) B.box('solid', 0.3, 0.05, 1.1, x, y, z, i % 2 ? 0x9a7048 : 0x8a6440, { ry: ry + Math.PI / 2 });
    rope.push([x, y, z]);
  }
  const pts = [];
  for (const side of [-0.55, 0.55]) {
    const ox = Math.sin(ry) * side;
    const oz = Math.cos(ry) * side;
    for (let i = 0; i < rope.length - 1; i += 1) {
      const [x1, y1, z1] = rope[i];
      const [x2, y2, z2] = rope[i + 1];
      pts.push(new THREE.Vector3(x1 + ox, y1 + 0.8, z1 + oz), new THREE.Vector3(x2 + ox, y2 + 0.8, z2 + oz));
      if (i % 3 === 0) pts.push(new THREE.Vector3(x1 + ox, y1, z1 + oz), new THREE.Vector3(x1 + ox, y1 + 0.8, z1 + oz));
    }
  }
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x6a5238 }));
  lines.layers.set(1);
  parent.add(lines);
  for (const [px, py, pz] of [[a[0], ya, a[1]], [b[0], yb, b[1]]]) {
    for (const side of [-0.6, 0.6]) B.block('solid', 0.14, 1.3, 0.14, px + Math.sin(ry) * side, py - 0.3, pz + Math.cos(ry) * side, WOOD);
  }
}

// Ropeway: pylons, a cable and a gondola going back and forth.
function ropeway(B, parent, decor, from, to) {
  const y0 = heightAt(from[0], from[1]);
  const y1 = heightAt(to[0], to[1]);
  const A = new THREE.Vector3(from[0], y0 + 3.2, from[1]);
  const Bv = new THREE.Vector3(to[0], y1 + 3.2, to[1]);
  const ry = Math.atan2(-(to[1] - from[1]), to[0] - from[0]);
  for (const [p, y] of [[from, y0], [to, y1]]) {
    B.at(p[0], y, p[1], ry, () => {
      B.block('solid', 3.2, 3.0, 2.6, 0, 0, 0, 0xe8e4d8);
      B.geo('solid', gableGeometry(3.8, 3.2, 0.8), 0, 3.0, 0, 0xc8402e);
    });
    solids.push({ x: p[0], z: p[1], w: 3.4, d: 2.8, ry });
  }
  const span = A.distanceTo(Bv);
  const pylons = Math.max(1, Math.floor(span / 28));
  const cable = [A.clone()];
  for (let i = 1; i <= pylons; i += 1) {
    const t = i / (pylons + 1);
    const x = from[0] + (to[0] - from[0]) * t;
    const z = from[1] + (to[1] - from[1]) * t;
    const g = heightAt(x, z);
    const top = Math.max(g + 6, A.y + (Bv.y - A.y) * t + 1);
    B.block('solid', 0.5, top - g, 0.5, x, g, z, 0xb8bcc0);
    B.box('solid', 2.2, 0.2, 0.3, x, top, z, 0x9aa0a4, { ry: ry + Math.PI / 2 });
    cable.push(new THREE.Vector3(x, top - 0.1, z));
  }
  cable.push(Bv.clone());
  const pts = [];
  for (const off of [-0.8, 0.8]) {
    const ox = Math.sin(ry) * off;
    const oz = Math.cos(ry) * off;
    for (let i = 0; i < cable.length - 1; i += 1) {
      pts.push(cable[i].clone().add(new THREE.Vector3(ox, 0, oz)), cable[i + 1].clone().add(new THREE.Vector3(ox, 0, oz)));
    }
  }
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x3a4250 }));
  lines.layers.set(1);
  parent.add(lines);
  // gondolas
  const gondolas = [0, 0.5].map((phase, i) => {
    const g = new THREE.Group();
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.0), toon(i ? 0xd83a2a : 0x2f5fa8));
    cab.position.y = -1.1;
    g.add(cab);
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.4, 1.02), new THREE.MeshBasicMaterial({ color: 0xcfe4f0 }));
    win.position.y = -0.95;
    g.add(win);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), toon(0x555555));
    arm.position.y = -0.35;
    g.add(arm);
    g.rotation.y = ry;
    parent.add(g);
    return { g, phase, off: i ? 0.8 : -0.8 };
  });
  // total cable length for travel
  const cum = [0];
  for (let i = 1; i < cable.length; i += 1) cum.push(cum[i - 1] + cable[i].distanceTo(cable[i - 1]));
  const total = cum[cum.length - 1];
  const at = (s) => {
    let i = 0;
    while (i < cum.length - 2 && cum[i + 1] < s) i += 1;
    const t = (s - cum[i]) / (cum[i + 1] - cum[i]);
    const p = cable[i].clone().lerp(cable[i + 1], t);
    p.y -= Math.sin(t * Math.PI) * 0.6;
    return p;
  };
  return (time) => {
    for (const gd of gondolas) {
      // back and forth with a pause at each station
      const u = ((time / 50 + gd.phase) % 1) * 2;
      const k = u < 1 ? u : 2 - u;
      const e = THREE.MathUtils.smoothstep(k, 0.05, 0.95);
      const p = at(e * total);
      gd.g.position.set(p.x + Math.sin(ry) * gd.off, p.y, p.z + Math.cos(ry) * gd.off);
      gd.g.rotation.z = Math.sin(time * 1.3 + gd.phase * 5) * 0.03;
    }
  };
}

function teaHouse(B, decor, x, z, ry) {
  const y = heightAt(x, z);
  solids.push({ x, z, w: 3.4, d: 2.4, ry });
  B.at(x, y, z, ry, () => {
    B.block('solid', 3.2, 1.3, 2.2, 0, 0, 0, 0x8a6040);
    B.geo('solid', hipGeometry(4.0, 3.0, 1.2), 0, 1.3, 0, 0xa88e5c, { jitter: 0.05 });
    // bench with red felt and a big red parasol
    B.block('solid', 1.8, 0.4, 0.6, 0, 0, 1.8, 0x7a5234);
    B.block('solid', 1.8, 0.04, 0.62, 0, 0.4, 1.8, 0xc8302a);
    B.geo('solid', cyl6, 1.3, 1.1, 1.8, 0x7a5234, { sx: 0.04, sy: 2.2, sz: 0.04 });
    B.geo('solid', new THREE.ConeGeometry(1.2, 0.5, 12), 1.3, 2.25, 1.8, 0xd8322a);
    B.box('glow', 0.5, 0.7, 0.04, -0.9, 0.7, 1.11, 0xf2ead4, { lit: 1, emit: 0xffd898 });
  });
  const flag = makeSign({ lines: [['茶', 1]], width: 0.4, height: 0.7, bg: '#f6f0e0', fg: '#c8302a', pxPerUnit: 96 });
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  flag.position.set(x - 1.6 * c + s * 1.3, y + 1.4, z + 1.6 * s + c * 1.3);
  flag.rotation.y = ry;
  decor.add(flag);
}

// ---------------------------------------------------------------- village

export function buildMountain(B, decor, rng, parent) {
  const steam = createSteam(parent);
  const features = [];
  const claims = [];
  const claim = (x, z, r) => claims.push([x, z, r]);

  mountainRoad(B);
  for (let s = 0; s < MOUNTAIN_ROAD_LENGTH; s += 2) {
    // (claims along the road so trees keep off it)
    const q = MOUNTAIN_ROAD;
    let acc = 0;
    for (let i = 0; i < q.length - 1; i += 1) {
      const len = Math.hypot(q[i + 1][0] - q[i][0], q[i + 1][1] - q[i][1]);
      if (s <= acc + len) {
        const t = (s - acc) / len;
        claim(q[i][0] + (q[i + 1][0] - q[i][0]) * t, q[i][1] + (q[i + 1][1] - q[i][1]) * t, 3);
        break;
      }
      acc += len;
    }
  }

  const { x: cx, z: cz } = BASIN;
  // hot-water field in the middle, inns and shops around it
  yubatake(B, cx + 1, cz - 3, steam);
  claim(cx + 3, cz - 3, 8);
  const doors = [];
  doors.push(ryokan(B, decor, cx - 9, cz + 5, Math.PI * 0.75, 3, '山の湯旅館'));
  doors.push(ryokan(B, decor, cx + 11, cz + 3, -Math.PI * 0.6, 2, '湯元 松乃屋'));
  doors.push(ryokan(B, decor, cx - 2, cz - 13, 0.1, 2, '渓流荘'));
  for (const [x, z] of [[cx - 9, cz + 5], [cx + 11, cz + 3], [cx - 2, cz - 13]]) claim(x, z, 5.5);
  const shops = [[cx + 3, cz + 6, Math.PI], [cx - 3, cz + 6.5, Math.PI], [cx + 9, cz - 9, -0.4], [cx - 10, cz - 6, 0.6]];
  for (const [x, z, ry] of shops) {
    shop(B, rng, x, z, ry);
    claim(x, z, 2.4);
  }
  bathhouse(B, decor, cx + 7, cz + 11, Math.PI, steam);
  claim(cx + 7, cz + 11, 4);

  // foot bath under a little roof beside the road end
  const [rx, rz] = MOUNTAIN_ROAD[MOUNTAIN_ROAD.length - 1];
  const fx = rx + 3;
  const fz = rz - 4;
  const fy = heightAt(fx, fz);
  B.block('solid', 3.0, 0.35, 1.2, fx, fy, fz, 0x9a9a90);
  B.box('glow', 2.6, 0.04, 0.8, fx, fy + 0.34, fz, HOT, { lit: 0 });
  B.block('solid', 3.0, 0.4, 0.4, fx, fy, fz + 0.9, WOOD_LIGHT);
  for (const [dx, dz] of [[-1.5, -0.6], [1.5, -0.6], [-1.5, 1.1], [1.5, 1.1]]) B.block('solid', 0.08, 1.8, 0.08, fx + dx, fy, fz + dz, WOOD);
  B.geo('solid', gableGeometry(3.6, 2.4, 0.5), fx, fy + 1.8, fz + 0.25, TILE);
  steam.add(fx, fy + 0.4, fz, 1.2, 8, 1.6);
  claim(fx, fz, 2.5);

  // ♨ gate where the road arrives
  const gx = rx - 1;
  const gz = rz - 9;
  torii(B, gx, heightAt(gx, gz), gz, 0.9, 0.9);
  const gate = makeSign({ lines: [['♨ 山の湯温泉', 1]], width: 2.0, height: 0.42, bg: '#2a1a10', fg: '#f2d27a', border: '#c8a038', pxPerUnit: 96 });
  gate.position.set(gx, heightAt(gx, gz) + 2.55, gz + 0.2);
  gate.rotation.y = 0.9;
  decor.add(gate);

  // outdoor pools on the basin rim; one belongs to the snow monkeys
  const pools = [];
  for (const [a, r, opts] of [[2.4, 14.5, { roof: true }], [3.6, 16, { fence: true }], [5.2, 15.5, { fence: false }]]) {
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    if (RAIL.closest(x, z)?.d < 5) continue;
    pools.push(rotenburo(B, rng, x, z, rng.range(1.8, 2.6), steam, opts));
    claim(x, z, 4);
  }
  const monkeyPool = pools[pools.length - 1];
  if (monkeyPool) {
    const [mx, my, mz] = monkeyPool;
    features.push(snowMonkeys(parent, [
      [mx - 0.6, my, mz + 0.3, false], [mx + 0.5, my, mz - 0.4, false], [mx + 0.1, my, mz + 0.8, false],
      [mx + 2.4, heightAt(mx + 2.4, mz) + 0.35, mz, true], [mx - 2.3, heightAt(mx - 2.3, mz + 0.6) + 0.35, mz + 0.6, true],
    ]));
    const sign = makeSign({ lines: [['野猿公苑', 1], ['snow monkeys', 0.5]], width: 1.1, height: 0.5, bg: '#f6f0e0', fg: '#3a2a1a', border: '#5a3a26', pxPerUnit: 96 });
    sign.position.set(mx, heightAt(mx, mz - 3.4) + 1.2, mz - 3.4);
    decor.add(sign);
  }

  // waterfall on the highest part of the rim, with a suspension bridge in front
  let best = null;
  for (let a = 0; a < Math.PI * 2; a += 0.05) {
    const x = cx + Math.cos(a) * 24;
    const z = cz + Math.sin(a) * 24;
    if (RAIL.closest(x, z)?.d < 10 || closestOnPolyline(x, z, MOUNTAIN_ROAD).d < 12) continue;
    const h = heightAt(x, z);
    if (!best || h > best.h) best = { a, h, x, z };
  }
  if (best) {
    const top = [cx + Math.cos(best.a) * 26, cz + Math.sin(best.a) * 26];
    const foot = [cx + Math.cos(best.a) * 15, cz + Math.sin(best.a) * 15];
    waterfall(parent, top, foot, 1.8);
    const py = heightAt(foot[0], foot[1]);
    B.geo('glow', new THREE.CylinderGeometry(2.4, 2.4, 0.05, 12), foot[0], py + 0.2, foot[1], 0x7ac0d8, { lit: 0 });
    for (let a = 0; a < Math.PI * 2; a += 0.5) B.geo('solid', blob, foot[0] + Math.cos(a) * 2.5, py + 0.15, foot[1] + Math.sin(a) * 2.5, 0x8a8a80, { sx: 0.5, sy: 0.3, sz: 0.5 });
    steam.add(foot[0], py + 0.3, foot[1], 1.2, 12, 1.6); // spray
    // sacred rope across the falls
    const mid = [(top[0] + foot[0]) / 2, (top[1] + foot[1]) / 2];
    stoneLantern(B, foot[0] - Math.sin(best.a) * 3.2 - Math.cos(best.a) * 1.5, heightAt(foot[0] - Math.sin(best.a) * 3.2, foot[1] + Math.cos(best.a) * 3.2), foot[1] + Math.cos(best.a) * 3.2 - Math.sin(best.a) * 1.5, 0.8);
    const across = [Math.sin(best.a), -Math.cos(best.a)];
    const inward = [-Math.cos(best.a), -Math.sin(best.a)];
    const b0 = [foot[0] + inward[0] * 3.2 + across[0] * 5, foot[1] + inward[1] * 3.2 + across[1] * 5];
    const b1 = [foot[0] + inward[0] * 3.2 - across[0] * 5, foot[1] + inward[1] * 3.2 - across[1] * 5];
    suspensionBridge(B, parent, b0, b1);
    claim(foot[0], foot[1], 6);
    claim(mid[0], mid[1], 4);
    footpath(B, [b1, [cx - 1, cz - 1], [cx + 1, cz - 7]], { style: 'stone', wander: 0.5 });
  }

  // ropeway from the basin up to the highest nearby summit
  let summit = null;
  for (let a = 0; a < Math.PI * 2; a += 0.1) {
    for (const r of [40, 48, 56]) {
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const h = heightAt(x, z);
      if (!summit || h > summit.h) summit = { x, z, h };
    }
  }
  const base = [cx + (summit.x - cx) * 0.2, cz + (summit.z - cz) * 0.2];
  features.push(ropeway(B, parent, decor, base, [summit.x, summit.z]));
  claim(base[0], base[1], 3);
  // summit: viewing deck, torii and a small shrine
  const sy = summit.h;
  B.block('solid', 5, 0.3, 4, summit.x + 3.5, sy - 0.1, summit.z, 0x9a7048);
  torii(B, summit.x + 3.5, sy + 0.2, summit.z + 3, 0.8);
  B.block('solid', 1.0, 0.9, 0.9, summit.x + 5, sy + 0.2, summit.z - 1.2, 0xc8402e);
  B.geo('solid', gableGeometry(1.5, 1.4, 0.5), summit.x + 5, sy + 1.1, summit.z - 1.2, TILE);

  // mountain tea house at a hairpin
  const [hx, hz] = MOUNTAIN_ROAD[2];
  teaHouse(B, decor, hx - 4.2, hz + 1.2, 0.6);
  claim(hx - 4.2, hz + 1.2, 3);

  // stone lanes linking the village, with lanterns
  const lanes = [
    [[rx, rz - 1], [cx - 4, cz - 1], [cx + 3, cz + 3], [cx + 7, cz + 8.5]],
    [[cx - 6, cz + 3], [cx - 6, cz - 8], [cx - 2, cz - 10]],
    [[cx + 7, cz + 1], [cx + 9, cz - 6]],
  ];
  const onsenStation = RAIL.at(RAIL.sOf(144, 115.5));
  lanes.push([[cx + 9, cz + 6], [onsenStation.x - 2, onsenStation.z - 4], [onsenStation.x + 3, onsenStation.z - 2.4]]);
  for (const lane of lanes) {
    const pts = footpath(B, lane, { style: 'stone', wander: 0.4 });
    for (let i = 6; i < pts.length; i += 10) {
      const p = pts[i];
      const lx = p.x + p.nx * 0.9;
      const lz = p.z + p.nz * 0.9;
      const ly = heightAt(lx, lz);
      B.block('solid', 0.07, 1.3, 0.07, lx, ly, lz, WOOD);
      B.geo('glow', cyl8, lx, ly + 1.45, lz, 0xf2e2c8, { sx: 0.13, sy: 0.3, sz: 0.13, lit: 1, emit: i % 20 === 6 ? 0xff7a40 : 0xffb060 });
    }
  }
  for (const d of doors) footpath(B, [d, [cx, cz - 1]], { style: 'stone', wander: 0.3 });
  // steam vents in the lanes
  for (let i = 0; i < 6; i += 1) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(3, 11);
    steam.add(cx + Math.cos(a) * r, heightAt(cx + Math.cos(a) * r, cz + Math.sin(a) * r) + 0.05, cz + Math.sin(a) * r, 0.2, 5, 1.2);
  }

  const steamMat = steam.build();
  const lights = [
    [0xff9a50, cx - 9, heightAt(cx - 9, cz + 5) + 2.5, cz + 5, 10],
    [0xffb060, cx + 2, heightAt(cx + 2, cz) + 2, cz, 12],
    [0xffb060, cx + 11, heightAt(cx + 11, cz + 3) + 2, cz + 3, 9],
  ];
  return {
    claims,
    lights,
    steamMat,
    update(t) {
      for (const f of features) f(t);
    },
  };
}

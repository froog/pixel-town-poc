import * as THREE from 'three';
import { Batcher, gableGeometry, hipGeometry } from './batcher.js';
import { heightAt, LAKE, lakeDistance, RAIL, RAIL_STATIONS } from './terrain.js';
import { house, solids, stoneLantern, torii } from './buildings.js';
import { bush, paddyCell, pineTree, roundTree } from './props.js';
import { kura, minka, persimmon } from './rural.js';
import { footpath, pathToRoad } from './paths.js';
import { makeSign } from './signs.js';
import { shared, toonRamp } from './materials.js';
import { DENSITY } from './quality.js';

// 湖畔 (Kohan): the lake south of town. Water, a pier with rowboats and
// swan boats, a shrine island with a red arched bridge, a torii standing in
// the water, a lakeside inn, willows and reeds, and farmland along the road
// from town.

const cyl6 = new THREE.CylinderGeometry(1, 1, 1, 6);
const cyl8 = new THREE.CylinderGeometry(1, 1, 1, 8);
const blob = new THREE.IcosahedronGeometry(1, 0);
const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: toonRamp });

function lakeWater() {
  const size = LAKE.r * 2 + 16;
  const g = new THREE.PlaneGeometry(size, size, 48, 48);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const depth = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i += 1) depth[i] = LAKE.y - heightAt(pos.getX(i) + LAKE.x, pos.getZ(i) + LAKE.z);
  g.setAttribute('depth', new THREE.BufferAttribute(depth, 1));
  const material = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      attribute float depth;
      varying float vDepth;
      varying vec3 vWorld;
      void main() {
        vDepth = depth;
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
      uniform float uTime, uNight;
      varying float vDepth;
      varying vec3 vWorld;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 deep = vec3(0.12, 0.36, 0.42);
        vec3 shallow = vec3(0.32, 0.62, 0.58);
        vec3 col = mix(shallow, deep, smoothstep(0.0, 1.4, vDepth));
        float ripple = sin(vWorld.x * 1.1 + uTime * 0.9) * sin(vWorld.z * 0.8 - uTime * 0.7);
        col *= 0.94 + 0.06 * step(0.55, ripple);
        float sparkle = step(0.985, h21(floor(vWorld.xz * vec2(1.6, 3.0)) + floor(uTime * 1.5)));
        col += vec3(0.6) * sparkle * (1.0 - uNight);
        float foam = smoothstep(0.22, 0.0, vDepth + sin(uTime * 1.2 + vWorld.x) * 0.04);
        col = mix(col, vec3(0.9, 0.95, 0.92), foam * 0.7);
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
  mesh.position.set(LAKE.x, LAKE.y, LAKE.z);
  mesh.name = 'lake';
  return mesh;
}

// first point, walking from `from` toward `to`, that is dry land
function shoreBetween(from, to) {
  for (let t = 0; t <= 1; t += 0.01) {
    const x = from[0] + (to[0] - from[0]) * t;
    const z = from[1] + (to[1] - from[1]) * t;
    if (heightAt(x, z) > LAKE.y + 0.25) return [x, z];
  }
  return to;
}

function willow(B, rng, x, z) {
  const y = heightAt(x, z);
  B.geo('foliage', cyl6, x, y + 0.9, z, 0x6a5038, { sx: 0.12, sy: 1.8, sz: 0.12, sway: 0 });
  B.geo('foliage', blob, x, y + 2.0, z, 0x7aa84a, { sx: 0.9, sy: 0.55, sz: 0.9, sway: (bx, by) => (by - y) / 3 });
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2 + rng.next() * 0.3;
    const r = rng.range(0.55, 0.95);
    const len = rng.range(1.0, 1.7);
    B.box('foliage', 0.08, len, 0.08, x + Math.cos(a) * r, y + 2.1 - len / 2, z + Math.sin(a) * r, rng.pick([0x8ab854, 0x7aa84a, 0x9ac860]), {
      sway: (bx, by) => 0.6 + (y + 2.1 - by) * 0.9,
    });
  }
}

function crapeMyrtle(B, rng, x, z) {
  const y = heightAt(x, z);
  B.geo('foliage', cyl6, x, y + 0.6, z, 0x9a8a78, { sx: 0.08, sy: 1.2, sz: 0.08, sway: 0 });
  for (let i = 0; i < 5; i += 1) {
    B.geo('foliage', blob, x + rng.range(-0.4, 0.4), y + rng.range(1.3, 1.8), z + rng.range(-0.4, 0.4), rng.pick([0xe87ab0, 0xf29ac8, 0xd86aa0]), {
      sx: 0.36, sy: 0.3, sz: 0.36, sway: (bx, by) => (by - y) / 2,
    });
  }
}

function reeds(B, rng, x, z) {
  const y = heightAt(x, z);
  for (let i = 0; i < 9; i += 1) {
    const h = rng.range(0.5, 0.9);
    B.box('foliage', 0.03, h, 0.03, x + rng.range(-0.4, 0.4), Math.max(y, LAKE.y) + h / 2, z + rng.range(-0.4, 0.4), rng.pick([0x8a9a4a, 0x9aa858, 0x7a8a40]), {
      sway: (bx, by) => (by - y) * 1.4, rz: rng.range(-0.15, 0.15),
    });
  }
}

function inn(B, decor, x, z, ry) {
  const y = heightAt(x, z);
  solids.push({ x, z, w: 7, d: 4.4, ry });
  B.at(x, y, z, ry, () => {
    B.block('solid', 7.4, 0.4, 4.8, 0, -0.3, 0, 0x9a9a8e);
    for (let f = 0; f < 2; f += 1) {
      B.block('solid', 6.6, 1.1, 4.0, 0, 0.1 + f * 1.2, 0, 0x5a3a26);
      for (let i = 0; i < 7; i += 1) B.box('glow', 0.7, 0.6, 0.04, -2.7 + i * 0.9, 0.7 + f * 1.2, 2.02, 0xf2ead4, { lit: 1, emit: 0xffcf80 });
      B.box('solid', 7.0, 0.1, 4.4, 0, 1.25 + f * 1.2, 0, 0x3a3a40);
      // balcony rail
      B.box('solid', 6.6, 0.05, 0.05, 0, 0.62 + f * 1.2, 2.3, 0x7a5a3a);
    }
    B.geo('solid', hipGeometry(8.2, 5.4, 1.4), 0, 2.5, 0, 0x3c3e44);
    B.box('solid', 3.2, 0.2, 0.3, 0, 3.9, 0, 0x2a2c30);
    // entrance with noren
    B.block('solid', 1.6, 0.9, 0.06, 0, 0.1, 2.06, 0x2a3a6a);
  });
  const sign = makeSign({ lines: [['湖月荘', 1], ['KOGETSU-SŌ', 0.5]], width: 1.4, height: 0.5, bg: '#3a2616', fg: '#f2d27a', border: '#c8a038', pxPerUnit: 96 });
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  sign.position.set(x + s * 2.1, y + 1.25, z + c * 2.1);
  sign.rotation.y = ry;
  decor.add(sign);
}

function boathouse(B, x, z, ry) {
  const y = heightAt(x, z);
  solids.push({ x, z, w: 3, d: 2.2, ry });
  B.at(x, y, z, ry, () => {
    B.block('solid', 2.8, 1.4, 2.0, 0, 0, 0, 0xe8dcc0);
    B.geo('solid', gableGeometry(3.4, 2.6, 0.6), 0, 1.4, 0, 0x2f5fa8);
    B.box('glow', 1.2, 0.5, 0.04, 0, 0.9, 1.01, 0x3a5a70, { lit: 1, emit: 0xfff0c8 });
    B.box('solid', 2.0, 0.28, 0.04, 0, 1.5, 1.02, 0xf6f6f0);
  });
}

function islandShrine(B, cx, cz) {
  const top = LAKE.y + 0.5;
  B.geo('solid', blob, cx, LAKE.y - 0.6, cz, 0x8a8a7a, { sx: 3.8, sy: 1.5, sz: 3.2, jitter: 0.12 });
  B.geo('solid', new THREE.CylinderGeometry(3.3, 3.5, 0.2, 10), cx, top, cz, 0x6a9a48);
  B.at(cx, top + 0.1, cz + 0.4, Math.PI, () => {
    B.block('solid', 1.4, 0.2, 1.2, 0, 0, 0, 0x9a9a90);
    B.block('solid', 1.0, 0.9, 0.9, 0, 0.2, 0, 0xc8402e);
    B.geo('solid', gableGeometry(1.5, 1.4, 0.55), 0, 1.1, 0, 0x3c3e44, { ry: Math.PI / 2 });
  });
  pineTree(B, { pick: (l) => l[1], next: () => 0.3, range: (a) => a, int: (a) => a, chance: () => false }, cx - 1.7, cz - 1.2, 1.2, top);
  torii(B, cx, top + 0.1, cz - 2.2, 0.6);
  stoneLantern(B, cx + 1.4, top + 0.1, cz - 1.4, 0.6);
}

// Red arched (taiko) footbridge between two points.
function archBridge(B, a, b, y0) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ry = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
  const n = 14;
  for (let i = 0; i < n; i += 1) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const x = a[0] + (b[0] - a[0]) * ((t0 + t1) / 2);
    const z = a[1] + (b[1] - a[1]) * ((t0 + t1) / 2);
    const h0 = Math.sin(t0 * Math.PI) * 1.1;
    const h1 = Math.sin(t1 * Math.PI) * 1.1;
    const pitch = Math.atan2(h1 - h0, len / n);
    B.box('solid', len / n + 0.05, 0.12, 1.2, x, y0 + (h0 + h1) / 2, z, 0x9a6a40, { ry, rz: pitch });
    for (const side of [-0.6, 0.6]) {
      const sx = x + Math.sin(ry) * side;
      const sz = z + Math.cos(ry) * side;
      B.box('solid', len / n + 0.05, 0.06, 0.06, sx, y0 + (h0 + h1) / 2 + 0.55, sz, 0xc8402e, { ry, rz: pitch });
      if (i % 2 === 0) B.box('solid', 0.07, 0.6, 0.07, sx, y0 + (h0 + h1) / 2 + 0.27, sz, 0xc8402e, { ry });
    }
  }
  for (const [px, pz] of [a, b]) B.block('solid', 0.5, 0.9, 1.4, px, y0 - 0.8, pz, 0x9a9a90, { ry });
}

function swanBoat(parent, i) {
  const g = new THREE.Group();
  const white = toon(0xfafaf6);
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 0.9), white);
  hull.position.y = 0.15;
  g.add(hull);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.8, 0.16), white);
  neck.position.set(0.62, 0.65, 0);
  neck.rotation.z = -0.25;
  g.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.18), white);
  head.position.set(0.78, 1.02, 0);
  g.add(head);
  const beak = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.1), toon(0xf08a2a));
  beak.position.set(0.98, 1.0, 0);
  g.add(beak);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.8), toon(i % 2 ? 0xf29ac8 : 0x6ab8e8));
  canopy.position.set(-0.1, 0.85, 0);
  g.add(canopy);
  for (const sz of [-0.36, 0.36]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), white);
    post.position.set(-0.1, 0.6, sz);
    g.add(post);
  }
  parent.add(g);
  return g;
}

function rowboat(parent, color) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 0.7), toon(color));
  hull.position.y = 0.08;
  g.add(hull);
  const inside = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.56), toon(0x9a7048));
  inside.position.y = 0.2;
  g.add(inside);
  parent.add(g);
  return g;
}

export function buildLake(B, decor, rng, parent) {
  const claims = [];
  const free = (x, z, r) => claims.every(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) > r + cr);
  const claim = (x, z, r) => claims.push([x, z, r]);
  const nearRail = (x, z, r) => {
    const q = RAIL.closest(x, z);
    return q && q.d < r;
  };
  const isLake = (x, z, margin = 0) => lakeDistance(x, z) < LAKE.r + margin;

  parent.add(lakeWater());

  // --- road A ends in a little plaza; a stone path leads to the station
  const station = RAIL_STATIONS.find((s) => s.id === 'lake');
  const st = RAIL.at(station.s);
  const n = [-st.tz, st.tx];
  B.block('solid', 7, 0.1, 5, 0, -0.02, 82.5, 0xcfcbc0);
  for (const sx of [-2.8, 2.8]) stoneLantern(B, sx, 0.08, 84.4, 0.7);
  const platformEnd = [st.x - st.tx * 6.8 + n[0] * station.side * 2.2, st.z - st.tz * 6.8 + n[1] * station.side * 2.2];
  footpath(B, [[0, 85], [platformEnd[0] - 1.5, (85 + platformEnd[1]) / 2], platformEnd], { style: 'stone', wander: 0.3 });
  claim(0, 83, 4);
  const sign = makeSign({ lines: [['湖畔', 1], ['KOHAN · LAKESIDE', 0.5]], width: 1.4, height: 0.55, bg: '#1f5fa8', fg: '#ffffff', border: '#ffffff', pxPerUnit: 96 });
  sign.position.set(3.2, 1.35, 84.9);
  decor.add(sign);
  B.block('solid', 0.06, 1.1, 0.06, 3.2, 0, 84.8, 0x888888);

  // --- pier, boathouse and boats
  const pierBase = shoreBetween([LAKE.x - 8, LAKE.z], [LAKE.x - 8, LAKE.z - 40]);
  const pierY = LAKE.y + 0.35;
  for (let k = 0; k < 18; k += 1) {
    const z = pierBase[1] + 0.6 + k * 0.42;
    B.box('solid', 1.3, 0.08, 0.38, pierBase[0], pierY, z, rng.pick([0x9a7048, 0x8a6440, 0xa87a50]));
    if (k % 4 === 0) for (const dx of [-0.6, 0.6]) B.geo('solid', cyl6, pierBase[0] + dx, LAKE.y - 0.4, z, 0x5a3e26, { sx: 0.08, sy: 1.6, sz: 0.08 });
  }
  boathouse(B, pierBase[0] - 3.2, pierBase[1] - 2.2, 0);
  claim(pierBase[0] - 2, pierBase[1] - 1, 4);
  const boats = [];
  for (let i = 0; i < 3; i += 1) {
    const b = rowboat(parent, [0x2f8ad8, 0xe8e8e0, 0xd84a3a][i]);
    boats.push({ g: b, x: pierBase[0] + (i % 2 ? 1.3 : -1.3), z: pierBase[1] + 2.2 + i * 1.6, ry: Math.PI / 2, phase: i });
  }
  const swans = [0, 1, 2].map((i) => ({ g: swanBoat(parent, i), phase: i * 2.1, r: 9 + i * 3, speed: 0.05 + i * 0.012 }));

  // --- shrine island with a red arched bridge from the west shore
  const island = [LAKE.x - 10, LAKE.z + 8];
  islandShrine(B, island[0], island[1]);
  const bridgeShore = shoreBetween(island, [island[0] - 30, island[1]]);
  archBridge(B, [bridgeShore[0] + 0.5, bridgeShore[1]], [island[0] - 3.1, island[1]], LAKE.y + 0.6);
  claim(bridgeShore[0], bridgeShore[1], 3);

  // --- torii standing in the water, facing the station
  torii(B, LAKE.x + 7, LAKE.y - 0.8, LAKE.z - 11, 1.25, 0.25);

  // --- lakeside inn on the east shore
  const innSpot = shoreBetween([LAKE.x + 34, LAKE.z + 2], [LAKE.x, LAKE.z + 2]);
  inn(B, decor, innSpot[0] + 5, innSpot[1], -Math.PI / 2);
  claim(innSpot[0] + 5, innSpot[1], 5.5);
  const innPath = footpath(B, [[innSpot[0] + 1.2, innSpot[1] - 4], [innSpot[0] - 1, innSpot[1] - 12], [st.x + 6, st.z + 5]], { style: 'gravel' });

  // --- lakeside promenade from the station past the pier to the bridge
  footpath(B, [
    [platformEnd[0] - 1, platformEnd[1] + 1.5],
    [pierBase[0] + 2, pierBase[1] - 1.2],
    [pierBase[0] - 6, pierBase[1] - 0.5],
    [bridgeShore[0] - 1, bridgeShore[1] - 5],
    [bridgeShore[0] - 0.5, bridgeShore[1]],
  ], { style: 'gravel', wander: 0.8 });

  // --- shoreline planting
  for (let a = 0; a < Math.PI * 2; a += 0.11) {
    const edge = shoreBetween([LAKE.x, LAKE.z], [LAKE.x + Math.cos(a) * 45, LAKE.z + Math.sin(a) * 40]);
    const x = edge[0] + Math.cos(a) * rng.range(1.2, 3.5);
    const z = edge[1] + Math.sin(a) * rng.range(1.2, 3.5);
    if (nearRail(x, z, 3.5) || !free(x, z, 1.2)) continue;
    const roll = rng.next();
    if (roll < 0.22) willow(B, rng, x, z);
    else if (roll < 0.34) crapeMyrtle(B, rng, x, z);
    else if (roll < 0.55) reeds(B, rng, edge[0] - Math.cos(a) * 0.6, edge[1] - Math.sin(a) * 0.6);
    else if (roll < 0.7) bush(B, rng, x, z);
    claim(x, z, 1.2);
  }

  // --- farmland along the road from town
  const doors = [];
  for (const [x, z, ry] of [[-11.5, 50, Math.PI / 2], [12.5, 58, -Math.PI / 2], [-12, 72, Math.PI / 2], [13, 44, -Math.PI / 2]]) {
    const res = minka(B, rng, x, z, ry);
    doors.push(res.door);
    kura(B, x + (x < 0 ? -1.5 : 1.5), z + 5, ry);
    persimmon(B, rng, x + (x < 0 ? 2.5 : -2.5), z - 3.6);
    claim(x, z + 2, 6);
  }
  for (const [x, z] of [[-6, 90], [9, 88.5]]) {
    if (!free(x, z, 2) || nearRail(x, z, 4) || isLake(x, z, 3)) continue;
    const res = house(B, rng, { x, z, ry: 0, floors: 2 });
    doors.push(res.door);
    claim(x, z, 2.2);
  }
  const roadA = [[0, 30], [0, 84]];
  for (const d of doors) pathToRoad(B, d, roadA, { style: 'dirt' });
  for (let x = -17.6; x < 20; x += 3.6) {
    for (let z = 34.4; z < 92; z += 3.6) {
      const cx = x + 1.8;
      const cz = z + 1.8;
      if (Math.abs(cx) < 3.6 || nearRail(cx, cz, 4.5) || isLake(cx, cz, 4) || !free(cx, cz, 1.8)) continue;
      if (Math.abs(heightAt(cx, cz) - heightAt(cx + 1.8, cz + 1.8)) > 0.5) continue;
      paddyCell(B, rng, x, z);
      claim(cx, cz, 1.6);
    }
  }
  // field paths between the paddies
  footpath(B, [[-3, 40], [-9, 41.5], [-16, 40.5]], { style: 'dirt', width: 0.5 });
  footpath(B, [[3, 66], [9, 67], [17, 66]], { style: 'dirt', width: 0.5 });
  footpath(B, [[-3, 62], [-8, 63], [-16, 61]], { style: 'dirt', width: 0.5 });

  // --- trees on the rest of the lake basin
  for (let i = 0; i < 700 * DENSITY; i += 1) {
    const x = rng.range(-30, 36);
    const z = rng.range(34, 160);
    if (isLake(x, z, 2) || nearRail(x, z, 3.5) || Math.abs(x) < 3 || !free(x, z, 1)) continue;
    if (heightAt(x, z) < 0.4 && z < 95 && Math.abs(x) < 20) continue; // keep the fields open
    if (rng.chance(0.5)) roundTree(B, rng, x, z, rng.range(0.9, 1.4));
    else pineTree(B, rng, x, z, rng.range(0.9, 1.3));
    claim(x, z, 0.8);
  }

  const lights = [
    [0xffcf80, innSpot[0] + 3, heightAt(innSpot[0] + 3, innSpot[1]) + 1.5, innSpot[1], 8],
    [0xfff4d8, st.x, st.y + 2.2, st.z + 2, 8],
  ];
  const fireflySpots = [];
  for (let i = 0; i < 40; i += 1) {
    const a = rng.next() * Math.PI * 2;
    const edge = shoreBetween([LAKE.x, LAKE.z], [LAKE.x + Math.cos(a) * 45, LAKE.z + Math.sin(a) * 40]);
    fireflySpots.push([edge[0], heightAt(edge[0], edge[1]) + rng.range(0.4, 1.6), edge[1], rng.range(0, 10)]);
  }

  return {
    lights,
    fireflySpots,
    claims,
    update(t) {
      for (const b of boats) {
        b.g.position.set(b.x, LAKE.y + Math.sin(t * 1.3 + b.phase) * 0.04, b.z);
        b.g.rotation.set(Math.sin(t + b.phase) * 0.04, b.ry + Math.sin(t * 0.3 + b.phase) * 0.08, 0);
      }
      for (const s of swans) {
        const a = t * s.speed + s.phase;
        const x = LAKE.x + 3 + Math.cos(a) * s.r;
        const z = LAKE.z + Math.sin(a) * s.r * 0.7;
        s.g.position.set(x, LAKE.y + Math.sin(t * 1.5 + s.phase) * 0.04, z);
        s.g.rotation.y = Math.atan2(-Math.cos(a) * 0.7, -Math.sin(a));
      }
    },
  };
}

import * as THREE from 'three';
import { hipGeometry, mat4 } from './batcher.js';
import { heightAt, PORTAL_L, PORTAL_R, QUAY, roadBHeight, roadHeight, ROAD_B_Z, SEA, TRACK_Z } from './terrain.js';
import { makeSign } from './signs.js';
import { PALETTE } from './buildings.js';
import { ROAD_A, ROAD_B } from './layout.js';

const cyl6 = new THREE.CylinderGeometry(1, 1, 1, 6);
const cyl8 = new THREE.CylinderGeometry(1, 1, 1, 8);
const cone6 = new THREE.ConeGeometry(1, 1, 6);
const blob = new THREE.IcosahedronGeometry(1, 0);

const ASPHALT = 0x6c767c;
const ASPHALT_DARK = 0x5e676d;
const PAVING = 0xcfcbc0;
const PAINT = 0xf2f4f0;

// ---------------------------------------------------------------- nature

const LEAVES = [
  [0x2f7a3e, 0x3e9650, 0x57ad5c],
  [0x2a6b36, 0x357f40, 0x4c9a4c],
  [0x3a8a3a, 0x4fa046, 0x6cbc58],
];

export function roundTree(B, rng, x, z, s = 1, y = heightAt(x, z)) {
  const pal = rng.pick(LEAVES);
  const trunkH = 0.7 * s;
  B.geo('foliage', cyl6, x, y + trunkH / 2, z, 0x6e4a2c, { sx: 0.09 * s, sy: trunkH, sz: 0.09 * s, sway: 0 });
  const blobs = rng.int(3, 5);
  const sway = (bx, by) => Math.max(0, (by - y) / (1.6 * s)) * 1.0;
  for (let i = 0; i < blobs; i += 1) {
    const a = (i / blobs) * Math.PI * 2 + rng.next();
    const r = i === 0 ? 0 : 0.32 * s;
    const bs = s * rng.range(0.38, 0.52);
    const by = y + trunkH + 0.25 * s + (i === 0 ? 0.2 * s : rng.range(-0.05, 0.2) * s);
    B.geo('foliage', blob, x + Math.cos(a) * r, by, z + Math.sin(a) * r, pal[i === 0 ? 2 : rng.int(0, 1)], {
      sx: bs, sy: bs * 0.9, sz: bs, ry: rng.next() * 6, sway,
    });
  }
}

export function pineTree(B, rng, x, z, s = 1, y = heightAt(x, z)) {
  const pal = rng.pick(LEAVES);
  B.geo('foliage', cyl6, x, y + 0.35 * s, z, 0x5e3e26, { sx: 0.08 * s, sy: 0.7 * s, sz: 0.08 * s, sway: 0 });
  const sway = (bx, by) => Math.max(0, (by - y) / (2.2 * s));
  for (let i = 0; i < 3; i += 1) {
    const r = (0.62 - i * 0.16) * s;
    B.geo('foliage', cone6, x, y + (0.75 + i * 0.42) * s, z, pal[i === 2 ? 2 : i], { sx: r, sy: 0.7 * s, sz: r, ry: i, sway });
  }
}

export function bigTree(B, rng, x, z, s = 1, y = heightAt(x, z)) {
  B.geo('foliage', cyl6, x, y + 0.9 * s, z, 0x5a3a22, { sx: 0.18 * s, sy: 1.8 * s, sz: 0.18 * s, sway: 0 });
  for (const [dx, dz, rz] of [[0.3, 0, -0.6], [-0.3, 0.1, 0.6]]) {
    B.geo('foliage', cyl6, x + dx * s, y + 1.6 * s, z + dz * s, 0x5a3a22, { sx: 0.08 * s, sy: 0.9 * s, sz: 0.08 * s, rz, sway: 0.2 });
  }
  const sway = (bx, by) => Math.max(0, (by - y - 1.2 * s) / (2 * s)) * 1.1;
  for (let i = 0; i < 9; i += 1) {
    const a = rng.next() * Math.PI * 2;
    const r = rng.range(0, 0.9) * s;
    const bs = rng.range(0.55, 0.8) * s;
    const by = y + rng.range(2.0, 3.0) * s;
    B.geo('foliage', blob, x + Math.cos(a) * r, by, z + Math.sin(a) * r, rng.pick(LEAVES[1]), { sx: bs, sy: bs * 0.8, sz: bs, ry: a, sway });
  }
  B.geo('foliage', blob, x, y + 3.2 * s, z, LEAVES[2][2], { sx: 0.7 * s, sy: 0.55 * s, sz: 0.7 * s, sway });
}

const HYDRANGEA = [0x8a6ad8, 0x5a8ae8, 0xe88ac0, 0xb8a0e8, 0x6aa0f0];

export function hydrangea(B, rng, x, z, s = 1, y = heightAt(x, z)) {
  const sway = (bx, by) => Math.max(0, (by - y) / 0.6) * 0.5;
  B.geo('foliage', blob, x, y + 0.22 * s, z, 0x3a7a3e, { sx: 0.42 * s, sy: 0.3 * s, sz: 0.36 * s, sway });
  const hue = rng.pick(HYDRANGEA);
  for (let i = 0; i < 7; i += 1) {
    const c = new THREE.Color(rng.chance(0.25) ? rng.pick(HYDRANGEA) : hue).multiplyScalar(rng.range(0.85, 1.1));
    B.geo('foliage', blob, x + rng.range(-0.3, 0.3) * s, y + rng.range(0.32, 0.5) * s, z + rng.range(-0.25, 0.25) * s, c, {
      sx: 0.12 * s, sy: 0.11 * s, sz: 0.12 * s, sway,
    });
  }
}

export function bush(B, rng, x, z, s = 1, y = heightAt(x, z)) {
  const sway = (bx, by) => Math.max(0, (by - y) / 0.6) * 0.4;
  for (let i = 0; i < 3; i += 1) {
    B.geo('foliage', blob, x + rng.range(-0.25, 0.25) * s, y + 0.2 * s, z + rng.range(-0.2, 0.2) * s, rng.pick(LEAVES[0]), {
      sx: 0.3 * s, sy: 0.26 * s, sz: 0.3 * s, sway,
    });
  }
}

// ---------------------------------------------------------------- roads

// Ribbon along a centreline of [x, y, z] points (with constant width).
function ribbon(B, points, width, hex, bucket = 'solid') {
  const verts = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, ay, az] = points[i];
    const [bx, by, bz] = points[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * (width / 2);
    const nz = (dx / len) * (width / 2);
    const a1 = [ax + nx, ay, az + nz];
    const a2 = [ax - nx, ay, az - nz];
    const b1 = [bx + nx, by, bz + nz];
    const b2 = [bx - nx, by, bz - nz];
    verts.push(...a2, ...a1, ...b1, ...a2, ...b1, ...b2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  // make sure faces point up
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      const tx = p.getX(i + 1); const ty = p.getY(i + 1); const tz = p.getZ(i + 1);
      p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
      p.setXYZ(i + 2, tx, ty, tz);
    }
  }
  B.add(bucket, g, new THREE.Matrix4(), hex);
}

function stripeAlong(B, x, z, y, pitch, len, width, hex, ry = 0) {
  B.box('solid', width, 0.02, len, x, y + 0.012, z, hex, { ry, rx: pitch });
}

export function roads(B, rng) {
  // --- road A near section (flat)
  const flatFar = -8.4;
  B.block('solid', 3.2, 0.06, ROAD_A.zNear - flatFar, 0, -0.04, (ROAD_A.zNear + flatFar) / 2, ASPHALT);
  // --- road A down to the harbour
  const pts = [];
  const side = [];
  for (let z = flatFar; z >= ROAD_A.zFar; z -= 0.5) pts.push([0, roadHeight(z), z]);
  ribbon(B, pts, 3.2, ASPHALT);
  for (const sx of [-1, 1]) {
    side.length = 0;
    for (let z = flatFar; z >= ROAD_A.zFar; z -= 0.5) side.push([sx * 2.2, roadHeight(z) + 0.08, z]);
    ribbon(B, side, 1.1, PAVING);
    for (let z = flatFar - 0.25; z >= ROAD_A.zFar; z -= 0.5) {
      const y = roadHeight(z) + 0.04;
      B.box('solid', 0.12, 0.14, 0.52, sx * 2.78, y, z, 0xb4b0a6, { rx: Math.atan2(roadHeight(z - 0.25) - roadHeight(z + 0.25), 0.5) * -1 });
    }
  }
  // centre dashes
  for (let z = ROAD_A.zNear - 1; z > ROAD_A.zFar + 1; z -= 1.6) {
    if (z > -8.6 && z < -5.2) continue; // level crossing
    if (z > -3.6 && z < -0.2) continue; // junction
    if (z > 3.8 && z < 6.8) continue; // zebra
    const y = z > flatFar ? 0.02 : roadHeight(z);
    const pitch = z > flatFar ? 0 : -Math.atan2(roadHeight(z - 0.4) - roadHeight(z + 0.4), 0.8);
    stripeAlong(B, 0, z, y, pitch, 0.8, 0.1, PAINT);
  }
  // edge lines
  for (const sx of [-1.45, 1.45]) {
    B.box('solid', 0.07, 0.02, ROAD_A.zNear - flatFar, sx, 0.034, (ROAD_A.zNear + flatFar) / 2, PAINT);
  }
  // zebra crossing on road A
  for (let i = 0; i < 6; i += 1) B.box('solid', 0.3, 0.02, 2.2, -1.25 + i * 0.5, 0.036, 5.3, PAINT);
  B.box('solid', 3.0, 0.02, 0.18, 0, 0.036, 7.2, PAINT);
  // "とまれ" painted before the crossing
  const tomare = makeSign({ lines: ['とまれ'], width: 1.2, height: 0.9, bg: '#6c767c', fg: '#f2f4f0', pxPerUnit: 48 });
  tomare.rotation.x = -Math.PI / 2;
  tomare.position.set(-0.75, 0.04, -3.9);
  tomare.rotation.z = Math.PI;
  tomare.scale.set(0.7, 1.0, 1);

  // sidewalks on the flat section
  B.block('solid', 1.2, 0.14, ROAD_A.zNear - flatFar, -2.2, -0.02, (ROAD_A.zNear + flatFar) / 2, PAVING);
  B.block('solid', 1.2, 0.14, ROAD_A.zNear - ROAD_B.z1, 2.2, -0.02, (ROAD_A.zNear + ROAD_B.z1) / 2, PAVING);
  for (let z = ROAD_A.zNear; z > flatFar; z -= 0.6) {
    B.box('solid', 1.18, 0.005, 0.03, -2.2, 0.122, z, 0xb8b4a8);
    if (z > ROAD_B.z1) B.box('solid', 1.18, 0.005, 0.03, 2.2, 0.122, z, 0xb8b4a8);
  }
  // station forecourt paving
  B.block('solid', 17, 0.14, 1.0, 10.3, -0.02, -3.9, PAVING);
  B.block('solid', 1.2, 0.14, 2.6, 2.2, -0.02, -5.5, PAVING);

  // --- road B (east, climbing gently)
  const bpts = [];
  for (let x = 1.6; x <= ROAD_B.x1; x += 0.5) bpts.push([x, roadBHeight(x) + 0.0, ROAD_B_Z]);
  ribbon(B, bpts, 3.0, ASPHALT_DARK);
  const bside = [];
  for (let x = 2.8; x <= ROAD_B.x1; x += 0.5) bside.push([x, roadBHeight(x) + 0.08, ROAD_B_Z + 2.05]);
  ribbon(B, bside, 1.1, PAVING);
  for (let x = 5.2; x < ROAD_B.x1 - 1; x += 1.6) {
    const y = roadBHeight(x);
    const pitch = Math.atan2(roadBHeight(x + 0.4) - roadBHeight(x - 0.4), 0.8);
    B.box('solid', 0.8, 0.02, 0.1, x, y + 0.012, ROAD_B_Z, PAINT, { rz: pitch });
  }
  // zebra on road B
  for (let i = 0; i < 5; i += 1) B.box('solid', 2.0, 0.02, 0.3, 3.6, 0.036, -3.1 + i * 0.55, PAINT);

  // manholes
  for (const [x, z] of [[0.6, 1.5], [-0.5, 12], [7.5, -1.5]]) {
    B.geo('solid', cyl8, x, 0.02, z, 0x4a5258, { sx: 0.32, sy: 0.02, sz: 0.32 });
  }
  return [tomare];
}

// ---------------------------------------------------------------- railway

export function railway(B) {
  const x0 = PORTAL_L - 12;
  const x1 = PORTAL_R + 12;
  B.block('solid', x1 - x0, 0.14, 2.6, (x0 + x1) / 2, -0.06, TRACK_Z, 0x8e8a80, { jitter: 0.04 });
  for (let x = x0; x < x1; x += 0.55) {
    if (x > -1.8 && x < 1.8) continue;
    B.box('solid', 0.22, 0.07, 2.0, x, 0.11, TRACK_Z, 0x5a4636);
  }
  for (const dz of [-0.55, 0.55]) {
    B.box('solid', x1 - x0, 0.1, 0.07, (x0 + x1) / 2, 0.19, TRACK_Z + dz, 0xa2a8ae);
  }
  // crossing deck
  B.block('solid', 3.2, 0.16, 2.6, 0, 0, TRACK_Z, 0x4e5256);
  for (const dx of [-1.62, 1.62]) {
    for (let i = 0; i < 5; i += 1) B.box('solid', 0.06, 0.02, 0.5, dx, 0.17, TRACK_Z - 1.1 + i * 0.55, i % 2 ? 0x222222 : 0xf2d020);
  }
  // tunnel portals
  for (const [px, dir] of [[PORTAL_L, 1], [PORTAL_R, -1]]) {
    B.at(px, 0, TRACK_Z, dir > 0 ? 0 : Math.PI, () => {
      B.block('solid', 0.8, 3.6, 1.4, 0, -0.3, -2.1, 0x8c8e86, { jitter: 0.06 });
      B.block('solid', 0.8, 3.6, 1.4, 0, -0.3, 2.1, 0x8c8e86, { jitter: 0.06 });
      B.block('solid', 0.8, 1.2, 5.6, 0, 2.3, 0, 0x8c8e86, { jitter: 0.06 });
      B.block('solid', 0.9, 0.2, 5.8, 0.05, 3.5, 0, 0x7a7c74);
      B.block('solid', 0.3, 2.4, 2.8, -0.45, 0, 0, 0x121418);
      // hill face above the portal
      B.block('solid', 0.4, 2.4, 8.5, -0.6, 2.8, 0, 0x3f7d3a);
    });
  }
}

// ---------------------------------------------------------------- poles

// Utility pole; returns wire attach points in world space.
export function utilityPole(B, x, z, ry, { lamp = false, transformer = false } = {}) {
  const y = heightAt(x, z);
  const H = 5.4;
  const attach = [];
  B.at(x, y, z, ry, () => {
    B.geo('solid', cyl8, 0, H / 2, 0, 0xa4a49c, { sx: 0.09, sy: H, sz: 0.09 });
    B.box('solid', 1.3, 0.08, 0.08, 0, H - 0.3, 0, 0x7a7a74);
    B.box('solid', 0.9, 0.07, 0.07, 0, H - 1.05, 0, 0x7a7a74);
    for (const ax of [-0.55, 0, 0.55]) B.box('solid', 0.06, 0.1, 0.06, ax, H - 0.22, 0, 0xf0f0ea);
    // climbing pegs
    for (let i = 0; i < 6; i += 1) B.box('solid', 0.28, 0.03, 0.03, 0, 1.8 + i * 0.45, 0, 0x6a6a64, { ry: i % 2 ? Math.PI / 2 : 0 });
    // yellow-black guard sleeve
    for (let i = 0; i < 4; i += 1) B.geo('solid', cyl8, 0, 0.15 + i * 0.3, 0, i % 2 ? 0x222222 : 0xf2d020, { sx: 0.11, sy: 0.3, sz: 0.11 });
    if (transformer) {
      B.geo('solid', cyl8, 0.25, H - 1.7, 0, 0x8c9496, { sx: 0.2, sy: 0.55, sz: 0.2 });
      B.geo('solid', cyl8, -0.25, H - 1.7, 0, 0x8c9496, { sx: 0.2, sy: 0.55, sz: 0.2 });
    }
    if (lamp) {
      B.box('solid', 0.06, 0.06, 1.0, 0, H - 2.0, 0.5, 0x5a5a56, { rx: -0.2 });
      B.box('glow', 0.18, 0.08, 0.34, 0, H - 2.12, 0.98, 0xe8ece8, { lit: 1, emit: 0xfff4d0 });
    }
  });
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  for (const [ax, ay] of [[-0.55, H - 0.18], [0.55, H - 0.18], [0.35, H - 1.0]]) {
    attach.push(new THREE.Vector3(x + ax * c, y + ay, z - ax * s));
  }
  return attach;
}

export function wires(chains) {
  const pts = [];
  for (const chain of chains) {
    for (let i = 0; i < chain.length - 1; i += 1) {
      const a = chain[i];
      const b = chain[i + 1];
      for (let k = 0; k < Math.min(a.length, b.length); k += 1) {
        const dist = a[k].distanceTo(b[k]);
        const sag = 0.05 * dist + 0.1;
        const n = Math.max(6, Math.ceil(dist * 1.2));
        let prev = a[k];
        for (let j = 1; j <= n; j += 1) {
          const t = j / n;
          const p = a[k].clone().lerp(b[k], t);
          p.y -= Math.sin(t * Math.PI) * sag;
          pts.push(prev, p);
          prev = p;
        }
      }
    }
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x3a4250, transparent: true, opacity: 0.85 }));
  lines.name = 'wires';
  return lines;
}

// ---------------------------------------------------------------- street props

export function vendingMachine(B, rng, x, z, ry, body = 0x2a62c8) {
  B.at(x, heightAt(x, z) + 0.12, z, ry, () => {
    B.block('solid', 0.82, 1.7, 0.66, 0, 0, 0, body);
    B.block('solid', 0.86, 0.06, 0.7, 0, 1.7, 0, new THREE.Color(body).multiplyScalar(0.7));
    B.box('glow', 0.7, 0.2, 0.03, 0, 1.55, 0.34, 0xf2f6ff, { lit: 1, emit: 0xffffff });
    B.box('glow', 0.7, 0.7, 0.03, 0, 1.05, 0.335, 0xdde8f4, { lit: 1, emit: 0xeaf4ff });
    const drinks = [0xd83a3a, 0xf2c830, 0x3aa84a, 0x2a62c8, 0xf28a2a, 0xffffff, 0x8a4a2a];
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 6; c += 1) {
        const col = rng.pick(drinks);
        B.box('glow', 0.07, 0.16, 0.03, -0.27 + c * 0.108, 0.8 + r * 0.22, 0.355, col, { lit: 1, emit: col });
      }
    }
    B.box('solid', 0.5, 0.18, 0.04, 0, 0.3, 0.34, 0x1a1e22);
    B.box('solid', 0.18, 0.2, 0.04, 0.24, 0.62, 0.345, 0xc8ccd0);
  });
}

export function recycleBins(B, x, z) {
  for (let i = 0; i < 2; i += 1) {
    B.geo('solid', cyl8, x + i * 0.34, 0.4, z, i ? 0x3a78c8 : 0xe8e8e0, { sx: 0.15, sy: 0.55, sz: 0.15 });
  }
}

export function postBox(B, x, z) {
  B.geo('solid', cyl8, x, 0.55, z, 0xd8322a, { sx: 0.2, sy: 0.85, sz: 0.2 });
  B.box('solid', 0.46, 0.08, 0.46, x, 1.0, z, 0xb82a22);
  B.box('solid', 0.22, 0.04, 0.02, x, 0.78, z + 0.2, 0x1a1a1a);
}

export function curveMirror(B, x, z, ry) {
  B.at(x, 0.1, z, ry, () => {
    B.geo('solid', cyl8, 0, 1.3, 0, 0xf07a2a, { sx: 0.05, sy: 2.6, sz: 0.05 });
    B.geo('solid', cyl8, 0, 2.6, 0.08, 0xf07a2a, { sx: 0.32, sy: 0.06, sz: 0.32, rx: Math.PI / 2 });
    B.geo('glow', cyl8, 0, 2.6, 0.12, 0xb8d8f0, { sx: 0.26, sy: 0.02, sz: 0.26, rx: Math.PI / 2, lit: 0 });
  });
}

export function lowWall(B, x0, x1, z, h = 0.9, { rail = true, axis = 'x' } = {}) {
  const len = x1 - x0;
  const mid = (x0 + x1) / 2;
  if (axis === 'x') B.block('solid', len, h, 0.3, mid, 0, z, 0x9ea098, { jitter: 0.05 });
  else B.block('solid', 0.3, h, len, z, 0, mid, 0x9ea098, { jitter: 0.05 });
  if (axis === 'x') B.box('solid', len + 0.04, 0.08, 0.34, mid, h, z, 0xb4b6ae);
  else B.box('solid', 0.34, 0.08, len + 0.04, z, h, mid, 0xb4b6ae);
  if (!rail) return;
  for (let u = x0 + 0.1; u <= x1; u += 0.7) {
    if (axis === 'x') B.block('solid', 0.05, 0.55, 0.05, u, h, z, 0x7a8a8a);
    else B.block('solid', 0.05, 0.55, 0.05, z, h, u, 0x7a8a8a);
  }
  if (axis === 'x') B.box('solid', len, 0.06, 0.06, mid, h + 0.55, z, 0x7a8a8a);
  else B.box('solid', 0.06, 0.06, len, z, h + 0.55, mid, 0x7a8a8a);
}

export function noticeBoard(B, group, x, z, ry) {
  B.at(x, 0, z, ry, () => {
    for (const sx of [-0.75, 0.75]) B.block('solid', 0.1, 1.6, 0.1, sx, 0, 0, 0x6a4028);
    B.block('solid', 1.6, 0.9, 0.08, 0, 0.6, 0, 0x7a4a2a);
    B.geo('solid', hipGeometry(1.9, 0.5, 0.22), 0, 1.6, 0, 0x3a3a3a);
  });
  const posters = makeSign({
    lines: ['board'],
    width: 1.44,
    height: 0.76,
    bg: '#2f5a3a',
    pxPerUnit: 80,
    draw: (ctx, w, h) => {
      const cols = ['#f2d27a', '#f29ab0', '#9ad0f2', '#ffffff', '#c8f29a', '#f2b27a'];
      const cells = [[0.04, 0.08, 0.28, 0.5], [0.36, 0.06, 0.26, 0.4], [0.66, 0.1, 0.3, 0.36], [0.36, 0.52, 0.3, 0.4], [0.05, 0.62, 0.26, 0.32], [0.7, 0.52, 0.25, 0.42]];
      cells.forEach(([cx, cy, cw, ch], i) => {
        ctx.fillStyle = cols[i];
        ctx.fillRect(cx * w, cy * h, cw * w, ch * h);
        ctx.fillStyle = 'rgba(40,40,60,0.55)';
        for (let l = 0; l < 4; l += 1) ctx.fillRect((cx + 0.03) * w, (cy + 0.08 + l * ch * 0.2) * h, cw * w * 0.8, h * 0.025);
      });
    },
  });
  posters.position.set(x + Math.sin(ry) * 0.05, 1.05, z + Math.cos(ry) * 0.05);
  posters.rotation.y = ry;
  group.add(posters);
}

export function schoolSign(group, x, y, z, ry = 0) {
  const sign = makeSign({
    lines: ['school'],
    width: 0.62,
    height: 0.82,
    bg: '#ffffff',
    border: '#1f4f9a',
    pxPerUnit: 128,
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#1f4f9a';
      ctx.font = `800 ${h * 0.16}px "Hiragino Sans", sans-serif`;
      ctx.fillText('通学路', w / 2, h * 0.16);
      ctx.fillStyle = '#f7d9b8';
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.42, h * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.fillRect(w * 0.4, h * 0.3, w * 0.2, h * 0.06);
      ctx.fillStyle = '#2f6fd6';
      ctx.fillRect(w * 0.38, h * 0.52, w * 0.24, h * 0.16);
      ctx.fillStyle = '#d8322a';
      ctx.font = `800 ${h * 0.15}px "Hiragino Sans", sans-serif`;
      ctx.fillText('注意', w / 2, h * 0.84);
    },
  });
  sign.position.set(x, y, z);
  sign.rotation.y = ry;
  group.add(sign);
}

export function stonePillar(B, group, x, z, text) {
  B.block('solid', 0.5, 0.2, 0.5, x, 0, z, 0x8e9088);
  B.block('solid', 0.36, 1.9, 0.36, x, 0.2, z, 0xa6a89e);
  const s = makeSign({ lines: [text], width: 0.26, height: 1.5, bg: '#a6a89e', fg: '#3a3a36', vertical: true, pxPerUnit: 96 });
  s.position.set(x, 1.2, z + 0.185);
  group.add(s);
}

export function playground(B, x, z) {
  B.at(x, 0, z, 0.3, () => {
    B.block('solid', 5.4, 0.04, 3.8, 0, 0, 0, 0xe0cc9a);
    // slide
    B.block('solid', 0.8, 1.2, 0.8, -1.5, 0, -0.8, 0xe86a4a);
    B.block('solid', 0.9, 0.08, 0.9, -1.5, 1.2, -0.8, 0xf2c830);
    for (let i = 0; i < 5; i += 1) B.box('solid', 0.6, 0.04, 0.06, -1.5, 0.2 + i * 0.22, -1.25, 0xd0d0d0);
    B.box('solid', 0.5, 0.06, 1.8, -1.5, 0.66, 0.35, 0x3aa8e0, { rx: -0.62 });
    // swings
    for (const sx of [0.6, 2.2]) B.block('solid', 0.08, 1.8, 0.08, sx, 0, -0.6, 0x4a8ad8, { rz: 0 });
    B.box('solid', 1.7, 0.08, 0.08, 1.4, 1.8, -0.6, 0x4a8ad8);
    for (const sx of [1.0, 1.8]) {
      B.box('solid', 0.02, 1.3, 0.02, sx - 0.15, 1.15, -0.6, 0x888888);
      B.box('solid', 0.02, 1.3, 0.02, sx + 0.15, 1.15, -0.6, 0x888888);
      B.box('solid', 0.4, 0.05, 0.2, sx, 0.5, -0.6, 0xe8d040);
    }
    // sandbox + panda spring rider
    B.block('solid', 1.4, 0.15, 1.2, 1.4, 0, 1.0, 0x9a7a5a);
    B.block('solid', 1.2, 0.16, 1.0, 1.4, 0.001, 1.0, 0xf0dca8);
    B.block('solid', 0.36, 0.3, 0.5, -0.3, 0.3, 1.2, 0xf6f6f2);
    B.block('solid', 0.3, 0.28, 0.26, -0.3, 0.5, 1.5, 0xf6f6f2);
    B.box('solid', 0.08, 0.08, 0.08, -0.4, 0.82, 1.5, 0x1a1a1a);
    B.box('solid', 0.08, 0.08, 0.08, -0.2, 0.82, 1.5, 0x1a1a1a);
    B.geo('solid', cyl8, -0.3, 0.15, 1.2, 0xd0d0d0, { sx: 0.06, sy: 0.3, sz: 0.06 });
  });
}

// ---------------------------------------------------------------- far scenery

export function mountains(rng) {
  const B_positions = [];
  const colors = [];
  const c = new THREE.Color();
  const addPeak = (x, z, r, h, hex) => {
    const g = new THREE.ConeGeometry(r, h, 9, 3).toNonIndexed();
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      const y = p.getY(i);
      if (y < h / 2 - 0.01) {
        const k = 1 + (Math.sin(p.getX(i) * 0.3 + p.getZ(i) * 0.2 + x) * 0.18);
        p.setX(i, p.getX(i) * k);
        p.setZ(i, p.getZ(i) * k);
        p.setY(i, y + Math.sin(p.getX(i) * 0.5 + z) * h * 0.04);
      }
    }
    for (let i = 0; i < p.count; i += 1) {
      B_positions.push(p.getX(i) + x, p.getY(i) + h / 2 + SEA - 1, p.getZ(i) + z);
    }
    for (let i = 0; i < p.count; i += 3) {
      c.set(hex).multiplyScalar(rng.range(0.85, 1.1));
      for (let k = 0; k < 3; k += 1) colors.push(c.r, c.g, c.b);
    }
  };
  // ridge across the bay
  for (let i = 0; i < 16; i += 1) {
    const x = -190 + i * 25 + rng.range(-8, 8);
    const z = -150 - rng.range(0, 40) - (Math.abs(x) < 50 ? 0 : 0);
    addPeak(x, z, rng.range(24, 38), rng.range(9, 20), rng.pick([0x3f7f4a, 0x4a8a4a, 0x356f40]));
  }
  // headlands wrapping the bay
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i += 1) {
      const x = side * (78 + rng.range(-6, 18));
      const z = 30 - i * 22 + rng.range(-5, 5);
      addPeak(x, z, rng.range(18, 30), rng.range(14, 26), rng.pick([0x3a7a3a, 0x2f6a34, 0x4a8a40]));
    }
    for (let i = 0; i < 3; i += 1) {
      addPeak(side * (52 + i * 16), -72 - i * 20, rng.range(12, 20), rng.range(6, 13), 0x3f7f3e);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(B_positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

export function lighthouseIsland(B, x, z) {
  const y = SEA;
  B.geo('solid', blob, x, y - 0.4, z, 0x8a8a7a, { sx: 5, sy: 1.6, sz: 3.6, jitter: 0.1 });
  B.geo('foliage', blob, x - 1.2, y + 0.8, z - 0.6, 0x3e8a3e, { sx: 2.6, sy: 1.1, sz: 2.0, sway: 0.1 });
  B.geo('solid', cyl8, x + 1.2, y + 2.6, z + 0.4, 0xf6f6f0, { sx: 0.55, sy: 4.4, sz: 0.55 });
  for (let i = 0; i < 3; i += 1) B.geo('solid', cyl8, x + 1.2, y + 1.2 + i * 1.2, z + 0.4, 0xd83a2a, { sx: 0.57, sy: 0.3, sz: 0.57 });
  B.geo('glow', cyl8, x + 1.2, y + 5.1, z + 0.4, 0xfff4d0, { sx: 0.4, sy: 0.6, sz: 0.4, lit: 1, emit: 0xfff0b0 });
  B.geo('solid', cone6, x + 1.2, y + 5.65, z + 0.4, 0xd83a2a, { sx: 0.6, sy: 0.5, sz: 0.6 });
  return new THREE.Vector3(x + 1.2, y + 5.1, z + 0.4);
}

export function harbour(B, rng) {
  // stone quay edge
  B.block('solid', 20, QUAY - SEA + 0.6, 0.6, 0, SEA - 0.6, -30.8, 0x9a9a90, { jitter: 0.08 });
  for (let x = -9.5; x <= 9.5; x += 1.9) {
    B.geo('solid', cyl8, x, QUAY + 0.15, -30.6, 0x3a3a3a, { sx: 0.1, sy: 0.3, sz: 0.1 });
  }
  // wooden jetty
  for (let z = -31; z > -38; z -= 0.4) B.box('solid', 1.4, 0.08, 0.36, 5.5, QUAY - 0.05, z, rng.pick([0x9a7048, 0x8a6440, 0xa87a50]));
  for (let z = -31.4; z > -38; z -= 1.6) {
    for (const dx of [-0.65, 0.65]) B.geo('solid', cyl6, 5.5 + dx, QUAY - 1.4, z, 0x5a3e26, { sx: 0.09, sy: 2.8, sz: 0.09 });
  }
  // breakwater with a little red light
  const pts = [];
  for (let i = 0; i < 14; i += 1) {
    const t = i / 13;
    pts.push([-14 + t * 10, -33 - Math.sin(t * Math.PI * 0.5) * 9]);
  }
  for (const [bx, bz] of pts) {
    B.geo('solid', blob, bx, SEA + 0.2, bz, 0xb8b8ae, { sx: 1.3, sy: 0.9, sz: 1.3, ry: bx, jitter: 0.12 });
  }
  const [lx, lz] = pts[pts.length - 1];
  B.geo('solid', cyl8, lx, SEA + 2.0, lz, 0xd83a2a, { sx: 0.35, sy: 2.6, sz: 0.35 });
  B.geo('glow', cyl8, lx, SEA + 3.45, lz, 0xf6f6f0, { sx: 0.28, sy: 0.35, sz: 0.28, lit: 1, emit: 0xff5040 });
  B.geo('solid', cone6, lx, SEA + 3.8, lz, 0xd83a2a, { sx: 0.35, sy: 0.3, sz: 0.35 });
  return { jettyX: 5.5 };
}

export { mat4 };

// Terraced rice paddies: raised earth bunds around flooded plots with rows
// of young rice.
export function ricePaddies(B, rng, x0, z0, x1, z1, cell = 3.6) {
  for (let x = x0; x + cell <= x1 + 0.01; x += cell) {
    for (let z = z0; z + cell <= z1 + 0.01; z += cell) {
      const y = heightAt(x + cell / 2, z + cell / 2);
      const young = rng.chance(0.7);
      B.block('solid', cell, 0.1, cell, x + cell / 2, y - 0.04, z + cell / 2, 0x8a7048);
      B.box('glow', cell - 0.3, 0.02, cell - 0.3, x + cell / 2, y + 0.07, z + cell / 2, young ? 0x7cb8b0 : 0x9cc860, { lit: 0 });
      for (let r = 0; r < 7; r += 1) {
        B.box('foliage', cell - 0.6, 0.12, 0.08, x + cell / 2, y + 0.12, z + 0.5 + r * ((cell - 1) / 6),
          young ? 0x6aa84a : 0x8cc050, { sway: 0.35 });
      }
    }
  }
}

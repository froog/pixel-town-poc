import * as THREE from 'three';
import { makeSign } from './signs.js';

// Tunnels running along X: an arched tube (unlit, darkening with depth so it
// reads as a hole into the hill), stone portals with voussoirs, a lid over
// the terrain hole behind each portal, and sodium lamps inside.

const STONE = 0x8c8e86;
const STONE_LIGHT = 0xa4a69c;
const MOUTH = new THREE.Color(0x6a6c66);
const DEEP = new THREE.Color(0x0c0d10);

// shared so the main loop can dim tunnel mouths at night
export const tubeMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });

function profile(W, wallH, arcSteps = 10) {
  const R = W / 2;
  const pts = [[-R, 0], [-R, wallH]];
  for (let i = 1; i < arcSteps; i += 1) {
    const a = Math.PI - (i / arcSteps) * Math.PI;
    pts.push([Math.cos(a) * R, wallH + Math.sin(a) * R]);
  }
  pts.push([R, wallH], [R, 0]);
  return pts;
}

function pushQuad(verts, cols, a, b, c, d, col) {
  // both windings so the tube reads from any side
  for (const tri of [[a, b, c], [a, c, d], [a, c, b], [a, d, c]]) {
    for (const p of tri) {
      verts.push(p[0], p[1], p[2]);
      cols.push(col.r, col.g, col.b);
    }
  }
}

export function tunnel(B, decor, opts) {
  const { xa, xb, zc, floorY, W, wallH, openA = true, openB = true, cover, name = null, lampStep = 3 } = opts;
  const R = W / 2;
  const prof = profile(W, wallH);
  const verts = [];
  const cols = [];
  const col = new THREE.Color();
  const step = 1;
  for (let x = xa; x < xb - 1e-6; x += step) {
    const x2 = Math.min(xb, x + step);
    const mid = (x + x2) / 2;
    const depth = Math.min(openA ? mid - xa : Infinity, openB ? xb - mid : Infinity);
    col.copy(MOUTH).lerp(DEEP, THREE.MathUtils.smoothstep(depth, 0.5, 9));
    const y1 = floorY(x);
    const y2 = floorY(x2);
    for (let i = 0; i < prof.length - 1; i += 1) {
      const [z1, h1] = prof[i];
      const [z2, h2] = prof[i + 1];
      pushQuad(verts, cols,
        [x, y1 + h1, zc + z1], [x2, y2 + h1, zc + z1], [x2, y2 + h2, zc + z2], [x, y1 + h2, zc + z2],
        col.clone().multiplyScalar(i === 0 || i === prof.length - 2 ? 0.8 : 1));
    }
  }
  // closed ends are black caps
  for (const [x, open] of [[xa, openA], [xb, openB]]) {
    if (open) continue;
    const y = floorY(x);
    for (let i = 0; i < prof.length - 1; i += 1) {
      const [z1, h1] = prof[i];
      const [z2, h2] = prof[i + 1];
      pushQuad(verts, cols, [x, y, zc], [x, y + h1, zc + z1], [x, y + h2, zc + z2], [x, y, zc], DEEP);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const mesh = new THREE.Mesh(g, tubeMaterial);
  mesh.name = 'tunnel-tube';
  decor.add(mesh);

  // sodium lamps along the crown
  for (let x = xa + 1.5; x < xb - 1; x += lampStep) {
    B.box('glow', 0.5, 0.08, 0.16, x, floorY(x) + wallH + R - 0.12, zc + R * 0.35, 0xffa848, { lit: 1, emit: 0xffb458 });
  }

  for (const [x, open, s] of [[xa, openA, -1], [xb, openB, 1]]) {
    if (open) portal(B, x, zc, floorY(x), W, wallH, s, cover);
  }
  // lids over the terrain holes behind the portals
  for (const [x, open, s] of [[xa, openA, 1], [xb, openB, -1]]) {
    if (!open) continue;
    const top = cover;
    B.block('solid', 1.05, 0.5, (R + 1.6) * 2, x + s * 0.5, top - 0.45, zc, 0x3f7d3a);
  }

  if (name) {
    for (const [x, open, s] of [[xa, openA, -1], [xb, openB, 1]]) {
      if (!open) continue;
      const sign = makeSign({ lines: [name], width: 2.2, height: 0.42, bg: '#e8e6dc', fg: '#2a2a2a', border: '#6a6a62', pxPerUnit: 96 });
      sign.position.set(x + s * 0.47, floorY(x) + wallH + R + 0.55, zc);
      sign.rotation.y = s * Math.PI / 2;
      decor.add(sign);
    }
  }
}

// Stone headwall facing +X (s = 1) or -X (s = -1) with an arched opening.
function portal(B, x, zc, y0, W, wallH, s, cover) {
  const R = W / 2;
  const side = 1.3;
  const top = cover + 0.25;
  const thick = 0.7;
  const cx = x + s * (thick / 2 - 0.05);
  // piers either side of the opening
  for (const sz of [-1, 1]) {
    B.block('solid', thick, top - y0 + 0.5, side, cx, y0 - 0.5, zc + sz * (R + side / 2), STONE, { jitter: 0.07 });
  }
  // fill above the arch: slices between the arch curve and the top edge
  const n = 12;
  for (let i = 0; i < n; i += 1) {
    const a0 = Math.PI - (i / n) * Math.PI;
    const a1 = Math.PI - ((i + 1) / n) * Math.PI;
    const z0 = Math.cos(a0) * R;
    const z1 = Math.cos(a1) * R;
    const yb = wallH + Math.min(Math.sin(a0), Math.sin(a1)) * R;
    const h = top - (y0 + yb);
    B.block('solid', thick, h, Math.abs(z1 - z0) + 0.02, cx, y0 + yb, zc + (z0 + z1) / 2, STONE, { jitter: 0.07 });
  }
  // voussoir ring + keystone
  const ring = 13;
  for (let i = 0; i <= ring; i += 1) {
    const a = Math.PI - (i / ring) * Math.PI;
    const key = i === Math.floor(ring / 2) || i === Math.ceil(ring / 2);
    B.box('solid', thick + 0.16, key ? 0.5 : 0.36, 0.34, cx + s * 0.06, y0 + wallH + Math.sin(a) * (R + 0.16), zc + Math.cos(a) * (R + 0.16), key ? 0xb8b8ae : STONE_LIGHT, { rx: a - Math.PI / 2 });
  }
  for (const sz of [-1, 1]) {
    B.block('solid', thick + 0.14, wallH, 0.3, cx + s * 0.05, y0, zc + sz * (R + 0.14), STONE_LIGHT, { jitter: 0.05 });
  }
  // cornice
  B.block('solid', thick + 0.3, 0.22, 2 * (R + side) + 0.3, cx + s * 0.1, top - 0.02, zc, 0x7a7c74);
  // wing walls stepping down into the cutting
  for (const sz of [-1, 1]) {
    for (let k = 0; k < 3; k += 1) {
      const h = (top - y0) * (0.8 - k * 0.24);
      B.block('solid', 1.0, h, 0.5, x + s * (0.9 + k), y0 - 0.3, zc + sz * (R + side - 0.2 + k * 0.15), STONE, { jitter: 0.07 });
    }
  }
}

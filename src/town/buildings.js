import * as THREE from 'three';
import { gableGeometry, hipGeometry, mat4 } from './batcher.js';
import { heightAt } from './terrain.js';
import { makeSign } from './signs.js';
import { PLATEAU, PLATFORM, SHRINE, STAIRS } from './layout.js';

export const PALETTE = {
  roofBlue: [0x2f5fa8, 0x3b73c4, 0x24508f, 0x4a86cf, 0x2d6db8],
  roofOther: [0xb8453a, 0x9c3d33, 0x3a8a8a, 0x5b6470, 0x6a7a3a],
  walls: [0xf2ecdc, 0xe8e2d0, 0xdcd6c4, 0xf5f1e6, 0xd8cdb4, 0xc9d2d6, 0xe9dcc6],
  stone: 0x9a9c94,
  stoneDark: 0x7b7d76,
  wood: 0x7a4a2a,
  woodDark: 0x4e2f1c,
  glass: 0x3a5f80,
  windowWarm: [0xffcf7a, 0xffe2a8, 0xffbf6a, 0xfff0c8],
  shrineRoof: 0x485466,
  torii: 0xd4432c,
};

// Footprints {x, z, w, d, ry} that the first-person walker can't enter.
export const solids = [];

const cyl6 = new THREE.CylinderGeometry(1, 1, 1, 6);
const cyl8 = new THREE.CylinderGeometry(1, 1, 1, 8);
const sphere = new THREE.IcosahedronGeometry(1, 0);

export function groundRange(x, z, w, d, ry = 0) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  let lo = Infinity;
  let hi = -Infinity;
  for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) {
    const lx = (u * w) / 2;
    const lz = (v * d) / 2;
    const h = heightAt(x + lx * c + lz * s, z - lx * s + lz * c);
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  return { lo, hi };
}

function windowAt(B, rng, x, y, z, ry, w = 0.42, h = 0.38, litChance = 0.55) {
  const lit = rng.chance(litChance) ? 1 : 0;
  B.box('glow', w, h, 0.05, x, y, z, PALETTE.glass, { ry, lit, emit: rng.pick(PALETTE.windowWarm) });
  // sill
  const sx = Math.sin(ry) * 0.04;
  const sz = Math.cos(ry) * 0.04;
  B.box('solid', w + 0.08, 0.05, 0.1, x + sx, y - h / 2 - 0.03, z + sz, 0xf4f2ea, { ry });
}

// A Japanese town house: stone footing for slopes, 1-3 floors, gable/hip/flat
// roof, windows that light up at night, and a few details.
export function house(B, rng, opts) {
  const { x, z, ry = 0 } = opts;
  const w = opts.w ?? rng.range(2.1, 3.2);
  const d = opts.d ?? rng.range(1.9, 2.7);
  const floors = opts.floors ?? rng.pick([1, 2, 2, 2, 3]);
  const style = opts.style ?? rng.pick(['gable', 'gable', 'hip', 'hip', 'flat']);
  const wall = opts.wall ?? rng.pick(PALETTE.walls);
  const roof = opts.roof ?? (rng.chance(0.72) ? rng.pick(PALETTE.roofBlue) : rng.pick(PALETTE.roofOther));
  const { lo, hi } = groundRange(x, z, w + 0.3, d + 0.3, ry);
  const base = hi + 0.12;
  solids.push({ x, z, w: w + 0.3, d: d + 0.3, ry });

  B.at(x, 0, z, ry, () => {
    B.box('solid', w + 0.22, base - lo + 0.4, d + 0.22, 0, (base + lo - 0.4) / 2, 0, PALETTE.stone, { jitter: 0.08 });
  });

  B.at(x, base, z, ry, () => {
    const fh = 0.95;
    const H = floors * fh;
    B.block('solid', w, H, d, 0, 0, 0, wall);
    for (let f = 1; f < floors; f += 1) {
      B.box('solid', w + 0.05, 0.06, d + 0.05, 0, f * fh, 0, new THREE.Color(wall).multiplyScalar(0.86));
    }

    // roof
    if (style === 'gable') {
      const rise = 0.35 + d * 0.2;
      B.geo('solid', gableGeometry(w + 0.46, d + 0.5, rise), 0, H, 0, roof);
      B.box('solid', w + 0.5, 0.08, 0.14, 0, H + rise, 0, new THREE.Color(roof).multiplyScalar(0.7));
    } else if (style === 'hip') {
      const rise = 0.3 + d * 0.22;
      B.geo('solid', hipGeometry(w + 0.5, d + 0.5, rise), 0, H, 0, roof);
    } else {
      B.box('solid', w + 0.08, 0.16, d + 0.08, 0, H + 0.08, 0, roof);
      B.box('solid', w - 0.1, 0.03, d - 0.1, 0, H + 0.15, 0, 0xb8b8b0);
      if (rng.chance(0.5)) {
        B.geo('solid', cyl8, w * 0.25, H + 0.4, -d * 0.15, 0x9fb4c0, { sx: 0.22, sy: 0.4, sz: 0.22 });
      }
    }

    // windows front and back
    const cols = Math.max(1, Math.floor(w / 0.85));
    const doorCol = rng.int(0, cols - 1);
    for (const side of [1, -1]) {
      const fz = side * (d / 2 + 0.02);
      const fry = side === 1 ? 0 : Math.PI;
      for (let f = 0; f < floors; f += 1) {
        for (let c = 0; c < cols; c += 1) {
          const wx = -w / 2 + (c + 0.5) * (w / cols);
          if (f === 0 && c === doorCol && side === 1) {
            B.box('solid', 0.38, 0.66, 0.05, wx, 0.33, fz, rng.pick([PALETTE.wood, 0x5a6a78, 0x8a6a4a]), { ry: fry });
            B.box('solid', 0.56, 0.05, 0.3, wx, 0.72, fz + 0.12 * side, new THREE.Color(roof).multiplyScalar(0.9), { ry: fry });
            B.box('glow', 0.06, 0.06, 0.06, wx + 0.28, 0.62, fz + 0.03, 0xf0e8d0, { lit: 1, emit: 0xffe0a0 });
            continue;
          }
          if (rng.chance(0.18)) continue;
          windowAt(B, rng, wx, f * fh + 0.52, fz, fry);
        }
      }
    }
    // side windows
    for (const sx of [1, -1]) {
      for (let f = 0; f < floors; f += 1) {
        if (rng.chance(0.45)) windowAt(B, rng, sx * (w / 2 + 0.02), f * fh + 0.52, 0, (sx * Math.PI) / 2, 0.34, 0.34);
      }
    }

    // details
    if (rng.chance(0.45)) {
      const ax = rng.pick([-1, 1]) * (w / 2 + 0.1);
      B.box('solid', 0.14, 0.26, 0.38, ax, 0.2, -d * 0.2, 0xeeeee8);
      B.box('solid', 0.02, 0.16, 0.16, ax + Math.sign(ax) * 0.075, 0.2, -d * 0.2, 0x70767a);
    }
    if (floors >= 2 && rng.chance(0.5)) {
      const bw = w * rng.range(0.5, 0.8);
      B.box('solid', bw, 0.06, 0.4, 0, fh, d / 2 + 0.2, 0xd8d8d0);
      B.box('solid', bw, 0.04, 0.03, 0, fh + 0.36, d / 2 + 0.39, 0x5a6670);
      for (let p = 0; p <= Math.floor(bw / 0.12); p += 1) {
        B.box('solid', 0.02, 0.36, 0.02, -bw / 2 + p * 0.12, fh + 0.18, d / 2 + 0.39, 0x5a6670);
      }
      if (rng.chance(0.6)) {
        // laundry
        const cols2 = [0xffffff, 0xf29ab0, 0x9ad0f2, 0xf2e29a];
        for (let k = 0; k < 3; k += 1) {
          B.box('foliage', 0.16, 0.22, 0.02, -bw / 3 + k * 0.22, fh + 0.52, d / 2 + 0.28, rng.pick(cols2), { sway: 0.6 });
        }
        B.box('solid', bw * 0.9, 0.015, 0.015, 0, fh + 0.64, d / 2 + 0.28, 0x8a8a8a);
      }
    }
    if (rng.chance(0.35)) {
      // potted plant by the door
      const px = -w / 2 + (doorCol + 0.5) * (w / cols) + 0.4;
      B.box('solid', 0.18, 0.16, 0.18, px, 0.08, d / 2 + 0.2, 0xb0643a);
      B.geo('foliage', sphere, px, 0.3, d / 2 + 0.2, rng.pick([0x3e9650, 0x2f7a3e]), { sx: 0.18, sy: 0.2, sz: 0.18, sway: 0.4 });
    }
  });
  return { base, top: base + floors * 0.95 };
}

// The tall white corner house with the roller shutter garage.
export function garageHouse(B, x, z) {
  const w = 2.5;
  const d = 3.0;
  solids.push({ x, z, w: w + 0.3, d: d + 0.3, ry: 0 });
  B.at(x, 0, z, 0, () => {
    B.block('solid', w, 2.9, d, 0, 0, 0, 0xeae6da);
    B.block('solid', w + 0.12, 0.16, d + 0.12, 0, 2.9, 0, 0x2f5fa8);
    B.block('solid', w + 0.3, 0.06, d * 0.5, 0, 2.2, d / 2 - d * 0.25 + 0.1, 0x2f5fa8);
    // shutter
    B.block('solid', 1.7, 1.25, 0.04, 0, 0, d / 2 + 0.01, 0xc7ccd0);
    for (let i = 0; i < 9; i += 1) B.box('solid', 1.7, 0.02, 0.05, 0, 0.12 + i * 0.13, d / 2 + 0.02, 0x9aa2a8);
    B.box('solid', 1.9, 0.14, 0.08, 0, 1.32, d / 2 + 0.03, 0xdad6ca);
    // upper window with AC unit
    B.box('glow', 0.9, 0.55, 0.05, -0.25, 1.9, d / 2 + 0.02, PALETTE.glass, { lit: 1, emit: 0xffd896 });
    B.box('solid', 1.0, 0.06, 0.1, -0.25, 1.6, d / 2 + 0.05, 0xf4f2ea);
    B.box('solid', 0.45, 0.32, 0.22, 0.75, 1.62, d / 2 + 0.12, 0xf2f2ee);
    B.box('solid', 0.02, 0.2, 0.2, 0.75, 1.62, d / 2 + 0.24, 0x70767a, { ry: Math.PI / 2 });
    // side windows
    windowAt(B, { chance: () => true, pick: (l) => l[0] }, w / 2 + 0.02, 1.9, 0.4, Math.PI / 2, 0.5, 0.4);
    // potted plant
    B.box('solid', 0.24, 0.2, 0.24, 1.05, 0.1, d / 2 + 0.3, 0xb0643a);
    B.geo('foliage', sphere, 1.05, 0.38, d / 2 + 0.3, 0x3e9650, { sx: 0.24, sy: 0.24, sz: 0.24, sway: 0.4 });
  });
}

// ---------------------------------------------------------------- shrine

function stoneWall(B, rng, { x0, x1, z, height, face = 1, axis = 'x' }) {
  const rowH = height / Math.round(height / 0.42);
  const rows = Math.round(height / rowH);
  for (let r = 0; r < rows; r += 1) {
    let u = x0 - (r % 2 ? 0.3 : 0);
    while (u < x1) {
      const len = rng.range(0.45, 0.85);
      const a = Math.max(u, x0);
      const b = Math.min(u + len, x1);
      if (b - a > 0.08) {
        const tone = new THREE.Color(PALETTE.stone).multiplyScalar(rng.range(0.82, 1.08));
        const mid = (a + b) / 2;
        const y = r * rowH + rowH / 2;
        if (axis === 'x') B.box('solid', b - a - 0.04, rowH - 0.04, 0.2, mid, y, z + face * 0.08, tone);
        else B.box('solid', 0.2, rowH - 0.04, b - a - 0.04, z + face * 0.08, y, mid, tone);
      }
      u += len;
    }
  }
}

export function torii(B, x, y, z, scale = 1, ry = 0) {
  B.push(mat4(x, y, z, ry, 0, 0, scale, scale, scale));
  for (const sx of [-0.95, 0.95]) {
    B.geo('solid', cyl8, sx, 1.15, 0, PALETTE.torii, { sx: 0.11, sy: 2.3, sz: 0.11 });
    B.geo('solid', cyl8, sx, 0.12, 0, 0x2a2424, { sx: 0.14, sy: 0.24, sz: 0.14 });
  }
  B.box('solid', 2.4, 0.12, 0.14, 0, 1.82, 0, PALETTE.torii);
  B.box('solid', 2.7, 0.14, 0.22, 0, 2.3, 0, PALETTE.torii);
  B.box('solid', 2.6, 0.1, 0.28, 0, 2.43, 0, 0x2a2424);
  for (const sx of [-1, 1]) B.box('solid', 0.4, 0.1, 0.28, sx * 1.45, 2.47, 0, 0x2a2424, { rz: sx * 0.22 });
  B.box('solid', 0.12, 0.36, 0.1, 0, 2.05, 0, PALETTE.torii);
  B.pop();
}

export function stoneLantern(B, x, y, z, scale = 1) {
  B.push(mat4(x, y, z, 0, 0, 0, scale, scale, scale));
  const stone = 0xa9a89c;
  B.block('solid', 0.46, 0.12, 0.46, 0, 0, 0, stone);
  B.geo('solid', cyl6, 0, 0.42, 0, stone, { sx: 0.08, sy: 0.6, sz: 0.08 });
  B.block('solid', 0.38, 0.08, 0.38, 0, 0.72, 0, stone);
  B.block('glow', 0.26, 0.22, 0.26, 0, 0.8, 0, 0xd8d2bc, { lit: 1, emit: 0xffb84a });
  B.geo('solid', hipGeometry(0.6, 0.6, 0.22), 0, 1.02, 0, stone);
  B.geo('solid', sphere, 0, 1.28, 0, stone, { sx: 0.06, sy: 0.08, sz: 0.06 });
  B.pop();
}

function komainu(B, x, y, z, ry) {
  B.push(mat4(x, y, z, ry));
  const c = 0xb4b2a4;
  B.block('solid', 0.5, 0.3, 0.5, 0, 0, 0, 0x8e8c82);
  B.block('solid', 0.24, 0.3, 0.38, 0, 0.3, -0.02, c);
  B.block('solid', 0.26, 0.24, 0.24, 0, 0.56, 0.1, c);
  B.box('solid', 0.3, 0.12, 0.14, 0, 0.72, 0.02, 0x9a988c);
  B.pop();
}

export function shrineComplex(B, rng, { procedural = true } = {}) {
  const { x0, x1, z0, z1, top } = PLATEAU;
  // terrace core + stone faces
  B.block('solid', x1 - x0, top + 0.3, z1 - z0, (x0 + x1) / 2, -0.3, (z0 + z1) / 2, PALETTE.stoneDark);
  const stairL = STAIRS.x - STAIRS.width / 2 - 0.35;
  const stairR = STAIRS.x + STAIRS.width / 2 + 0.35;
  stoneWall(B, rng, { x0, x1: stairL, z: z1, height: top, face: 1 });
  stoneWall(B, rng, { x0: stairR, x1, z: z1, height: top, face: 1 });
  stoneWall(B, rng, { x0: z0, x1: z1, z: x1, height: top, face: 1, axis: 'z' });
  stoneWall(B, rng, { x0, x1, z: z0, height: top, face: -1 });
  // top surface: moss green with a gravel approach
  B.box('solid', x1 - x0, 0.06, z1 - z0, (x0 + x1) / 2, top + 0.03, (z0 + z1) / 2, 0x6a9a48);
  B.box('solid', 2.2, 0.07, z1 - z0 - 0.4, STAIRS.x, top + 0.035, (z0 + z1) / 2 + 0.2, 0xd9cfb2);
  B.box('solid', 5.6, 0.07, 3.8, SHRINE.x, top + 0.036, SHRINE.z - 0.1, 0xd9cfb2);
  for (let i = 0; i < 8; i += 1) {
    B.box('solid', 0.9, 0.03, 0.34, STAIRS.x + (i % 2 ? 0.2 : -0.2), top + 0.08, z1 - 0.4 - i * 0.44, 0xbfb59a);
  }

  // stairs down toward the camera
  for (let i = 0; i < STAIRS.steps - 1; i += 1) {
    const h = top - (i + 1) * STAIRS.rise;
    const zc = z1 + (i + 0.5) * STAIRS.run;
    B.block('solid', STAIRS.width, h, STAIRS.run, STAIRS.x, 0, zc, i % 2 ? 0xb3b2a8 : 0xa9a89e);
    for (const sx of [-1, 1]) {
      B.block('solid', 0.36, h + 0.3, STAIRS.run + 0.01, STAIRS.x + sx * (STAIRS.width / 2 + 0.18), 0, zc, 0x8f9188, { jitter: 0.06 });
    }
  }
  // wooden fence along the terrace edge
  for (let fx = x0 + 0.3; fx < x1 - 0.1; fx += 0.6) {
    if (fx > stairL - 0.2 && fx < stairR + 0.2) continue;
    B.block('solid', 0.06, 0.45, 0.06, fx, top, z1 - 0.12, 0x8a6a48);
  }
  B.box('solid', stairL - x0 - 0.2, 0.05, 0.05, (x0 + stairL) / 2, top + 0.38, z1 - 0.12, 0x8a6a48);
  B.box('solid', x1 - stairR - 0.2, 0.05, 0.05, (x1 + stairR) / 2, top + 0.38, z1 - 0.12, 0x8a6a48);

  torii(B, STAIRS.x, top, z1 - 0.75, 0.95);
  torii(B, STAIRS.x, 0, z1 + (STAIRS.steps - 1) * STAIRS.run + 0.9, 0.78);
  stoneLantern(B, STAIRS.x - 1.9, top, z1 - 2.9);
  stoneLantern(B, STAIRS.x + 1.9, top, z1 - 2.9);
  stoneLantern(B, STAIRS.x - 1.8, 0, z1 + 3.6, 0.9);
  stoneLantern(B, STAIRS.x + 1.8, 0, z1 + 3.6, 0.9);
  komainu(B, SHRINE.x - 1.45, top, z1 - 1.7, 0.3);
  komainu(B, SHRINE.x + 1.45, top, z1 - 1.7, -0.3);

  // purification fountain (temizuya)
  B.at(SHRINE.x + 3.6, top, SHRINE.z + 1.4, -0.4, () => {
    B.block('solid', 1.0, 0.45, 0.6, 0, 0, 0, 0x9a9a90);
    B.box('glow', 0.86, 0.03, 0.46, 0, 0.44, 0, 0x6ac0d8, { lit: 0 });
    for (const sx of [-0.55, 0.55]) for (const sz of [-0.35, 0.35]) B.block('solid', 0.07, 1.4, 0.07, sx, 0, sz, PALETTE.wood);
    B.geo('solid', gableGeometry(1.5, 1.1, 0.4), 0, 1.4, 0, PALETTE.shrineRoof);
  });

  if (procedural) shrineHall(B);
}

export function shrineHall(B) {
  const top = PLATEAU.top;
  solids.push({ x: SHRINE.x, z: SHRINE.z - 0.1, w: 4.6, d: 3.6, ry: 0 });
  B.at(SHRINE.x, top, SHRINE.z, 0, () => {
    B.block('solid', 4.4, 0.3, 3.9, 0, 0, 0, 0xa6a69a, { jitter: 0.05 });
    for (const sx of [-1.5, -0.5, 0.5, 1.5]) for (const sz of [-1.3, 0, 1.3]) {
      B.block('solid', 0.12, 0.5, 0.12, sx, 0.3, sz, PALETTE.woodDark);
    }
    B.block('solid', 3.8, 0.12, 3.3, 0, 0.8, 0, 0x8a5a36);
    // veranda rail
    B.box('solid', 3.8, 0.05, 0.05, 0, 1.2, 1.62, 0xb8392a);
    for (let i = 0; i < 9; i += 1) if (i !== 4) B.block('solid', 0.05, 0.3, 0.05, -1.85 + i * 0.4625, 0.92, 1.62, 0xb8392a);
    // body
    B.block('solid', 2.9, 1.45, 2.5, 0, 0.92, -0.1, 0xefe6d0);
    for (const sx of [-1.45, -0.48, 0.48, 1.45]) {
      B.block('solid', 0.16, 1.55, 0.16, sx, 0.92, 1.15, 0xb8392a);
      B.block('solid', 0.16, 1.55, 0.16, sx, 0.92, -1.35, 0xb8392a);
    }
    B.box('solid', 3.1, 0.14, 2.7, 0, 2.4, -0.1, 0xb8392a);
    B.box('solid', 3.0, 0.08, 0.06, 0, 1.4, 1.16, 0xb8392a);
    // lattice doors
    B.block('solid', 0.9, 0.95, 0.04, 0, 0.95, 1.16, 0x5a3a24);
    for (let i = 1; i < 6; i += 1) B.box('solid', 0.9, 0.025, 0.05, 0, 0.95 + i * 0.16, 1.18, 0xd8c8a0);
    for (let i = 1; i < 5; i += 1) B.box('solid', 0.025, 0.95, 0.05, -0.45 + i * 0.18, 1.42, 1.18, 0xd8c8a0);
    B.box('glow', 0.8, 0.85, 0.02, 0, 1.42, 1.15, 0x3a2a1e, { lit: 1, emit: 0xffb060 });
    // steps + offering box + bell
    for (let i = 0; i < 3; i += 1) B.block('solid', 1.2, 0.3 + i * 0.25, 0.3, 0, 0, 2.3 - i * 0.3, 0x8a5a36);
    B.block('solid', 0.8, 0.4, 0.4, 0, 0.92, 1.45, 0x6a4028);
    for (let i = 0; i < 5; i += 1) B.box('solid', 0.8, 0.03, 0.05, 0, 1.33, 1.3 + i * 0.07, 0xc8a878);
    B.geo('solid', cyl6, 0, 1.75, 1.72, 0xf2f0e6, { sx: 0.04, sy: 1.0, sz: 0.04 });
    B.geo('solid', sphere, 0, 2.28, 1.72, 0xe0b040, { sx: 0.14, sy: 0.14, sz: 0.14 });
    // shimenawa rope + paper streamers
    B.geo('solid', cyl8, 0, 2.2, 1.3, 0xd8c890, { sx: 0.09, sy: 2.4, sz: 0.09, rz: Math.PI / 2 });
    for (const sx of [-0.8, -0.3, 0.3, 0.8]) {
      B.box('foliage', 0.08, 0.26, 0.015, sx, 2.02, 1.34, 0xffffff, { sway: 0.8 });
    }
    // roof: irimoya (hip lower, gable upper), with upturned corners
    B.geo('solid', hipGeometry(5.0, 4.6, 0.95), 0, 2.46, -0.1, PALETTE.shrineRoof);
    B.box('solid', 5.0, 0.07, 4.6, 0, 2.47, -0.1, 0x6f7c8e);
    B.geo('solid', gableGeometry(3.1, 2.4, 1.0), 0, 3.05, -0.1, 0x55627a);
    B.box('solid', 3.4, 0.2, 0.24, 0, 4.06, -0.1, 0x2c323c);
    for (const sx of [-1, 1]) {
      B.box('solid', 0.3, 0.34, 0.3, sx * 1.62, 4.1, -0.1, 0x2c323c);
      for (const sz of [-1, 1]) B.box('solid', 0.5, 0.08, 0.12, sx * 2.45, 2.56, -0.1 + sz * 2.25, 0x6f7c8e, { ry: sx * sz * 0.78, rz: sx * 0.35 });
    }
    // gable end decoration (golden)
    B.box('solid', 0.5, 0.12, 0.04, 0, 3.25, 1.12, 0xd8a838);
  });
  const plaque = makeSign({ lines: ['夏山神社'], width: 0.36, height: 0.95, bg: '#3a2616', fg: '#f2d27a', vertical: true, border: '#d8a838' });
  plaque.position.set(SHRINE.x, PLATEAU.top + 2.75, SHRINE.z + 1.2);
  return plaque;
}

// ---------------------------------------------------------------- station

export function station(B, group) {
  const { x0, x1, z0, z1, top } = PLATFORM;
  B.block('solid', x1 - x0, top, z1 - z0, (x0 + x1) / 2, 0, (z0 + z1) / 2, 0xb9b6ac);
  B.box('solid', x1 - x0, 0.02, 0.12, (x0 + x1) / 2, top + 0.01, z0 + 0.08, 0xf2f2ea);
  B.box('solid', x1 - x0 - 0.2, 0.02, 0.18, (x0 + x1) / 2, top + 0.012, z0 + 0.42, 0xf2c830);
  B.box('solid', x1 - x0, 0.1, 0.1, (x0 + x1) / 2, top - 0.1, z0 - 0.02, 0x8a8a82);
  // steps up from the forecourt
  for (let i = 0; i < 3; i += 1) B.block('solid', 1.0, ((3 - i) * top) / 3, 0.34, x0 + 0.6, 0, z1 + 0.17 + i * 0.34, 0xaaa79c);

  // shelter
  const sx0 = 8.2;
  const sx1 = 15.6;
  B.box('solid', sx1 - sx0 + 0.6, 0.12, 2.1, (sx0 + sx1) / 2, top + 2.3, (z0 + z1) / 2, 0x3d6b52);
  B.box('solid', sx1 - sx0 + 0.7, 0.18, 0.08, (sx0 + sx1) / 2, top + 2.22, z1 + 0.25, 0x2f5a44);
  for (const px of [sx0, (sx0 + sx1) / 2, sx1]) {
    B.geo('solid', cyl8, px, top + 1.15, z1 - 0.35, 0x6a7a74, { sx: 0.07, sy: 2.3, sz: 0.07 });
  }
  // lamps under the shelter
  for (const px of [9.6, 12.1, 14.6]) {
    B.box('glow', 0.6, 0.06, 0.14, px, top + 2.2, (z0 + z1) / 2, 0xe8f0f0, { lit: 1, emit: 0xf8fff0 });
  }
  // benches
  for (const bx of [10.3, 13.9]) {
    B.block('solid', 1.3, 0.06, 0.38, bx, top + 0.4, z1 - 0.5, 0xa8733c);
    B.block('solid', 1.3, 0.3, 0.05, bx, top + 0.46, z1 - 0.3, 0xa8733c);
    for (const lx of [-0.55, 0.55]) B.block('solid', 0.05, 0.4, 0.3, bx + lx, top, z1 - 0.5, 0x4a4a4a);
  }
  // back fence
  for (let fx = x0 + 1.2; fx <= x1; fx += 0.9) B.block('solid', 0.06, 0.9, 0.06, fx, top, z1 - 0.06, 0xe8e8e0);
  B.box('solid', x1 - x0 - 1.2, 0.07, 0.05, (x0 + x1) / 2 + 0.6, top + 0.86, z1 - 0.06, 0x3d6b52);
  B.box('solid', x1 - x0 - 1.2, 0.05, 0.05, (x0 + x1) / 2 + 0.6, top + 0.45, z1 - 0.06, 0x3d6b52);

  // little ticket office
  solids.push({ x: 17.4, z: (z0 + z1) / 2 + 0.05, w: 2.3, d: 1.9, ry: 0 });
  B.at(17.4, top, (z0 + z1) / 2 + 0.05, 0, () => {
    B.block('solid', 2.0, 1.8, 1.6, 0, 0, 0, 0xf0ead8);
    B.geo('solid', hipGeometry(2.5, 2.1, 0.7), 0, 1.8, 0, 0x2f5fa8);
    B.box('glow', 0.9, 0.5, 0.04, -0.2, 1.1, 0.81, PALETTE.glass, { lit: 1, emit: 0xfff0c8 });
    B.box('solid', 0.5, 0.9, 0.04, 0.6, 0.45, 0.81, 0x5a6a78);
  });

  // hanging station sign
  const sign = makeSign({
    lines: [['海見町駅', 1.15], ['UMIMI-CHŌ STATION', 0.55]],
    width: 2.6,
    height: 0.62,
    bg: '#f6f6f0',
    fg: '#1c3d7a',
    border: '#2f5fa8',
    lit: true,
    pxPerUnit: 96,
  });
  sign.position.set(12.1, top + 1.88, z1 + 0.28);
  group.add(sign);
  B.box('solid', 0.03, 0.2, 0.03, 11.2, top + 2.15, z1 + 0.28, 0x444444);
  B.box('solid', 0.03, 0.2, 0.03, 13.0, top + 2.15, z1 + 0.28, 0x444444);

  // station name board on posts
  const board = makeSign({
    lines: [['うみみちょう', 0.9], ['海見町', 1.2], ['← はまべ    やまて →', 0.5]],
    width: 1.8,
    height: 0.8,
    bg: '#ffffff',
    fg: '#1a1a1a',
    border: '#2f7a4a',
    pxPerUnit: 96,
  });
  board.position.set(7.2, top + 1.25, z1 - 0.25);
  group.add(board);
  for (const px of [6.45, 7.95]) B.block('solid', 0.06, 1.3, 0.06, px, top, z1 - 0.3, 0x4a4a4a);
}

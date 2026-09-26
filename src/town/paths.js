import * as THREE from 'three';
import { fbm } from './rng.js';
import { heightAt } from './terrain.js';

// Wandering footpaths: a smooth curve through waypoints, nudged sideways by
// noise so it meanders, draped on the terrain. Styles: dirt, gravel, stone
// (flagstones) and steps (stepping stones).

const STYLES = {
  dirt: { color: 0xb49a6c, width: 0.7 },
  gravel: { color: 0xcfc6ad, width: 0.9 },
  stone: { color: 0xa9a79c, width: 0.9 },
  steps: { color: 0xa8a89c, width: 0.5 },
};

export function footpath(B, waypoints, { style = 'dirt', width, wander = 0.6, lift = 0.04, ground = heightAt } = {}) {
  const st = STYLES[style];
  const w = width ?? st.width;
  const curve = new THREE.CatmullRomCurve3(waypoints.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const len = curve.getLength();
  const n = Math.max(2, Math.ceil(len / 0.5));
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    const u = i / n;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const nx = -t.z;
    const nz = t.x;
    // meander, pinned at both ends
    const pin = Math.sin(u * Math.PI);
    const off = (fbm(p.x * 0.15 + 3, p.z * 0.15, 2) - 0.5) * 2 * wander * pin;
    pts.push({ x: p.x + nx * off, z: p.z + nz * off, nx, nz });
  }
  if (style === 'steps' || style === 'stone') {
    const spacing = style === 'steps' ? 0.62 : 0.55;
    const every = Math.max(1, Math.round(spacing / (len / n)));
    for (let i = 0; i < pts.length; i += every) {
      const p = pts[i];
      const s = style === 'steps' ? 0.34 + ((i * 7) % 5) * 0.03 : w;
      const d = style === 'steps' ? s * 0.8 : 0.46;
      B.box('solid', s, 0.06, d, p.x, ground(p.x, p.z) + lift, p.z, style === 'steps' ? 0xa8a89c : (i % 3 ? 0xa9a79c : 0x9a988e), {
        ry: Math.atan2(-p.nx, p.nz) + (style === 'steps' ? (i % 3) * 0.3 : 0), jitter: 0.08,
      });
    }
    return pts;
  }
  const verts = [];
  const side = (p, k) => [p.x + p.nx * k * w * 0.5, ground(p.x + p.nx * k * w * 0.5, p.z + p.nz * k * w * 0.5) + lift, p.z + p.nz * k * w * 0.5];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a1 = side(pts[i], -1);
    const a2 = side(pts[i], 1);
    const b1 = side(pts[i + 1], -1);
    const b2 = side(pts[i + 1], 1);
    verts.push(...a1, ...b2, ...a2, ...a1, ...b1, ...b2);
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
  B.add('solid', g, new THREE.Matrix4(), st.color, { jitter: 0.06 });
  return pts;
}

// Short path from a door to the nearest point on a polyline (a road).
export function pathToRoad(B, from, road, opts = {}) {
  let best = null;
  for (let i = 0; i < road.length - 1; i += 1) {
    const [ax, az] = road[i];
    const [bx, bz] = road[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((from[0] - ax) * dx + (from[1] - az) * dz) / (dx * dx + dz * dz)));
    const p = [ax + dx * t, az + dz * t];
    const d = Math.hypot(p[0] - from[0], p[1] - from[1]);
    if (!best || d < best.d) best = { p, d };
  }
  if (!best || best.d < 1.2 || best.d > (opts.maxLength ?? 30)) return null;
  // stop just short of the road edge
  const k = (best.d - (opts.roadHalf ?? 1.6)) / best.d;
  const end = [from[0] + (best.p[0] - from[0]) * k, from[1] + (best.p[1] - from[1]) * k];
  const mid = [(from[0] + end[0]) / 2 + (from[1] - end[1]) * 0.15, (from[1] + end[1]) / 2 - (from[0] - end[0]) * 0.15];
  return footpath(B, [from, mid, end], opts);
}

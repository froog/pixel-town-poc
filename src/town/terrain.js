import * as THREE from 'three';
import { fbm, lerp, smoothstep } from './rng.js';
import { shared } from './materials.js';

// World layout (camera looks toward -Z, like the source panorama):
//   town        x -30..30   flat town, shrine terrace, station, harbour (sea to -Z)
//   Yamate      x 62..185   farming valley east of the ridge
//   mountains   z 60..180   high country north of Yamate with the onsen basin
//   lake        x -17..20, z 90..150  lowland lake south of town
//   ring        mountains on every land edge; the bay is closed by headlands
// One railway loops through all of them (see RAIL below).

export const SEA = -3.2;
export const TRACK_Z = -7;
export const EXTENT = { x0: -70, x1: 204, z0: -48, z1: 60 }; // detailed, 1-unit grid
export const WORLD = { x0: -124, x1: 244, z0: -60, z1: 224 }; // everything, 2-unit grid outside EXTENT
export const BASIN = { x: 128, z: 104, r: 26, y: 18 };
export const LAKE = { x: 2, z: 124, r: 25, y: -0.45 };

// East of the town, road B runs through a tunnel in the ridge and comes out
// in Yamate, a farming valley sitting VALLEY units above sea level.
export const VALLEY = 3.2;
export const ROAD_TUNNEL = { x0: 38, x1: 62 };
export const RURAL_Y = VALLEY + 0.02;
export const RAIL_V = VALLEY + 0.02;
export const RURAL_ROAD = [[62, -1.9], [96, -1.9], [112, 4], [122, 14], [128, 22], [140, 30], [178, 32]];
// switchback road from the valley up to the onsen basin
export const MOUNTAIN_ROAD = [[124, 17], [114, 30], [100, 40], [112, 54], [96, 66], [110, 78], [116, 92], [124, 104]];

export function riverZ(x) {
  return 14 + 7 * Math.sin((x - 64) / 16) + 2 * Math.sin(x / 7.3);
}

// ---------------------------------------------------------------- polylines

// Closest point on a polyline: distance and arc length along it.
export function closestOnPolyline(x, z, pts) {
  let best = { d: Infinity, s: 0 };
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (len * len)));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best.d) best = { d, s: acc + t * len };
    acc += len;
  }
  return best;
}

export function distToPolyline(x, z, pts) {
  return closestOnPolyline(x, z, pts).d;
}

function polylineLength(pts) {
  let len = 0;
  for (let i = 0; i < pts.length - 1; i += 1) len += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return len;
}
export const MOUNTAIN_ROAD_LENGTH = polylineLength(MOUNTAIN_ROAD);
// The last stretch runs level into the basin.
export function mountainRoadY(s) {
  const climb = MOUNTAIN_ROAD_LENGTH - 10;
  return RURAL_Y + (BASIN.y + 0.02 - RURAL_Y) * smoothstep(0, climb, s) ** 0.9;
}

// ---------------------------------------------------------------- railway loop
// Control points [x, z, railTopY]. The loop runs east from Umimi-chō through
// the ridge to Yamate, crosses the river and the valley road, climbs to the
// onsen basin, tunnels west under the mountains, drops to the lake and comes
// back to town through the west hills. Tunnels, bridges and cuttings are
// decided from the terrain (see analyseRail).
const RAIL_CTRL = [
  [12.1, -7, 0], [20, -7, 0], [28, -7, 0], [45, -7, 1.6], [62, -7, RAIL_V], [76, -7, RAIL_V], [90.5, -7, RAIL_V],
  [104, -7, RAIL_V], [118, -7.2, RAIL_V], [130, -4, RAIL_V], [137, 4, RAIL_V], [138.4, 16, RAIL_V], [138.6, 29, RAIL_V],
  [140, 42, 4.6], [150, 58, 7], [166, 74, 9.6], [178, 90, 12.2], [176, 106, 14.8], [163, 115, 17.2], [150, 115.5, 18.2],
  [138, 115.5, 18.2], [124, 117, 17.8], [104, 122, 15.4], [82, 123, 12.2], [60, 119, 8.4], [42, 111, 4.6], [28, 104, 1.8],
  [16, 100.5, 1.0], [4, 95.5, 1.0], [-10, 86, 1.0], [-28, 70, 0.8], [-44, 50, 0.5], [-54, 26, 0.3], [-54, 6, 0.1],
  [-46, -5, 0], [-34, -7, 0], [-23, -7, 0], [-10, -7, 0], [0, -7, 0],
];
export const RAIL_COVER = 4.4;
export const RAIL_STATIONS = [
  { id: 'umimi', name: '海見町', x: 12.1, z: -7, side: 1 },
  { id: 'yamate', name: '山手', x: 90.5, z: -7, side: 1 },
  { id: 'onsen', name: '山の湯温泉', x: 144, z: 115.5, side: -1 },
  { id: 'lake', name: '湖畔', x: 10, z: 98, side: -1 },
];

class Rail {
  constructor(ctrl) {
    const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
    // fine samples by curve parameter, then resample evenly by arc length
    const n = ctrl.length;
    const fine = [];
    const per = 40;
    for (let i = 0; i < n; i += 1) {
      for (let k = 0; k < per; k += 1) {
        const u = k / per;
        const p = curve.getPoint((i + u) / n);
        const y = lerp(ctrl[i][2], ctrl[(i + 1) % n][2], u);
        fine.push([p.x, p.z, y]);
      }
    }
    fine.push(fine[0]);
    const cum = [0];
    for (let i = 1; i < fine.length; i += 1) cum.push(cum[i - 1] + Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1]));
    this.length = cum[cum.length - 1];
    this.step = 0.5;
    const count = Math.round(this.length / this.step);
    this.step = this.length / count;
    this.x = new Float32Array(count);
    this.z = new Float32Array(count);
    this.y = new Float32Array(count);
    let j = 0;
    for (let i = 0; i < count; i += 1) {
      const s = i * this.step;
      while (j < cum.length - 2 && cum[j + 1] < s) j += 1;
      const t = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
      this.x[i] = lerp(fine[j][0], fine[j + 1][0], t);
      this.z[i] = lerp(fine[j][1], fine[j + 1][1], t);
      this.y[i] = lerp(fine[j][2], fine[j + 1][2], t);
    }
    // smooth the grade (keeps level stretches level)
    const ys = Float32Array.from(this.y);
    for (let i = 0; i < count; i += 1) {
      let sum = 0;
      for (let k = -8; k <= 8; k += 1) sum += ys[(i + k + count) % count];
      this.y[i] = sum / 17;
    }
    this.count = count;
    // spatial hash of segments for fast closest-point queries
    this.cell = 8;
    this.grid = new Map();
    for (let i = 0; i < count; i += 1) {
      const i2 = (i + 1) % count;
      const x0 = Math.min(this.x[i], this.x[i2]) - 24;
      const x1 = Math.max(this.x[i], this.x[i2]) + 24;
      const z0 = Math.min(this.z[i], this.z[i2]) - 24;
      const z1 = Math.max(this.z[i], this.z[i2]) + 24;
      for (let gx = Math.floor(x0 / this.cell); gx <= Math.floor(x1 / this.cell); gx += 1) {
        for (let gz = Math.floor(z0 / this.cell); gz <= Math.floor(z1 / this.cell); gz += 1) {
          const key = gx * 100003 + gz;
          if (!this.grid.has(key)) this.grid.set(key, []);
          this.grid.get(key).push(i);
        }
      }
    }
  }

  wrap(s) {
    return ((s % this.length) + this.length) % this.length;
  }

  // position, tangent and height at arc length s
  at(s) {
    s = this.wrap(s);
    const f = s / this.step;
    const i = Math.floor(f) % this.count;
    const i2 = (i + 1) % this.count;
    const t = f - Math.floor(f);
    const dx = this.x[i2] - this.x[i];
    const dz = this.z[i2] - this.z[i];
    const len = Math.hypot(dx, dz) || 1;
    return {
      x: lerp(this.x[i], this.x[i2], t),
      z: lerp(this.z[i], this.z[i2], t),
      y: lerp(this.y[i], this.y[i2], t),
      tx: dx / len,
      tz: dz / len,
      grade: (this.y[i2] - this.y[i]) / len,
    };
  }

  // closest point within 24 units: { d, s } or null
  closest(x, z) {
    const list = this.grid.get(Math.floor(x / this.cell) * 100003 + Math.floor(z / this.cell));
    if (!list) return null;
    let best = null;
    for (const i of list) {
      const i2 = (i + 1) % this.count;
      const ax = this.x[i];
      const az = this.z[i];
      const dx = this.x[i2] - ax;
      const dz = this.z[i2] - az;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (!best || d < best.d) best = { d, s: (i + t) * this.step };
    }
    return best && best.d < 24 ? best : null;
  }

  // arc length of the point closest to (x, z)
  sOf(x, z) {
    let best = { d: Infinity, s: 0 };
    for (let i = 0; i < this.count; i += 1) {
      const d = Math.hypot(this.x[i] - x, this.z[i] - z);
      if (d < best.d) best = { d, s: i * this.step };
    }
    return best.s;
  }
}

export const RAIL = new Rail(RAIL_CTRL);
for (const st of RAIL_STATIONS) st.s = RAIL.sOf(st.x, st.z);

// Tunnel / bridge / cutting sections along the loop, from the terrain the
// railway would otherwise have to cross.
let railSections = null;
export function railSections_() {
  if (railSections) return railSections;
  const n = RAIL.count;
  const type = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const depth = baseHeight(RAIL.x[i], RAIL.z[i]) - RAIL.y[i];
    type[i] = depth > 4.2 ? 'tunnel' : depth < -1.0 ? 'bridge' : 'cut';
  }
  // stations and level crossings stay in the open
  const keepOpen = [...RAIL_STATIONS.map((st) => st.s), ...railCrossings().map((c) => c.s)];
  for (const s0 of keepOpen) {
    for (let k = -26; k <= 26; k += 1) type[(Math.round(s0 / RAIL.step) + k + n) % n] = 'cut';
  }
  // tidy: fill short gaps inside tunnels, drop very short tunnels/bridges
  const runs = () => {
    const out = [];
    let i0 = 0;
    for (let i = 1; i <= n; i += 1) {
      if (i === n || type[i] !== type[i0]) {
        out.push({ type: type[i0], i0, i1: i - 1 });
        i0 = i;
      }
    }
    return out;
  };
  for (const r of runs()) {
    const len = r.i1 - r.i0 + 1;
    if (r.type === 'cut' && len < 10) {
      const before = type[(r.i0 - 1 + n) % n];
      const after = type[(r.i1 + 1) % n];
      if (before === 'tunnel' && after === 'tunnel') for (let i = r.i0; i <= r.i1; i += 1) type[i] = 'tunnel';
    }
  }
  for (const r of runs()) {
    const len = r.i1 - r.i0 + 1;
    if ((r.type === 'tunnel' && len < 14) || (r.type === 'bridge' && len < 5)) for (let i = r.i0; i <= r.i1; i += 1) type[i] = 'cut';
  }
  railSections = runs().map((r) => ({ type: r.type, s0: r.i0 * RAIL.step, s1: (r.i1 + 1) * RAIL.step }));
  railSections.typeAt = (s) => type[Math.floor(RAIL.wrap(s) / RAIL.step) % n];
  return railSections;
}

// where roads cross the railway at grade
let crossings = null;
export function railCrossings() {
  if (crossings) return crossings;
  crossings = [
    { id: 'town', x: 0, z: TRACK_Z },
    { id: 'yamate', x: 138.6, z: 29 },
  ].map((c) => ({ ...c, s: RAIL.sOf(c.x, c.z) }));
  return crossings;
}

// portals: ends of tunnel sections, with the direction into the hill
let portals = null;
export function railPortals() {
  if (portals) return portals;
  portals = [];
  for (const sec of railSections_()) {
    if (sec.type !== 'tunnel') continue;
    for (const [s, dir] of [[sec.s0, 1], [sec.s1, -1]]) {
      const p = RAIL.at(s);
      portals.push({ s, x: p.x, z: p.z, y: p.y, tx: p.tx * dir, tz: p.tz * dir, sec });
    }
  }
  return portals;
}

// ---------------------------------------------------------------- terrain

export function rawHeight(x0, z0) {
  // Region boundaries are domain-warped so valleys and ridges meander; the
  // town centre (|x|, |z| < ~40) stays exactly as laid out.
  // no warp around the ridge tunnels either: rail and road portals must line up
  const tunnelZone = (1 - smoothstep(72, 86, x0)) * (1 - smoothstep(12, 22, Math.abs(z0 + 3)));
  const warpAmt = 11 * smoothstep(40, 75, Math.hypot(x0, z0 * 1.3)) * (1 - tunnelZone);
  const x = x0 + (fbm(x0 * 0.018 + 31, z0 * 0.018, 3) - 0.5) * 2 * warpAmt;
  const z = z0 + (fbm(x0 * 0.018, z0 * 0.018 + 57, 3) - 0.5) * 2 * warpAmt;
  const town = 1 - smoothstep(44, 60, x);
  const valley = smoothstep(52, 66, x);
  const hillNoise = fbm(x * 0.05, z * 0.05 + 40, 4);
  let h = 0;
  const slope = smoothstep(-8.6, -31, z) * town;
  h -= slope * 4.3;
  // gentle undulation on the slope and hills
  h += (fbm(x * 0.07 + 11, z * 0.07 - 3, 3) - 0.5) * 1.4 * slope;
  const left = smoothstep(-17, -34, x);
  const ridge = smoothstep(20, 37, x) * (1 - smoothstep(55, 66, x));
  h += left * (9 + hillNoise * 7) * smoothstep(-44, -24, z);
  h += ridge * (9 + hillNoise * 8) * smoothstep(-44, -22, z);
  // a knoll behind the shrine
  h += 3.6 * Math.exp(-(((x + 23) / 6) ** 2) - (((z + 1) / 7) ** 2));
  // seabed drops away
  h -= smoothstep(-30, -44, z) * 5 * town;
  // rolling fields south of town toward the lake
  h += (fbm(x * 0.04 + 7, z * 0.04 + 2, 3) - 0.5) * 1.6 * smoothstep(40, 64, z) * town * (1 - left);
  // Yamate valley: a broad floor with wooded walls
  h += valley * (VALLEY + (fbm(x * 0.035 + 5, z * 0.035, 3) - 0.5) * 0.9);
  h += valley * smoothstep(-20, -40, z) * (10 + hillNoise * 9);
  h += valley * smoothstep(38, 56, z) * (10 + hillNoise * 8);
  h += smoothstep(182, 200, x) * (12 + hillNoise * 8);
  // high country north of the valley, with the onsen basin
  const mz = smoothstep(50, 86, z) * valley;
  if (mz > 0) {
    const ridged = 1 - Math.abs(fbm(x * 0.017 + 3, z * 0.017 - 7, 4) * 2 - 1);
    h += mz * (4 + ridged * ridged * 30);
    const bd = Math.hypot(x0 - BASIN.x, z0 - BASIN.z);
    const b = 1 - smoothstep(BASIN.r * 0.5, BASIN.r, bd);
    if (b > 0) h = lerp(h, BASIN.y + (fbm(x0 * 0.09, z0 * 0.09, 2) - 0.5) * 1.4, b);
  }
  // the lake, with a wobbly shoreline
  const ld = lakeDistance(x0, z0);
  const lake = 1 - smoothstep(LAKE.r - 5, LAKE.r + 1, ld);
  if (lake > 0) h = lerp(h, LAKE.y - 1.6, lake);
  // mountain ring closing the world
  h += smoothstep(-74, -104, x) * (18 + hillNoise * 16);
  h += smoothstep(150, 190, z) * (16 + hillNoise * 18) * (1 - lake);
  h += smoothstep(206, 232, x) * (20 + hillNoise * 16);
  return h;
}

// distance from the lake centre, with a wobbly shoreline (< LAKE.r is water)
export function lakeDistance(x, z) {
  return Math.hypot(x - LAKE.x, (z - LAKE.z) * 1.15) + (fbm(x * 0.08, z * 0.08, 2) - 0.5) * 7;
}

export const ROAD_COVER = RURAL_Y + 5.4;

// Road tunnel portals (the road tunnel is straight along X).
const ROAD_PORTALS = [
  { x: ROAD_TUNNEL.x0, dir: 1, zc: -1.9, half: 4.2, cover: () => ROAD_COVER },
  { x: ROAD_TUNNEL.x1, dir: -1, zc: -1.9, half: 4.2, cover: () => ROAD_COVER },
];

// Everything except the railway: roads, river, quay, road tunnel cover.
export function baseHeight(x, z) {
  let h = rawHeight(x, z);
  // keep the road to the harbour on a clean line
  const road = 1 - smoothstep(2.2, 4.2, Math.abs(x));
  if (z < -7 && z > -31) h = lerp(h, roadHeight(z) - 0.14, road);
  // road A continues south to the lake
  if (z > 30 && z < 84) h = lerp(h, 0.03 - 0.14, road);
  // road B climbs gently east ("yuunagi-zaka") up to the road tunnel
  if (x > 2 && x <= ROAD_TUNNEL.x0) {
    const deep = Math.max(0, x - 24);
    const band = 1 - smoothstep(1.9, 3.6 + Math.min(deep * 0.45, 4.5), Math.abs(z - ROAD_B_Z));
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
  // harbour quay
  if (z < -16) {
    const q = (1 - smoothstep(8, 10.5, Math.abs(x))) * smoothstep(-31.4, -30.6, z);
    h = lerp(h, Math.max(h, QUAY), q);
  }
  // the switchback road climbs a gorge it has carved for itself
  if (z > 10 && x > 80 && x < 140) {
    const { d, s: along } = closestOnPolyline(x, z, MOUNTAIN_ROAD);
    if (d < 22) {
      const ry = mountainRoadY(along);
      const limit = ry + 1.2 + Math.max(0, d - 2.2) * 0.85 + Math.max(0, d - 7) ** 2 * 0.45;
      h = lerp(h, Math.min(h, limit), 1 - smoothstep(14, 22, d));
      const band = 1 - smoothstep(1.9, 3.4, d);
      if (band > 0) h = lerp(h, ry - 0.14, band);
    }
  }
  // road tunnel: hill ramps up behind each portal and covers the tube
  for (const p of ROAD_PORTALS) {
    const d = (x - p.x) * p.dir;
    if (d < 1 || d > 14) continue;
    const w = 1 - smoothstep(p.half, p.half + 6, Math.abs(z - p.zc));
    if (w <= 0) continue;
    const cover = p.cover(x);
    h = lerp(h, Math.min(Math.max(h, cover), cover + (d - 1) * 1.15), w);
  }
  if (Math.abs(z - ROAD_B_Z) < 4.2 && x >= ROAD_TUNNEL.x0 + 1 && x <= ROAD_TUNNEL.x1 - 1) h = Math.max(h, ROAD_COVER);
  return h;
}

// Final terrain: the railway cuts, fills or tunnels through the base terrain.
export function heightAt(x, z) {
  let h = baseHeight(x, z);
  const q = RAIL.closest(x, z);
  if (!q) return h;
  const secs = railSections_();
  const type = secs.typeAt(q.s);
  const ry = RAIL.at(q.s).y;
  if (type === 'tunnel') {
    const sec = secs.find((sc) => q.s >= sc.s0 && q.s < sc.s1) ?? { s0: q.s, s1: q.s };
    const dp = Math.min(q.s - sec.s0, sec.s1 - q.s);
    const cover = ry + RAIL_COVER;
    const w = 1 - smoothstep(3.2, 9, q.d);
    // level for 3 units behind the portal (under the lid), then ramp up
    h = lerp(h, Math.min(Math.max(h, cover), cover + Math.max(0, dp - 3) * 1.15), w);
    if (q.d < 3.2) h = Math.max(h, cover);
  } else if (type === 'cut') {
    const depth = Math.abs(h - ry);
    const band = 1 - smoothstep(1.5, 3.2 + Math.min(depth * 0.5, 4), q.d);
    h = lerp(h, ry - 0.1, band);
  }
  // roads keep their own band even where a rail tunnel's cover spreads over it
  if (x > 2 && x <= ROAD_TUNNEL.x0 + 0.5) {
    h = lerp(h, roadBHeight(x) - 0.14, 1 - smoothstep(1.9, 3.6, Math.abs(z - ROAD_B_Z)));
  } else if (x >= ROAD_TUNNEL.x1 - 0.5 && x < 90) {
    h = lerp(h, RURAL_Y - 0.14, 1 - smoothstep(1.9, 3.6, distToPolyline(x, z, RURAL_ROAD)));
  }
  return h;
}

// Terrain cells to leave out: right behind each portal the ground would have
// to be vertical, so a lid covers the hole instead.
export function isTerrainHole(cx, cz, step) {
  // road tunnel (axis aligned)
  if (Math.abs(cz - ROAD_B_Z) < 3) {
    if (cx > ROAD_TUNNEL.x0 && cx < ROAD_TUNNEL.x0 + 1) return true;
    if (cx > ROAD_TUNNEL.x1 - 1 && cx < ROAD_TUNNEL.x1) return true;
  }
  for (const p of railPortals()) {
    const dx = cx - p.x;
    const dz = cz - p.z;
    const u = dx * p.tx + dz * p.tz;
    const v = -dx * p.tz + dz * p.tx;
    if (u > 0 && u < step + 0.6 && Math.abs(v) < 2.6) return true;
  }
  return false;
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

// Terrain mesh over `extent` at `step` spacing; `skip` is an inner extent that
// another mesh already covers.
export function buildTerrain(extent = EXTENT, step = 1, skip = null) {
  const { x0, x1, z0, z1 } = extent;
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
    const rural = cx > ROAD_TUNNEL.x1 || cz > 60;
    if (cy < SEA + 0.35) c.set(SAND);
    else if (cy > 54 + n * 8) c.set(steep > 1.3 ? 0xc8ccd6 : 0xf2f4f8); // summer snow on the highest peaks
    else if (cy > 36 + n * 6) c.set(steep > 1.0 ? 0x8a8a84 : n > 0.5 ? 0x8a9a58 : 0x7a8a50); // alpine meadow + scree
    else if (steep > 1.45) c.set(ROCK);
    else if (cx > ROAD_TUNNEL.x1 && cy < VALLEY - 0.6 && cz < 40) c.set(n > 0.5 ? 0xa8a290 : 0x948e7c);
    else if (cz > 60 && cx < 60 && lakeDistance(cx, cz) < LAKE.r + 2.5) c.set(n > 0.5 ? 0xd8cca0 : 0xc8bc90); // lake shore
    else if (rural ? steep > 0.5 || cy > (cx > 58 ? VALLEY + 2 : 2.5) : cy > 1.2 || Math.abs(cx) > 22) c.set(HILL[Math.floor(n * 3.99)]);
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
      if (skip && cxm > skip.x0 && cxm < skip.x1 && czm > skip.z0 && czm < skip.z1) continue;
      if (isTerrainHole(cxm, czm, step)) continue;
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

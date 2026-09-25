import * as THREE from 'three';
import { Batcher, gableGeometry } from './batcher.js';
import { ROAD_TUNNEL, roadBHeight, roadHeight, RURAL_ROAD, RURAL_Y, SEA, TRACK_Z } from './terrain.js';
import { STATION_STOP_X, PLATEAU, STAIRS } from './layout.js';
import { makeRng } from './rng.js';
import { shared, toonRamp } from './materials.js';

const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: toonRamp });

// ---------------------------------------------------------------- tram

function buildTramCar(B, lead) {
  const L = 4.3;
  const W = 1.34;
  B.box('solid', L, 0.7, W, 0, 0.7, 0, 0x3f7d4a);
  B.box('solid', L, 0.78, W, 0, 1.44, 0, 0xeee3c2);
  B.box('solid', L + 0.01, 0.07, W + 0.01, 0, 1.06, 0, 0xc8402e);
  B.box('solid', L - 0.1, 0.14, W - 0.06, 0, 1.9, 0, 0xa8aca8);
  B.box('solid', L - 0.6, 0.08, W - 0.4, 0, 2.0, 0, 0x8a8e8c);
  for (const sz of [-1, 1]) {
    for (let i = 0; i < 6; i += 1) {
      if (i === 1 || i === 4) {
        // doorway interior; the sliding leaves are separate meshes
        B.box('glow', 0.48, 1.08, 0.012, -L / 2 + 0.4 + i * 0.7, 0.95, sz * (W / 2 + 0.004), 0x8a7a5c, { lit: 1, emit: 0xfff0c8 });
        B.box('glow', 0.3, 0.5, 0.013, -L / 2 + 0.4 + i * 0.7, 1.2, sz * (W / 2 + 0.005), 0xe8dcc0, { lit: 1, emit: 0xfff6dc });
        continue;
      }
      B.box('glow', 0.52, 0.42, 0.03, -L / 2 + 0.4 + i * 0.7, 1.4, sz * (W / 2 + 0.01), 0x4a6a80, { lit: 1, emit: 0xfff2cc });
    }
  }
  for (const sx of [-1, 1]) {
    B.box('glow', 0.03, 0.46, 1.0, sx * (L / 2 + 0.01), 1.42, 0, 0x3a5a70, { lit: 1, emit: 0xfff2cc });
    B.box('glow', 0.04, 0.1, 0.16, sx * (L / 2 + 0.02), 0.72, 0.42, 0xf6f2d8, { lit: 1, emit: 0xffffe0 });
    B.box('glow', 0.04, 0.1, 0.16, sx * (L / 2 + 0.02), 0.72, -0.42, 0xf6f2d8, { lit: 1, emit: 0xffffe0 });
    B.box('solid', 0.8, 0.28, 1.1, sx * 1.35, 0.24, 0, 0x2a2a2a);
    for (const sz of [-0.5, 0.5]) for (const wx of [-0.25, 0.25]) {
      B.box('solid', 0.28, 0.28, 0.06, sx * 1.35 + wx, 0.2, sz, 0x3a3a3a);
    }
  }
  // route board
  B.box('glow', 0.03, 0.14, 0.6, (lead ? 1 : -1) * (L / 2 + 0.02), 1.78, 0, 0x222222, { lit: 1, emit: 0xffa040 });
  if (lead) {
    // pantograph
    B.box('solid', 0.5, 0.04, 0.04, 0.3, 2.3, 0, 0x333333, { rz: 0.9 });
    B.box('solid', 0.5, 0.04, 0.04, 0.3, 2.3, 0, 0x333333, { rz: -0.9 });
    B.box('solid', 0.06, 0.04, 0.9, 0.3, 2.5, 0, 0x333333);
  }
}

// Returns { x, speed } for the tram at time t (seconds). It arrives from
// one tunnel, dwells at the station, leaves through the other, then comes
// back the other way.
const TRAM_PERIOD = 76;
const FAR_L = -46;
const FAR_R = 50;
function tramX(t) {
  const u = ((t % TRAM_PERIOD) + TRAM_PERIOD) % TRAM_PERIOD;
  const S = STATION_STOP_X;
  const seg = (a, b, k, ease) => a + (b - a) * ease(Math.min(1, Math.max(0, k)));
  const out = (k) => 1 - (1 - k) * (1 - k);
  const inn = (k) => k * k;
  if (u < 13) return seg(FAR_L, S, u / 13, out);
  if (u < 21) return S;
  if (u < 32) return seg(S, FAR_R, (u - 21) / 11, inn);
  if (u < 38) return FAR_R;
  if (u < 51) return seg(FAR_R, S, (u - 38) / 13, out);
  if (u < 59) return S;
  if (u < 70) return seg(S, FAR_L, (u - 59) / 11, inn);
  return FAR_L;
}

// 0 = closed, 1 = open; doors open a moment after the tram stops.
function tramDoors(t) {
  const u = ((t % TRAM_PERIOD) + TRAM_PERIOD) % TRAM_PERIOD;
  for (const start of [13, 51]) {
    const k = u - start;
    if (k < 0 || k > 8) continue;
    return THREE.MathUtils.smoothstep(k, 0.9, 1.7) * (1 - THREE.MathUtils.smoothstep(k, 6.2, 7.0));
  }
  return 0;
}

function doorLeaves(car) {
  const green = toon(0x2f6a3e);
  const glass = new THREE.MeshBasicMaterial({ color: 0x4a6a80 });
  const leaves = [];
  for (const sz of [-1, 1]) {
    for (const dx of [-1.05, 1.05]) {
      for (const side of [-1, 1]) {
        const leaf = new THREE.Group();
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.1, 0.03), green);
        leaf.add(panel);
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.38, 0.035), glass);
        win.position.y = 0.2;
        leaf.add(win);
        const baseX = dx + side * 0.125;
        leaf.position.set(baseX, 0.95, sz * (0.67 + 0.012));
        car.add(leaf);
        leaves.push({ leaf, baseX, side, sz });
      }
    }
  }
  return { leaves, glass };
}

export function createTram(scene) {
  const group = new THREE.Group();
  group.name = 'tram';
  const cars = [];
  for (let i = 0; i < 2; i += 1) {
    const car = new THREE.Group();
    const B = new Batcher();
    buildTramCar(B, i === 0);
    B.build(car);
    car.userData.doors = doorLeaves(car);
    car.position.y = 0.2;
    group.add(car);
    cars.push(car);
  }
  group.position.z = TRACK_Z;
  scene.add(group);

  const state = { x: FAR_L, v: 0, dir: 1, crossing: false, atStation: false };
  let prevX = tramX(0);
  let t0 = 8;
  state.update = (t, dt) => {
    const x = tramX(t + t0);
    state.v = dt > 0 ? (x - prevX) / dt : 0;
    if (Math.abs(state.v) > 0.05) state.dir = Math.sign(state.v);
    prevX = x;
    state.x = x;
    cars[0].position.x = x + state.dir * 2.25;
    cars[1].position.x = x - state.dir * 2.25;
    cars[0].rotation.y = state.dir > 0 ? 0 : Math.PI;
    cars[1].rotation.y = state.dir > 0 ? Math.PI : 0;
    const d = Math.max(0, Math.abs(x) - 4.6);
    const approaching = Math.sign(-x) === state.dir && Math.abs(state.v) > 0.1;
    state.crossing = d < 0.4 || (approaching && d < 14);
    state.atStation = Math.abs(x - STATION_STOP_X) < 0.01;
    // doors open on the platform side (+Z in world space)
    const open = tramDoors(t + t0);
    state.doorsOpen = open;
    for (const car of cars) {
      const platformSide = Math.cos(car.rotation.y) > 0 ? 1 : -1;
      for (const d of car.userData.doors.leaves) {
        const k = d.sz === platformSide ? open : 0;
        d.leaf.position.x = d.baseX + d.side * k * 0.23;
      }
      car.userData.doors.glass.color.setHex(0x4a6a80).lerp(new THREE.Color(0xfff2cc), THREE.MathUtils.smoothstep(shared.uNight.value, 0.25, 0.7));
    }
    // small sway while moving
    group.rotation.x = Math.sin(t * 7) * 0.004 * Math.min(1, Math.abs(state.v) / 4);
  };
  state.skip = (seconds) => {
    t0 += seconds;
  };
  return state;
}

// ---------------------------------------------------------------- crossing

export function createCrossing(scene) {
  const group = new THREE.Group();
  group.name = 'crossing';
  const lamps = [];
  const arms = [];
  const post = toon(0x222222);
  const yellow = toon(0xf2d020);
  const black = toon(0x1a1a1a);
  const lampOff = new THREE.MeshBasicMaterial({ color: 0x4a1a1a });
  const lampOn = new THREE.MeshBasicMaterial({ color: 0xff3a2a });

  for (const [x, z, side] of [[-2.25, TRACK_Z + 1.7, 1], [2.25, TRACK_Z - 1.7, -1]]) {
    const unit = new THREE.Group();
    unit.position.set(x, 0, z);
    unit.rotation.y = side > 0 ? 0 : Math.PI;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.9, 8), post);
    pole.position.y = 1.45;
    unit.add(pole);
    for (let i = 0; i < 5; i += 1) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.18, 8), i % 2 ? black : yellow);
      band.position.y = 0.2 + i * 0.18;
      unit.add(band);
    }
    // crossbuck
    for (const r of [0.6, -0.6]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.03), yellow);
      bar.position.set(0, 2.72, 0.06);
      bar.rotation.z = r;
      unit.add(bar);
    }
    // lamps
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.06), black);
    bar.position.set(0, 2.25, 0.05);
    unit.add(bar);
    for (const lx of [-0.34, 0.34]) {
      const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 10), black);
      hood.rotation.x = Math.PI / 2;
      hood.position.set(lx, 2.25, 0.08);
      unit.add(hood);
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.1, 10), lampOff);
      lamp.position.set(lx, 2.25, 0.13);
      unit.add(lamp);
      lamps.push(lamp);
    }
    // barrier arm
    const pivot = new THREE.Group();
    pivot.position.set(0.12, 0.95, 0.12);
    const armLen = 3.1;
    for (let i = 0; i < 8; i += 1) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(armLen / 8, 0.07, 0.05), i % 2 ? black : yellow);
      seg.position.x = (i + 0.5) * (armLen / 8);
      pivot.add(seg);
    }
    const weight = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.12), black);
    weight.position.x = -0.18;
    pivot.add(weight);
    unit.add(pivot);
    arms.push(pivot);
    group.add(unit);
  }
  scene.add(group);

  let lower = 0;
  const light = new THREE.PointLight(0xff3a2a, 0, 6, 2);
  light.position.set(0, 2.4, TRACK_Z);
  group.add(light);
  return {
    get closed() {
      return lower > 0.5;
    },
    update(active, t, dt) {
      const target = active ? 1 : 0;
      lower += Math.sign(target - lower) * Math.min(Math.abs(target - lower), dt / 2.2);
      for (const arm of arms) arm.rotation.z = (1 - lower) * (Math.PI / 2 - 0.08);
      const blink = active && Math.floor(t * 2.4) % 2 === 0;
      lamps.forEach((lamp, i) => {
        const on = active && (i % 2 === 0 ? blink : !blink);
        lamp.material = on ? lampOn : lampOff;
      });
      light.intensity = active ? (blink ? 3 : 1.5) * (0.4 + shared.uNight.value) : 0;
    },
  };
}

// ---------------------------------------------------------------- cars

function carModel(kind, bodyColor) {
  const B = new Batcher();
  const glass = 0x3a5a70;
  if (kind === 'kei') {
    B.box('solid', 1.6, 0.42, 0.86, 0, 0.36, 0, bodyColor);
    B.box('solid', 1.1, 0.4, 0.8, -0.12, 0.76, 0, bodyColor);
    B.box('glow', 1.0, 0.28, 0.82, -0.12, 0.78, 0, glass, { lit: 0 });
    B.box('glow', 0.04, 0.3, 0.7, 0.43, 0.76, 0, glass, { lit: 0 });
  } else if (kind === 'van') {
    B.box('solid', 1.9, 0.5, 0.92, 0, 0.4, 0, bodyColor);
    B.box('solid', 1.6, 0.5, 0.9, -0.1, 0.88, 0, bodyColor);
    B.box('glow', 1.5, 0.3, 0.92, -0.1, 0.92, 0, glass, { lit: 0 });
    B.box('glow', 0.04, 0.34, 0.76, 0.71, 0.9, 0, glass, { lit: 0 });
  } else if (kind === 'bus') {
    // little community bus
    B.box('solid', 2.6, 0.5, 1.0, 0, 0.42, 0, 0x3f8a5a);
    B.box('solid', 2.6, 0.62, 1.0, 0, 0.98, 0, bodyColor);
    B.box('solid', 2.5, 0.08, 0.94, 0, 1.33, 0, 0xd8d4c4);
    B.box('glow', 2.2, 0.34, 1.02, -0.1, 1.02, 0, glass, { lit: 1, emit: 0xfff2cc });
    B.box('glow', 0.04, 0.4, 0.86, 1.31, 0.98, 0, glass, { lit: 0 });
    B.box('glow', 0.04, 0.12, 0.6, 1.32, 1.24, 0, 0x222222, { lit: 1, emit: 0xffa040 });
  } else {
    // kei truck with a load
    B.box('solid', 0.62, 0.8, 0.86, 0.55, 0.55, 0, bodyColor);
    B.box('glow', 0.04, 0.3, 0.74, 0.87, 0.78, 0, glass, { lit: 0 });
    B.box('solid', 1.1, 0.12, 0.86, -0.3, 0.3, 0, 0xc8c8c0);
    B.box('solid', 1.1, 0.28, 0.04, -0.3, 0.48, 0.42, 0xc8c8c0);
    B.box('solid', 1.1, 0.28, 0.04, -0.3, 0.48, -0.42, 0xc8c8c0);
    B.box('solid', 0.5, 0.3, 0.4, -0.4, 0.5, 0.1, 0x8a6a3a);
    B.box('solid', 0.3, 0.2, 0.3, -0.05, 0.46, -0.15, 0xf2c830);
  }
  const front = kind === 'truck' ? 0.87 : kind === 'van' ? 0.95 : kind === 'bus' ? 1.3 : 0.8;
  for (const sz of [-0.3, 0.3]) {
    B.box('glow', 0.04, 0.09, 0.16, front + 0.01, 0.42, sz, 0xf6f2d8, { lit: 1, emit: 0xfffae0 });
    B.box('glow', 0.04, 0.09, 0.12, -front + (kind === 'truck' ? 0.02 : -0.01), 0.42, sz, 0xb83a2a, { lit: 1, emit: 0xff3020 });
  }
  for (const sx of kind === 'bus' ? [-0.85, 0.85] : [-0.52, 0.52]) for (const sz of [-0.42, 0.42]) {
    B.box('solid', 0.3, 0.3, 0.1, sx, 0.15, sz, 0x222222);
  }
  const g = new THREE.Group();
  const inner = new THREE.Group();
  B.build(inner);
  g.add(inner);
  return g;
}

class Path {
  constructor() {
    this.pts = [];
  }

  line(x0, z0, x1, z1, step = 1) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / step));
    for (let i = 0; i <= n; i += 1) this.pts.push([x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n]);
    return this;
  }

  points(list) {
    for (const p of list) this.pts.push([p[0], p[1]]);
    return this;
  }

  // semicircle around `c` from the left lane (c + left*r) to the other lane
  uturn(c, dir, left, r, n = 10) {
    for (let i = 1; i < n; i += 1) {
      const a = (i / n) * Math.PI;
      this.pts.push([c[0] + left[0] * r * Math.cos(a) + dir[0] * r * Math.sin(a), c[1] + left[1] * r * Math.cos(a) + dir[1] * r * Math.sin(a)]);
    }
    return this;
  }

  arc(cx, cz, r, a0, a1, n = 10) {
    for (let i = 0; i <= n; i += 1) {
      const a = a0 + ((a1 - a0) * i) / n;
      this.pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
    return this;
  }

  finish() {
    // drop duplicates, build cumulative lengths
    const p = this.pts.filter((q, i, a) => i === 0 || Math.hypot(q[0] - a[i - 1][0], q[1] - a[i - 1][1]) > 1e-4);
    this.pts = p;
    this.cum = [0];
    for (let i = 1; i <= p.length; i += 1) {
      const a = p[i - 1];
      const b = p[i % p.length];
      this.cum.push(this.cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    this.length = this.cum[this.cum.length - 1];
    return this;
  }

  sample(s) {
    s = ((s % this.length) + this.length) % this.length;
    let lo = 0;
    let hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    const a = this.pts[lo];
    const b = this.pts[(lo + 1) % this.pts.length];
    const seg = this.cum[lo + 1] - this.cum[lo] || 1;
    const t = (s - this.cum[lo]) / seg;
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / seg, dz: (b[1] - a[1]) / seg };
  }
}

// Densify a polyline and offset it to the driver's left.
function lane(points, offset) {
  const dense = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az)));
    for (let k = 0; k < n; k += 1) dense.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  dense.push(points[points.length - 1]);
  return dense.map((p, i) => {
    const a = dense[Math.max(0, i - 1)];
    const b = dense[Math.min(dense.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const dx = (b[0] - a[0]) / len;
    const dz = (b[1] - a[1]) / len;
    return [p[0] + dz * offset, p[1] - dx * offset];
  });
}

function roadY(x, z) {
  let y;
  if (Math.abs(x) <= 1.75) y = z > -8.4 ? 0.03 : roadHeight(z);
  else if (x <= ROAD_TUNNEL.x1) y = roadBHeight(x);
  else y = RURAL_Y;
  if (Math.abs(x) < 1.7 && Math.abs(z - TRACK_Z) < 1.3) y = 0.17;
  return y;
}

export function createTraffic(scene) {
  const A = new Path()
    .line(-0.75, 40, -0.75, -28.5)
    .arc(0, -28.5, 0.75, Math.PI, Math.PI * 2)
    .line(0.75, -28.5, 0.75, 40)
    .arc(0, 40, 0.75, 0, Math.PI)
    .finish();
  // road B -> Yamate tunnel -> rural road, driving on the left
  const centre = [[1.65, -1.9], [ROAD_TUNNEL.x1, -1.9], ...RURAL_ROAD.slice(1)];
  const eb = lane(centre, 0.75);
  const wb = lane([...centre].reverse(), 0.75);
  const end = centre[centre.length - 1];
  const prev = centre[centre.length - 2];
  const dl = Math.hypot(end[0] - prev[0], end[1] - prev[1]);
  const dir = [(end[0] - prev[0]) / dl, (end[1] - prev[1]) / dl];
  const left = [dir[1], -dir[0]];
  const Bp = new Path()
    .points(wb)
    .arc(1.5, -0.4, 0.75, -Math.PI / 2, -Math.PI, 6)
    .line(0.75, -0.4, 0.75, 40)
    .arc(0, 40, 0.75, 0, Math.PI)
    .line(-0.75, 40, -0.75, -28.5)
    .arc(0, -28.5, 0.75, Math.PI, Math.PI * 2)
    .line(0.75, -28.5, 0.75, -3.55)
    .arc(1.65, -3.55, 0.9, Math.PI, Math.PI / 2, 6)
    .points(eb)
    .uturn(end, dir, left, 0.75)
    .finish();

  const specs = [
    { path: A, s: 5, kind: 'kei', color: 0xf6f6f0, speed: 4.2 },
    { path: A, s: 60, kind: 'van', color: 0x6aa8d8, speed: 3.8 },
    { path: A, s: 110, kind: 'kei', color: 0xe85a4a, speed: 4.4 },
    { path: Bp, s: 20, kind: 'truck', color: 0xf2f2ea, speed: 3.4 },
    { path: Bp, s: 120, kind: 'kei', color: 0xf2c830, speed: 4.0 },
    { path: Bp, s: 200, kind: 'van', color: 0x9ad87a, speed: 3.6 },
    { path: Bp, s: 300, kind: 'bus', color: 0xf2ecd8, speed: 3.2 },
    { path: Bp, s: 390, kind: 'truck', color: 0xe8e8e0, speed: 3.0 },
  ];
  const cars = specs.map((spec) => {
    const mesh = carModel(spec.kind, spec.color);
    mesh.name = `car:${spec.kind}`;
    scene.add(mesh);
    return { ...spec, mesh, v: spec.speed, pos: new THREE.Vector3(), dir: new THREE.Vector3(1, 0, 0) };
  });

  const ahead = new THREE.Vector3();
  return {
    cars,
    update(dt, crossingClosed) {
      for (const car of cars) {
        const p = car.path.sample(car.s);
        let want = car.speed;
        // wait at the level crossing
        if (crossingClosed && Math.abs(p.x) < 1.7) {
          if (p.dz < -0.5 && p.z > -5.2 && p.z < -4.2) want = 0;
          if (p.dz > 0.5 && p.z < -8.8 && p.z > -9.8) want = 0;
        }
        // slow for turns
        const q = car.path.sample(car.s + 1.2);
        if (p.dx * q.dx + p.dz * q.dz < 0.8) want = Math.min(want, 1.6);
        // keep distance from cars ahead
        for (const other of cars) {
          if (other === car) continue;
          ahead.copy(other.pos).sub(car.pos);
          ahead.y = 0;
          const dist = ahead.length();
          if (dist < 3.2 && dist > 0.01) {
            const fwd = (ahead.x * p.dx + ahead.z * p.dz) / dist;
            const same = other.dir.x * p.dx + other.dir.z * p.dz;
            if (fwd > 0.85 && same > 0.3) want = Math.min(want, dist < 2.2 ? 0 : other.v);
          }
        }
        car.v += Math.sign(want - car.v) * Math.min(Math.abs(want - car.v), dt * 4);
        car.s += car.v * dt;
        const y = roadY(p.x, p.z);
        car.pos.set(p.x, y, p.z);
        car.dir.set(p.dx, 0, p.dz);
        car.mesh.position.copy(car.pos);
        car.mesh.rotation.y = Math.atan2(-p.dz, p.dx);
        const y2 = roadY(p.x + p.dx * 0.8, p.z + p.dz * 0.8);
        car.mesh.children[0].rotation.z = Math.atan2(y2 - y, 0.8);
      }
    },
  };
}

// ---------------------------------------------------------------- sea life

export function createBoats(scene) {
  const rng = makeRng(99);
  const boats = [];
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 2.2, 0, -1.2, 0, 0, 0, 0, 0, -1.2, 0, 0, 0, 2.2, 0], 3));
  sailGeo.computeVertexNormals();
  for (let i = 0; i < 6; i += 1) {
    const B = new Batcher();
    const sail = i < 4;
    if (sail) {
      B.box('solid', 1.8, 0.35, 0.6, 0, 0.1, 0, 0xf6f6f0);
      B.box('solid', 1.82, 0.08, 0.62, 0, 0.0, 0, rng.pick([0x2f5fa8, 0xd83a2a, 0x3a8a8a]));
      B.box('solid', 0.05, 2.4, 0.05, 0.2, 1.4, 0, 0xdadad0);
      B.geo('solid', sailGeo, 0.15, 0.4, 0, 0xffffff);
      B.geo('solid', sailGeo, 0.3, 0.4, 0, rng.pick([0xf6f6f0, 0xf2e0b0, 0xf2b0a0]), { sx: -0.55, sy: 0.9 });
    } else {
      B.box('solid', 2.2, 0.45, 0.8, 0, 0.1, 0, 0xf2f2ea);
      B.box('solid', 2.22, 0.1, 0.82, 0, -0.05, 0, 0x2f5fa8);
      B.box('solid', 0.7, 0.55, 0.6, -0.3, 0.6, 0, 0xf6f6f0);
      B.box('glow', 0.02, 0.2, 0.5, 0.06, 0.7, 0, 0x3a5a70, { lit: 1, emit: 0xfff0c0 });
      B.box('solid', 0.04, 1.2, 0.04, 0.3, 1.2, 0, 0xdadad0);
      B.box('glow', 0.08, 0.08, 0.08, 0.3, 1.8, 0, 0xff4040, { lit: 1, emit: 0xff4030 });
    }
    const group = new THREE.Group();
    B.build(group);
    scene.add(group);
    const boat = { group, sail, phase: rng.range(0, 10) };
    if (sail) {
      boat.cx = rng.range(-30, 30);
      boat.cz = rng.range(-70, -48);
      boat.rx = rng.range(8, 22);
      boat.rz = rng.range(3, 8);
      boat.speed = rng.range(0.012, 0.03) * (rng.chance(0.5) ? 1 : -1);
    } else {
      boat.fixed = new THREE.Vector3(i === 4 ? 7.0 : 4.0, 0, i === 4 ? -33.5 : -35.8);
    }
    boats.push(boat);
  }
  return {
    update(t) {
      for (const b of boats) {
        const g = b.group;
        if (b.sail) {
          const a = t * b.speed + b.phase;
          g.position.set(b.cx + Math.cos(a) * b.rx, SEA, b.cz + Math.sin(a) * b.rz);
          const dx = -Math.sin(a) * b.rx * Math.sign(b.speed);
          const dz = Math.cos(a) * b.rz * Math.sign(b.speed);
          g.rotation.y = Math.atan2(-dz, dx);
        } else {
          g.position.copy(b.fixed);
          g.position.y = SEA;
          g.rotation.y = Math.PI / 2 + Math.sin(t * 0.3 + b.phase) * 0.04;
        }
        g.position.y += Math.sin(t * 1.4 + b.phase) * 0.06;
        g.rotation.z = Math.sin(t * 1.1 + b.phase) * 0.05;
        g.rotation.x = Math.sin(t * 0.9 + b.phase * 2) * 0.04;
      }
    },
  };
}

export function createGulls(scene) {
  const rng = makeRng(5);
  const white = toon(0xf6f6f2);
  const grey = toon(0x9aa0a8);
  const gulls = [];
  for (let i = 0; i < 9; i += 1) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.1), white);
    g.add(body);
    const wings = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.42), side > 0 ? white : grey);
      wing.position.z = side * 0.21;
      pivot.add(wing);
      g.add(pivot);
      wings.push({ pivot, side });
    }
    scene.add(g);
    gulls.push({
      g, wings,
      cx: rng.range(-18, 18), cz: rng.range(-36, -18), y: rng.range(3, 9),
      r: rng.range(4, 10), speed: rng.range(0.25, 0.5) * (rng.chance(0.5) ? 1 : -1), phase: rng.range(0, 7),
    });
  }
  return {
    update(t) {
      for (const b of gulls) {
        const a = t * b.speed + b.phase;
        b.g.position.set(b.cx + Math.cos(a) * b.r, b.y + Math.sin(t * 0.7 + b.phase) * 0.8, b.cz + Math.sin(a) * b.r * 0.6);
        const dx = -Math.sin(a) * Math.sign(b.speed);
        const dz = Math.cos(a) * 0.6 * Math.sign(b.speed);
        b.g.rotation.y = Math.atan2(-dz, dx);
        b.g.rotation.x = -Math.sign(b.speed) * 0.25;
        const flap = Math.sin(t * 9 + b.phase * 3);
        const glide = Math.sin(t * 0.8 + b.phase) > 0.2 ? 0.15 : 1;
        for (const w of b.wings) w.pivot.rotation.x = w.side * flap * 0.55 * glide;
      }
    },
  };
}

// ---------------------------------------------------------------- night fx

export function createFireflies(scene, extra = []) {
  const rng = makeRng(77);
  const base = [];
  for (let i = 0; i < 90; i += 1) {
    const onTerrace = rng.chance(0.6);
    const x = onTerrace ? rng.range(PLATEAU.x0 + 0.5, PLATEAU.x1 - 0.5) : rng.range(-17, -3);
    const z = onTerrace ? rng.range(PLATEAU.z0 + 0.5, PLATEAU.z1) : rng.range(2.6, 7);
    const y = (onTerrace ? PLATEAU.top : 0) + rng.range(0.3, 1.8);
    base.push([x, y, z, rng.range(0, 10)]);
  }
  base.push(...extra);
  const count = base.length;
  const positions = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xd8ff7a, size: 2, sizeAttenuation: false, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.layers.set(1);
  points.frustumCulled = false;
  scene.add(points);
  return {
    update(t, night) {
      mat.opacity = THREE.MathUtils.smoothstep(night, 0.5, 0.95);
      points.visible = mat.opacity > 0.01;
      if (!points.visible) return;
      for (let i = 0; i < count; i += 1) {
        const [x, y, z, p] = base[i];
        positions[i * 3] = x + Math.sin(t * 0.4 + p) * 0.6;
        positions[i * 3 + 1] = y + Math.sin(t * 0.7 + p * 2) * 0.25;
        positions[i * 3 + 2] = z + Math.cos(t * 0.33 + p) * 0.6;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

export function createLighthouseBeam(scene, pos) {
  const geo = new THREE.ConeGeometry(2.2, 26, 16, 1, true);
  geo.translate(0, -13, 0);
  geo.rotateZ(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xfff2c0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(geo, mat);
  beam.position.copy(pos);
  beam.layers.set(1);
  scene.add(beam);
  return {
    update(t, night) {
      beam.rotation.y = t * 0.7;
      mat.opacity = 0.16 * THREE.MathUtils.smoothstep(night, 0.4, 0.9);
      beam.visible = mat.opacity > 0.005;
    },
  };
}

export function createCat(scene, x, y, z) {
  const g = new THREE.Group();
  const fur = toon(0xf2a24a);
  const dark = toon(0xc8782a);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.18), fur);
  body.position.y = 0.11;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.16, 0.17), fur);
  head.position.set(0.16, 0.26, 0);
  g.add(head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 4), dark);
    ear.position.set(0.16, 0.37, s * 0.05);
    g.add(ear);
  }
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.15, 0.12, 0);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.26, 0.04), dark);
  tail.position.y = 0.12;
  tailPivot.add(tail);
  g.add(tailPivot);
  g.position.set(x, y, z);
  g.rotation.y = -Math.PI / 2 + 0.4;
  scene.add(g);
  return {
    update(t) {
      tailPivot.rotation.z = -0.5 + Math.sin(t * 2.2) * 0.35;
      tailPivot.rotation.x = Math.sin(t * 1.3) * 0.3;
      head.rotation.y = Math.sin(t * 0.25) > 0.6 ? 0.6 : 0;
    },
  };
}

export { STAIRS };

import * as THREE from 'three';
import { Batcher, gableGeometry, mat4 } from './batcher.js';
import { heightAt, RAIL, RAIL_COVER, RAIL_STATIONS, railCrossings, railPortals, railSections_ } from './terrain.js';
import { portal, tubeMaterial } from './tunnel.js';
import { makeSign } from './signs.js';
import { shared, toonRamp } from './materials.js';
import { buildTramCar, doorLeaves } from './life.js';

// The railway loop: track, tunnels, bridges, the two stations that aren't
// hand-built (onsen, lake), the valley level crossing, and the trams.

const W = 2.8; // tunnel width
const WALL = 1.55;
const MOUTH = new THREE.Color(0x6a6c66);
const DEEP = new THREE.Color(0x0c0d10);

const yawOf = (tx, tz) => Math.atan2(-tz, tx);

// ---------------------------------------------------------------- track

function ribbon(verts, a, b, wa, wb, ya, yb) {
  // quad strip between samples a and b, offsets wa..wb across the track
  const na = [-a.tz, a.tx];
  const nb = [-b.tz, b.tx];
  const p = (s, n, w, y) => [s.x + n[0] * w, y, s.z + n[1] * w];
  const q = [p(a, na, wa, ya), p(b, nb, wa, yb), p(b, nb, wb, yb), p(a, na, wb, ya)];
  for (const k of [0, 2, 1, 0, 3, 2]) verts.push(...q[k]);
}

function wall(verts, a, b, w, ya0, ya1, yb0, yb1) {
  const na = [-a.tz, a.tx];
  const nb = [-b.tz, b.tx];
  const q = [
    [a.x + na[0] * w, ya0, a.z + na[1] * w], [b.x + nb[0] * w, yb0, b.z + nb[1] * w],
    [b.x + nb[0] * w, yb1, b.z + nb[1] * w], [a.x + na[0] * w, ya1, a.z + na[1] * w],
  ];
  for (const k of [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]) verts.push(...q[k]);
}

function addVerts(B, verts, hex, bucket = 'solid') {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  B.add(bucket, g, new THREE.Matrix4(), hex);
}

function track(B) {
  const secs = railSections_();
  const ballast = [];
  const deck = [];
  const rails = [];
  const step = 1;
  const n = Math.floor(RAIL.length / step);
  for (let i = 0; i < n; i += 1) {
    const s = i * step;
    const a = RAIL.at(s);
    const b = RAIL.at(s + step);
    const type = secs.typeAt(s + step / 2);
    if (type === 'bridge') {
      ribbon(deck, a, b, -1.5, 1.5, a.y + 0.02, b.y + 0.02);
      for (const w of [-1.5, 1.5]) wall(deck, a, b, w, a.y - 0.42, a.y + 0.02, b.y - 0.42, b.y + 0.02);
    } else {
      ribbon(ballast, a, b, -1.3, 1.3, a.y + 0.08, b.y + 0.08);
      for (const w of [-1.3, 1.3]) wall(ballast, a, b, w, a.y - 0.25, a.y + 0.08, b.y - 0.25, b.y + 0.08);
    }
    for (const w of [-0.55, 0.55]) {
      ribbon(rails, a, b, w - 0.035, w + 0.035, a.y + 0.24, b.y + 0.24);
      wall(rails, a, b, w + 0.035, a.y + 0.14, a.y + 0.24, b.y + 0.14, b.y + 0.24);
    }
  }
  addVerts(B, ballast, 0x8e8a80);
  addVerts(B, deck, 0x9a9890);
  addVerts(B, rails, 0xa2a8ae);
  // sleepers
  for (let s = 0; s < RAIL.length; s += 0.62) {
    const p = RAIL.at(s);
    if (Math.abs(p.x) < 1.8 && Math.abs(p.z + 7) < 1.5) continue; // road A crossing deck
    B.box('solid', 0.22, 0.07, 2.0, p.x, p.y + 0.13, p.z, 0x5a4636, { ry: yawOf(p.tx, p.tz) });
  }
}

// ---------------------------------------------------------------- bridges

function bridges(B) {
  for (const sec of railSections_()) {
    if (sec.type !== 'bridge') continue;
    // piers
    for (let s = sec.s0 + 2; s < sec.s1 - 1; s += 5) {
      const p = RAIL.at(s);
      const g = heightAt(p.x, p.z);
      const h = p.y - 0.42 - (g - 0.6);
      if (h > 0.2) B.block('solid', 0.7, h, 2.2, p.x, g - 0.6, p.z, 0xa8a8a0, { ry: yawOf(p.tx, p.tz) });
    }
    // railings
    for (let s = sec.s0; s < sec.s1; s += 1.2) {
      const p = RAIL.at(s);
      const n = [-p.tz, p.tx];
      for (const w of [-1.45, 1.45]) {
        B.block('solid', 0.06, 0.55, 0.06, p.x + n[0] * w, p.y + 0.02, p.z + n[1] * w, 0x2f5fa8);
      }
    }
    for (let s = sec.s0; s < sec.s1; s += 1) {
      const a = RAIL.at(s);
      const b = RAIL.at(Math.min(s + 1, sec.s1));
      const verts = [];
      for (const w of [-1.45, 1.45]) wall(verts, a, b, w, a.y + 0.5, a.y + 0.58, b.y + 0.5, b.y + 0.58);
      addVerts(B, verts, 0x2f5fa8);
    }
    // abutments
    for (const s of [sec.s0, sec.s1]) {
      const p = RAIL.at(s);
      B.block('solid', 1.2, 2.5, 3.4, p.x, p.y - 2.45, p.z, 0x9a9a90, { ry: yawOf(p.tx, p.tz), jitter: 0.06 });
    }
  }
}

// ---------------------------------------------------------------- tunnels

function tunnels(B, decor) {
  const prof = [[-W / 2, 0], [-W / 2, WALL]];
  for (let i = 1; i < 10; i += 1) {
    const a = Math.PI - (i / 10) * Math.PI;
    prof.push([Math.cos(a) * (W / 2), WALL + Math.sin(a) * (W / 2)]);
  }
  prof.push([W / 2, WALL], [W / 2, 0]);

  for (const sec of railSections_()) {
    if (sec.type !== 'tunnel') continue;
    const verts = [];
    const cols = [];
    const col = new THREE.Color();
    for (let s = sec.s0; s < sec.s1 - 1e-3; s += 1) {
      const s2 = Math.min(sec.s1, s + 1);
      const a = RAIL.at(s);
      const b = RAIL.at(s2);
      const depth = Math.min((s + s2) / 2 - sec.s0, sec.s1 - (s + s2) / 2);
      col.copy(MOUTH).lerp(DEEP, THREE.MathUtils.smoothstep(depth, 0.5, 9));
      const na = [-a.tz, a.tx];
      const nb = [-b.tz, b.tx];
      for (let k = 0; k < prof.length - 1; k += 1) {
        const [w1, h1] = prof[k];
        const [w2, h2] = prof[k + 1];
        const q = [
          [a.x + na[0] * w1, a.y - 0.08 + h1, a.z + na[1] * w1], [b.x + nb[0] * w1, b.y - 0.08 + h1, b.z + nb[1] * w1],
          [b.x + nb[0] * w2, b.y - 0.08 + h2, b.z + nb[1] * w2], [a.x + na[0] * w2, a.y - 0.08 + h2, a.z + na[1] * w2],
        ];
        const c = col.clone().multiplyScalar(k === 0 || k === prof.length - 2 ? 0.8 : 1);
        for (const kk of [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]) {
          verts.push(...q[kk]);
          cols.push(c.r, c.g, c.b);
        }
      }
      if (Math.round(s) % 4 === 0) {
        B.box('glow', 0.16, 0.08, 0.5, a.x + na[0] * 0.5, a.y + WALL + W / 2 - 0.2, a.z + na[1] * 0.5, 0xffa848, { lit: 1, emit: 0xffb458, ry: yawOf(a.tx, a.tz) + Math.PI / 2 });
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const mesh = new THREE.Mesh(g, tubeMaterial);
    mesh.name = 'rail-tunnel';
    decor.add(mesh);
  }

  // portals + lids over the terrain holes behind them
  for (const p of railPortals()) {
    const n = [-p.tz, p.tx];
    let cover = p.y + RAIL_COVER;
    for (const u of [1.2, 2.2, 2.8]) {
      for (let v = -2.6; v <= 2.6; v += 0.65) cover = Math.max(cover, heightAt(p.x + p.tx * u + n[0] * v, p.z + p.tz * u + n[1] * v));
    }
    B.push(mat4(p.x, 0, p.z, yawOf(p.tx, p.tz)));
    portal(B, 0, 0, p.y - 0.08, W, WALL, -1, cover, 1.4);
    B.block('solid', 3.0, 0.6, 6.6, 1.5, cover - 0.55, 0, 0x3f7d3a);
    B.pop();
  }
}

// ---------------------------------------------------------------- stations

function platformBase(st) {
  const p = RAIL.at(st.s);
  const n = [-p.tz, p.tx];
  return { p, n, cx: p.x + n[0] * st.side * 2.25, cz: p.z + n[1] * st.side * 2.25, ry: yawOf(p.tx, p.tz), top: p.y + 0.55 };
}

function ruralStation(B, decor, st, { roof = 0x8a3a2a, board }) {
  const { p, cx, cz, ry, top } = platformBase(st);
  B.push(mat4(cx, 0, cz, ry));
  const side = st.side; // local +z points to the track when side = -1
  const towardTrack = -side;
  B.block('solid', 13, top - p.y + 0.45, 1.8, 0, p.y - 0.45, 0, 0xb0ada2);
  B.box('solid', 12.8, 0.02, 0.18, 0, top + 0.012, towardTrack * 0.5, 0xf2c830);
  B.box('solid', 13, 0.02, 0.12, 0, top + 0.01, towardTrack * 0.84, 0xf2f2ea);
  // shelter
  B.at(0, top, -towardTrack * 0.35, 0, () => {
    B.block('solid', 3.6, 1.5, 0.08, 0, 0, -towardTrack * 0.45, 0x8a6040);
    for (const px of [-1.7, 1.7]) B.block('solid', 0.1, 1.9, 0.1, px, 0, towardTrack * 0.3, 0x6a4a30);
    B.geo('solid', gableGeometry(4.2, 1.7, 0.45), 0, 1.9, 0, roof);
    B.block('solid', 3.0, 0.06, 0.36, 0, 0.42, -towardTrack * 0.25, 0xa8733c);
    B.box('glow', 0.5, 0.06, 0.14, 0, 1.82, 0, 0xe8ece8, { lit: 1, emit: 0xfff4d0 });
  });
  for (let fx = -6.2; fx <= 6.2; fx += 0.9) B.block('solid', 0.05, 0.8, 0.05, fx, top, -towardTrack * 0.86, 0x8a6a48);
  for (const px of [-4.9, -3.7]) B.block('solid', 0.06, 1.2, 0.06, px, top, -towardTrack * 0.55, 0x4a4a4a);
  B.pop();
  const sign = makeSign({ ...board, width: 1.6, height: 0.72, bg: '#ffffff', fg: '#1a1a1a', border: '#2f7a4a', pxPerUnit: 96 });
  const local = new THREE.Vector3(-4.3, top + 1.15, -towardTrack * 0.52).applyMatrix4(mat4(cx, 0, cz, ry));
  sign.position.copy(local);
  sign.rotation.y = ry + (towardTrack > 0 ? 0 : Math.PI);
  decor.add(sign);
  return { cx, cz, top, ry };
}

// ---------------------------------------------------------------- crossing (valley)

function valleyCrossing(B) {
  const c = railCrossings().find((cc) => cc.id === 'yamate');
  const p = RAIL.at(c.s);
  const n = [-p.tz, p.tx];
  B.push(mat4(p.x, p.y, p.z, yawOf(p.tx, p.tz)));
  B.block('solid', 3.2, 0.26, 3.4, 0, 0, 0, 0x4e5256);
  B.pop();
  const lamps = [];
  const unit = new THREE.Group();
  for (const side of [-1, 1]) {
    const px = p.x + p.tx * side * 2.4 + n[0] * side * 2.0;
    const pz = p.z + p.tz * side * 2.4 + n[1] * side * 2.0;
    const g = new THREE.Group();
    g.position.set(px, p.y, pz);
    g.rotation.y = yawOf(p.tx, p.tz) + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8), new THREE.MeshToonMaterial({ color: 0x222222, gradientMap: toonRamp }));
    post.position.y = 1.3;
    g.add(post);
    const yellow = new THREE.MeshToonMaterial({ color: 0xf2d020, gradientMap: toonRamp });
    for (const r of [0.6, -0.6]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.03), yellow);
      bar.position.set(0, 2.45, 0.06);
      bar.rotation.z = r;
      g.add(bar);
    }
    for (const lx of [-0.3, 0.3]) {
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.09, 10), new THREE.MeshBasicMaterial({ color: 0x4a1a1a }));
      lamp.position.set(lx, 2.0, 0.08);
      g.add(lamp);
      lamps.push(lamp);
    }
    unit.add(g);
  }
  return {
    unit,
    update(active, t) {
      const blink = Math.floor(t * 2.4) % 2 === 0;
      lamps.forEach((l, i) => l.material.color.setHex(active && (i % 2 === 0 ? blink : !blink) ? 0xff3a2a : 0x4a1a1a));
    },
  };
}

// ---------------------------------------------------------------- trams

const CRUISE = 7.5;
const ACCEL = 1.3;
const DWELL = 10;

function tramDoorsAt(u) {
  return THREE.MathUtils.smoothstep(u, 0.9, 1.7) * (1 - THREE.MathUtils.smoothstep(u, DWELL - 1.8, DWELL - 1.0));
}

function createTramSet(scene, startStation) {
  const group = new THREE.Group();
  group.name = 'tram';
  const cars = [];
  for (let i = 0; i < 2; i += 1) {
    const car = new THREE.Group();
    const inner = new THREE.Group();
    const B = new Batcher();
    buildTramCar(B, i === 0);
    B.build(inner);
    inner.userData.doors = doorLeaves(inner);
    car.add(inner);
    group.add(car);
    cars.push(inner);
  }
  scene.add(group);
  const st = RAIL_STATIONS.find((x) => x.id === startStation);
  return { group, cars, s: st.s + 2.25, v: 0, dwell: 0, stop: st, doors: 0, lastStop: null };
}

function nextStop(tram) {
  let best = null;
  for (const st of RAIL_STATIONS) {
    if (st === tram.lastStop) continue;
    const target = st.s + 2.25;
    const d = RAIL.wrap(target - tram.s);
    if (!best || d < best.d) best = { st, d };
  }
  return best;
}

function placeTram(tram) {
  tram.cars.forEach((inner, i) => {
    const car = inner.parent;
    const s = tram.s - i * 4.5;
    const p = RAIL.at(s);
    car.position.set(p.x, p.y + 0.2, p.z);
    car.rotation.set(0, yawOf(p.tx, p.tz), Math.atan(p.grade), 'YXZ');
    // lead car faces forward, trailing car backward (cab at each end)
    inner.rotation.y = i === 0 ? 0 : Math.PI;
  });
}

export function buildRailway(B, decor) {
  track(B);
  bridges(B);
  tunnels(B, decor);
  const onsen = RAIL_STATIONS.find((s) => s.id === 'onsen');
  const lake = RAIL_STATIONS.find((s) => s.id === 'lake');
  const onsenInfo = ruralStation(B, decor, onsen, { roof: 0x4a3a30, board: { lines: [['やまのゆおんせん', 0.7], ['山の湯温泉', 1.1], ['← やまて　こはん →', 0.45]] } });
  const lakeInfo = ruralStation(B, decor, lake, { roof: 0x2f5fa8, board: { lines: [['こはん', 0.9], ['湖畔', 1.2], ['← やまのゆ　うみみ →', 0.45]] } });
  return { onsenInfo, lakeInfo };
}

export function createRailSystem(scene) {
  const trams = [createTramSet(scene, 'umimi'), createTramSet(scene, 'onsen')];
  const valley = valleyCrossing(new Batcher());
  scene.add(valley.unit);
  const crossings = railCrossings();
  const state = { trams, crossingActive: {}, valleyCrossing: valley };

  state.update = (t, dt) => {
    for (const tram of trams) {
      if (tram.dwell > 0) {
        tram.dwell -= dt;
        const u = DWELL - tram.dwell;
        tram.doors = tramDoorsAt(u);
        if (tram.dwell <= 0) {
          tram.lastStop = tram.stop;
          tram.stop = null;
          tram.doors = 0;
        }
      } else {
        const ns = nextStop(tram);
        const brake = Math.sqrt(2 * ACCEL * Math.max(0, ns.d));
        const want = Math.min(CRUISE, brake);
        tram.v += Math.sign(want - tram.v) * Math.min(Math.abs(want - tram.v), ACCEL * dt * 1.6);
        tram.s = RAIL.wrap(tram.s + Math.min(tram.v * dt, ns.d));
        if (ns.d < 0.03 || (ns.d < 0.25 && tram.v < 0.3)) {
          tram.s = RAIL.wrap(ns.st.s + 2.25);
          tram.v = 0;
          tram.stop = ns.st;
          tram.dwell = DWELL;
        }
      }
      // doors on the platform side
      for (const inner of tram.cars) {
        const flip = inner.rotation.y !== 0 ? -1 : 1;
        const side = tram.stop ? tram.stop.side * flip : 0;
        for (const d of inner.userData.doors.leaves) {
          const k = tram.stop && d.sz === side ? tram.doors : 0;
          d.leaf.position.x = d.baseX + d.side * k * 0.23;
        }
        inner.userData.doors.glass.color.setHex(0x4a6a80).lerp(new THREE.Color(0xfff2cc), THREE.MathUtils.smoothstep(shared.uNight.value, 0.25, 0.7));
      }
      placeTram(tram);
    }
    // a crossing is active while a tram approaches it or is on it
    for (const c of crossings) {
      let active = false;
      for (const tram of trams) {
        const ahead = RAIL.wrap(c.s - tram.s); // crossing ahead of the front
        const behind = RAIL.wrap(tram.s - c.s); // front already past
        if ((ahead < 16 && tram.v > 0.2) || ahead < 1 || behind < 11) active = true;
      }
      state.crossingActive[c.id] = active;
    }
    valley.update(state.crossingActive.yamate, t);
  };

  state.status = () => {
    const tram = trams[0];
    if (tram.stop) return `🚃 停車中 · tram at ${tram.stop.name}`;
    const ns = nextStop(tram);
    return `🚃 bound for ${ns.st.name} →`;
  };
  state.skip = (seconds) => {
    for (const tram of trams) {
      tram.dwell = 0;
      tram.stop = null;
      tram.s = RAIL.wrap(tram.s + seconds * CRUISE);
      tram.v = CRUISE;
    }
  };
  state.crossings = crossings;
  return state;
}

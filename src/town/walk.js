import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import {
  distToPolyline, EXTENT, heightAt, PORTAL_R, RAIL_EXIT, RAIL_V, railY, riverZ, ROAD_B_Z, ROAD_TUNNEL, roadBHeight, RURAL_ROAD, RURAL_Y, SEA, TRACK_Z, VALLEY,
} from './terrain.js';
import { PLATEAU, PLATFORM, STAIRS } from './layout.js';
import { solids } from './buildings.js';

// First-person walking: WASD / arrows + mouse look (pointer lock), or two
// thumb sticks on touch screens. Ground height follows roads, stairs, the
// shrine terrace, the platform and tunnels; buildings, water and walls
// taller than a step block movement.

const EYE = 0.62;
const WALK = 2.4;
const RUN = 5.2;
const MAX_STEP = 0.32;

export function walkableY(x, z) {
  // road tunnel floor
  if (x > ROAD_TUNNEL.x0 - 0.5 && x < ROAD_TUNNEL.x1 + 0.5 && Math.abs(z - ROAD_B_Z) < 2.1) return roadBHeight(x) + 0.02;
  // east rail tunnel climbs to Yamate; Yamate station platform + steps
  if (x > PORTAL_R - 0.5 && x < RAIL_EXIT + 0.5 && Math.abs(z - TRACK_Z) < 1.3) return railY(x) + 0.12;
  if (x > 84.2 && x < 96.4 && z > TRACK_Z + 0.8 && z < TRACK_Z + 2.6) return RAIL_V + 0.55;
  if (x > 83.2 && x <= 84.2 && z > TRACK_Z + 1.2 && z < TRACK_Z + 2.2) return RAIL_V + (0.55 * (x - 83.2)) / 1.0;
  // shrine terrace + stairs
  if (x > PLATEAU.x0 && x < PLATEAU.x1 && z > PLATEAU.z0 && z < PLATEAU.z1) return PLATEAU.top + 0.06;
  const stairsEnd = PLATEAU.z1 + (STAIRS.steps - 1) * STAIRS.run;
  if (Math.abs(x - STAIRS.x) < STAIRS.width / 2 && z >= PLATEAU.z1 && z < stairsEnd) {
    const i = Math.floor((z - PLATEAU.z1) / STAIRS.run);
    return PLATEAU.top - (i + 1) * STAIRS.rise;
  }
  if (x > PLATFORM.x0 && x < PLATFORM.x1 && z > PLATFORM.z0 && z < PLATFORM.z1) return PLATFORM.top;
  // three steps up to the platform at its west end
  if (x > PLATFORM.x0 + 0.1 && x < PLATFORM.x0 + 1.1 && z >= PLATFORM.z1 && z < PLATFORM.z1 + 1.02) {
    const i = Math.floor((z - PLATFORM.z1) / 0.34);
    return ((3 - i) * PLATFORM.top) / 3;
  }
  // level crossing deck, then the flat town street + sidewalks
  if (Math.abs(x) < 1.7 && Math.abs(z - TRACK_Z) < 1.3) return 0.17;
  if (Math.abs(x) < 2.8 && z > -8.4 && z < 34) return Math.abs(x) < 1.6 ? 0.03 : 0.12;
  // rural road + bridge deck
  if (x >= ROAD_TUNNEL.x1 && distToPolyline(x, z, RURAL_ROAD) < 1.6) return RURAL_Y;
  return heightAt(x, z);
}

function blocked(x, z, y) {
  if (x < EXTENT.x0 + 2 || x > EXTENT.x1 - 2 || z < EXTENT.z0 + 2 || z > EXTENT.z1 - 2) return true;
  if (y < SEA + 0.25) return true;
  if (x > 64 && Math.abs(z - riverZ(x)) < 2.2 && y < VALLEY - 0.4) return true;
  for (const s of solids) {
    const dx = x - s.x;
    const dz = z - s.z;
    const c = Math.cos(s.ry);
    const sn = Math.sin(s.ry);
    const lx = dx * c - dz * sn;
    const lz = dx * sn + dz * c;
    if (Math.abs(lx) < s.w / 2 + 0.12 && Math.abs(lz) < s.d / 2 + 0.12) return true;
  }
  return false;
}

export function createWalker({ camera, canvas, onExit, onZone }) {
  const look = new PointerLockControls(camera, canvas);
  look.pointerSpeed = 0.7;
  const keys = new Set();
  const pos = new THREE.Vector3();
  let groundY = 0;
  let active = false;
  let bob = 0;
  let zoneTimer = 0;
  let lastZone = '';
  const touch = { move: null, look: null, mx: 0, mz: 0 };
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');

  const onKey = (e) => {
    if (!active) return;
    if (e.type === 'keydown') keys.add(e.code);
    else keys.delete(e.code);
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  canvas.addEventListener('click', () => {
    if (active && !look.isLocked && !('ontouchstart' in window)) look.lock();
  });
  look.addEventListener('lock', () => document.body.classList.add('locked'));
  look.addEventListener('unlock', () => document.body.classList.remove('locked'));

  // touch: left half moves, right half looks
  const tstart = (e) => {
    if (!active) return;
    document.body.classList.add('touched');
    for (const t of e.changedTouches) {
      const slot = t.clientX < window.innerWidth / 2 ? 'move' : 'look';
      if (!touch[slot]) touch[slot] = { id: t.identifier, x: t.clientX, y: t.clientY, ox: t.clientX, oy: t.clientY };
    }
    e.preventDefault();
  };
  const tmove = (e) => {
    if (!active) return;
    for (const t of e.changedTouches) {
      if (touch.move?.id === t.identifier) {
        touch.mx = THREE.MathUtils.clamp((t.clientX - touch.move.ox) / 50, -1, 1);
        touch.mz = THREE.MathUtils.clamp((t.clientY - touch.move.oy) / 50, -1, 1);
      }
      if (touch.look?.id === t.identifier) {
        euler.setFromQuaternion(camera.quaternion);
        euler.y -= (t.clientX - touch.look.x) * 0.006;
        euler.x = THREE.MathUtils.clamp(euler.x - (t.clientY - touch.look.y) * 0.006, -1.4, 1.4);
        camera.quaternion.setFromEuler(euler);
        touch.look.x = t.clientX;
        touch.look.y = t.clientY;
      }
    }
    e.preventDefault();
  };
  const tend = (e) => {
    for (const t of e.changedTouches) {
      if (touch.move?.id === t.identifier) {
        touch.move = null;
        touch.mx = 0;
        touch.mz = 0;
      }
      if (touch.look?.id === t.identifier) touch.look = null;
    }
  };
  canvas.addEventListener('touchstart', tstart, { passive: false });
  canvas.addEventListener('touchmove', tmove, { passive: false });
  canvas.addEventListener('touchend', tend);
  canvas.addEventListener('touchcancel', tend);

  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();

  function tryMove(nx, nz) {
    const ny = walkableY(nx, nz);
    if (ny - groundY > MAX_STEP) return false;
    if (blocked(nx, nz, ny)) return false;
    pos.x = nx;
    pos.z = nz;
    groundY = ny;
    return true;
  }

  return {
    get active() {
      return active;
    },
    get position() {
      return pos;
    },
    enter(x, z, yaw) {
      active = true;
      pos.set(x, 0, z);
      groundY = walkableY(x, z);
      camera.position.set(x, groundY + EYE, z);
      euler.set(-0.05, yaw, 0);
      camera.quaternion.setFromEuler(euler);
      if (!('ontouchstart' in window)) look.lock();
    },
    exit() {
      active = false;
      keys.clear();
      document.body.classList.remove('touched');
      if (look.isLocked) look.unlock();
      onExit?.();
    },
    update(dt) {
      if (!active) return;
      const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
      let mz = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      let mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      mz -= touch.mz;
      mx += touch.mx;
      camera.getWorldDirection(fwd);
      fwd.y = 0;
      fwd.normalize();
      right.crossVectors(fwd, camera.up).normalize();
      const len = Math.hypot(mx, mz);
      const speed = (run || Math.hypot(touch.mx, touch.mz) > 0.95 ? RUN : WALK) * dt;
      if (len > 0.05) {
        const k = speed / Math.max(1, len);
        const dx = (fwd.x * mz + right.x * mx) * k;
        const dz = (fwd.z * mz + right.z * mx) * k;
        // slide along obstacles by trying each axis
        if (!tryMove(pos.x + dx, pos.z + dz)) {
          if (!tryMove(pos.x + dx, pos.z)) tryMove(pos.x, pos.z + dz);
        }
        bob += speed * 5.5;
      }
      const target = groundY + EYE + Math.sin(bob) * 0.025;
      camera.position.x = pos.x;
      camera.position.z = pos.z;
      camera.position.y += (target - camera.position.y) * Math.min(1, dt * 12);

      zoneTimer -= dt;
      if (zoneTimer <= 0) {
        zoneTimer = 0.4;
        const zone = zoneAt(pos.x, pos.z, groundY);
        if (zone && zone !== lastZone) onZone?.(zone);
        lastZone = zone;
      }
    },
  };
}

export function zoneAt(x, z, y) {
  if (x > PLATEAU.x0 && x < PLATEAU.x1 && z > PLATEAU.z0 && z < PLATEAU.z1 + 3.5) return '夏山神社 · Natsuyama Shrine';
  if (x > PLATFORM.x0 - 3 && x < PLATFORM.x1 && z > PLATFORM.z0 - 1 && z < -3.3) return '海見町駅 · Umimi-chō Station';
  if (z < -25 && Math.abs(x) < 12) return '海見港 · Umimi Harbour';
  if (x > ROAD_TUNNEL.x0 && x < ROAD_TUNNEL.x1) return Math.abs(z - TRACK_Z) < 2 ? '鉄道トンネル · Railway Tunnel' : '山手トンネル · Yamate Tunnel';
  if (x > 83 && x < 97 && Math.abs(z - TRACK_Z - 1.7) < 1.5) return '山手駅 · Yamate Station';
  if (x > 95 && x < 105 && z < -7) return '千本鳥居 · Path of a Thousand Torii';
  if (x > 145 && z > 33) return '山手寺 · Yamate Temple';
  if (x >= ROAD_TUNNEL.x1) return '山手の里 · Yamate Village';
  if (y !== undefined) return '海見町 · Umimi-chō';
  return '';
}

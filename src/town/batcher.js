import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { foliageMaterial, glowMaterial, solidMaterial } from './materials.js';

// Collects thousands of small static pieces and merges them into one mesh per
// material bucket. Colour lives in vertex colours, so a whole town is a
// handful of draw calls.

const BUCKETS = {
  solid: { attrs: {}, material: solidMaterial, shadows: true },
  foliage: { attrs: { sway: 1 }, material: foliageMaterial, shadows: true },
  glow: { attrs: { lit: 1, emit: 3 }, material: glowMaterial, shadows: false },
};

const unitBox = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
const tmpColor = new THREE.Color();

export function mat4(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4();
  m.compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
    new THREE.Vector3(sx, sy, sz)
  );
  return m;
}

export class Batcher {
  constructor() {
    this.parts = { solid: [], foliage: [], glow: [] };
    this.stack = [new THREE.Matrix4()];
  }

  get top() {
    return this.stack[this.stack.length - 1];
  }

  push(matrix) {
    this.stack.push(this.top.clone().multiply(matrix));
  }

  pop() {
    this.stack.pop();
  }

  // Run fn with a local transform (position + yaw) pushed.
  at(x, y, z, ry, fn) {
    this.push(mat4(x, y, z, ry));
    fn();
    this.pop();
  }

  add(bucket, geometry, matrix, hex, attrs = {}) {
    const def = BUCKETS[bucket];
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    for (const key of Object.keys(g.attributes)) {
      if (key !== 'position') g.deleteAttribute(key);
    }
    g.applyMatrix4(this.top.clone().multiply(matrix));
    g.computeVertexNormals();

    const count = g.attributes.position.count;
    const colors = new Float32Array(count * 3);
    tmpColor.set(hex);
    const jitter = attrs.jitter ?? 0;
    for (let i = 0; i < count; i += 3) {
      const k = jitter ? 1 + (Math.random() - 0.5) * jitter : 1;
      for (let v = 0; v < 3 && i + v < count; v += 1) {
        colors[(i + v) * 3] = tmpColor.r * k;
        colors[(i + v) * 3 + 1] = tmpColor.g * k;
        colors[(i + v) * 3 + 2] = tmpColor.b * k;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    for (const [name, size] of Object.entries(def.attrs)) {
      const data = new Float32Array(count * size);
      let value = attrs[name] ?? 0;
      if (name === 'emit') value = new THREE.Color(attrs.emit ?? hex);
      if (name === 'sway' && typeof value === 'function') {
        const pos = g.attributes.position;
        for (let i = 0; i < count; i += 1) data[i] = value(pos.getX(i), pos.getY(i), pos.getZ(i));
      } else {
        for (let i = 0; i < count; i += 1) {
          if (size === 1) data[i] = value;
          else {
            data[i * 3] = value.r;
            data[i * 3 + 1] = value.g;
            data[i * 3 + 2] = value.b;
          }
        }
      }
      g.setAttribute(name, new THREE.BufferAttribute(data, size));
    }
    this.parts[bucket].push(g);
    return g;
  }

  // Axis-aligned box centred on (x, y, z) in the current local frame.
  box(bucket, w, h, d, x, y, z, hex, opts = {}) {
    const m = mat4(x, y, z, opts.ry ?? 0, opts.rx ?? 0, opts.rz ?? 0, w, h, d);
    return this.add(bucket, unitBox, m, hex, opts);
  }

  // Box whose bottom sits at y.
  block(bucket, w, h, d, x, y, z, hex, opts = {}) {
    return this.box(bucket, w, h, d, x, y + h / 2, z, hex, opts);
  }

  geo(bucket, geometry, x, y, z, hex, opts = {}) {
    const m = mat4(x, y, z, opts.ry ?? 0, opts.rx ?? 0, opts.rz ?? 0, opts.sx ?? 1, opts.sy ?? 1, opts.sz ?? 1);
    return this.add(bucket, geometry, m, hex, opts);
  }

  build(parent) {
    const meshes = [];
    for (const [bucket, list] of Object.entries(this.parts)) {
      if (!list.length) continue;
      const def = BUCKETS[bucket];
      const merged = mergeGeometries(list, false);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, def.material());
      mesh.castShadow = def.shadows;
      mesh.receiveShadow = def.shadows;
      mesh.name = `batch:${bucket}`;
      parent.add(mesh);
      meshes.push(mesh);
    }
    return meshes;
  }
}

// Gable roof prism: ridge runs along local X. Width w (x), depth d (z),
// rise h. Bottom plane at y = 0.
export function gableGeometry(w, d, h) {
  const hw = w / 2;
  const hd = d / 2;
  const p = [
    [-hw, 0, hd], [hw, 0, hd], [hw, h, 0], [-hw, h, 0], // front slope
    [hw, 0, -hd], [-hw, 0, -hd], [-hw, h, 0], [hw, h, 0], // back slope
  ];
  const verts = [];
  const quad = (a, b, c, e) => verts.push(...a, ...b, ...c, ...a, ...c, ...e);
  quad(p[0], p[1], p[2], p[3]);
  quad(p[4], p[5], p[6], p[7]);
  // gable ends
  verts.push(-hw, 0, -hd, -hw, 0, hd, -hw, h, 0);
  verts.push(hw, 0, hd, hw, 0, -hd, hw, h, 0);
  // underside
  quad([-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  return g;
}

// Hip roof: ridge along X of length (w - d), all four sides sloped.
export function hipGeometry(w, d, h) {
  const hw = w / 2;
  const hd = d / 2;
  const r = Math.max(0.001, hw - hd * 0.9);
  const A = [-hw, 0, hd];
  const B = [hw, 0, hd];
  const C = [hw, 0, -hd];
  const D = [-hw, 0, -hd];
  const R1 = [-r, h, 0];
  const R2 = [r, h, 0];
  const verts = [];
  const tri = (a, b, c) => verts.push(...a, ...b, ...c);
  tri(A, B, R2); tri(A, R2, R1); // front
  tri(C, D, R1); tri(C, R1, R2); // back
  tri(B, C, R2); // right
  tri(D, A, R1); // left
  tri(A, D, C); tri(A, C, B); // underside
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  return g;
}

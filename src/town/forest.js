import * as THREE from 'three';
import { Batcher } from './batcher.js';
import { makeRng } from './rng.js';

// Instanced trees for large areas: each species is built once with the same
// generators as the hand-placed trees, then drawn thousands of times.

function speciesGeometry(build) {
  const B = new Batcher();
  build(B);
  const holder = new THREE.Group();
  const [mesh] = B.build(holder);
  return mesh;
}

export function createForest(parent, species, points) {
  // species: [{ name, build(B) }], points: [{ x, y, z, s, kind }]
  const meshes = [];
  const rng = makeRng(404);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  species.forEach((sp, k) => {
    const list = points.filter((p) => p.kind === k);
    if (!list.length) return;
    const proto = speciesGeometry(sp.build);
    const inst = new THREE.InstancedMesh(proto.geometry, proto.material, list.length);
    list.forEach((p, i) => {
      q.setFromAxisAngle(up, rng.next() * Math.PI * 2);
      m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
      inst.setMatrixAt(i, m);
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.name = `forest:${sp.name}`;
    inst.computeBoundingSphere();
    parent.add(inst);
    meshes.push(inst);
  });
  return meshes;
}

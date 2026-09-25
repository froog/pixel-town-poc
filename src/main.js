import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Batcher } from './town/batcher.js';
import { makeRng } from './town/rng.js';
import { shared, toonRamp } from './town/materials.js';
import { buildSea, buildTerrain, heightAt, roadBHeight, SEA, TRACK_Z } from './town/terrain.js';
import { buildClouds, buildSkyDome, sampleSky, sunDirection } from './town/sky.js';
import { garageHouse, groundRange, house, shrineComplex, shrineHall, station } from './town/buildings.js';
import {
  bigTree, bush, curveMirror, harbour, hydrangea, lighthouseIsland, lowWall, mountains, noticeBoard,
  pineTree, playground, ricePaddies, postBox, railway, recycleBins, roads, roundTree, schoolSign, stonePillar,
  utilityPole, vendingMachine, wires,
} from './town/props.js';
import {
  createBoats, createCat, createCrossing, createFireflies, createGulls, createLighthouseBeam, createTraffic, createTram,
} from './town/life.js';
import { PixelPass } from './town/pixelPass.js';
import { updateSigns } from './town/signs.js';
import { tubeMaterial } from './town/tunnel.js';
import { Soundscape } from './town/audio.js';
import { buildRural } from './town/rural.js';
import { createWalker, zoneAt } from './town/walk.js';
import { DENSITY, LITE } from './town/quality.js';
import { PLATEAU, PLATFORM, SHRINE, STAIRS, STATION_STOP_X } from './town/layout.js';

const $ = (sel) => document.querySelector(sel);

// Building runs in stages so the loading text updates between them.
const tick = (label) => {
  $('#loading').textContent = `海見町 · ${label}…`;
  return new Promise((resolve) => setTimeout(resolve, 0));
};

// ------------------------------------------------------------------ renderer

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
$('#app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9ad8f5, 60, 260);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.3, 700);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 3;
controls.maxDistance = 95;
controls.maxPolarAngle = 1.48;
controls.autoRotateSpeed = 0.35;

const pixel = new PixelPass(renderer, scene, camera);

// ------------------------------------------------------------------ lights

const hemi = new THREE.HemisphereLight(0xbfeeff, 0x5c6e4f, 1.4);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1c4, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(LITE ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 160 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
sun.target.position.set(0, 0, -6);

// ------------------------------------------------------------------ world

const rng = makeRng(2026);
const world = new THREE.Group();
scene.add(world);
const decor = new THREE.Group(); // textured signs etc.
world.add(decor);

const sky = buildSkyDome();
sky.layers.set(1);
scene.add(sky);
const clouds = buildClouds();
scene.add(clouds);

await tick('shaping the hills');
const terrain = new THREE.Mesh(
  buildTerrain(),
  new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp })
);
terrain.receiveShadow = true;
terrain.castShadow = true;
terrain.name = 'terrain';
world.add(terrain);

const sea = buildSea();
world.add(sea);

const far = new THREE.Mesh(mountains(makeRng(8)), new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp }));
far.name = 'mountains';
world.add(far);

const B = new Batcher();
const occupied = [];
const free = (x, z, r) => occupied.every(([ox, oz, or]) => Math.hypot(x - ox, z - oz) > r + or);
const claim = (x, z, r) => occupied.push([x, z, r]);

// roads, railway, station, shrine
decor.add(...roads(B, rng, decor));
railway(B, decor);
station(B, decor);
shrineComplex(B, rng, { procedural: false });
claim((PLATEAU.x0 + PLATEAU.x1) / 2, (PLATEAU.z0 + PLATEAU.z1) / 2, 7);
claim(STAIRS.x, 4.5, 2.5);
claim(11, -5, 8);

const hallBatch = new Batcher();
const plaque = shrineHall(hallBatch);
const hall = new THREE.Group();
hall.name = 'shrine:procedural';
hallBatch.build(hall);
hall.add(plaque);
world.add(hall);

// corner house, walls, street furniture
garageHouse(B, -4.4, -3.9);
claim(-4.4, -3.9, 2.2);
lowWall(B, PLATEAU.x1, -2.95, 2.2);
lowWall(B, -2.4, 2.2, -2.95, 0.9, { axis: 'z' });
schoolSign(decor, -4.3, 0.55, 2.37);
noticeBoard(B, decor, -8.3, 4.1, 0.25);
stonePillar(B, decor, STAIRS.x - 2.2, 6.2, '夏山神社');
vendingMachine(B, rng, 3.4, -4.12, 0, 0x2a62c8);
vendingMachine(B, rng, 4.3, -4.12, 0, 0xe8e8e0);
recycleBins(B, 5.0, -4.0);
postBox(B, -2.3, 7.8);
curveMirror(B, 2.5, -0.1, -0.7);
const swings = playground(B, world, 7.2, 4.8);
claim(7.2, 4.8, 3.6);

await tick('building houses');
// town houses on the slope down to the harbour
for (let gz = -11; gz > -30; gz -= 3.9) {
  for (let gx = -40; gx < 44; gx += 4.3) {
    const x = gx + rng.range(-0.8, 0.8);
    const z = gz + rng.range(-0.6, 0.6);
    if (Math.abs(x) < 4.6) continue;
    const h = heightAt(x, z);
    if (h < SEA + 0.6 || h > 9) continue;
    if (!rng.chance(0.8)) continue;
    if (!free(x, z, 1.6)) continue;
    const { lo, hi } = groundRange(x, z, 3, 2.6);
    if (hi - lo > 1.6) continue;
    house(B, rng, { x, z, ry: rng.range(-0.12, 0.12) });
    claim(x, z, 1.7);
  }
}
// houses on the hills behind the shrine and to the east
for (const [x0, x1, z0, z1] of [[-40, -19, -5, 14], [20, 42, 1.5, 14]]) {
  for (let gz = z0; gz < z1; gz += 4.2) {
    for (let gx = x0; gx < x1; gx += 4.4) {
      const x = gx + rng.range(-0.8, 0.8);
      const z = gz + rng.range(-0.6, 0.6);
      if (heightAt(x, z) > 11 || !rng.chance(0.7) || !free(x, z, 1.7)) continue;
      const { lo, hi } = groundRange(x, z, 3, 2.6);
      if (hi - lo > 1.1) continue;
      house(B, rng, { x, z, ry: rng.range(-0.3, 0.3) });
      claim(x, z, 1.8);
    }
  }
}
// foreground streets
for (const [x, z, ry] of [[-9, 10.5, 0.05], [-13.2, 11.2, -0.08], [-5.6, 12.8, 0], [11.5, 9, 0], [15.6, 8.6, 0.06], [19.8, 9.4, -0.05], [13.6, 13.5, 0]]) {
  house(B, rng, { x, z, ry });
  claim(x, z, 1.8);
}
// seaside row near the quay
for (let x = -9; x <= 9; x += 3.4) {
  if (Math.abs(x) < 3.5) continue;
  if (!free(x, -27.6, 1.4)) continue;
  house(B, rng, { x, z: -27.6, ry: Math.PI, floors: rng.pick([1, 2]), w: 2.4, d: 2.0 });
  claim(x, -27.6, 1.6);
}
harbour(B, rng);
ricePaddies(B, rng, -18.4, 15.6, -3.9, 30);
ricePaddies(B, rng, 3.6, 16.6, 25.2, 30);
claim(-11, 23, 8);
claim(14, 23, 9);
const beamPos = lighthouseIsland(B, 36, -64);

// terrace trees + garden planting
const T = PLATEAU.top;
bigTree(B, rng, -16.3, -4.3, 1.1, T);
bigTree(B, rng, -7.4, -4.4, 0.95, T);
bigTree(B, rng, -16.6, 1.0, 0.85, T);
roundTree(B, rng, -7.2, -0.8, 1.1, T);
roundTree(B, rng, -14.9, -4.4, 1.0, T);
pineTree(B, rng, -9.2, -4.8, 1.2, T);
pineTree(B, rng, -15.2, -1.6, 1.1, T);
for (let x = PLATEAU.x0 + 0.6; x < PLATEAU.x1; x += 0.9) {
  if (Math.abs(x - STAIRS.x) < STAIRS.width / 2 + 0.7) continue;
  hydrangea(B, rng, x + rng.range(-0.2, 0.2), PLATEAU.z1 + 0.55 + rng.range(-0.1, 0.2), rng.range(0.9, 1.2), 0);
}
for (let i = 0; i < 7; i += 1) {
  hydrangea(B, rng, -6.0 + i * 0.5, 1.6 + rng.range(-0.3, 0.2), rng.range(0.8, 1.1), 0);
}
roundTree(B, rng, -5.4, 0.6, 1.2, 0);
roundTree(B, rng, -3.4, 0.9, 0.9, 0);
for (let i = 0; i < 6; i += 1) hydrangea(B, rng, STAIRS.x + 2.4 + i * 0.55, 6.6 + rng.range(-0.2, 0.2), 1, 0);
for (let i = 0; i < 5; i += 1) hydrangea(B, rng, STAIRS.x - 4.6 + i * 0.55, 6.4 + rng.range(-0.2, 0.2), 1, 0);
for (let i = 0; i < 6; i += 1) bush(B, rng, 2.9 + i * 0.6, 1.1, 1, 0.05);
roundTree(B, rng, 4.2, 8.6, 1.15, 0);
roundTree(B, rng, 10.6, 3.2, 1.3, 0);
bigTree(B, rng, 3.8, 2.4, 0.8, 0);

// forests over the hills and between houses
await tick('planting forests');
for (let i = 0; i < 1400 * DENSITY; i += 1) {
  const x = rng.range(-68, 68);
  const z = rng.range(-46, 32);
  const h = heightAt(x, z);
  if (h < SEA + 0.8) continue;
  const hilly = h > 1.4 || Math.abs(x) > 22;
  if (!hilly && !rng.chance(0.08)) continue;
  if (Math.abs(x) < 3.2 && z < 34) continue;
  if (Math.abs(z - TRACK_Z) < 2 && x > -24 && x < 29) continue;
  if (Math.abs(z + 1.9) < 2.3 && x > 1) continue;
  if (x > 54) continue; // Yamate plants its own forest
  if (!free(x, z, 0.8)) continue;
  const s = rng.range(0.8, 1.5) * (hilly ? 1.1 : 0.9);
  if (rng.chance(0.4)) pineTree(B, rng, x, z, s);
  else roundTree(B, rng, x, z, s);
  claim(x, z, 0.5);
}

// Yamate valley beyond the road tunnel
await tick('farming Yamate');
const rural = buildRural(B, decor, rng, world);

// utility poles + wires
const chains = [rural.chain];
const chainA = [6.6, 0.4, -10.4, -16, -21.6, -27.2].map((z, i) => utilityPole(B, 2.45, z, 0, { lamp: i % 2 === 0, transformer: i === 1 }));
chains.push(chainA);
const chainB = [8.2, 14.6, 21, 27.4, 33.8].map((x, i) => utilityPole(B, x, 0.6, Math.PI / 2, { lamp: i % 2 === 0 }));
chains.push([chainA[1], ...chainB]);
const chainW = [16, 9.2].map((z) => utilityPole(B, -2.5, z, 0, { lamp: true }));
chains.push(chainW);
const wireLines = wires(chains);
wireLines.layers.set(1);
world.add(wireLines);

await tick('merging geometry');
const staticMeshes = B.build(world);

// ------------------------------------------------------------------ life

await tick('waking the town');
const tram = createTram(world);
const crossing = createCrossing(world);
const traffic = createTraffic(world);
const boats = createBoats(world);
const gulls = createGulls(world);
const fireflies = createFireflies(world, rural.fireflySpots);
const beam = createLighthouseBeam(world, beamPos);
const cat = createCat(world, -4.9, 0.98, 2.2);

// warm pools of light after dark
const nightLights = [
  [0xffb050, STAIRS.x - 1.9, T + 1.0, PLATEAU.z1 - 2.9, 7],
  [0xffb050, STAIRS.x + 1.9, T + 1.0, PLATEAU.z1 - 2.9, 7],
  [0xffb050, STAIRS.x, 1.0, PLATEAU.z1 + 3.6, 6],
  [0xd8ecff, 3.9, 1.2, -3.3, 9],
  [0xf8fff0, STATION_STOP_X, PLATFORM.top + 2.0, -5.3, 10],
  [0xfff0c8, 2.45, 3.2, 7.6, 8],
  [0xfff0c8, -2.5, 3.2, 9.8, 8],
  [0xfff0c8, 2.45, 3.2, -10.4, 8],
  ...rural.lights,
].map(([c, x, y, z, s]) => {
  const l = new THREE.PointLight(c, 0, 9, 1.6);
  l.position.set(x, y, z);
  l.userData.strength = s;
  world.add(l);
  return l;
});

// ------------------------------------------------------------------ GLB shrine (pipeline asset)

let glbShrine = null;
let shrineMode = 'procedural';
function loadGlbShrine() {
  if (glbShrine) return Promise.resolve(glbShrine);
  return new Promise((resolve, reject) => {
    new GLTFLoader().load('./assets/generated/shrine_01_simple_clean.glb', (gltf) => {
      const inner = gltf.scene;
      inner.traverse((child) => {
        if (!child.isMesh) return;
        const hasColors = Boolean(child.geometry.attributes.color);
        if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals();
        child.material = new THREE.MeshToonMaterial({ vertexColors: hasColors, color: hasColors ? 0xffffff : 0x9db3bf, gradientMap: toonRamp, side: THREE.DoubleSide });
        child.castShadow = true;
        child.receiveShadow = true;
      });
      // rotation recorded in shrine_01_simple_cleanup_meta.json
      inner.rotation.set(THREE.MathUtils.degToRad(-90), 0, THREE.MathUtils.degToRad(45));
      const box = new THREE.Box3().setFromObject(inner);
      inner.position.sub(box.getCenter(new THREE.Vector3()));
      inner.position.y -= new THREE.Box3().setFromObject(inner).min.y;
      const wrap = new THREE.Group();
      wrap.add(inner);
      wrap.scale.setScalar(2.1);
      wrap.position.set(SHRINE.x, PLATEAU.top + 0.05, SHRINE.z - 0.2);
      wrap.name = 'shrine:triposr';
      glbShrine = wrap;
      world.add(wrap);
      resolve(wrap);
    }, undefined, reject);
  });
}

async function setShrineMode(mode) {
  shrineMode = mode;
  $('#shrine-mode').textContent = mode === 'procedural' ? 'Shrine: built' : 'Shrine: TripoSR';
  if (mode === 'triposr') {
    try {
      await loadGlbShrine();
    } catch (error) {
      console.error(error);
      toast('Could not load the TripoSR shrine GLB');
      shrineMode = 'procedural';
    }
  }
  hall.visible = shrineMode === 'procedural';
  if (glbShrine) glbShrine.visible = shrineMode === 'triposr';
}

// ------------------------------------------------------------------ cameras

const PRESETS = {
  street: { pos: [3.2, 8.4, 25], target: [0.4, 0.8, -7.5], label: 'Street' },
  shrine: { pos: [-3.2, 7.2, 13.5], target: [-11.6, 2.4, -1.2], label: 'Shrine' },
  station: { pos: [23, 6.6, 7.5], target: [10.5, 0.8, -6.2], label: 'Station' },
  harbour: { pos: [17, 11, -11], target: [0, -2.6, -34], label: 'Harbour' },
  diorama: { pos: [46, 42, 38], target: [0, -1, -8], label: 'Diorama' },
  yamate: { pos: [96, 19, 50], target: [128, 3, 10], label: 'Yamate' },
};
let tween = null;
function goTo(name, instant = false) {
  const p = PRESETS[name];
  if (!p) return;
  if (walker.active) walker.exit();
  document.querySelectorAll('[data-cam]').forEach((b) => b.classList.toggle('on', b.dataset.cam === name));
  const to = { pos: new THREE.Vector3(...p.pos), target: new THREE.Vector3(...p.target) };
  if (instant) {
    camera.position.copy(to.pos);
    controls.target.copy(to.target);
    controls.update();
    return;
  }
  tween = { from: { pos: camera.position.clone(), target: controls.target.clone() }, to, t: 0 };
}

// ------------------------------------------------------------------ walking

const orbitView = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
const walker = createWalker({
  camera,
  canvas: renderer.domElement,
  onZone: (name) => toast(name),
  onExit: (mode) => {
    document.body.classList.remove('walking', 'flying');
    $('#walk').classList.remove('on');
    $('#fly').classList.remove('on');
    camera.fov = 38;
    camera.near = 0.3;
    camera.updateProjectionMatrix();
    if (mode === 'fly') {
      // stay where we flew to, orbiting a point just ahead
      const ahead = new THREE.Vector3();
      camera.getWorldDirection(ahead);
      controls.target.copy(camera.position).addScaledVector(ahead, 14);
      controls.target.y = Math.max(controls.target.y, heightAt(controls.target.x, controls.target.z));
    } else {
      camera.position.copy(orbitView.pos);
      controls.target.copy(orbitView.target);
    }
    controls.enabled = true;
    controls.update();
  },
});
function leaveOrbit() {
  tween = null;
  orbitView.pos.copy(camera.position);
  orbitView.target.copy(controls.target);
  controls.enabled = false;
  controls.autoRotate = false;
  $('#orbit').classList.remove('on');
  camera.fov = 62;
  camera.near = 0.05;
  camera.updateProjectionMatrix();
  document.body.classList.add('walking');
  document.querySelectorAll('[data-cam]').forEach((b) => b.classList.remove('on'));
}
function setModeUi(mode) {
  document.body.classList.toggle('flying', mode === 'fly');
  $('#walk').classList.toggle('on', mode === 'walk');
  $('#fly').classList.toggle('on', mode === 'fly');
}
function toggleFly() {
  if (walker.active && walker.mode === 'fly') {
    walker.exit();
    return;
  }
  if (!walker.active) leaveOrbit();
  else camera.position.y += 1.5; // take off from a walk
  walker.fly();
  setModeUi('fly');
  toast('Fly: WASD · R up · F down · Shift fast');
}
function toggleWalk() {
  if (walker.active && walker.mode === 'fly') {
    walker.land();
    setModeUi('walk');
    return;
  }
  if (walker.active) {
    walker.exit();
    return;
  }
  leaveOrbit();
  setModeUi('walk');
  // start near whatever the camera was looking at
  const t = controls.target;
  if (t.x > 62) walker.enter(66, -2.9, -Math.PI / 2);
  else if (t.x < -6 && t.z > -6) walker.enter(STAIRS.x, 7.5, 0);
  else if (t.x > 6 && t.z > -8) walker.enter(9.2, -5.1, -1.2);
  else if (t.z < -20) walker.enter(-2.2, -24, Math.PI);
  else walker.enter(-2.2, 10, 0);
}

// ------------------------------------------------------------------ time of day

const state = {
  hour: 15.5,
  playing: true,
  speed: 1 / 14, // game hours per real second
  night: 0,
};
const tmpDir = new THREE.Vector3();
const lightDir = new THREE.Vector3(0.3, 1, -0.2).normalize();
function applyTimeOfDay() {
  const s = sampleSky(state.hour);
  state.night = s.night;
  shared.uNight.value = s.night;
  sky.material.uniforms.uTop.value.copy(s.top);
  sky.material.uniforms.uHorizon.value.copy(s.horizon);
  sky.material.uniforms.uSunColor.value.copy(s.sun);
  sunDirection(state.hour, tmpDir);
  sky.material.uniforms.uSunDir.value.copy(tmpDir);

  const up = tmpDir.y > -0.05;
  lightDir.copy(up ? tmpDir : tmpDir.clone().negate());
  lightDir.y = Math.max(lightDir.y, 0.18);
  lightDir.normalize();
  sun.color.copy(up ? s.sun : new THREE.Color(0x8fa8ff));
  sun.intensity = up ? s.sunIntensity * THREE.MathUtils.smoothstep(tmpDir.y, -0.05, 0.12) + (1 - THREE.MathUtils.smoothstep(tmpDir.y, -0.05, 0.12)) * 0.35 : 0.35;
  hemi.color.copy(s.hemiSky);
  hemi.groundColor.copy(s.hemiGround);
  hemi.intensity = THREE.MathUtils.lerp(1.5, 0.9, s.night);
  scene.fog.color.copy(s.horizon);

  const seaU = sea.material.uniforms;
  seaU.uSky.value.copy(s.horizon);
  seaU.uSunDir.value.copy(up ? tmpDir : tmpDir.clone().negate());
  seaU.uSunColor.value.copy(up ? s.sun : new THREE.Color(0x9ab0ff));
  seaU.uDeep.value.set(0x1f63b8).lerp(new THREE.Color(0x0c1a3a), s.night);
  seaU.uShallow.value.set(0x3fb8d8).lerp(new THREE.Color(0x1a3a5a), s.night);

  const cloudTint = new THREE.Color(0xffffff).lerp(s.sun, 0.35).lerp(new THREE.Color(0x6a78a8), s.night * 0.8);
  clouds.userData.material.color.copy(cloudTint);

  for (const l of nightLights) l.intensity = l.userData.strength * THREE.MathUtils.smoothstep(s.night, 0.25, 0.8);
  updateSigns(s.night);
  tubeMaterial.color.setScalar(THREE.MathUtils.lerp(1, 0.45, s.night));

  const h = Math.floor(state.hour);
  const m = Math.floor((state.hour - h) * 60);
  $('#clock').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  $('#time').value = state.hour;
  $('#period').textContent = periodName(state.hour);
}

function periodName(h) {
  if (h < 4.5) return '夜 · night';
  if (h < 6.8) return '夜明け · dawn';
  if (h < 11) return '朝 · morning';
  if (h < 16.5) return '昼 · afternoon';
  if (h < 19.2) return '夕方 · dusk';
  return '夜 · night';
}

// ------------------------------------------------------------------ UI

const sound = new Soundscape();
let toastTimer = 0;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  pixel.setSize(window.innerWidth, window.innerHeight);
  $('#px').textContent = pixel.enabled ? `${pixel.pixelSize}×` : 'off';
}
window.addEventListener('resize', resize);

function setPixel(size) {
  if (size < 1) {
    pixel.enabled = false;
  } else {
    pixel.enabled = true;
    pixel.pixelSize = Math.min(8, size);
  }
  resize();
}

$('#time').addEventListener('input', (e) => {
  state.hour = Number(e.target.value);
  applyTimeOfDay();
});
$('#play').addEventListener('click', togglePlay);
function togglePlay() {
  state.playing = !state.playing;
  $('#play').textContent = state.playing ? '❚❚' : '▶';
}
document.querySelectorAll('[data-cam]').forEach((b) => b.addEventListener('click', () => goTo(b.dataset.cam)));
$('#orbit').addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  $('#orbit').classList.toggle('on', controls.autoRotate);
});
$('#px-down').addEventListener('click', () => setPixel(pixel.enabled ? pixel.pixelSize - 1 : 0));
$('#px-up').addEventListener('click', () => setPixel(pixel.enabled ? pixel.pixelSize + 1 : 1));
$('#outlines').addEventListener('click', () => {
  pixel.outlines = !pixel.outlines;
  $('#outlines').classList.toggle('on', pixel.outlines);
});
$('#dither').addEventListener('click', () => {
  pixel.dither = !pixel.dither;
  $('#dither').classList.toggle('on', pixel.dither);
});
$('#sound').addEventListener('click', () => {
  if (sound.on) sound.stop();
  else sound.start();
  $('#sound').classList.toggle('on', sound.on);
  $('#sound').textContent = sound.on ? '♪ Sound on' : '♪ Sound';
});
$('#shrine-mode').addEventListener('click', () => setShrineMode(shrineMode === 'procedural' ? 'triposr' : 'procedural'));
$('#source').addEventListener('click', () => $('#source-full').classList.add('show'));
$('#source-full').addEventListener('click', () => $('#source-full').classList.remove('show'));
$('#postcard').addEventListener('click', () => {
  wantPostcard = true;
});
$('#walk').addEventListener('click', toggleWalk);
$('#fly').addEventListener('click', toggleFly);
for (const [id, v] of [['#fly-up', 1], ['#fly-down', -1]]) {
  const el = $(id);
  const on = (e) => { e.preventDefault(); walker.setLift(v); };
  const off = () => walker.setLift(0);
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointerleave', off);
  el.addEventListener('pointercancel', off);
}
$('#flag').addEventListener('click', flagView);
$('#hide').addEventListener('click', () => document.body.classList.toggle('bare'));

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'v') {
    toggleFly();
    return;
  }
  if (walker.active && 'wasdrf'.includes(k)) return; // movement keys
  if (k === 'f') {
    toggleWalk();
    return;
  }
  if (k === ' ') {
    togglePlay();
    e.preventDefault();
  } else if (k === 'h') document.body.classList.toggle('bare');
  else if (k === 'r') goTo('street');
  else if (k === '[') setPixel(pixel.enabled ? pixel.pixelSize - 1 : 0);
  else if (k === ']') setPixel(pixel.enabled ? pixel.pixelSize + 1 : 1);
  else if (k === 'n') {
    state.hour = state.night > 0.5 ? 13 : 21;
    applyTimeOfDay();
  } else if (k === 't') {
    tram.skip(20);
    toast('Tram schedule +20s');
  } else if (k === 'p') wantPostcard = true;
  else if (k === 'b') flagView();
  else if (k >= '1' && k <= '6') goTo(Object.keys(PRESETS)[Number(k) - 1]);
});

let wantPostcard = false;
let wantFlag = null;

// ------------------------------------------------------------------ viewport log
// Every couple of seconds (when something changed) the page posts where the
// camera is to scripts/serve.py, so a view can be discussed and replayed.
// A 🚩 flag adds a note and a screenshot. `#view=<json>` restores a view.

const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const sessionId = Math.random().toString(36).slice(2, 8);
function viewState() {
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  const heading = (((-THREE.MathUtils.radToDeg(e.y)) % 360) + 360) % 360;
  const st = {
    session: sessionId,
    mode: walker.active ? walker.mode : 'orbit',
    pos: camera.position.toArray().map((v) => round(v)),
    target: walker.active ? null : controls.target.toArray().map((v) => round(v)),
    yaw: round(e.y, 3),
    pitch: round(e.x, 3),
    heading: round(heading, 1),
    fov: camera.fov,
    zone: zoneAt(camera.position.x, camera.position.z, 0),
    hour: round(state.hour),
    playing: state.playing,
    tram: { x: round(tram.x, 1), stop: tram.stop, doors: round(tram.doorsOpen ?? 0) },
    pixel: pixel.enabled ? pixel.pixelSize : 0,
    outlines: pixel.outlines,
    shrine: shrineMode,
    lite: LITE,
    screen: [window.innerWidth, window.innerHeight, window.devicePixelRatio],
    ua: navigator.userAgent.replace(/^Mozilla\/5.0 /, '').slice(0, 140),
  };
  st.link = `${location.origin}${location.pathname}#view=${encodeURIComponent(JSON.stringify(replayable(st)))}`;
  return st;
}
function replayable(st) {
  return { mode: st.mode, pos: st.pos, target: st.target, yaw: st.yaw, pitch: st.pitch, hour: st.hour };
}
function applyView(v) {
  if (v.hour !== undefined) {
    state.hour = v.hour;
    state.playing = false;
    $('#play').textContent = '▶';
    applyTimeOfDay();
  }
  if (v.mode === 'fly') {
    if (!walker.active || walker.mode !== 'fly') toggleFly();
    camera.position.set(...v.pos);
    camera.quaternion.setFromEuler(new THREE.Euler(v.pitch ?? 0, v.yaw, 0, 'YXZ'));
  } else if (v.mode === 'walk') {
    if (!walker.active) toggleWalk();
    else if (walker.mode === 'fly') toggleWalk();
    walker.enter(v.pos[0], v.pos[2], v.yaw);
    const e = new THREE.Euler(v.pitch ?? 0, v.yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(e);
  } else {
    if (walker.active) walker.exit();
    tween = null;
    camera.position.set(...v.pos);
    controls.target.set(...(v.target ?? [0, 0, 0]));
    controls.update();
  }
}

let lastSent = '';
let sendTimer = 0;
function sendState(dt) {
  sendTimer -= dt;
  if (sendTimer > 0) return;
  sendTimer = 2;
  const st = viewState();
  const key = JSON.stringify({ ...st, link: '', hour: Math.round(state.hour * 4), tram: null });
  if (key === lastSent) return;
  lastSent = key;
  fetch('./api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(st), keepalive: true })
    .catch(() => {});
}
function flagView() {
  const note = window.prompt('What looks wrong here? (sent with a screenshot)', '');
  if (note === null) return;
  wantFlag = { note };
}
function sendFlag(note) {
  const st = viewState();
  const image = renderer.domElement.toDataURL('image/png');
  fetch('./api/flag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note, state: st, image }) })
    .then((r) => r.json())
    .then((r) => toast(r.ok ? `🚩 Flag sent (${r.id})` : 'Flag failed'))
    .catch(() => toast('Flag failed: no log server'));
}

function savePostcard() {
  const src = renderer.domElement;
  const scale = pixel.enabled ? pixel.pixelSize : 1;
  const out = document.createElement('canvas');
  out.width = src.width * scale;
  out.height = src.height * scale;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, out.width, out.height);
  const a = document.createElement('a');
  a.download = `umimi-cho-${$('#clock').textContent.replace(':', '')}.png`;
  a.href = out.toDataURL('image/png');
  a.click();
  toast('Postcard saved');
}

function tramStatus() {
  const x = tram.x;
  if (tram.stop === 'umimi') return '🚃 停車中 · tram at Umimi-chō';
  if (tram.stop === 'yamate') return '🚃 停車中 · tram at Yamate';
  if (Math.abs(tram.v) < 0.05) return '🚃 next tram from はまべ tunnel';
  if (tram.v > 0) return x < STATION_STOP_X ? '🚃 arriving at Umimi-chō…' : '🚃 bound for Yamate →';
  return x > STATION_STOP_X ? '🚃 ← bound for Umimi-chō' : '🚃 ← leaving for はまべ';
}

// ------------------------------------------------------------------ loop

const clock = new THREE.Clock();
let elapsed = 0;
let statusTimer = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  elapsed += dt;
  shared.uTime.value = elapsed;

  if (state.playing) {
    state.hour = (state.hour + dt * state.speed) % 24;
    applyTimeOfDay();
  }

  if (walker.active) walker.update(dt);
  else if (tween) {
    tween.t = Math.min(1, tween.t + dt / 1.8);
    const k = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
    camera.position.lerpVectors(tween.from.pos, tween.to.pos, k);
    controls.target.lerpVectors(tween.from.target, tween.to.target, k);
    if (tween.t >= 1) tween = null;
  }
  if (!walker.active) controls.update();
  // shadows follow whatever we're looking at
  const focus = walker.active ? camera.position : controls.target;
  sun.target.position.set(focus.x, 0, focus.z);
  sun.position.copy(sun.target.position).addScaledVector(lightDir, 70);

  tram.update(elapsed, dt);
  crossing.update(tram.crossing, elapsed, dt);
  traffic.update(dt, crossing.closed || tram.crossing);
  boats.update(elapsed);
  gulls.update(elapsed);
  fireflies.update(elapsed, state.night);
  beam.update(elapsed, state.night);
  cat.update(elapsed);
  swings(elapsed);
  rural.update(elapsed);
  clouds.userData.update(dt);
  sound.update(elapsed, state.night, tram.crossing, 1 - Math.min(1, camera.position.distanceTo(new THREE.Vector3(0, 0, TRACK_Z)) / 60));

  statusTimer -= dt;
  if (statusTimer <= 0) {
    $('#tram').textContent = tramStatus();
    statusTimer = 0.5;
  }

  renderer.shadowMap.needsUpdate = true;
  pixel.render(state.night);
  sendState(dt);
  if (wantFlag) {
    const { note } = wantFlag;
    wantFlag = null;
    sendFlag(note);
  }
  if (wantPostcard) {
    wantPostcard = false;
    savePostcard();
  }
  requestAnimationFrame(frame);
}

resize();
goTo('street', true);
const viewParam = location.hash.match(/view=([^&]+)/);
applyTimeOfDay();
$('#loading').classList.add('done');
frame();
if (viewParam) {
  try {
    applyView(JSON.parse(decodeURIComponent(viewParam[1])));
  } catch (error) {
    console.warn('bad #view link', error);
  }
}

// handy for poking around from the console
window.town = { exitMode: () => walker.active && walker.exit(), toggleFly, viewState, applyView, heightAt, walker, toggleWalk, applyTimeOfDay, scene, camera, controls, state, tram, traffic, pixel, staticMeshes, goTo, setShrineMode, roadBHeight };

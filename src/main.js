import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const app = document.querySelector('#app');
const statusEl = document.querySelector('#status');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87d7f4);
scene.fog = new THREE.Fog(0x87d7f4, 7, 18);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.01, 100);
const defaultCamera = new THREE.Vector3(2.15, 1.2, 4.6);
camera.position.copy(defaultCamera);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.72, 0);
controls.minDistance = 2.2;
controls.maxDistance = 9;
controls.maxPolarAngle = Math.PI * 0.48;

const hemi = new THREE.HemisphereLight(0xbfeeff, 0x5c6e4f, 2.15);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff1c4, 2.2);
sun.position.set(3.5, 5, 2.5);
scene.add(sun);

const fill = new THREE.DirectionalLight(0x8fd7ff, 0.8);
fill.position.set(-4, 2.5, -3);
scene.add(fill);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(3.2, 48),
  new THREE.MeshStandardMaterial({ color: 0xbcd7a0, roughness: 0.9, metalness: 0 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.015;
scene.add(ground);

const grid = new THREE.GridHelper(6, 24, 0x7ba0a0, 0x9fc8b4);
grid.position.y = 0.002;
grid.material.opacity = 0.22;
grid.material.transparent = true;
scene.add(grid);

const contactShadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.95, 32),
  new THREE.MeshBasicMaterial({
    color: 0x5d705c,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  })
);
contactShadow.rotation.x = -Math.PI / 2;
contactShadow.scale.set(1.25, 0.7, 1);
contactShadow.position.y = 0.006;
scene.add(contactShadow);

function applyBrowserMaterial(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;

    child.castShadow = false;
    child.receiveShadow = false;

    const hasVertexColors = Boolean(child.geometry?.attributes?.color);
    child.material = new THREE.MeshBasicMaterial({
      vertexColors: hasVertexColors,
      color: hasVertexColors ? 0xffffff : 0x9db3bf,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
  });
}

function frameObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);

  const groundedBox = new THREE.Box3().setFromObject(object);
  object.position.y -= groundedBox.min.y;

  controls.target.set(0, 0.72, 0);
  camera.position.copy(defaultCamera);
  controls.update();
}

const loader = new GLTFLoader();
loader.load(
  './assets/generated/shrine_01_simple_clean.glb',
  (gltf) => {
    const shrine = gltf.scene;
    applyBrowserMaterial(shrine);
    shrine.rotation.set(0.08, -0.8, -0.32);
    frameObject(shrine);
    scene.add(shrine);
    statusEl.textContent = 'Loaded assets/generated/shrine_01_simple_clean.glb';
  },
  undefined,
  (error) => {
    console.error(error);
    statusEl.textContent = 'Could not load the shrine GLB. Serve this folder over HTTP.';
  }
);

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() !== 'r') return;
  camera.position.copy(defaultCamera);
  controls.target.set(0, 0.72, 0);
  controls.update();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

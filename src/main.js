import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const app = document.querySelector('#app');
const statusEl = document.querySelector('#status');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87d7f4);
scene.fog = new THREE.Fog(0x87d7f4, 9, 22);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.01, 100);
const defaultCamera = new THREE.Vector3(4.4, 2.15, 7.2);
camera.position.copy(defaultCamera);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.65, 0);
controls.minDistance = 3.2;
controls.maxDistance = 13;
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
  new THREE.CircleGeometry(5.2, 64),
  new THREE.MeshStandardMaterial({ color: 0xbcd7a0, roughness: 0.9, metalness: 0 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.015;
scene.add(ground);

const grid = new THREE.GridHelper(10, 32, 0x7ba0a0, 0x9fc8b4);
grid.position.y = 0.002;
grid.material.opacity = 0.22;
grid.material.transparent = true;
scene.add(grid);

const assets = [
  {
    label: 'Clean shrine',
    path: './assets/generated/shrine_01_simple_clean.glb',
    x: -3.2,
    targetHeight: 1.55,
    rotation: new THREE.Euler(0.08, -0.8, -0.32),
    fallbackColor: 0x9db3bf,
  },
  {
    label: 'Prompt shrine',
    path: './assets/generated/shrine_01_prompt3d_raw.glb',
    x: -1.6,
    targetHeight: 1.2,
    rotation: new THREE.Euler(0, -0.55, 0),
    fallbackColor: 0xa9b4c0,
  },
  {
    label: 'Blue house',
    path: './assets/generated/house_blue_01_prompt3d_raw.glb',
    x: 0,
    targetHeight: 1.2,
    rotation: new THREE.Euler(0, -0.55, 0),
    fallbackColor: 0x4d8fc8,
  },
  {
    label: 'Train',
    path: './assets/generated/train_01_prompt3d_raw.glb',
    x: 1.6,
    targetHeight: 0.95,
    rotation: new THREE.Euler(0, -0.3, 0),
    fallbackColor: 0xd6ca7a,
  },
  {
    label: 'Vending',
    path: './assets/generated/vending_machine_01_prompt3d_raw.glb',
    x: 3.2,
    targetHeight: 1.15,
    rotation: new THREE.Euler(0, -0.45, 0),
    fallbackColor: 0x2f77c5,
  },
];

function applyBrowserMaterial(root, fallbackColor) {
  root.traverse((child) => {
    if (!child.isMesh) return;

    child.castShadow = false;
    child.receiveShadow = false;

    const hasVertexColors = Boolean(child.geometry?.attributes?.color);
    child.material = new THREE.MeshBasicMaterial({
      vertexColors: hasVertexColors,
      color: hasVertexColors ? 0xffffff : fallbackColor,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
  });
}

function normalizeObject(object, targetHeight) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);

  const size = box.getSize(new THREE.Vector3());
  const height = Math.max(size.y, 0.001);
  object.scale.setScalar(targetHeight / height);

  const groundedBox = new THREE.Box3().setFromObject(object);
  object.position.y -= groundedBox.min.y;
}

function createContactShadow(x, radius) {
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 32),
    new THREE.MeshBasicMaterial({
      color: 0x5d705c,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1.25, 0.7, 1);
  shadow.position.set(x, 0.006, 0);
  scene.add(shadow);
}

function createLabel(text, x) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgba(255, 255, 255, 0.82)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#153142';
  context.font = '600 44px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  label.position.set(x, 0.08, 1.08);
  label.scale.set(0.9, 0.225, 1);
  scene.add(label);
}

function resetCamera() {
  controls.target.set(0, 0.65, 0);
  camera.position.copy(defaultCamera);
  controls.update();
}

const loader = new GLTFLoader();
let loadedCount = 0;
let failedCount = 0;

function updateStatus() {
  const total = assets.length;
  const failed = failedCount ? `, ${failedCount} failed` : '';
  statusEl.textContent = `Loaded ${loadedCount}/${total} GLBs${failed}`;
}

assets.forEach((asset) => {
  createContactShadow(asset.x, asset.label === 'Clean shrine' ? 0.75 : 0.48);
  createLabel(asset.label, asset.x);

  loader.load(
    asset.path,
    (gltf) => {
      const object = gltf.scene;
      applyBrowserMaterial(object, asset.fallbackColor);
      object.rotation.copy(asset.rotation);
      normalizeObject(object, asset.targetHeight);
      object.position.x = asset.x;
      scene.add(object);
      loadedCount += 1;
      updateStatus();
    },
    undefined,
    (error) => {
      console.error(`Could not load ${asset.path}`, error);
      failedCount += 1;
      updateStatus();
    }
  );
});

updateStatus();
resetCamera();

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() !== 'r') return;
  resetCamera();
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

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Character } from './Character.js';
import { CITY, CAMERA } from './constants.js';

const container = document.getElementById('app');
const loading = document.getElementById('loading');
const instructions = document.getElementById('instructions');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.6;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const bgCanvas = document.createElement('canvas');
bgCanvas.width = 1;
bgCanvas.height = 512;
const ctx = bgCanvas.getContext('2d');
const grad = ctx.createLinearGradient(0, 0, 0, 512);
grad.addColorStop(0, '#000011');
grad.addColorStop(0.4, '#0a0a2a');
grad.addColorStop(0.7, '#1a0a2a');
grad.addColorStop(1, '#2a0a1a');
ctx.fillStyle = grad;
ctx.fillRect(0, 0, 1, 512);
scene.background = new THREE.CanvasTexture(bgCanvas);
scene.fog = new THREE.FogExp2(0x0a0a1a, 0.0015);

const camera = new THREE.PerspectiveCamera(CAMERA.FOV, window.innerWidth / window.innerHeight, CAMERA.NEAR, CAMERA.FAR);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 1.5;
pmrem.dispose();

const ambient = new THREE.AmbientLight(0x4444aa, 0.8);
scene.add(ambient);

const hemi = new THREE.HemisphereLight(0x8888cc, 0x444488, 1.5);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xaaccff, 3.5);
dir.position.set(10, 20, 10);
dir.castShadow = true;
dir.shadow.mapSize.width = 2048;
dir.shadow.mapSize.height = 2048;
dir.shadow.camera.near = 0.5;
dir.shadow.camera.far = 80;
dir.shadow.camera.left = -30;
dir.shadow.camera.right = 30;
dir.shadow.camera.top = 30;
dir.shadow.camera.bottom = -30;
scene.add(dir);

const dir2 = new THREE.DirectionalLight(0xff4488, 1.0);
dir2.position.set(-10, 5, -10);
scene.add(dir2);

const grid = new THREE.GridHelper(200, 50, 0x0044ff, 0x222244);
grid.position.y = 0.01;
scene.add(grid);

// Stars
const starCount = 2000;
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(starCount * 3);
for (let i = 0; i < starCount * 3; i++) {
  const r = 300 + Math.random() * 200;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
  starPos[i * 3 + 1] = Math.abs(r * Math.cos(phi));
  starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({
  color: 0xaaaaff,
  size: 0.3,
  transparent: true,
  opacity: 0.6,
  blending: THREE.AdditiveBlending,
});
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.4, 0.2, 0.05
);
composer.addPass(bloom);

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
});

async function loadCity() {
  console.log('Loading GLB from:', CITY.MODEL_PATH);
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(CITY.MODEL_PATH);
  const model = gltf.scene;
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  console.log('Model loaded - Size:', size.x.toFixed(1), size.y.toFixed(1), size.z.toFixed(1));

  model.position.x -= center.x;
  model.position.z -= center.z;
  model.traverse((child) => {
    if (child.isMesh) {
      child.receiveShadow = true;
      if (child.material && !child.material.envMap) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => { m.envMap = scene.environment; m.envMapIntensity = 0.6; });
        } else {
          child.material.envMap = scene.environment;
          child.material.envMapIntensity = 0.6;
        }
      }
    }
  });
  scene.add(model);

  return { center, size };
}

async function main() {
  try {
    await loadCity();
  } catch (err) {
    loading.innerHTML = `<p style="color:#ff4444;">Error ciudad: ${err.message}</p>`;
    console.error('Load error:', err);
    return;
  }

  const character = new Character(scene);
  try {
    await character.load();
    loading.classList.add('hidden');
  } catch (err) {
    loading.innerHTML = `<p style="color:#ff4444;">Error personaje: ${err.message}</p>`;
    console.error('Character load error:', err);
    return;
  }

  camera.position.copy(character.cameraPosition);
  camera.lookAt(character.cameraTarget);

  instructions.classList.remove('hidden');
  character.lock(renderer.domElement);

  const clock = new THREE.Clock();

  const particleCount = 1500;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(particleCount * 3);
  const pSizes = new Float32Array(particleCount);
  const pSpeeds = [];
  for (let i = 0; i < particleCount; i++) {
    pPos[i * 3] = (Math.random() - 0.5) * 200;
    pPos[i * 3 + 1] = Math.random() * 60;
    pPos[i * 3 + 2] = (Math.random() - 0.5) * 200;
    pSizes[i] = 0.05 + Math.random() * 0.15;
    pSpeeds.push({
      x: (Math.random() - 0.5) * 0.3,
      y: Math.random() * 0.15,
      z: (Math.random() - 0.5) * 0.3,
    });
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('size', new THREE.BufferAttribute(pSizes, 1));
  const colorPalette = [0x0088ff, 0x8800ff, 0xff0088, 0x00ffaa];
  const pMat = new THREE.PointsMaterial({
    color: 0x4488ff,
    size: 0.15,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const particles = new THREE.Points(pGeo, pMat);
  scene.add(particles);

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    character.update(dt);

    const pos = particles.geometry.attributes.position.array;
    for (let i = 0; i < particleCount; i++) {
      pos[i * 3] += pSpeeds[i].x * dt;
      pos[i * 3 + 1] += pSpeeds[i].y * dt;
      pos[i * 3 + 2] += pSpeeds[i].z * dt;
      if (pos[i * 3 + 1] > 60) { pos[i * 3 + 1] = 0; }
      if (Math.abs(pos[i * 3]) > 100) pSpeeds[i].x *= -1;
      if (Math.abs(pos[i * 3 + 2]) > 100) pSpeeds[i].z *= -1;
    }
    particles.geometry.attributes.position.needsUpdate = true;

    camera.position.copy(character.cameraPosition);
    camera.lookAt(character.cameraTarget);

    composer.render();
  }

  animate();
}

main();

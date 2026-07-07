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

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.3;
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
grad.addColorStop(0, '#000003');
grad.addColorStop(0.12, '#020218');
grad.addColorStop(0.28, '#0c0830');
grad.addColorStop(0.45, '#1a0a35');
grad.addColorStop(0.6, '#250a28');
grad.addColorStop(0.78, '#2a0a18');
grad.addColorStop(0.92, '#1a0810');
grad.addColorStop(1, '#0d0508');
ctx.fillStyle = grad;
ctx.fillRect(0, 0, 1, 512);
scene.background = new THREE.CanvasTexture(bgCanvas);
scene.fog = new THREE.FogExp2(0x0c0820, 0.002);

const camera = new THREE.PerspectiveCamera(CAMERA.FOV, window.innerWidth / window.innerHeight, CAMERA.NEAR, CAMERA.FAR);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 1.5;
pmrem.dispose();

const ambient = new THREE.AmbientLight(0x3333aa, 0.5);
scene.add(ambient);

const hemi = new THREE.HemisphereLight(0x8888cc, 0x111122, 1.0);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xaaccff, 3.5);
dir.position.set(10, 20, 10);
dir.castShadow = true;
dir.shadow.mapSize.width = 4096;
dir.shadow.mapSize.height = 4096;
dir.shadow.camera.near = 0.5;
dir.shadow.camera.far = 60;
dir.shadow.camera.left = -5;
dir.shadow.camera.right = 5;
dir.shadow.camera.top = 5;
dir.shadow.camera.bottom = -5;
dir.shadow.bias = -0.0005;
dir.shadow.radius = 8;
const dirTarget = new THREE.Object3D();
dirTarget.position.set(0, 0, 0);
scene.add(dirTarget);
dir.target = dirTarget;
scene.add(dir);

const dir2 = new THREE.DirectionalLight(0xff4488, 1.0);
dir2.position.set(-10, 5, -10);
scene.add(dir2);

const grid = new THREE.GridHelper(200, 50, 0x0044ff, 0x222244);
grid.position.y = 0.01;
scene.add(grid);



// Stars — two layers: distant & bright
const starCount = 5000;
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(starCount * 3);
const starSizes = new Float32Array(starCount);
for (let i = 0; i < starCount; i++) {
  const r = 250 + Math.random() * 250;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
  starPos[i * 3 + 1] = Math.abs(r * Math.cos(phi));
  starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  starSizes[i] = 0.08 + Math.random() * 0.5;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
starGeo.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
const starMat = new THREE.PointsMaterial({
  color: 0xaaccff,
  size: 0.25,
  transparent: true,
  opacity: 0.85,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  sizeAttenuation: true,
});
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

// Bright star clusters / distant galaxies
const brightCount = 800;
const brightGeo = new THREE.BufferGeometry();
const brightPos = new Float32Array(brightCount * 3);
for (let i = 0; i < brightCount; i++) {
  const r = 200 + Math.random() * 300;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  brightPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
  brightPos[i * 3 + 1] = Math.abs(r * Math.cos(phi));
  brightPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
}
brightGeo.setAttribute('position', new THREE.BufferAttribute(brightPos, 3));
const brightMat = new THREE.PointsMaterial({
  color: 0xffccee,
  size: 1.2,
  transparent: true,
  opacity: 0.5,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  sizeAttenuation: true,
});
const brightStars = new THREE.Points(brightGeo, brightMat);
scene.add(brightStars);

// Moon
const moonGeo = new THREE.SphereGeometry(4, 32, 32);
const moonMat = new THREE.MeshBasicMaterial({ color: 0xffeedd });
const moon = new THREE.Mesh(moonGeo, moonMat);
moon.position.set(80, 120, -150);
scene.add(moon);

// Moon glow
const glowCanvas = document.createElement('canvas');
glowCanvas.width = glowCanvas.height = 128;
const gctx = glowCanvas.getContext('2d');
const glow = gctx.createRadialGradient(64, 64, 0, 64, 64, 64);
glow.addColorStop(0, 'rgba(255,238,200,0.4)');
glow.addColorStop(0.15, 'rgba(255,200,180,0.15)');
glow.addColorStop(0.4, 'rgba(180,120,255,0.04)');
glow.addColorStop(1, 'rgba(0,0,0,0)');
gctx.fillStyle = glow;
gctx.fillRect(0, 0, 128, 128);
const glowTex = new THREE.CanvasTexture(glowCanvas);
const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
}));
glowSprite.scale.set(60, 60, 1);
glowSprite.position.copy(moon.position);
scene.add(glowSprite);

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
  const cityMeshes = [];
  model.traverse((child) => {
    if (child.isMesh) {
      cityMeshes.push(child);
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
  scene.userData.cityMeshes = cityMeshes;
}

async function main() {
  try {
    await loadCity();
  } catch (err) {
    loading.innerHTML = `<p style="color:#ff4444;">Error ciudad: ${err.message}</p>`;
    console.error('Load error:', err);
    return;
  }

  const character = new Character(scene, dir, dirTarget);
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

  character.lock(renderer.domElement);

  const clock = new THREE.Clock();

  const particleCount = 3000;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(particleCount * 3);
  const pColors = new Float32Array(particleCount * 3);
  const pSpeeds = [];
  const palettes = [
    [0x00, 0x88, 0xff], [0x88, 0x00, 0xff],
    [0xff, 0x00, 0x88], [0x00, 0xff, 0xaa],
    [0xff, 0x44, 0x00], [0xff, 0xcc, 0x00],
  ];
  for (let i = 0; i < particleCount; i++) {
    pPos[i * 3] = (Math.random() - 0.5) * 250;
    pPos[i * 3 + 1] = Math.random() * 80;
    pPos[i * 3 + 2] = (Math.random() - 0.5) * 250;
    const c = palettes[Math.floor(Math.random() * palettes.length)];
    pColors[i * 3] = c[0] / 255;
    pColors[i * 3 + 1] = c[1] / 255;
    pColors[i * 3 + 2] = c[2] / 255;
    pSpeeds.push({
      x: (Math.random() - 0.5) * 0.5,
      y: Math.random() * 0.25,
      z: (Math.random() - 0.5) * 0.5,
      wobble: Math.random() * Math.PI * 2,
    });
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));
  const pMat = new THREE.PointsMaterial({
    size: 0.25,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
    vertexColors: true,
  });
  const particles = new THREE.Points(pGeo, pMat);
  scene.add(particles);

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    character.update(dt);

    const pos = particles.geometry.attributes.position.array;
    const time = performance.now() * 0.001;
    for (let i = 0; i < particleCount; i++) {
      const idx = i * 3;
      pos[idx] += pSpeeds[i].x * dt + Math.sin(time * 0.5 + pSpeeds[i].wobble) * 0.02;
      pos[idx + 1] += pSpeeds[i].y * dt;
      pos[idx + 2] += pSpeeds[i].z * dt + Math.cos(time * 0.5 + pSpeeds[i].wobble) * 0.02;
      if (pos[idx + 1] > 80) { pos[idx + 1] = 0; }
      if (Math.abs(pos[idx]) > 125) pSpeeds[i].x *= -1;
      if (Math.abs(pos[idx + 2]) > 125) pSpeeds[i].z *= -1;
    }
    particles.geometry.attributes.position.needsUpdate = true;

    camera.position.copy(character.cameraPosition);
    camera.lookAt(character.cameraTarget);

    composer.render();
  }

  animate();
}

main();

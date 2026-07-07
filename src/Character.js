import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { PLAYER, ANIMS } from './constants.js';
import { detectWall } from './Collision.js';

function stripPositionTracks(clip) {
  if (!clip) return clip;
  const tracks = clip.tracks.filter((t) => !t.name.endsWith('.position'));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _rightAxis = new THREE.Vector3(1, 0, 0);
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();

export class Character {
  constructor(scene, dirLight, dirTarget) {
    this.scene = scene;
    this.dirLight = dirLight;
    this.dirTarget = dirTarget;
    this.position = new THREE.Vector3(0, 0, 0);
    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;
    this.currentState = 'idle';

    this.charLight = new THREE.PointLight(0x88aaff, 3.0, 15);
    this.charLight2 = new THREE.PointLight(0xff88aa, 2.0, 12);
    scene.add(this.charLight);
    scene.add(this.charLight2);

    this.yaw = 0;
    this.pitch = -0.3;
    this.cameraDist = PLAYER.CAMERA_DIST;
    this.cameraDistMin = 2;
    this.cameraDistMax = 15;
    this.targetCameraDist = this.cameraDist;
    this.cameraHeight = PLAYER.CAMERA_HEIGHT;

    this.speed = 0;
    this.verticalVel = 0;
    this.grounded = true;
    this.footOffset = 0;

    this.keys = { forward: false, backward: false, left: false, right: false };
    this.shift = false;
    this.isLocked = false;
    this.slidePressed = false;
    this.flairPressed = false;
    this.isSliding = false;
    this.isFlair = false;
    this.slideTimer = 0;
    this.flairTimer = 0;
    this.flairDuration = 1;
    this.isDancing = false;
    this.danceTimer = 0;
    this.danceDuration = {};
    this._slideY = 0;
    this._zoomVel = 0;
    this._zoomDamping = 0.92;

    this.animLoadPromise = null;

    this._setupInput();
  }

  async load() {
    const loader = new FBXLoader();

    const [
      idleFBX,
      runningFBX,
      slideFBX,
      jumpFBX,
      jumpFromWallFBX,
      wallRunFBX,
      flairFBX,
      climbFBX,
      dance1FBX,
      dance2FBX,
      dance3FBX,
    ] = await Promise.all([
      loader.loadAsync(ANIMS.IDLE),
      loader.loadAsync(ANIMS.RUNNING),
      loader.loadAsync(ANIMS.SLIDE),
      loader.loadAsync(ANIMS.JUMP),
      loader.loadAsync(ANIMS.JUMP_FROM_WALL),
      loader.loadAsync(ANIMS.WALL_RUN),
      loader.loadAsync(ANIMS.FLAIR),
      loader.loadAsync(ANIMS.CLIMB),
      loader.loadAsync(ANIMS.DANCE1),
      loader.loadAsync(ANIMS.DANCE2),
      loader.loadAsync(ANIMS.DANCE3),
    ]);

    if (flairFBX.animations[0]) {
      this.flairDuration = flairFBX.animations[0].duration;
    }
    if (dance1FBX.animations[0]) this.danceDuration.d1 = dance1FBX.animations[0].duration;
    if (dance2FBX.animations[0]) this.danceDuration.d2 = dance2FBX.animations[0].duration;
    if (dance3FBX.animations[0]) this.danceDuration.d3 = dance3FBX.animations[0].duration;

    this.model = idleFBX;

    const box = new THREE.Box3().setFromObject(this.model);
    const size = box.getSize(new THREE.Vector3());
    const height = size.y;
    const autoScale = (height > 10 || height < 0.5) ? (PLAYER.HEIGHT / height) : 1;
    this.model.scale.setScalar(autoScale * 0.0627);

    this.model.position.set(0, 0, 0);
    box.setFromObject(this.model);
    this.footOffset = -box.min.y;
    this.position.y = this.footOffset;
    this.model.raycast = () => {};
    this.scene.add(this.model);

    this.charHeight = box.max.y - box.min.y;
    this.cameraDist = this.charHeight * 2.2;
    this.targetCameraDist = this.cameraDist;
    this.cameraHeight = this.charHeight * 1.6;
    this.cameraDistMin = this.charHeight * 0.4;
    this.cameraDistMax = this.charHeight * 25;

    // Shadow circle on ground
    const sSize = 256;
    const sc = document.createElement('canvas');
    sc.width = sc.height = sSize;
    const sctx = sc.getContext('2d');
    const half = sSize / 2;
    const sg = sctx.createRadialGradient(half, half, 0, half, half, half);
    sg.addColorStop(0, 'rgba(0,0,0,0.25)');
    sg.addColorStop(0.2, 'rgba(0,0,0,0.18)');
    sg.addColorStop(0.5, 'rgba(0,0,0,0.08)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    sctx.fillStyle = sg;
    sctx.fillRect(0, 0, sSize, sSize);
    const stex = new THREE.CanvasTexture(sc);
    stex.minFilter = THREE.LinearMipmapLinearFilter;
    stex.magFilter = THREE.LinearFilter;
    const smat = new THREE.MeshBasicMaterial({ map: stex, transparent: true, depthWrite: false, opacity: 0.6 });
    this.shadowDisc = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), smat);
    this.shadowDisc.rotation.x = -Math.PI / 2;
    this.shadowDisc.scale.set(this.charHeight * 1.8, this.charHeight * 1.8, 1);
    this.shadowDisc.position.y = 0.01;
    this.scene.add(this.shadowDisc);

    this.mixer = new THREE.AnimationMixer(this.model);

    const clips = {
      idle: idleFBX.animations[0],
      run: runningFBX.animations[0],
      slide: slideFBX.animations[0],
      jump: jumpFBX.animations[0],
      jumpFromWall: jumpFromWallFBX.animations[0],
      wallRun: wallRunFBX.animations[0],
      flair: flairFBX.animations[0],
      climb: climbFBX.animations[0],
      dance1: dance1FBX.animations[0],
      dance2: dance2FBX.animations[0],
      dance3: dance3FBX.animations[0],
    };

    for (const [name, clip] of Object.entries(clips)) {
      if (clip) {
        const clean = stripPositionTracks(clip);
        const action = this.mixer.clipAction(clean);
        this.actions[name] = action;
      }
    }

    this._setupMaterial(this.model);

    this._setAnim('idle');
  }

  _setupMaterial(root) {
    root.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(m => {
            m.envMap = this.scene.environment;
            m.envMapIntensity = 3.0;
            m.roughness = Math.min(m.roughness || 0.5, 0.2);
            m.metalness = Math.max(m.metalness || 0, 0.4);
            m.emissive = new THREE.Color(0x2244aa);
            m.emissiveIntensity = 0.3;
          });
        }
      }
    });
  }

  _setAnim(name) {
    const action = this.actions[name];
    if (!action || action === this.currentAction) return;
    if (this.currentAction) {
      this.currentAction.fadeOut(0.12);
    }
    action.reset().fadeIn(0.12).play();
    this.currentAction = action;
    this.currentState = name;
  }

  _setupInput() {
    document.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'KeyW': this.keys.forward = true; break;
        case 'KeyS': this.keys.backward = true; break;
        case 'KeyA': this.keys.left = true; break;
        case 'KeyD': this.keys.right = true; break;
        case 'ShiftLeft': case 'ShiftRight':
          this.shift = true;
          if ((this.keys.forward || this.keys.backward || this.keys.left || this.keys.right) && this.grounded && !this.isSliding) {
            this.slidePressed = true;
          }
          break;
        case 'Space': this._jump(); break;
        case 'KeyE': this.flairPressed = true; break;
        case 'Digit1': this._startDance('dance1'); break;
        case 'Digit2': this._startDance('dance2'); break;
        case 'Digit3': this._startDance('dance3'); break;
      }
    });

    document.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': this.keys.forward = false; break;
        case 'KeyS': this.keys.backward = false; break;
        case 'KeyA': this.keys.left = false; break;
        case 'KeyD': this.keys.right = false; break;
        case 'ShiftLeft': case 'ShiftRight': this.shift = false; break;
        case 'KeyE': this.flairPressed = false; break;
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement !== null;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      this.yaw -= e.movementX * PLAYER.MOUSE_SENSITIVITY;
      this.pitch -= e.movementY * PLAYER.MOUSE_SENSITIVITY;
      const maxDown = Math.atan2(this.cameraHeight, this.cameraDist) * 0.85;
      this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(maxDown, this.pitch));
    });

    document.addEventListener('wheel', (e) => {
      this._zoomVel += e.deltaY * 0.005;
    });
  }

  lock(domElement) {
    domElement.addEventListener('click', () => domElement.requestPointerLock());
  }

  get cameraTarget() {
    return new THREE.Vector3(
      this.position.x,
      this.position.y + this.charHeight * 0.5,
      this.position.z,
    );
  }

  get cameraPosition() {
    const upFactor = 1 - Math.max(0, -this.pitch) / (Math.PI / 2.2) * 0.3;
    const effectiveDist = this.cameraDist * upFactor;
    _offset.set(0, this.cameraHeight, effectiveDist);
    _offset.applyAxisAngle(_rightAxis, this.pitch);
    _offset.applyAxisAngle(_up, this.yaw);
    return new THREE.Vector3(
      this.position.x + _offset.x,
      this.position.y + _offset.y,
      this.position.z + _offset.z,
    );
  }

  _jump() {
    if (this.grounded && this.isLocked) {
      this.verticalVel = PLAYER.JUMP_FORCE;
      this.grounded = false;
    }
  }

  _startDance(name) {
    if (!this.isLocked || !this.grounded || this.isDancing) return;
    const dur = this.danceDuration[name] || 3;
    this.isDancing = true;
    this.danceTimer = dur;
    this._setAnim(name);
  }

  update(delta) {
    if (!this.model || !this.mixer) return;

    // Smooth zoom with inertia
    this._zoomVel *= this._zoomDamping;
    this.targetCameraDist += this._zoomVel * delta * 60;
    this.targetCameraDist = Math.max(this.cameraDistMin, Math.min(this.cameraDistMax, this.targetCameraDist));
    if (Math.abs(this._zoomVel) < 0.001) this._zoomVel = 0;
    this.cameraDist += (this.targetCameraDist - this.cameraDist) * Math.min(1, 16 * delta);

    // Clamp pitch to prevent camera going underground
    const maxDown = Math.atan2(this.cameraHeight, this.cameraDist) * 0.85;
    this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(maxDown, this.pitch));

    _forward.set(0, 0, -1).applyAxisAngle(_up, this.yaw);
    _right.set(1, 0, 0).applyAxisAngle(_up, this.yaw);

    _moveDir.set(0, 0, 0);
    if (this.keys.forward) _moveDir.add(_forward);
    if (this.keys.backward) _moveDir.sub(_forward);
    if (this.keys.right) _moveDir.add(_right);
    if (this.keys.left) _moveDir.sub(_right);

    const moving = _moveDir.lengthSq() > 0;
    if (moving) _moveDir.normalize();

    // Wall detection — only when airborne (for wall jump)
    const wall = !this.grounded
      ? detectWall(this.scene, this.position, PLAYER.HEIGHT)
      : { hit: false };

    // --- State transitions ---

    if (this.isSliding) {
      this.slideTimer -= delta;
      if (this.slideTimer <= 0) {
        this.isSliding = false;
      }
    }

    if (this.isFlair) {
      this.flairTimer -= delta;
      if (this.flairTimer <= 0) {
        this.isFlair = false;
      }
    }

    if (this.isDancing) {
      this.danceTimer -= delta;
      if (this.danceTimer <= 0) {
        this.isDancing = false;
      }
    }

    // Slide trigger: shift while moving
    if (this.slidePressed && !this.isSliding && this.grounded && moving) {
      this.isSliding = true;
      this.slideTimer = 0.8;
      this.slidePressed = false;
    }
    this.slidePressed = false;

    // Flair trigger: E
    if (this.flairPressed && !this.isFlair && this.grounded) {
      this.isFlair = true;
      this.flairTimer = this.flairDuration;
      this.flairPressed = false;
    }
    this.flairPressed = false;

    // Jump from wall
    if (!this.grounded && wall.hit && wall.distance < 2.0 && this.keys.forward) {
      // playing wallRun or jumpFromWall
    }

    // --- Movement ---
    const targetSpeed = this.isSliding
      ? PLAYER.RUN_SPEED * 1.5
      : (this.isFlair || this.isDancing)
        ? 0
        : moving
          ? PLAYER.RUN_SPEED
          : 0;
    this.speed += (targetSpeed - this.speed) * Math.min(1, 10 * delta);

    let moveX, moveZ;
    if (this.isSliding) {
      moveX = _moveDir.x * this.speed * delta;
      moveZ = _moveDir.z * this.speed * delta;
    } else {
      moveX = _moveDir.x * this.speed * delta;
      moveZ = _moveDir.z * this.speed * delta;
    }

    if (moveX !== 0 || moveZ !== 0) {
      this._collTick = (this._collTick || 0) + 1;
      let finalX = moveX;
      let finalZ = moveZ;
      if (this._collTick % 2 === 0) {
        const moveDist = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (moveDist > 0.0001) {
          _rayDir.set(moveX / moveDist, 0, moveZ / moveDist);
          _rayOrigin.set(this.position.x, this.position.y + this.charHeight * 0.4, this.position.z);
          _raycaster.set(_rayOrigin, _rayDir);
          _raycaster.far = moveDist + 0.3;

          const targets = this.scene.userData.cityMeshes || this.scene.children;
          const hits = _raycaster.intersectObjects(targets, false);
          let hitDist = moveDist + 0.3;
          for (const hit of hits) {
            if (hit.distance > 0.01 && hit.distance < hitDist) {
              hitDist = hit.distance;
            }
          }

          if (hitDist > 0.3) {
            const allowed = Math.max(0, hitDist - 0.3);
            finalX = _rayDir.x * Math.min(allowed, moveDist);
            finalZ = _rayDir.z * Math.min(allowed, moveDist);
          }
        }
      }
      this.position.x += finalX;
      this.position.z += finalZ;
    }

    // Gravity — only apply when airborne
    if (this.grounded) {
      this.position.y = this.footOffset;
      this.verticalVel = 0;
    } else {
      this.verticalVel += PLAYER.GRAVITY * delta;
      this.position.y += this.verticalVel * delta;
      if (this.position.y <= this.footOffset) {
        this.position.y = this.footOffset;
        this.verticalVel = 0;
        this.grounded = true;
      }
    }

    if (!this.isDancing) {
      const targetYOffset = this.isSliding
        ? -this.charHeight * 0.25
        : this.isFlair
          ? -this.charHeight * 0.2
          : 0;
      this._slideY += (targetYOffset - this._slideY) * Math.min(1, 10 * delta);
    }
    this.model.position.set(this.position.x, this.position.y + this._slideY, this.position.z);
    this.shadowDisc.position.x = this.position.x;
    this.shadowDisc.position.z = this.position.z;

    // Follow lights
    this.charLight.position.set(
      this.position.x + 1, this.position.y + this.charHeight * 1.5, this.position.z + 1,
    );
    this.charLight2.position.set(
      this.position.x - 1, this.position.y + this.charHeight * 0.5, this.position.z - 1,
    );

    // Shadow light follows character
    this.dirLight.position.set(
      this.position.x + 5, this.position.y + 15, this.position.z + 5
    );
    this.dirTarget.position.copy(this.position);
    this.dirTarget.updateMatrixWorld();
    const s = this.charHeight * 2;
    this.dirLight.shadow.camera.left = -s;
    this.dirLight.shadow.camera.right = s;
    this.dirLight.shadow.camera.top = s;
    this.dirLight.shadow.camera.bottom = -s;
    this.dirLight.shadow.camera.updateProjectionMatrix();

    // Model rotation
    if (moving && !this.isSliding && !this.isFlair && !this.isDancing) {
      const targetAngle = Math.atan2(_moveDir.x, _moveDir.z);
      let diff = targetAngle - this.model.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.model.rotation.y += diff * Math.min(1, 10 * delta);
    }

    // --- Animation state ---
    if (this.isSliding) {
      this._setAnim('slide');
    } else if (this.isFlair) {
      this._setAnim('flair');
    } else if (this.isDancing) {
      // _startDance already set the anim
    } else if (!this.grounded) {
      if (wall.hit && wall.distance < 2.5) {
        this._setAnim('jumpFromWall');
      } else {
        this._setAnim('jump');
      }
    } else if (moving) {
      this._setAnim('run');
    } else {
      this._setAnim('idle');
    }

    this.mixer.update(delta);

    if (this.isDancing) {
      const b = new THREE.Box3().setFromObject(this.model);
      this._slideY -= b.min.y;
      this.model.position.y = this.position.y + this._slideY;
    }
  }
}

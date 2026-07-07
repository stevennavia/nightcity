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

export class Character {
  constructor(scene) {
    this.scene = scene;
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
    this.pitch = -0.2;
    this.cameraDist = PLAYER.CAMERA_DIST;
    this.cameraDistMin = 2;
    this.cameraDistMax = 15;
    this.cameraHeight = PLAYER.CAMERA_HEIGHT;

    this.speed = 0;
    this.verticalVel = 0;
    this.grounded = true;
    this.footOffset = 0;

    this.keys = { forward: false, backward: false, left: false, right: false };
    this.shift = false;
    this.isLocked = false;
    this.slidePressed = false;
    this.leanPressed = false;
    this.isSliding = false;
    this.isLeaning = false;
    this.slideTimer = 0;
    this.leanWallInfo = null;

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
      leaningFBX,
      climbFBX,
    ] = await Promise.all([
      loader.loadAsync(ANIMS.IDLE),
      loader.loadAsync(ANIMS.RUNNING),
      loader.loadAsync(ANIMS.SLIDE),
      loader.loadAsync(ANIMS.JUMP),
      loader.loadAsync(ANIMS.JUMP_FROM_WALL),
      loader.loadAsync(ANIMS.WALL_RUN),
      loader.loadAsync(ANIMS.LEANING),
      loader.loadAsync(ANIMS.CLIMB),
    ]);

    this.model = idleFBX;

    const box = new THREE.Box3().setFromObject(this.model);
    const size = box.getSize(new THREE.Vector3());
    const height = size.y;
    const autoScale = (height > 10 || height < 0.5) ? (PLAYER.HEIGHT / height) : 1;
    this.model.scale.setScalar(autoScale * 0.0784);

    this.model.position.set(0, 0, 0);
    box.setFromObject(this.model);
    this.footOffset = -box.min.y;
    this.position.y = this.footOffset;
    this.scene.add(this.model);

    this.charHeight = box.max.y - box.min.y;
    this.cameraDist = this.charHeight * 4;
    this.cameraHeight = this.charHeight * 2.5;
    this.cameraDistMin = this.charHeight * 1;
    this.cameraDistMax = this.charHeight * 15;

    this.mixer = new THREE.AnimationMixer(this.model);

    const clips = {
      idle: idleFBX.animations[0],
      run: runningFBX.animations[0],
      slide: slideFBX.animations[0],
      jump: jumpFBX.animations[0],
      jumpFromWall: jumpFromWallFBX.animations[0],
      wallRun: wallRunFBX.animations[0],
      lean: leaningFBX.animations[0],
      climb: climbFBX.animations[0],
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
          if (this.keys.forward && this.grounded && !this.isSliding) {
            this.slidePressed = true;
          }
          break;
        case 'Space': this._jump(); break;
        case 'KeyE': this.leanPressed = true; break;
      }
    });

    document.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': this.keys.forward = false; break;
        case 'KeyS': this.keys.backward = false; break;
        case 'KeyA': this.keys.left = false; break;
        case 'KeyD': this.keys.right = false; break;
        case 'ShiftLeft': case 'ShiftRight': this.shift = false; break;
        case 'KeyE': this.leanPressed = false; break;
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement !== null;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      this.yaw -= e.movementX * PLAYER.MOUSE_SENSITIVITY;
      this.pitch -= e.movementY * PLAYER.MOUSE_SENSITIVITY;
      this.pitch = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 3, this.pitch));
    });

    document.addEventListener('wheel', (e) => {
      this.cameraDist += e.deltaY * 0.01;
      this.cameraDist = Math.max(this.cameraDistMin, Math.min(this.cameraDistMax, this.cameraDist));
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
    _offset.set(0, this.cameraHeight, this.cameraDist);
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

  update(delta) {
    if (!this.model || !this.mixer) return;

    _forward.set(0, 0, -1).applyAxisAngle(_up, this.yaw);
    _right.set(1, 0, 0).applyAxisAngle(_up, this.yaw);

    _moveDir.set(0, 0, 0);
    if (this.keys.forward) _moveDir.add(_forward);
    if (this.keys.backward) _moveDir.sub(_forward);
    if (this.keys.right) _moveDir.add(_right);
    if (this.keys.left) _moveDir.sub(_right);

    const moving = _moveDir.lengthSq() > 0;
    if (moving) _moveDir.normalize();

    // Wall detection
    const wall = detectWall(this.scene, this.position, PLAYER.HEIGHT);

    // --- State transitions ---

    if (this.isSliding) {
      this.slideTimer -= delta;
      if (this.slideTimer <= 0) {
        this.isSliding = false;
      }
    }

    if (this.isLeaning) {
      if (!this.leanPressed || !wall.hit) {
        this.isLeaning = false;
        this.leanWallInfo = null;
      }
    }

    // Slide trigger: shift while moving forward
    if (this.slidePressed && !this.isSliding && this.grounded && this.keys.forward) {
      this.isSliding = true;
      this.slideTimer = 0.8;
      this.slidePressed = false;
    }
    this.slidePressed = false;

    // Lean trigger: E near wall
    if (this.leanPressed && wall.hit && !this.isLeaning && this.grounded) {
      this.isLeaning = true;
      this.leanWallInfo = wall;
    }

    // Jump from wall
    if (!this.grounded && wall.hit && wall.distance < 2.0 && this.keys.forward) {
      // playing wallRun or jumpFromWall
    }

    // --- Movement ---
    const targetSpeed = (this.isSliding || this.isLeaning)
      ? 0
      : moving
        ? PLAYER.RUN_SPEED
        : 0;
    this.speed += (targetSpeed - this.speed) * Math.min(1, 10 * delta);

    if (this.isSliding) {
      const slideDir = new THREE.Vector3(0, 0, -1).applyAxisAngle(_up, this.yaw);
      this.position.x += slideDir.x * PLAYER.RUN_SPEED * 1.5 * delta;
      this.position.z += slideDir.z * PLAYER.RUN_SPEED * 1.5 * delta;
    } else {
      this.position.x += _moveDir.x * this.speed * delta;
      this.position.z += _moveDir.z * this.speed * delta;
    }

    // Gravity
    this.verticalVel += PLAYER.GRAVITY * delta;
    this.position.y += this.verticalVel * delta;
    if (this.position.y <= this.footOffset) {
      this.position.y = this.footOffset;
      this.verticalVel = 0;
      this.grounded = true;
    }

    this.model.position.copy(this.position);

    // Follow lights
    this.charLight.position.set(
      this.position.x + 1, this.position.y + this.charHeight * 1.5, this.position.z + 1,
    );
    this.charLight2.position.set(
      this.position.x - 1, this.position.y + this.charHeight * 0.5, this.position.z - 1,
    );

    // Model rotation
    if (moving && !this.isSliding && !this.isLeaning) {
      const targetAngle = Math.atan2(_moveDir.x, _moveDir.z);
      let diff = targetAngle - this.model.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.model.rotation.y += diff * Math.min(1, 10 * delta);
    }

    // --- Animation state ---
    if (this.isSliding) {
      this._setAnim('slide');
    } else if (this.isLeaning) {
      this._setAnim('lean');
      if (this.leanWallInfo) {
        const wallAngle = Math.atan2(this.leanWallInfo.normal.x, this.leanWallInfo.normal.z);
        let diff = (wallAngle + Math.PI) - this.model.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.model.rotation.y += diff * Math.min(1, 8 * delta);
      }
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
  }
}

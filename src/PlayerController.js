import * as THREE from 'three';
import { PLAYER } from './constants.js';

export class PlayerController {
  constructor(camera) {
    this.camera = camera;
    this.position = new THREE.Vector3(0, PLAYER.HEIGHT, 0);

    this.yaw = 0;
    this.pitch = 0;
    this.verticalVelocity = 0;
    this.isGrounded = true;

    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
    };
    this.isLocked = false;

    this.camera.position.copy(this.position);

    this._setupPointerLock();
    this._setupKeyboard();
  }

  _setupPointerLock() {
    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement !== null;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      this.yaw -= e.movementX * PLAYER.MOUSE_SENSITIVITY;
      this.pitch -= e.movementY * PLAYER.MOUSE_SENSITIVITY;
      this.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.pitch));
    });
  }

  _setupKeyboard() {
    const map = {
      'KeyW': 'forward',
      'KeyS': 'backward',
      'KeyA': 'left',
      'KeyD': 'right',
    };

    document.addEventListener('keydown', (e) => {
      const action = map[e.code];
      if (action) this.keys[action] = true;
      if (e.code === 'Space' && this.isGrounded && this.isLocked) {
        this.verticalVelocity = PLAYER.JUMP_FORCE;
        this.isGrounded = false;
      }
    });

    document.addEventListener('keyup', (e) => {
      const action = map[e.code];
      if (action) this.keys[action] = false;
    });
  }

  lock(domElement) {
    domElement.addEventListener('click', () => {
      domElement.requestPointerLock();
    });
  }

  update(delta) {
    const forward = new THREE.Vector3(0, 0, -1)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const right = new THREE.Vector3(1, 0, 0)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    const moveDir = new THREE.Vector3();
    if (this.keys.forward) moveDir.add(forward);
    if (this.keys.backward) moveDir.sub(forward);
    if (this.keys.right) moveDir.add(right);
    if (this.keys.left) moveDir.sub(right);

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
    }

    this.position.x += moveDir.x * PLAYER.SPEED * delta;
    this.position.z += moveDir.z * PLAYER.SPEED * delta;

    this.verticalVelocity += PLAYER.GRAVITY * delta;
    this.position.y += this.verticalVelocity * delta;

    if (this.position.y <= PLAYER.HEIGHT) {
      this.position.y = PLAYER.HEIGHT;
      this.verticalVelocity = 0;
      this.isGrounded = true;
    }

    this.camera.position.copy(this.position);

    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }
}

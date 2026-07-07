import * as THREE from 'three';
import { COLLISION } from './constants.js';

const _dirs = [];
for (let i = 0; i < COLLISION.RAY_COUNT; i++) {
  const angle = (i / COLLISION.RAY_COUNT) * Math.PI * 2;
  _dirs.push(new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)));
}

const _origin = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _intersects = [];

export function detectWall(scene, position, height = 1) {
  _origin.copy(position);
  _origin.y += height * 0.4;

  const targets = scene.userData.cityMeshes || scene.children;

  for (const dir of _dirs) {
    _raycaster.set(_origin, dir);
    _raycaster.far = COLLISION.LEAN_DISTANCE;
    _intersects.length = 0;

    _raycaster.intersectObjects(targets, false, _intersects);

    for (const hit of _intersects) {
      if (hit.distance > 0.3 && hit.distance < COLLISION.LEAN_DISTANCE) {
        const dist = hit.distance;
        const normal = hit.face.normal.clone();
        const normalWorld = normal.applyQuaternion(hit.object.quaternion).normalize();

        return {
          hit: true,
          distance: dist,
          normal: normalWorld,
          direction: dir.clone(),
          point: hit.point,
        };
      }
    }
  }

  return { hit: false };
}

export function detectWallInDirection(scene, position, direction, maxDist) {
  _origin.copy(position);
  const targets = scene.userData.cityMeshes || scene.children;
  _raycaster.set(_origin, direction);
  _raycaster.far = maxDist;
  _intersects.length = 0;

  _raycaster.intersectObjects(targets, false, _intersects);

  for (const hit of _intersects) {
    if (hit.distance > 0.3) {
      return {
        hit: true,
        distance: hit.distance,
        point: hit.point,
        face: hit.face,
        object: hit.object,
      };
    }
  }

  return { hit: false };
}

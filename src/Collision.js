import * as THREE from 'three';
import { COLLISION } from './constants.js';

const _dirs = [];
for (let i = 0; i < COLLISION.RAY_COUNT; i++) {
  const angle = (i / COLLISION.RAY_COUNT) * Math.PI * 2;
  _dirs.push(new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)));
}

const _ray = new THREE.Ray();
const _origin = new THREE.Vector3();
const _intersects = [];

export function detectWall(scene, position, height = 1) {
  _origin.copy(position);

  for (const dir of _dirs) {
    _ray.set(_origin, dir);
    _intersects.length = 0;

    scene.raycast(_ray, _intersects, Infinity);

    for (const hit of _intersects) {
      if (hit.distance < COLLISION.LEAN_DISTANCE && hit.distance > 0.3) {
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
  _ray.set(_origin, direction);
  _intersects.length = 0;

  scene.raycast(_ray, _intersects, maxDist);

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

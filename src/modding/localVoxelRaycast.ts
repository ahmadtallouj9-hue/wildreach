import * as THREE from 'three';
import { Block } from '../world/blocks';
import { LOCAL_GRID_SIZE } from './constants';

export interface LocalRayHit {
  /** Solid cell that was hit. */
  x: number;
  y: number;
  z: number;
  /** Empty in-bounds cell adjacent to the hit face (placement target). */
  px: number;
  py: number;
  pz: number;
  face: [number, number, number];
  distance: number;
}

function inGrid(x: number, y: number, z: number): boolean {
  return (
    x >= 0 &&
    x < LOCAL_GRID_SIZE &&
    y >= 0 &&
    y < LOCAL_GRID_SIZE &&
    z >= 0 &&
    z < LOCAL_GRID_SIZE
  );
}

/**
 * Grid traversal raycast for the local editor volume.
 * Uses the same DDA approach as world `voxelRaycast`, bounded to [0, size).
 * When the grid is empty, returns the last in-bounds air cell (for first-block placement).
 */
export function localVoxelRaycast(
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  maxDist: number,
  getBlock: (x: number, y: number, z: number) => number,
): LocalRayHit | null {
  let dirX = direction.x;
  let dirY = direction.y;
  let dirZ = direction.z;
  const len = Math.hypot(dirX, dirY, dirZ);
  if (len < 1e-8) return null;
  dirX /= len;
  dirY /= len;
  dirZ /= len;

  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = dirX >= 0 ? 1 : -1;
  const stepY = dirY >= 0 ? 1 : -1;
  const stepZ = dirZ >= 0 ? 1 : -1;

  const tDeltaX = dirX === 0 ? Infinity : Math.abs(1 / dirX);
  const tDeltaY = dirY === 0 ? Infinity : Math.abs(1 / dirY);
  const tDeltaZ = dirZ === 0 ? Infinity : Math.abs(1 / dirZ);

  const frac = (v: number, step: number) => {
    const f = v - Math.floor(v);
    return step > 0 ? 1 - f : f === 0 ? 1 : f;
  };

  let tMaxX = dirX === 0 ? Infinity : tDeltaX * frac(origin.x, stepX);
  let tMaxY = dirY === 0 ? Infinity : tDeltaY * frac(origin.y, stepY);
  let tMaxZ = dirZ === 0 ? Infinity : tDeltaZ * frac(origin.z, stepZ);

  let face: [number, number, number] = [0, 0, 0];
  let t = 0;
  let entered = false;
  let lastAir: { x: number; y: number; z: number; face: [number, number, number]; t: number } | null =
    null;

  const airPlacementHit = (): LocalRayHit | null => {
    if (!lastAir) return null;
    return {
      x: lastAir.x,
      y: lastAir.y,
      z: lastAir.z,
      px: lastAir.x,
      py: lastAir.y,
      pz: lastAir.z,
      face: lastAir.face,
      distance: lastAir.t,
    };
  };

  for (let i = 0; i < 128; i++) {
    if (t > maxDist) return airPlacementHit();

    if (inGrid(x, y, z)) {
      entered = true;
      const b = getBlock(x, y, z);
      if (b !== Block.Air && b !== Block.Water) {
        const px = x + face[0];
        const py = y + face[1];
        const pz = z + face[2];
        const placeInBounds = inGrid(px, py, pz);
        return {
          x,
          y,
          z,
          px: placeInBounds ? px : x,
          py: placeInBounds ? py : y,
          pz: placeInBounds ? pz : z,
          face,
          distance: t,
        };
      }
      lastAir = { x, y, z, face: [face[0], face[1], face[2]], t };
    } else if (entered) {
      return airPlacementHit();
    }

    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        t = tMaxX;
        x += stepX;
        tMaxX += tDeltaX;
        face = [-stepX, 0, 0];
      } else {
        t = tMaxZ;
        z += stepZ;
        tMaxZ += tDeltaZ;
        face = [0, 0, -stepZ];
      }
    } else if (tMaxY < tMaxZ) {
      t = tMaxY;
      y += stepY;
      tMaxY += tDeltaY;
      face = [0, -stepY, 0];
    } else {
      t = tMaxZ;
      z += stepZ;
      tMaxZ += tDeltaZ;
      face = [0, 0, -stepZ];
    }
  }

  return airPlacementHit();
}

/** Build a world-space ray from a viewport camera and pointer NDC. */
export function cameraRayFromNdc(
  camera: THREE.Camera,
  ndcX: number,
  ndcY: number,
): { origin: THREE.Vector3; direction: THREE.Vector3 } {
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  camera.getWorldPosition(origin);
  direction.set(ndcX, ndcY, 0.5).unproject(camera).sub(origin).normalize();
  return { origin, direction };
}

import { Block, CHUNK_HEIGHT } from './blocks';

export interface RayHit {
  /** Block that was hit (solid). */
  x: number;
  y: number;
  z: number;
  /** Empty cell adjacent to the hit face — where a new block would be placed. */
  px: number;
  py: number;
  pz: number;
  face: [number, number, number];
  distance: number;
}

/**
 * Amanatides & Woo grid traversal from origin along direction.
 * Returns the first solid voxel within maxDist, or null.
 */
export function voxelRaycast(
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  maxDist: number,
  getBlock: (x: number, y: number, z: number) => number,
): RayHit | null {
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

  for (let i = 0; i < 128; i++) {
    if (t > maxDist) return null;
    if (y >= 0 && y < CHUNK_HEIGHT) {
      const b = getBlock(x, y, z);
      if (b !== Block.Air && b !== Block.Water) {
        // `face` is the outward normal of the side we entered through
        // (points toward the player). Place in the empty cell on that side.
        return {
          x,
          y,
          z,
          px: x + face[0],
          py: y + face[1],
          pz: z + face[2],
          face,
          distance: t,
        };
      }
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

  return null;
}

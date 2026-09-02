import { Block, CHUNK_HEIGHT, isFluid } from '../world/blocks';

export type BlockFace = 'north' | 'south' | 'east' | 'west' | 'top' | 'bottom';

export interface BlockHitResult {
  hit: boolean;
  blockId: number;
  blockPosition: { x: number; y: number; z: number };
  placePosition: { x: number; y: number; z: number };
  hitPosition: { x: number; y: number; z: number };
  face: BlockFace;
  faceNormal: [number, number, number];
  distance: number;
}

/**
 * Maps a face normal vector to standard voxel face name.
 */
export function normalToFace(normal: [number, number, number]): BlockFace {
  const [nx, ny, nz] = normal;
  if (ny > 0) return 'top';
  if (ny < 0) return 'bottom';
  if (nz < 0) return 'north';
  if (nz > 0) return 'south';
  if (nx > 0) return 'east';
  return 'west';
}

/**
 * Maps standard voxel face name to outward normal vector.
 */
export function faceToNormal(face: BlockFace): [number, number, number] {
  switch (face) {
    case 'top':
      return [0, 1, 0];
    case 'bottom':
      return [0, -1, 0];
    case 'north':
      return [0, 0, -1];
    case 'south':
      return [0, 0, 1];
    case 'east':
      return [1, 0, 0];
    case 'west':
      return [-1, 0, 0];
  }
}

/**
 * Fast Amanatides & Woo voxel grid traversal from origin along direction.
 * Raycast stops at the first solid/interactive voxel within maxDist.
 * Does not pass through solid blocks.
 */
export function raycastBlock(
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  maxDist: number,
  getBlock: (x: number, y: number, z: number) => number,
  includeFluids = false,
): BlockHitResult | null {
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

  let faceNormal: [number, number, number] = [0, 0, 0];
  let t = 0;

  for (let i = 0; i < 128; i++) {
    if (t > maxDist) return null;

    if (y >= 0 && y < CHUNK_HEIGHT) {
      const b = getBlock(x, y, z);
      const isSolidTarget = b !== Block.Air && (includeFluids || !isFluid(b));
      if (isSolidTarget) {
        const hitX = origin.x + dirX * t;
        const hitY = origin.y + dirY * t;
        const hitZ = origin.z + dirZ * t;
        const face = normalToFace(faceNormal);

        return {
          hit: true,
          blockId: b,
          blockPosition: { x, y, z },
          placePosition: {
            x: x + faceNormal[0],
            y: y + faceNormal[1],
            z: z + faceNormal[2],
          },
          hitPosition: { x: hitX, y: hitY, z: hitZ },
          face,
          faceNormal,
          distance: t,
        };
      }
    }

    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        t = tMaxX;
        x += stepX;
        tMaxX += tDeltaX;
        faceNormal = [-stepX, 0, 0];
      } else {
        t = tMaxZ;
        z += stepZ;
        tMaxZ += tDeltaZ;
        faceNormal = [0, 0, -stepZ];
      }
    } else if (tMaxY < tMaxZ) {
      t = tMaxY;
      y += stepY;
      tMaxY += tDeltaY;
      faceNormal = [0, -stepY, 0];
    } else {
      t = tMaxZ;
      z += stepZ;
      tMaxZ += tDeltaZ;
      faceNormal = [0, 0, -stepZ];
    }
  }

  return null;
}

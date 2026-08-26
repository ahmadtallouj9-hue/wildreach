import { Block } from '../world/blocks';
import { LOCAL_GRID_SIZE } from './constants';
import type { Cell } from './EditorTools';
import type { LocalVoxelGrid } from './LocalVoxelGrid';

export type ExtrudeMode = 'pull' | 'push';

export type FaceNormal = [number, number, number];

/** Two tangent axes perpendicular to an axis-aligned face normal. */
export function tangentAxes(normal: FaceNormal): [FaceNormal, FaceNormal] {
  const ax = Math.abs(normal[0]);
  const ay = Math.abs(normal[1]);
  const az = Math.abs(normal[2]);
  if (ax >= ay && ax >= az) {
    return [
      [0, 1, 0],
      [0, 0, 1],
    ];
  }
  if (ay >= ax && ay >= az) {
    return [
      [1, 0, 0],
      [0, 0, 1],
    ];
  }
  return [
    [1, 0, 0],
    [0, 1, 0],
  ];
}

function inBounds(x: number, y: number, z: number): boolean {
  return (
    x >= 0 &&
    x < LOCAL_GRID_SIZE &&
    y >= 0 &&
    y < LOCAL_GRID_SIZE &&
    z >= 0 &&
    z < LOCAL_GRID_SIZE
  );
}

function isExposedSurface(
  grid: LocalVoxelGrid,
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number,
): boolean {
  if (grid.get(x, y, z) === Block.Air) return false;
  const ax = x + nx;
  const ay = y + ny;
  const az = z + nz;
  // Outside the volume counts as empty — still an exposed face.
  if (!inBounds(ax, ay, az)) return true;
  return grid.get(ax, ay, az) === Block.Air;
}

/**
 * MagicaVoxel-style 2D surface BFS: connected occupied voxels on the hit plane
 * whose face along `normal` is exposed (adjacent cell empty / OOB).
 */
export function collectExposedFacePatch(
  grid: LocalVoxelGrid,
  hit: Cell,
  normal: FaceNormal,
): Cell[] {
  const [nx, ny, nz] = normal;
  if (nx === 0 && ny === 0 && nz === 0) return [];
  if (!inBounds(hit.x, hit.y, hit.z)) return [];
  if (!isExposedSurface(grid, hit.x, hit.y, hit.z, nx, ny, nz)) return [];

  const plane =
    nx !== 0 ? ('x' as const) : ny !== 0 ? ('y' as const) : ('z' as const);
  const planeValue = plane === 'x' ? hit.x : plane === 'y' ? hit.y : hit.z;
  const [t0, t1] = tangentAxes(normal);

  const out: Cell[] = [];
  const seen = new Uint8Array(LOCAL_GRID_SIZE * LOCAL_GRID_SIZE * LOCAL_GRID_SIZE);
  const idx = (x: number, y: number, z: number) =>
    x + z * LOCAL_GRID_SIZE + y * LOCAL_GRID_SIZE * LOCAL_GRID_SIZE;
  const queue: Cell[] = [{ x: hit.x, y: hit.y, z: hit.z }];
  seen[idx(hit.x, hit.y, hit.z)] = 1;

  while (queue.length) {
    const c = queue.shift()!;
    out.push(c);
    for (const [dx, dy, dz] of [t0, t1, [-t0[0], -t0[1], -t0[2]], [-t1[0], -t1[1], -t1[2]]]) {
      const x = c.x + dx!;
      const y = c.y + dy!;
      const z = c.z + dz!;
      if (!inBounds(x, y, z)) continue;
      const i = idx(x, y, z);
      if (seen[i]) continue;
      const onPlane =
        plane === 'x' ? x === planeValue : plane === 'y' ? y === planeValue : z === planeValue;
      if (!onPlane) continue;
      if (grid.get(x, y, z) === Block.Air) continue;
      if (!isExposedSurface(grid, x, y, z, nx, ny, nz)) continue;
      seen[i] = 1;
      queue.push({ x, y, z });
    }
  }
  return out;
}

/**
 * Apply one-step MagicaVoxel face extrude.
 * PULL: write active block into `pos + normal` for each surface voxel.
 * PUSH: clear `pos` (inset/erase the surface layer).
 * Returns number of cells written.
 */
export function applyFaceExtrude(
  grid: LocalVoxelGrid,
  hit: Cell,
  normal: FaceNormal,
  mode: ExtrudeMode,
  activeBlock: number,
  emissive = false,
): number {
  const patch = collectExposedFacePatch(grid, hit, normal);
  if (!patch.length) return 0;

  const [nx, ny, nz] = normal;
  let n = 0;

  if (mode === 'pull') {
    for (const c of patch) {
      const x = c.x + nx;
      const y = c.y + ny;
      const z = c.z + nz;
      if (!inBounds(x, y, z)) continue;
      if (grid.get(x, y, z) !== Block.Air) continue;
      if (!grid.canWriteAt(x, y, z, false)) continue;
      grid.set(x, y, z, activeBlock);
      if (emissive) grid.setEmissive(x, y, z, true);
      n++;
    }
    return n;
  }

  // PUSH — erase the exposed surface layer.
  for (const c of patch) {
    if (grid.get(c.x, c.y, c.z) === Block.Air) continue;
    grid.set(c.x, c.y, c.z, Block.Air);
    grid.setEmissive(c.x, c.y, c.z, false);
    n++;
  }
  return n;
}

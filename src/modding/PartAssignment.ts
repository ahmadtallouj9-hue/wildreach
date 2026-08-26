import { Block } from '../world/blocks';
import { LOCAL_GRID_SIZE, LOCAL_GRID_VOLUME } from './constants';
import { LocalVoxelGrid } from './LocalVoxelGrid';
import type { ModPart, Vec3 } from './ModAsset';

/** Per-voxel part index (0..parts.length-1). Same length as voxel buffer. */
export type PartMask = Uint8Array;

export function createPartMask(): PartMask {
  return new Uint8Array(LOCAL_GRID_VOLUME);
}

export function partMaskFromArray(data: number[] | undefined, partCount: number): PartMask {
  const mask = createPartMask();
  if (!data || data.length !== LOCAL_GRID_VOLUME) return mask;
  for (let i = 0; i < mask.length; i++) {
    const idx = data[i]!;
    mask[i] = idx < partCount ? idx : 0;
  }
  return mask;
}

export function partMaskToArray(mask: PartMask): number[] {
  return Array.from(mask);
}

export function partIndexForVoxel(mask: PartMask, x: number, y: number, z: number, grid: LocalVoxelGrid): number {
  if (grid.get(x, y, z) === Block.Air) return -1;
  return mask[grid.index(x, y, z)] ?? 0;
}

/** Assign all solid voxels inside an inclusive AABB to a part index. */
export function assignBoxToPart(
  mask: PartMask,
  grid: LocalVoxelGrid,
  partIndex: number,
  min: Vec3,
  max: Vec3,
): number {
  const x0 = Math.max(0, Math.min(min.x, max.x));
  const y0 = Math.max(0, Math.min(min.y, max.y));
  const z0 = Math.max(0, Math.min(min.z, max.z));
  const x1 = Math.min(LOCAL_GRID_SIZE - 1, Math.max(min.x, max.x));
  const y1 = Math.min(LOCAL_GRID_SIZE - 1, Math.max(min.y, max.y));
  const z1 = Math.min(LOCAL_GRID_SIZE - 1, Math.max(min.z, max.z));
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (grid.get(x, y, z) === Block.Air) continue;
        mask[grid.index(x, y, z)] = partIndex;
        n++;
      }
    }
  }
  return n;
}

export function countVoxelsForPart(mask: PartMask, grid: LocalVoxelGrid, partIndex: number): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) {
    if (grid.voxels[i] !== Block.Air && mask[i] === partIndex) n++;
  }
  return n;
}

/** Paint-selection mask (1 = selected solid voxel). */
export type VoxelSelection = Uint8Array;

export function createVoxelSelection(): VoxelSelection {
  return new Uint8Array(LOCAL_GRID_VOLUME);
}

export function countSelection(selection: VoxelSelection, grid: LocalVoxelGrid): number {
  let n = 0;
  for (let i = 0; i < selection.length; i++) {
    if (selection[i] && grid.voxels[i] !== Block.Air) n++;
  }
  return n;
}

/** Assign every selected solid voxel to a part index. Returns count assigned. */
export function assignSelectionToPart(
  mask: PartMask,
  grid: LocalVoxelGrid,
  partIndex: number,
  selection: VoxelSelection,
): number {
  let n = 0;
  for (let i = 0; i < selection.length; i++) {
    if (!selection[i] || grid.voxels[i] === Block.Air) continue;
    mask[i] = partIndex;
    n++;
  }
  return n;
}

/** Bounding-box center of selected solid voxels (for part pivot). */
export function selectionPivot(selection: VoxelSelection, grid: LocalVoxelGrid): Vec3 | null {
  let minX = LOCAL_GRID_SIZE;
  let minY = LOCAL_GRID_SIZE;
  let minZ = LOCAL_GRID_SIZE;
  let maxX = -1;
  let maxY = -1;
  let maxZ = -1;
  for (let i = 0; i < selection.length; i++) {
    if (!selection[i] || grid.voxels[i] === Block.Air) continue;
    const x = i % LOCAL_GRID_SIZE;
    const y = Math.floor(i / (LOCAL_GRID_SIZE * LOCAL_GRID_SIZE));
    const z = Math.floor(i / LOCAL_GRID_SIZE) % LOCAL_GRID_SIZE;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  if (maxX < 0) return null;
  return {
    x: Math.round((minX + maxX) * 0.5),
    y: Math.round((minY + maxY) * 0.5),
    z: Math.round((minZ + maxZ) * 0.5),
  };
}

/** Face-adjacent flood fill of solid voxels into the selection mask. */
export function selectConnectedChunk(
  selection: VoxelSelection,
  grid: LocalVoxelGrid,
  sx: number,
  sy: number,
  sz: number,
  value = 1,
): number {
  if (grid.get(sx, sy, sz) === Block.Air) return 0;
  const start = grid.index(sx, sy, sz);
  if (selection[start] === value) return 0;

  const stack: number[] = [start];
  let n = 0;
  const dirs = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ] as const;

  while (stack.length) {
    const i = stack.pop()!;
    if (selection[i] === value) continue;
    if (grid.voxels[i] === Block.Air) continue;
    selection[i] = value;
    n++;
    const x = i % LOCAL_GRID_SIZE;
    const y = Math.floor(i / (LOCAL_GRID_SIZE * LOCAL_GRID_SIZE));
    const z = Math.floor(i / LOCAL_GRID_SIZE) % LOCAL_GRID_SIZE;
    for (const [dx, dy, dz] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (
        nx < 0 ||
        ny < 0 ||
        nz < 0 ||
        nx >= LOCAL_GRID_SIZE ||
        ny >= LOCAL_GRID_SIZE ||
        nz >= LOCAL_GRID_SIZE
      ) {
        continue;
      }
      const ni = grid.index(nx, ny, nz);
      if (selection[ni] === value) continue;
      if (grid.voxels[ni] === Block.Air) continue;
      stack.push(ni);
    }
  }
  return n;
}

/** Build a grid containing only selected voxels (for selection overlay mesh). */
export function cloneGridForSelection(grid: LocalVoxelGrid, selection: VoxelSelection): LocalVoxelGrid {
  const out = new LocalVoxelGrid();
  for (let i = 0; i < grid.voxels.length; i++) {
    if (selection[i] && grid.voxels[i] !== Block.Air) out.voxels[i] = grid.voxels[i]!;
  }
  return out;
}

export function cloneGridForPart(grid: LocalVoxelGrid, mask: PartMask, partIndex: number): LocalVoxelGrid {
  const out = new LocalVoxelGrid();
  for (let i = 0; i < grid.voxels.length; i++) {
    if (grid.voxels[i] !== Block.Air && mask[i] === partIndex) {
      out.voxels[i] = grid.voxels[i]!;
    }
  }
  return out;
}

export function newPartId(parts: ModPart[]): string {
  let n = parts.length;
  while (parts.some((p) => p.id === `part-${n}`)) n++;
  return `part-${n}`;
}

/** Select every solid voxel belonging to a part index. */
export function selectPartVoxels(
  selection: VoxelSelection,
  mask: PartMask,
  grid: LocalVoxelGrid,
  partIndex: number,
): number {
  selection.fill(0);
  let n = 0;
  for (let i = 0; i < selection.length; i++) {
    if (grid.voxels[i] !== Block.Air && mask[i] === partIndex) {
      selection[i] = 1;
      n++;
    }
  }
  return n;
}

/** Invert selection among solid voxels only. */
export function invertSolidSelection(selection: VoxelSelection, grid: LocalVoxelGrid): number {
  let n = 0;
  for (let i = 0; i < selection.length; i++) {
    if (grid.voxels[i] === Block.Air) {
      selection[i] = 0;
      continue;
    }
    selection[i] = selection[i] ? 0 : 1;
    if (selection[i]) n++;
  }
  return n;
}

/** Grow selection by one face-adjacent solid voxel ring. */
export function growSelection(selection: VoxelSelection, grid: LocalVoxelGrid): number {
  const next = createVoxelSelection();
  next.set(selection);
  const dirs = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ] as const;
  for (let i = 0; i < selection.length; i++) {
    if (!selection[i]) continue;
    const x = i % LOCAL_GRID_SIZE;
    const y = Math.floor(i / (LOCAL_GRID_SIZE * LOCAL_GRID_SIZE));
    const z = Math.floor(i / LOCAL_GRID_SIZE) % LOCAL_GRID_SIZE;
    for (const [dx, dy, dz] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (
        nx < 0 ||
        ny < 0 ||
        nz < 0 ||
        nx >= LOCAL_GRID_SIZE ||
        ny >= LOCAL_GRID_SIZE ||
        nz >= LOCAL_GRID_SIZE
      ) {
        continue;
      }
      const ni = grid.index(nx, ny, nz);
      if (grid.voxels[ni] !== Block.Air) next[ni] = 1;
    }
  }
  selection.set(next);
  return countSelection(selection, grid);
}

/** Average of selected solid voxel centers — for pivot centering. */
export function selectionCentroid(
  selection: VoxelSelection,
  grid: LocalVoxelGrid,
): Vec3 | null {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let n = 0;
  for (let i = 0; i < selection.length; i++) {
    if (!selection[i] || grid.voxels[i] === Block.Air) continue;
    sx += i % LOCAL_GRID_SIZE;
    sy += Math.floor(i / (LOCAL_GRID_SIZE * LOCAL_GRID_SIZE));
    sz += Math.floor(i / LOCAL_GRID_SIZE) % LOCAL_GRID_SIZE;
    n++;
  }
  if (!n) return null;
  return {
    x: Math.round(sx / n),
    y: Math.round(sy / n),
    z: Math.round(sz / n),
  };
}

/** Centroid of all solid voxels in a part. */
export function partCentroid(mask: PartMask, grid: LocalVoxelGrid, partIndex: number): Vec3 | null {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let n = 0;
  for (let i = 0; i < mask.length; i++) {
    if (grid.voxels[i] === Block.Air || mask[i] !== partIndex) continue;
    sx += i % LOCAL_GRID_SIZE;
    sy += Math.floor(i / (LOCAL_GRID_SIZE * LOCAL_GRID_SIZE));
    sz += Math.floor(i / LOCAL_GRID_SIZE) % LOCAL_GRID_SIZE;
    n++;
  }
  if (!n) return null;
  return {
    x: Math.round(sx / n),
    y: Math.round(sy / n),
    z: Math.round(sz / n),
  };
}

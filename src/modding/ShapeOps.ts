import { Block } from '../world/blocks';
import { LOCAL_GRID_SIZE } from './constants';
import type { LocalVoxelGrid } from './LocalVoxelGrid';

const S = LOCAL_GRID_SIZE;

function idx(x: number, y: number, z: number): number {
  return x + z * S + y * S * S;
}

function snapshot(grid: LocalVoxelGrid): { v: Uint8Array; e: Uint8Array } {
  return { v: new Uint8Array(grid.voxels), e: new Uint8Array(grid.emissive) };
}

function restore(grid: LocalVoxelGrid, snap: { v: Uint8Array; e: Uint8Array }): void {
  grid.voxels.set(snap.v);
  grid.emissive.set(snap.e);
  grid.recount();
}

function remap(
  grid: LocalVoxelGrid,
  map: (x: number, y: number, z: number) => { x: number; y: number; z: number },
): boolean {
  const src = snapshot(grid);
  grid.clear();
  let any = false;
  for (let y = 0; y < S; y++) {
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        const i = idx(x, y, z);
        const b = src.v[i]!;
        if (b === Block.Air) continue;
        const p = map(x, y, z);
        if (p.x < 0 || p.y < 0 || p.z < 0 || p.x >= S || p.y >= S || p.z >= S) continue;
        grid.set(p.x, p.y, p.z, b);
        if (src.e[i]) grid.setEmissive(p.x, p.y, p.z, true);
        any = true;
      }
    }
  }
  return any;
}

export function flipGrid(grid: LocalVoxelGrid, axis: 'x' | 'y' | 'z'): boolean {
  const m = S - 1;
  if (axis === 'x') return remap(grid, (x, y, z) => ({ x: m - x, y, z }));
  if (axis === 'y') return remap(grid, (x, y, z) => ({ x, y: m - y, z }));
  return remap(grid, (x, y, z) => ({ x, y, z: m - z }));
}

export function rotateGrid90(grid: LocalVoxelGrid, axis: 'x' | 'y' | 'z'): boolean {
  const c = (S - 1) / 2;
  if (axis === 'y') {
    return remap(grid, (x, y, z) => ({
      x: Math.round(c + (z - c)),
      y,
      z: Math.round(c - (x - c)),
    }));
  }
  if (axis === 'x') {
    return remap(grid, (x, y, z) => ({
      x,
      y: Math.round(c - (z - c)),
      z: Math.round(c + (y - c)),
    }));
  }
  return remap(grid, (x, y, z) => ({
    x: Math.round(c - (y - c)),
    y: Math.round(c + (x - c)),
    z,
  }));
}

function bounds(grid: LocalVoxelGrid): { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number } | null {
  let minX = S, minY = S, minZ = S, maxX = -1, maxY = -1, maxZ = -1;
  for (let y = 0; y < S; y++) {
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        if (grid.get(x, y, z) === Block.Air) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
      }
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

export function centerGrid(grid: LocalVoxelGrid): boolean {
  const b = bounds(grid);
  if (!b) return false;
  const cx = Math.floor((b.minX + b.maxX) / 2);
  const cy = Math.floor((b.minY + b.maxY) / 2);
  const cz = Math.floor((b.minZ + b.maxZ) / 2);
  const tx = Math.floor((S - 1) / 2) - cx;
  const ty = Math.floor((S - 1) / 2) - cy;
  const tz = Math.floor((S - 1) / 2) - cz;
  if (!tx && !ty && !tz) return false;
  return translateGrid(grid, tx, ty, tz);
}

export function floorGrid(grid: LocalVoxelGrid): boolean {
  const b = bounds(grid);
  if (!b || b.minY === 0) return false;
  return translateGrid(grid, 0, -b.minY, 0);
}

export function translateGrid(grid: LocalVoxelGrid, dx: number, dy: number, dz: number): boolean {
  if (!dx && !dy && !dz) return false;
  return remap(grid, (x, y, z) => ({ x: x + dx, y: y + dy, z: z + dz }));
}

/** Keep only voxels with at least one air neighbor (shell). */
export function hollowGrid(grid: LocalVoxelGrid): boolean {
  const src = snapshot(grid);
  let any = false;
  for (let y = 0; y < S; y++) {
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        const i = idx(x, y, z);
        if (src.v[i] === Block.Air) continue;
        const interior =
          x > 0 && x < S - 1 &&
          y > 0 && y < S - 1 &&
          z > 0 && z < S - 1 &&
          src.v[idx(x - 1, y, z)] !== Block.Air &&
          src.v[idx(x + 1, y, z)] !== Block.Air &&
          src.v[idx(x, y - 1, z)] !== Block.Air &&
          src.v[idx(x, y + 1, z)] !== Block.Air &&
          src.v[idx(x, y, z - 1)] !== Block.Air &&
          src.v[idx(x, y, z + 1)] !== Block.Air;
        if (interior) {
          grid.set(x, y, z, Block.Air);
          any = true;
        }
      }
    }
  }
  return any;
}

/** Expand every solid by 1 (von Neumann). */
export function shellExpand(grid: LocalVoxelGrid, block: number, emissive: boolean): boolean {
  const src = snapshot(grid);
  let any = false;
  const dirs = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ] as const;
  for (let y = 0; y < S; y++) {
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        if (src.v[idx(x, y, z)] === Block.Air) continue;
        for (const [dx, dy, dz] of dirs) {
          const nx = x + dx;
          const ny = y + dy;
          const nz = z + dz;
          if (nx < 0 || ny < 0 || nz < 0 || nx >= S || ny >= S || nz >= S) continue;
          if (src.v[idx(nx, ny, nz)] !== Block.Air) continue;
          if (!grid.canPlaceAt(nx, ny, nz) && grid.get(nx, ny, nz) === Block.Air) continue;
          if (grid.get(nx, ny, nz) !== Block.Air) continue;
          grid.set(nx, ny, nz, block);
          if (emissive) grid.setEmissive(nx, ny, nz, true);
          any = true;
        }
      }
    }
  }
  return any;
}

export function replaceColor(grid: LocalVoxelGrid, from: number, to: number, emissive: boolean): number {
  if (from === to || from === Block.Air) return 0;
  let n = 0;
  for (let y = 0; y < S; y++) {
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        if (grid.get(x, y, z) !== from) continue;
        grid.set(x, y, z, to);
        if (emissive) grid.setEmissive(x, y, z, true);
        n++;
      }
    }
  }
  return n;
}

/** 3D flood fill of contiguous air (or matching color) from seed. */
export function floodFill(
  grid: LocalVoxelGrid,
  sx: number,
  sy: number,
  sz: number,
  block: number,
  emissive: boolean,
  mode: 'air' | 'same',
): number {
  if (!grid.inBounds(sx, sy, sz)) return 0;
  const target = grid.get(sx, sy, sz);
  if (mode === 'air' && target !== Block.Air) return 0;
  if (mode === 'same' && target === Block.Air) return 0;
  if (mode === 'same' && target === block) return 0;

  const stack: number[] = [idx(sx, sy, sz)];
  const seen = new Uint8Array(S * S * S);
  let n = 0;
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i]) continue;
    seen[i] = 1;
    const x = i % S;
    const y = Math.floor(i / (S * S));
    const z = Math.floor((i % (S * S)) / S);
    const cur = grid.voxels[i]!;
    if (mode === 'air' && cur !== Block.Air) continue;
    if (mode === 'same' && cur !== target) continue;
    if (mode === 'air' && grid.isFull()) break;

    if (mode === 'air') {
      grid.set(x, y, z, block);
      if (emissive) grid.setEmissive(x, y, z, true);
    } else {
      grid.set(x, y, z, block);
      if (emissive) grid.setEmissive(x, y, z, true);
    }
    n++;
    const push = (nx: number, ny: number, nz: number) => {
      if (nx < 0 || ny < 0 || nz < 0 || nx >= S || ny >= S || nz >= S) return;
      const ni = idx(nx, ny, nz);
      if (!seen[ni]) stack.push(ni);
    };
    push(x + 1, y, z);
    push(x - 1, y, z);
    push(x, y + 1, z);
    push(x, y - 1, z);
    push(x, y, z + 1);
    push(x, y, z - 1);
  }
  return n;
}

export function toggleGlowAll(grid: LocalVoxelGrid, on: boolean): number {
  let n = 0;
  for (let y = 0; y < S; y++) {
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        if (grid.get(x, y, z) === Block.Air) continue;
        grid.setEmissive(x, y, z, on);
        n++;
      }
    }
  }
  return n;
}

export function clearLayerY(grid: LocalVoxelGrid, y: number): number {
  let n = 0;
  for (let z = 0; z < S; z++) {
    for (let x = 0; x < S; x++) {
      if (grid.get(x, y, z) === Block.Air) continue;
      grid.set(x, y, z, Block.Air);
      n++;
    }
  }
  return n;
}

export function fillLayerY(grid: LocalVoxelGrid, y: number, block: number, emissive: boolean): number {
  let n = 0;
  for (let z = 0; z < S; z++) {
    for (let x = 0; x < S; x++) {
      if (!grid.canPlaceAt(x, y, z)) continue;
      grid.set(x, y, z, block);
      if (emissive) grid.setEmissive(x, y, z, true);
      n++;
    }
  }
  return n;
}

export interface ShapeClipboard {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  voxels: Uint8Array;
  emissive: Uint8Array;
}

export function copySelection(grid: LocalVoxelGrid): ShapeClipboard | null {
  const b = bounds(grid);
  if (!b) return null;
  const sizeX = b.maxX - b.minX + 1;
  const sizeY = b.maxY - b.minY + 1;
  const sizeZ = b.maxZ - b.minZ + 1;
  const voxels = new Uint8Array(sizeX * sizeY * sizeZ);
  const emissive = new Uint8Array(sizeX * sizeY * sizeZ);
  let i = 0;
  for (let y = b.minY; y <= b.maxY; y++) {
    for (let z = b.minZ; z <= b.maxZ; z++) {
      for (let x = b.minX; x <= b.maxX; x++) {
        voxels[i] = grid.get(x, y, z);
        emissive[i] = grid.getEmissive(x, y, z) ? 1 : 0;
        i++;
      }
    }
  }
  return { sizeX, sizeY, sizeZ, voxels, emissive };
}

export function pasteClipboard(grid: LocalVoxelGrid, clip: ShapeClipboard, ox: number, oy: number, oz: number): number {
  let n = 0;
  let i = 0;
  for (let y = 0; y < clip.sizeY; y++) {
    for (let z = 0; z < clip.sizeZ; z++) {
      for (let x = 0; x < clip.sizeX; x++) {
        const b = clip.voxels[i]!;
        const e = clip.emissive[i]! === 1;
        i++;
        if (b === Block.Air) continue;
        const gx = ox + x;
        const gy = oy + y;
        const gz = oz + z;
        if (!grid.inBounds(gx, gy, gz)) continue;
        if (grid.get(gx, gy, gz) === Block.Air && grid.isFull()) continue;
        grid.set(gx, gy, gz, b);
        if (e) grid.setEmissive(gx, gy, gz, true);
        n++;
      }
    }
  }
  return n;
}

export function duplicateInPlace(grid: LocalVoxelGrid): boolean {
  const clip = copySelection(grid);
  if (!clip) return false;
  return pasteClipboard(grid, clip, 1, 0, 1) > 0;
}

export { restore, snapshot };

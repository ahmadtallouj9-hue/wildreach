import { Block } from '../world/blocks';
import { LOCAL_GRID_SIZE, LOCAL_GRID_VOLUME } from './constants';
import type { PaletteEntry } from './editorPalette';

/** Serialized voxel model payload (Phase 2/3 extend with parts, scripts). */
export interface LocalModelData {
  version: 1;
  size: number;
  /** Dense block-id buffer (same as ModShapeExport.voxelData). */
  voxels: number[];
  palette?: PaletteEntry[];
  usedBlocks?: number[];
  /** Per-voxel index into ModAsset.parts (parallel to voxels). */
  partMask?: number[];
  /** Per-voxel emissive flag (0/1), parallel to voxels. */
  emissiveMask?: number[];
}

/**
 * Fixed-size voxel buffer for in-game custom models (32³ workspace).
 * Index layout matches world chunks: x + z·S + y·S².
 */
export class LocalVoxelGrid {
  readonly size = LOCAL_GRID_SIZE;
  readonly capacity = LOCAL_GRID_VOLUME;
  readonly voxels: Uint8Array;
  /** 1 = emissive glow on this voxel. */
  readonly emissive: Uint8Array;
  private filled = 0;

  constructor(copy?: Uint8Array, emissiveCopy?: Uint8Array) {
    const n = LOCAL_GRID_SIZE ** 3;
    this.voxels = copy ? new Uint8Array(copy) : new Uint8Array(n);
    this.emissive = emissiveCopy ? new Uint8Array(emissiveCopy) : new Uint8Array(n);
    this.recount();
  }

  index(x: number, y: number, z: number): number {
    return x + z * LOCAL_GRID_SIZE + y * LOCAL_GRID_SIZE * LOCAL_GRID_SIZE;
  }

  inBounds(x: number, y: number, z: number): boolean {
    return (
      x >= 0 &&
      x < LOCAL_GRID_SIZE &&
      y >= 0 &&
      y < LOCAL_GRID_SIZE &&
      z >= 0 &&
      z < LOCAL_GRID_SIZE
    );
  }

  get(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z)) return Block.Air;
    return this.voxels[this.index(x, y, z)]!;
  }

  getEmissive(x: number, y: number, z: number): boolean {
    if (!this.inBounds(x, y, z)) return false;
    return this.emissive[this.index(x, y, z)]! === 1;
  }

  setEmissive(x: number, y: number, z: number, on: boolean): void {
    if (!this.inBounds(x, y, z)) return;
    this.emissive[this.index(x, y, z)] = on ? 1 : 0;
  }

  /** Returns previous block id, or -1 if out of bounds. */
  set(x: number, y: number, z: number, block: number): number {
    if (!this.inBounds(x, y, z)) return -1;
    const i = this.index(x, y, z);
    const prev = this.voxels[i]!;
    this.voxels[i] = block;
    if (prev === Block.Air && block !== Block.Air) this.filled++;
    else if (prev !== Block.Air && block === Block.Air) this.filled--;
    if (block === Block.Air) this.emissive[i] = 0;
    return prev;
  }

  clear(): void {
    this.voxels.fill(Block.Air);
    this.emissive.fill(0);
    this.filled = 0;
  }

  recount(): void {
    let n = 0;
    for (let i = 0; i < this.voxels.length; i++) {
      if (this.voxels[i] !== Block.Air) n++;
    }
    this.filled = n;
  }

  filledCount(): number {
    return this.filled;
  }

  remainingCapacity(): number {
    return this.capacity - this.filled;
  }

  isFull(): boolean {
    return this.filled >= this.capacity;
  }

  /** Empty cell that can accept a new solid (respects capacity). */
  canPlaceAt(x: number, y: number, z: number): boolean {
    if (!this.inBounds(x, y, z)) return false;
    if (this.get(x, y, z) !== Block.Air) return false;
    return !this.isFull();
  }

  /** Cell is in-bounds and either air (with capacity) or already solid (overwrite). */
  canWriteAt(x: number, y: number, z: number, overwrite: boolean): boolean {
    if (!this.inBounds(x, y, z)) return false;
    const cur = this.get(x, y, z);
    if (cur !== Block.Air) return overwrite;
    return !this.isFull();
  }

  toData(): LocalModelData {
    return {
      version: 1,
      size: this.size,
      voxels: Array.from(this.voxels),
      emissiveMask: Array.from(this.emissive),
    };
  }

  static fromData(data: LocalModelData): LocalVoxelGrid {
    const grid = new LocalVoxelGrid();
    const srcSize = data.size | 0;
    if (!srcSize || !Array.isArray(data.voxels)) {
      throw new Error('LocalModelData size mismatch');
    }
    // Same size — direct copy.
    if (srcSize === LOCAL_GRID_SIZE && data.voxels.length === grid.voxels.length) {
      for (let i = 0; i < data.voxels.length; i++) grid.voxels[i] = data.voxels[i]!;
      if (Array.isArray(data.emissiveMask) && data.emissiveMask.length === grid.emissive.length) {
        for (let i = 0; i < data.emissiveMask.length; i++) {
          grid.emissive[i] = data.emissiveMask[i]! ? 1 : 0;
        }
      }
      grid.recount();
      return grid;
    }
    // Smaller models (e.g. legacy 16³) — paste centered into the larger workspace.
    if (srcSize < LOCAL_GRID_SIZE && data.voxels.length === srcSize ** 3) {
      const ox = Math.floor((LOCAL_GRID_SIZE - srcSize) / 2);
      const oy = Math.floor((LOCAL_GRID_SIZE - srcSize) / 2);
      const oz = Math.floor((LOCAL_GRID_SIZE - srcSize) / 2);
      for (let y = 0; y < srcSize; y++) {
        for (let z = 0; z < srcSize; z++) {
          for (let x = 0; x < srcSize; x++) {
            const si = x + z * srcSize + y * srcSize * srcSize;
            const v = data.voxels[si]!;
            if (!v) continue;
            grid.set(ox + x, oy + y, oz + z, v);
            if (Array.isArray(data.emissiveMask) && data.emissiveMask[si]) {
              grid.setEmissive(ox + x, oy + y, oz + z, true);
            }
          }
        }
      }
      grid.recount();
      return grid;
    }
    throw new Error('LocalModelData size mismatch');
  }
}

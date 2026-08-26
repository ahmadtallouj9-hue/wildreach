import { Block, CHUNK_SIZE, SEA_LEVEL } from './blocks';
import type { ColumnInfo } from './ColumnInfo';
import { WorldSeed } from './gen/SeedSystem';

export type LandmarkType = 'monolith' | 'overlook' | 'lake' | 'canyon';

export interface Landmark {
  id: string;
  type: LandmarkType;
  name: string;
  wx: number;
  wy: number;
  wz: number;
  cx: number;
  cz: number;
}

const NAMES: Record<LandmarkType, string[]> = {
  monolith: ['Stone Sentinel', 'Highreach Spire', 'Lone Pillar'],
  overlook: ['Ridgeview', 'Windcrest', 'Skyline Point'],
  lake: ['Mirror Basin', 'Stillmere', 'Hidden Pool'],
  canyon: ['Deepcut', 'Shadow Rift', 'Granite Gap'],
};

function hash(x: number, z: number, salt: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ (salt | 0);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Sparse deterministic landmarks — one candidate per 4×4 chunk region. */
export class LandmarkGen {
  private salt: number;

  constructor(seed: WorldSeed | string) {
    const ws = typeof seed === 'string' ? new WorldSeed(seed) : seed;
    this.salt = ws.derive('landmarks');
  }

  apply(
    cx: number,
    cz: number,
    voxels: Uint8Array,
    columns: ColumnInfo[],
  ): Landmark | null {
    const regionX = Math.floor(cx / 4);
    const regionZ = Math.floor(cz / 4);
    const r = hash(regionX, regionZ, this.salt);
    if (r > 0.18) return null;

    const ownerCx = regionX * 4 + Math.floor(hash(regionX + 1, regionZ, this.salt) * 4);
    const ownerCz = regionZ * 4 + Math.floor(hash(regionX, regionZ + 1, this.salt) * 4);
    if (ownerCx !== cx || ownerCz !== cz) return null;

    const wx = cx * CHUNK_SIZE + 8 + Math.floor(hash(cx, cz, this.salt + 2) * 8);
    const wz = cz * CHUNK_SIZE + 8 + Math.floor(hash(cx, cz, this.salt + 4) * 8);
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    const col = columns[lz * CHUNK_SIZE + lx];
    if (!col || col.height <= SEA_LEVEL + 2) return null;

    const types: LandmarkType[] = ['monolith', 'overlook', 'lake', 'canyon'];
    const type = types[Math.floor(hash(wx, wz, this.salt + 8) * types.length)]!;
    const nameList = NAMES[type];
    const name = nameList[Math.floor(hash(wx + wz, cx + cz, this.salt) * nameList.length)]!;

    switch (type) {
      case 'monolith':
        this.stampMonolith(voxels, lx, col.height + 1, lz);
        break;
      case 'overlook':
        this.stampOverlook(voxels, lx, col.height + 1, lz);
        break;
      case 'lake':
        this.stampLake(voxels, columns, lx, lz, col.height);
        break;
      case 'canyon':
        this.carveCanyon(voxels, columns, lx, lz, col.height);
        break;
    }

    return {
      id: `${type}-${wx}-${wz}`,
      type,
      name,
      wx,
      wy: col.height,
      wz,
      cx,
      cz,
    };
  }

  private stampMonolith(voxels: Uint8Array, lx: number, y: number, lz: number): void {
    for (let dy = 0; dy < 7; dy++) {
      setLocal(voxels, lx, y + dy, lz, Block.Stone);
      if (dy > 2) {
        setLocal(voxels, lx + 1, y + dy, lz, Block.Stone);
        setLocal(voxels, lx, y + dy, lz + 1, Block.Stone);
      }
    }
    setLocal(voxels, lx, y + 7, lz, Block.Gravel);
  }

  private stampOverlook(voxels: Uint8Array, lx: number, y: number, lz: number): void {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        setLocal(voxels, lx + dx, y, lz + dz, Block.Gravel);
        if (Math.abs(dx) + Math.abs(dz) <= 1) {
          setLocal(voxels, lx + dx, y + 1, lz + dz, Block.Stone);
        }
      }
    }
  }

  private stampLake(
    voxels: Uint8Array,
    columns: ColumnInfo[],
    lx: number,
    lz: number,
    surface: number,
  ): void {
    const level = surface - 2;
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dz * dz > 6) continue;
        const col = columns[(lz + dz) * CHUNK_SIZE + (lx + dx)];
        if (!col) continue;
        for (let y = level; y <= col.height; y++) {
          setLocal(voxels, lx + dx, y, lz + dz, y === level ? Block.Water : Block.Air);
        }
      }
    }
  }

  private carveCanyon(
    voxels: Uint8Array,
    columns: ColumnInfo[],
    lx: number,
    lz: number,
    surface: number,
  ): void {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const col = columns[(lz + dz) * CHUNK_SIZE + (lx + dx)];
        if (!col) continue;
        for (let y = col.height - 4; y <= col.height; y++) {
          if (y < surface - 5) continue;
          setLocal(voxels, lx + dx, y, lz + dz, Block.Air);
        }
        setLocal(voxels, lx + dx, col.height - 5, lz + dz, Block.Water);
      }
    }
  }
}

function setLocal(voxels: Uint8Array, x: number, y: number, z: number, b: number): void {
  if (x < 0 || z < 0 || x >= CHUNK_SIZE || z >= CHUNK_SIZE || y < 0 || y >= 144) return;
  voxels[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = b;
}

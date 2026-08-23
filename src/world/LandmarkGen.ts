import { Block, CHUNK_HEIGHT, CHUNK_SIZE } from './blocks';
import { BiomeId } from './Biomes';
import type { ColumnInfo } from './WorldGen';
import type { WorldGen } from './WorldGen';

export type LandmarkType = 'monolith' | 'ruin' | 'crystal' | 'overlook';

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

const LANDMARK_NAMES: Record<LandmarkType, string[]> = {
  monolith: ['Ashen Spire', 'Silent Obelisk', 'Veinstone Marker'],
  ruin: ['Fallen Ring', 'Broken Court', 'Mossward Ruins'],
  crystal: ['Glimmer Vein', 'Skyglass Cluster', 'Tide Crystal'],
  overlook: ['Wind Crest', 'Farwatch Rise', 'Edge of Reach'],
};

export class LandmarkGen {
  constructor(private world: WorldGen) {}

  /** Decide and stamp landmarks into a newly generated chunk. */
  apply(
    cx: number,
    cz: number,
    voxels: Uint8Array,
    columns: ColumnInfo[],
  ): Landmark | null {
    const chance = this.world.chunkChance(cx, cz, 99);
    if (chance > 0.07) return null;

    const lx = 4 + Math.floor(this.world.chunkChance(cx, cz, 11) * (CHUNK_SIZE - 8));
    const lz = 4 + Math.floor(this.world.chunkChance(cx, cz, 22) * (CHUNK_SIZE - 8));
    const col = columns[lz * CHUNK_SIZE + lx];
    if (!col || col.height <= 0) return null;

    // Prefer flatter / surface-friendly spots (skip deep water columns)
    if (col.height < 8) return null;

    const type = this.pickType(col.biome, this.world.chunkChance(cx, cz, 33));
    const wx = cx * CHUNK_SIZE + lx;
    const wz = cz * CHUNK_SIZE + lz;
    const wy = col.height + 1;

    switch (type) {
      case 'monolith':
        this.stampMonolith(voxels, lx, col.height + 1, lz);
        break;
      case 'ruin':
        this.stampRuin(voxels, lx, col.height + 1, lz);
        break;
      case 'crystal':
        this.stampCrystal(voxels, lx, col.height + 1, lz);
        break;
      case 'overlook':
        this.stampOverlook(voxels, lx, col.height + 1, lz);
        break;
    }

    const names = LANDMARK_NAMES[type];
    const name = names[Math.floor(this.world.chunkChance(cx, cz, 44) * names.length)];

    return {
      id: `${type}:${cx}:${cz}`,
      type,
      name,
      wx,
      wy,
      wz,
      cx,
      cz,
    };
  }

  private pickType(biome: BiomeId, r: number): LandmarkType {
    if (biome === BiomeId.Mountains) return r < 0.5 ? 'overlook' : 'crystal';
    if (biome === BiomeId.Desert) return r < 0.55 ? 'monolith' : 'ruin';
    if (biome === BiomeId.Wetlands) return r < 0.5 ? 'ruin' : 'crystal';
    if (biome === BiomeId.Forest) return r < 0.45 ? 'ruin' : 'monolith';
    return r < 0.4 ? 'monolith' : r < 0.7 ? 'ruin' : 'crystal';
  }

  private set(voxels: Uint8Array, x: number, y: number, z: number, b: number): void {
    if (x < 0 || z < 0 || y < 0 || x >= CHUNK_SIZE || z >= CHUNK_SIZE || y >= CHUNK_HEIGHT) return;
    voxels[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = b;
  }

  private stampMonolith(voxels: Uint8Array, x: number, y: number, z: number): void {
    const h = 8;
    for (let i = 0; i < h; i++) {
      this.set(voxels, x, y + i, z, Block.Ruin);
      this.set(voxels, x + 1, y + i, z, Block.Ruin);
    }
    this.set(voxels, x, y + h, z, Block.Crystal);
  }

  private stampRuin(voxels: Uint8Array, x: number, y: number, z: number): void {
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        if (Math.abs(dx) === 3 || Math.abs(dz) === 3) {
          this.set(voxels, x + dx, y, z + dz, Block.Ruin);
          if ((dx + dz) % 2 === 0) this.set(voxels, x + dx, y + 1, z + dz, Block.Ruin);
          if (Math.abs(dx) === 3 && Math.abs(dz) === 3) {
            this.set(voxels, x + dx, y + 2, z + dz, Block.Ruin);
          }
        }
      }
    }
  }

  private stampCrystal(voxels: Uint8Array, x: number, y: number, z: number): void {
    const spikes = [
      [0, 0, 5],
      [1, 0, 3],
      [-1, 1, 4],
      [0, -1, 3],
      [2, 1, 2],
    ];
    for (const [dx, dz, h] of spikes) {
      for (let i = 0; i < h; i++) {
        this.set(voxels, x + dx, y + i, z + dz, Block.Crystal);
      }
    }
  }

  private stampOverlook(voxels: Uint8Array, x: number, y: number, z: number): void {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        this.set(voxels, x + dx, y, z + dz, Block.Stone);
      }
    }
    for (let i = 1; i <= 4; i++) {
      this.set(voxels, x - 2, y + i, z - 2, Block.Ruin);
      this.set(voxels, x + 2, y + i, z - 2, Block.Ruin);
    }
    this.set(voxels, x, y + 1, z, Block.Crystal);
  }
}

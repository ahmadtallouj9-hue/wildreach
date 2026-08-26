import { Block, CHUNK_HEIGHT, CHUNK_SIZE, SEA_LEVEL } from '../blocks';
import { BiomeId } from '../Biomes';
import { hash3 } from './SeedSystem';
import type { WorldSeed } from './SeedSystem';
import type { ColumnInfo } from '../ColumnInfo';

/**
 * Sparse structures with region spacing. Origin chunk owns the structure.
 */
export class StructureGenerator {
  private salt: number;

  constructor(seed: WorldSeed) {
    this.salt = seed.derive('structures');
  }

  generate(cx: number, cz: number, voxels: Uint8Array, columns: ColumnInfo[]): void {
    this.tryRuin(cx, cz, voxels, columns);
    this.tryWell(cx, cz, voxels, columns);
  }

  private tryRuin(cx: number, cz: number, voxels: Uint8Array, columns: ColumnInfo[]): void {
    const region = 6;
    const rx = Math.floor(cx / region);
    const rz = Math.floor(cz / region);
    const pickX = rx * region + Math.floor(hash3(rx, 1, rz, this.salt) * region);
    const pickZ = rz * region + Math.floor(hash3(rx, 2, rz, this.salt) * region);
    if (pickX !== cx || pickZ !== cz) return;
    if (hash3(cx, 3, cz, this.salt) > 0.35) return;

    const lx = 4 + Math.floor(hash3(cx, 4, cz, this.salt) * 6);
    const lz = 4 + Math.floor(hash3(cx, 5, cz, this.salt) * 6);
    const col = columns[lz * CHUNK_SIZE + lx];
    if (!col || col.height <= SEA_LEVEL + 1) return;
    if (
      col.biome === BiomeId.Ocean ||
      col.biome === BiomeId.DeepOcean ||
      col.biome === BiomeId.River
    ) {
      return;
    }

    const y0 = col.height + 1;
    const w = 5;
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < w; dx++) {
        for (let dz = 0; dz < w; dz++) {
          const edge = dx === 0 || dz === 0 || dx === w - 1 || dz === w - 1;
          if (!edge && dy > 0) continue;
          if (dy === 3 && hash3(lx + dx, dy, lz + dz, this.salt) > 0.4) continue;
          set(voxels, lx + dx, y0 + dy, lz + dz, Block.Ruin);
        }
      }
    }
  }

  private tryWell(cx: number, cz: number, voxels: Uint8Array, columns: ColumnInfo[]): void {
    const region = 8;
    const rx = Math.floor(cx / region);
    const rz = Math.floor(cz / region);
    const pickX = rx * region + Math.floor(hash3(rx, 11, rz, this.salt + 7) * region);
    const pickZ = rz * region + Math.floor(hash3(rx, 12, rz, this.salt + 7) * region);
    if (pickX !== cx || pickZ !== cz) return;
    if (hash3(cx, 13, cz, this.salt) > 0.22) return;

    const lx = 6;
    const lz = 6;
    const col = columns[lz * CHUNK_SIZE + lx];
    if (!col || col.height < SEA_LEVEL + 2) return;
    if (col.biome === BiomeId.Desert || col.biome === BiomeId.Plains || col.biome === BiomeId.Savanna) {
      const y = col.height;
      for (let dy = -4; dy <= 1; dy++) {
        set(voxels, lx, y + dy, lz, dy < 0 ? Block.Water : Block.Ruin);
        set(voxels, lx + 1, y + dy, lz, Block.Ruin);
        set(voxels, lx - 1, y + dy, lz, Block.Ruin);
        set(voxels, lx, y + dy, lz + 1, Block.Ruin);
        set(voxels, lx, y + dy, lz - 1, Block.Ruin);
      }
    }
  }
}

function set(voxels: Uint8Array, x: number, y: number, z: number, b: number): void {
  if (x < 0 || z < 0 || y < 0 || x >= CHUNK_SIZE || z >= CHUNK_SIZE || y >= CHUNK_HEIGHT) return;
  voxels[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = b;
}

import { createNoise2D, createNoise3D } from 'simplex-noise';
import { Block, CHUNK_HEIGHT, CHUNK_SIZE, SEA_LEVEL } from './blocks';
import { BiomeId, pickBiome } from './Biomes';

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ColumnInfo {
  height: number;
  biome: BiomeId;
  surface: number;
}

export type TerrainType = 'balanced' | 'flat' | 'mountains' | 'islands' | 'wild';

export interface WorldGenOptions {
  terrain: TerrainType;
  caves: boolean;
}

export class WorldGen {
  readonly seed: string;
  private readonly options: WorldGenOptions;
  private heightNoise: ReturnType<typeof createNoise2D>;
  private ridgeNoise: ReturnType<typeof createNoise2D>;
  private tempNoise: ReturnType<typeof createNoise2D>;
  private moistNoise: ReturnType<typeof createNoise2D>;
  private caveNoise: ReturnType<typeof createNoise3D>;
  private detailNoise: ReturnType<typeof createNoise2D>;

  constructor(seed: string, options?: Partial<WorldGenOptions>) {
    this.seed = seed;
    this.options = {
      terrain: options?.terrain ?? 'balanced',
      caves: options?.caves !== false,
    };
    const base = hashSeed(seed);
    this.heightNoise = createNoise2D(mulberry32(base));
    this.ridgeNoise = createNoise2D(mulberry32(base + 1));
    this.tempNoise = createNoise2D(mulberry32(base + 2));
    this.moistNoise = createNoise2D(mulberry32(base + 3));
    this.caveNoise = createNoise3D(mulberry32(base + 4));
    this.detailNoise = createNoise2D(mulberry32(base + 5));
  }

  getTempMoist(wx: number, wz: number): { temp: number; moist: number } {
    const temp = this.tempNoise(wx * 0.0018, wz * 0.0018) * 0.5 + 0.5;
    const moist = this.moistNoise(wx * 0.0022, wz * 0.0022) * 0.5 + 0.5;
    return { temp, moist };
  }

  getBiome(wx: number, wz: number): BiomeId {
    const { temp, moist } = this.getTempMoist(wx, wz);
    return pickBiome(temp, moist);
  }

  getHeight(wx: number, wz: number): number {
    const biome = this.getBiome(wx, wz);
    const n1 = this.heightNoise(wx * 0.0035, wz * 0.0035);
    const n2 = this.heightNoise(wx * 0.012, wz * 0.012) * 0.35;
    const ridge = 1 - Math.abs(this.ridgeNoise(wx * 0.004, wz * 0.004));
    const detail = this.detailNoise(wx * 0.04, wz * 0.04) * 0.15;

    let h = SEA_LEVEL + n1 * 10 + n2 * 6 + detail * 3;

    switch (biome) {
      case BiomeId.Mountains:
        h += ridge * ridge * 28 + Math.max(0, n1) * 12;
        break;
      case BiomeId.Desert:
        h += n1 * 4 - 2;
        break;
      case BiomeId.Wetlands:
        h = Math.min(h, SEA_LEVEL + 3) + n2 * 2;
        break;
      case BiomeId.Forest:
        h += n2 * 3;
        break;
      default:
        h += n1 * 2;
    }

    switch (this.options.terrain) {
      case 'flat':
        h = SEA_LEVEL + 4 + n2 * 1.5 + detail;
        break;
      case 'mountains':
        h += ridge * ridge * 18 + Math.max(0, n1) * 8;
        break;
      case 'islands': {
        const island = this.heightNoise(wx * 0.0012, wz * 0.0012);
        if (island < 0.08) h = Math.min(h, SEA_LEVEL - 2);
        else h += (island - 0.08) * 40;
        break;
      }
      case 'wild':
        h += n1 * 6 + ridge * 12 + detail * 8;
        break;
      default:
        break;
    }

    return Math.max(4, Math.min(CHUNK_HEIGHT - 8, Math.floor(h)));
  }

  private isCave(wx: number, y: number, wz: number, surface: number): boolean {
    if (!this.options.caves) return false;
    // Keep a thick unbroken crust so the surface never floats as thin shelves
    if (y >= surface - 8 || y < 5) return false;
    const n = this.caveNoise(wx * 0.045, y * 0.06, wz * 0.045);
    const n2 = this.caveNoise(wx * 0.08 + 40, y * 0.08, wz * 0.08 + 40);
    // Rarer, roomier caves instead of Swiss cheese
    return n > 0.68 && n2 > 0.45;
  }

  fillChunk(cx: number, cz: number, voxels: Uint8Array): ColumnInfo[] {
    const columns: ColumnInfo[] = new Array(CHUNK_SIZE * CHUNK_SIZE);
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx;
        const wz = oz + lz;
        const biome = this.getBiome(wx, wz);
        const height = this.getHeight(wx, wz);
        columns[lz * CHUNK_SIZE + lx] = { height, biome, surface: height };

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          const i = lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
          let block = Block.Air;

          if (y === 0) {
            block = Block.Stone;
          } else if (y > height) {
            if (y <= SEA_LEVEL && (biome === BiomeId.Wetlands || height < SEA_LEVEL)) {
              block = Block.Water;
            }
          } else if (this.isCave(wx, y, wz, height)) {
            block = Block.Air;
          } else if (y === height) {
            block = this.surfaceBlock(biome, height);
          } else if (y >= height - 3) {
            block =
              biome === BiomeId.Desert
                ? Block.Sand
                : biome === BiomeId.Wetlands
                  ? Block.Clay
                  : Block.Dirt;
          } else {
            block = Block.Stone;
          }

          voxels[i] = block;
        }
      }
    }

    this.decorateSurface(cx, cz, voxels, columns);
    return columns;
  }

  private surfaceBlock(biome: BiomeId, height: number): number {
    switch (biome) {
      case BiomeId.Desert:
        return Block.Sand;
      case BiomeId.Mountains:
        return height > SEA_LEVEL + 22 ? Block.Snow : Block.Stone;
      case BiomeId.Wetlands:
        return Block.Moss;
      case BiomeId.Forest:
        return Block.Grass;
      default:
        return Block.Grass;
    }
  }

  private decorateSurface(
    cx: number,
    cz: number,
    voxels: Uint8Array,
    columns: ColumnInfo[],
  ): void {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;

    for (let lz = 2; lz < CHUNK_SIZE - 2; lz++) {
      for (let lx = 2; lx < CHUNK_SIZE - 2; lx++) {
        const col = columns[lz * CHUNK_SIZE + lx];
        const wx = ox + lx;
        const wz = oz + lz;
        const h = col.height;
        if (h <= SEA_LEVEL) continue;

        const top = this.get(voxels, lx, h, lz);
        if (top === Block.Air || top === Block.Water) continue;

        const r = this.hash2(wx, wz);
        if (col.biome === BiomeId.Forest && r < 0.08) {
          this.placeTree(voxels, lx, h + 1, lz, 4 + Math.floor(r * 30) % 3);
        } else if (col.biome === BiomeId.Plains && r < 0.015) {
          this.placeTree(voxels, lx, h + 1, lz, 3);
        } else if (col.biome === BiomeId.Desert && r < 0.02) {
          this.set(voxels, lx, h + 1, lz, Block.Sand);
          if (r < 0.008) this.set(voxels, lx, h + 2, lz, Block.Sand);
        } else if (col.biome === BiomeId.Mountains && r < 0.04 && top === Block.Stone) {
          this.set(voxels, lx, h + 1, lz, Block.Stone);
        } else if (col.biome === BiomeId.Wetlands && r < 0.03) {
          this.set(voxels, lx, h + 1, lz, Block.Wood);
        }
      }
    }
  }

  private placeTree(voxels: Uint8Array, x: number, y: number, z: number, trunk: number): void {
    for (let i = 0; i < trunk; i++) {
      this.set(voxels, x, y + i, z, Block.Wood);
    }
    const top = y + trunk;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 4) continue;
          const tx = x + dx;
          const ty = top + dy;
          const tz = z + dz;
          if (tx < 0 || tz < 0 || tx >= CHUNK_SIZE || tz >= CHUNK_SIZE) continue;
          if (ty < 0 || ty >= CHUNK_HEIGHT) continue;
          if (this.get(voxels, tx, ty, tz) === Block.Air) {
            this.set(voxels, tx, ty, tz, Block.Leaves);
          }
        }
      }
    }
  }

  private get(voxels: Uint8Array, x: number, y: number, z: number): number {
    if (x < 0 || z < 0 || y < 0 || x >= CHUNK_SIZE || z >= CHUNK_SIZE || y >= CHUNK_HEIGHT) {
      return Block.Air;
    }
    return voxels[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
  }

  private set(voxels: Uint8Array, x: number, y: number, z: number, b: number): void {
    if (x < 0 || z < 0 || y < 0 || x >= CHUNK_SIZE || z >= CHUNK_SIZE || y >= CHUNK_HEIGHT) return;
    voxels[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = b;
  }

  private hash2(x: number, z: number): number {
    const n = Math.sin(x * 127.1 + z * 311.7 + hashSeed(this.seed) * 0.0001) * 43758.5453;
    return n - Math.floor(n);
  }

  /** Deterministic float in [0,1) for landmark rarity checks. */
  chunkChance(cx: number, cz: number, salt: number): number {
    return this.hash2(cx * 73856093 + salt, cz * 19349663 + salt * 7);
  }
}

import { Block, CHUNK_SIZE, SEA_LEVEL } from '../blocks';
import { BiomeId } from '../Biomes';
import type { ColumnInfo } from '../ColumnInfo';
import { BIOME_GEN, dirtDepth, selectBiome, subsoilFor, surfaceBlockFor } from './BiomeTable';
import { CaveGenerator } from './CaveGenerator';
import { ClimateSampler, type ClimateSample } from './Climate';
import { OreGenerator } from './OreGenerator';
import { StructureGenerator } from './StructureGenerator';
import { TerrainShape, type TerrainType } from './TerrainShape';
import { VegetationGenerator } from './VegetationGenerator';
import { WorldSeed } from './SeedSystem';
import { WORLD_GENERATION_VERSION } from './version';

export interface PipelineOptions {
  terrain: TerrainType;
  caves: boolean;
}

export interface ColumnClimate {
  climate: ClimateSample;
  /** Softened surface height. */
  height: number;
  biome: BiomeId;
  /** Raw height before cliff softening. */
  rawHeight: number;
}

/**
 * Staged chunk generation pipeline. Deterministic for (seed, version, cx, cz).
 */
export class ChunkPipeline {
  readonly version = WORLD_GENERATION_VERSION;
  readonly seed: WorldSeed;
  readonly climate: ClimateSampler;
  readonly terrain: TerrainShape;
  readonly caves: CaveGenerator;
  readonly ores: OreGenerator;
  readonly vegetation: VegetationGenerator;
  readonly structures: StructureGenerator;
  private readonly options: PipelineOptions;
  /** Short-lived column cache (cleared each fillChunk / external sample burst). */
  private cache = new Map<string, ColumnClimate>();

  constructor(seedSource: string, options?: Partial<PipelineOptions>) {
    this.options = {
      terrain: options?.terrain ?? 'balanced',
      caves: options?.caves !== false,
    };
    this.seed = new WorldSeed(seedSource);
    this.climate = new ClimateSampler(this.seed);
    this.terrain = new TerrainShape(this.seed, this.options.terrain);
    this.caves = new CaveGenerator(this.seed, this.options.caves);
    this.ores = new OreGenerator(this.seed);
    this.vegetation = new VegetationGenerator(this.seed);
    this.structures = new StructureGenerator(this.seed);
  }

  private key(wx: number, wz: number): string {
    return `${wx | 0},${wz | 0}`;
  }

  /** Climate + raw height + biome (cached). Softening applied via sampleColumn. */
  private rawColumn(wx: number, wz: number): ColumnClimate {
    const k = this.key(wx, wz);
    const hit = this.cache.get(k);
    if (hit) return hit;

    const climate = this.climate.sample(wx, wz);
    const rawHeight = this.terrain.surfaceHeight(wx, wz, climate);
    const biome = selectBiome(climate, rawHeight);
    const col: ColumnClimate = { climate, height: rawHeight, biome, rawHeight };
    this.cache.set(k, col);
    return col;
  }

  sampleColumn(wx: number, wz: number): ColumnClimate {
    const base = this.rawColumn(wx, wz);
    let nMin = base.rawHeight;
    for (const [dx, dz] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      nMin = Math.min(nMin, this.rawColumn(wx + dx, wz + dz).rawHeight);
    }
    const height = this.terrain.softenHeight(base.rawHeight, nMin);
    const biome = selectBiome(base.climate, height);
    return { climate: base.climate, height, biome, rawHeight: base.rawHeight };
  }

  getHeight(wx: number, wz: number): number {
    return this.sampleColumn(wx, wz).height;
  }

  getBiome(wx: number, wz: number): BiomeId {
    return this.sampleColumn(wx, wz).biome;
  }

  fillChunk(cx: number, cz: number, voxels: Uint8Array): ColumnInfo[] {
    this.cache.clear();
    voxels.fill(Block.Air);
    const columns: ColumnInfo[] = new Array(CHUNK_SIZE * CHUNK_SIZE);
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;

    // Prefetch padded region for trees + edge softening
    const pad = 2;
    for (let wz = oz - pad; wz < oz + CHUNK_SIZE + pad; wz++) {
      for (let wx = ox - pad; wx < ox + CHUNK_SIZE + pad; wx++) {
        this.rawColumn(wx, wz);
      }
    }

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx;
        const wz = oz + lz;
        const col = this.sampleColumn(wx, wz);
        columns[lz * CHUNK_SIZE + lx] = {
          height: col.height,
          biome: col.biome,
          surface: col.height,
        };
      }
    }

    // --- Base terrain + surface + water ---
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx;
        const wz = oz + lz;
        const col = columns[lz * CHUNK_SIZE + lx]!;
        const height = col.height;
        const biome = col.biome;
        const def = BIOME_GEN[biome]!;
        const beach =
          height >= SEA_LEVEL &&
          height <= SEA_LEVEL + 2 &&
          biome !== BiomeId.Wetlands &&
          biome !== BiomeId.River;
        const depth = dirtDepth(biome, this.seed.at(wx, wz, 0x51));

        const yMax = Math.max(height, SEA_LEVEL);
        for (let y = 0; y <= yMax; y++) {
          const i = lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
          let block = Block.Air;

          if (y === 0) {
            block = Block.DarkStone;
          } else if (y > height) {
            if (
              y <= SEA_LEVEL &&
              (height < SEA_LEVEL || biome === BiomeId.Wetlands || biome === BiomeId.River)
            ) {
              block = def.waterIce && y === SEA_LEVEL ? Block.Ice : Block.Water;
            }
          } else if (y < height - 6 && this.caves.isCave(wx, y, wz, height)) {
            block =
              y < 6
                ? Block.DarkStone
                : y < 8 && this.seed.at(wx, wz, 0x61, y) < 0.07
                  ? Block.Lava
                  : Block.Air;
          } else if (y === height) {
            block = surfaceBlockFor(biome, height, beach);
          } else if (y >= height - depth) {
            block = subsoilFor(biome, height, beach);
          } else if (y >= height - depth - 6) {
            block = biome === BiomeId.Desert ? Block.Sand : Block.Stone;
          } else {
            block = y < 16 ? def.deep : def.underground;
            if (this.seed.at(wx + y, wz - y, 0x71) < 0.06) block = Block.Gravel;
          }

          voxels[i] = block;
        }
      }
    }

    this.ores.placeVeins(cx, cz, voxels);
    // Structures skipped for load performance (ruins/wells).
    this.vegetation.decorate(
      cx,
      cz,
      voxels,
      columns,
      (x, z) => this.getHeight(x, z),
      (x, z) => this.getBiome(x, z),
    );

    this.cache.clear();
    return columns;
  }
}

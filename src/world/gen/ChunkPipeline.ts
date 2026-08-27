import { Block, CHUNK_SIZE, SEA_LEVEL } from '../blocks';
import { BiomeId } from '../Biomes';
import type { ColumnInfo } from '../ColumnInfo';
import { BIOME_GEN, dirtDepth, selectBiome, subsoilFor, surfaceBlockFor } from './BiomeTable';
import { blendedSurfaceBlock } from './BiomeBlend';
import { CaveGenerator } from './CaveGenerator';
import { ClimateSampler, type ClimateSample } from './Climate';
import { OreGenerator } from './OreGenerator';
import { StructureGenerator } from './StructureGenerator';
import { TerrainShape, type TerrainType } from './TerrainShape';
import { VegetationGenerator } from './VegetationGenerator';
import { WorldSeed } from './SeedSystem';
import { WORLD_GENERATION_VERSION } from './version';
import {
  DEFAULT_TERRAIN_MODE,
  splitSurfaceHeight,
  surfaceHeightFromStep,
  type TerrainResolutionMode,
} from '../terrainResolution';
import { NEUTRAL_TUNING, type TerrainTuning } from '../style/styleTuning';

export interface PipelineOptions {
  terrain: TerrainType;
  caves: boolean;
  /** Whether the surface resolves to terrain voxels or whole blocks. */
  terrainMode: TerrainResolutionMode;
  /** Custom world-style tuning. Neutral tuning reproduces stock terrain. */
  tuning: TerrainTuning;
}

export interface ColumnClimate {
  climate: ClimateSample;
  /** Topmost fully solid gameplay block. */
  height: number;
  biome: BiomeId;
  /** Raw continuous height before cliff softening. */
  rawHeight: number;
  /** Sub-block surface elevation in terrain voxels (0..SURFACE_STEPS-1). */
  step: number;
  /** Continuous surface height in world units, after softening + snapping. */
  exactHeight: number;
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
      terrainMode: options?.terrainMode ?? DEFAULT_TERRAIN_MODE,
      tuning: options?.tuning ?? NEUTRAL_TUNING,
    };
    this.seed = new WorldSeed(seedSource);
    this.climate = new ClimateSampler(this.seed, this.options.tuning);
    this.terrain = new TerrainShape(this.seed, this.options.terrain, this.options.tuning);
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
    const rawHeight = this.terrain.surfaceHeightExact(wx, wz, climate);
    const biome = selectBiome(climate, rawHeight);
    const split = splitSurfaceHeight(rawHeight, this.options.terrainMode);
    const col: ColumnClimate = {
      climate,
      height: split.blockHeight,
      biome,
      rawHeight,
      step: split.step,
      exactHeight: surfaceHeightFromStep(split.blockHeight, split.step),
    };
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
    const softened = this.terrain.softenHeight(base.rawHeight, nMin);
    const split = splitSurfaceHeight(softened, this.options.terrainMode);
    const biome = selectBiome(base.climate, split.blockHeight);
    return {
      climate: base.climate,
      height: split.blockHeight,
      biome,
      rawHeight: base.rawHeight,
      step: split.step,
      exactHeight: surfaceHeightFromStep(split.blockHeight, split.step),
    };
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
          step: col.step,
        };
      }
    }

    // --- Base terrain + surface + water ---
    const sampleCol = (x: number, z: number) => {
      const lx = x - ox;
      const lz = z - oz;
      if (lx >= 0 && lz >= 0 && lx < CHUNK_SIZE && lz < CHUNK_SIZE) {
        const c = columns[lz * CHUNK_SIZE + lx]!;
        return { biome: c.biome, height: c.height };
      }
      const c = this.sampleColumn(x, z);
      return { biome: c.biome, height: c.height };
    };

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
            block =
              biome !== BiomeId.Ocean &&
              biome !== BiomeId.DeepOcean &&
              biome !== BiomeId.River &&
              biome !== BiomeId.Beach
                ? blendedSurfaceBlock(wx, wz, height, biome, beach, sampleCol)
                : surfaceBlockFor(biome, height, beach);
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
      (x, z) => this.sampleColumn(x, z).climate,
    );

    this.cache.clear();
    return columns;
  }
}

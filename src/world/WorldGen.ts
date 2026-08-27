import type { BiomeId } from './Biomes';
import type { ColumnInfo } from './ColumnInfo';
import { ChunkPipeline, type PipelineOptions } from './gen/ChunkPipeline';
import { WORLD_GENERATION_VERSION } from './gen/version';
import type { TerrainType } from './gen/TerrainShape';
import type { VytheraWorldStyle } from './style/WorldStyle';
import { NEUTRAL_TUNING, tuningFromStyle } from './style/styleTuning';

export type { ColumnInfo } from './ColumnInfo';
export type { TerrainType } from './gen/TerrainShape';
export { WORLD_GENERATION_VERSION };

export interface WorldGenOptions {
  terrain: TerrainType;
  caves: boolean;
  /** Optional custom world style. Omitted means stock VYTHERA terrain. */
  style: VytheraWorldStyle | null;
}

/**
 * Public world-generation facade. Delegates to the modular ChunkPipeline
 * (climate → terrain → biomes → surface → caves → ores → structures → vegetation).
 */
export class WorldGen {
  readonly seed: string;
  readonly generationVersion = WORLD_GENERATION_VERSION;
  private readonly pipeline: ChunkPipeline;

  constructor(seed: string, options?: Partial<WorldGenOptions>) {
    this.seed = seed;
    const opts: Partial<PipelineOptions> = {
      terrain: options?.terrain ?? 'balanced',
      caves: options?.caves !== false,
      tuning: options?.style ? tuningFromStyle(options.style) : NEUTRAL_TUNING,
    };
    this.pipeline = new ChunkPipeline(seed, opts);
  }

  getTempMoist(wx: number, wz: number): { temp: number; moist: number } {
    const c = this.pipeline.climate.sample(wx, wz);
    return { temp: c.temperature, moist: c.humidity };
  }

  getBiome(wx: number, wz: number): BiomeId {
    return this.pipeline.getBiome(wx, wz);
  }

  getHeight(wx: number, wz: number): number {
    return this.pipeline.getHeight(wx, wz);
  }

  /** Climate debug sample (continentalness, erosion, etc.). */
  sampleClimate(wx: number, wz: number) {
    return this.pipeline.sampleColumn(wx, wz);
  }

  fillChunk(cx: number, cz: number, voxels: Uint8Array): ColumnInfo[] {
    return this.pipeline.fillChunk(cx, cz, voxels);
  }

  hashAt(x: number, z: number): number {
    return this.pipeline.seed.at(x, z, 0);
  }

  chunkChance(cx: number, cz: number, salt: number): number {
    return this.pipeline.seed.at(cx * 73856093 + salt, cz * 19349663 + salt * 7, salt);
  }
}

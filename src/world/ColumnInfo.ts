import type { BiomeId } from './Biomes';

export interface ColumnInfo {
  /** Topmost fully solid gameplay block. */
  height: number;
  biome: BiomeId;
  surface: number;
  /**
   * Sub-block surface elevation in terrain voxels (0..SURFACE_STEPS-1).
   * 0 means the surface sits exactly on the block top (legacy behaviour).
   */
  step: number;
}

/**
 * Developer-only terrain resolution abstraction.
 *
 * Samples the SAME production generation logic (ClimateSampler + TerrainShape)
 * at a configurable cell size, so terrain resolution is the only variable
 * between comparison runs. Nothing here is used by gameplay.
 */
import { ClimateSampler, type ClimateSample } from '../gen/Climate';
import { TerrainShape, type TerrainType } from '../gen/TerrainShape';
import { WorldSeed } from '../gen/SeedSystem';
import { BIOME_GEN, selectBiome } from '../gen/BiomeTable';
import { BiomeId } from '../Biomes';
import { Block } from '../blocks';
import type { VegetationTuning } from '../gen/VegetationPlacement';
import { NEUTRAL_TUNING, tuningFromStyle, type TerrainTuning } from '../style/styleTuning';
import type { VytheraWorldStyle } from '../style/WorldStyle';

export const TERRAIN_RESOLUTIONS = [1, 0.5, 0.25, 0.125] as const;
export type TerrainResolution = (typeof TERRAIN_RESOLUTIONS)[number];

/** Terrain cells along one axis of a 1x1x1 gameplay block. */
export function cellsPerBlock(r: TerrainResolution): number {
  return Math.round(1 / r);
}

/** Terrain cells filling one gameplay block volume: 1, 8, 64, 512. */
export function cellsPerBlockVolume(r: TerrainResolution): number {
  return cellsPerBlock(r) ** 3;
}

/** Surface cells covering one gameplay block footprint: 1, 4, 16, 64. */
export function cellsPerBlockArea(r: TerrainResolution): number {
  return cellsPerBlock(r) ** 2;
}

/** Snap a height to the vertical cell grid for this resolution. */
export function quantizeToCell(height: number, r: number): number {
  return Math.round(height / r) * r;
}

export type SurfaceMaterial = 0 | 1 | 2 | 3 | 4 | 5;
export const MATERIAL = {
  Grass: 0 as SurfaceMaterial,
  Dirt: 1 as SurfaceMaterial,
  Rock: 2 as SurfaceMaterial,
  Sand: 3 as SurfaceMaterial,
  Snow: 4 as SurfaceMaterial,
  Water: 5 as SurfaceMaterial,
};

/** Original VYTHERA palette. Not derived from any reference artwork. */
export const MATERIAL_COLORS: Record<SurfaceMaterial, [number, number, number]> = {
  0: [0.36, 0.55, 0.24],
  1: [0.44, 0.33, 0.21],
  2: [0.47, 0.46, 0.44],
  3: [0.79, 0.72, 0.49],
  4: [0.92, 0.93, 0.95],
  5: [0.16, 0.44, 0.52],
};

/** Map a world block id onto the preview's small surface palette. */
export function materialForBlock(block: number): SurfaceMaterial {
  switch (block) {
    case Block.Sand:
      return MATERIAL.Sand;
    case Block.Snow:
    case Block.Ice:
      return MATERIAL.Snow;
    case Block.Stone:
    case Block.Gravel:
    case Block.DarkStone:
      return MATERIAL.Rock;
    case Block.Dirt:
    case Block.Clay:
      return MATERIAL.Dirt;
    case Block.Water:
      return MATERIAL.Water;
    default:
      return MATERIAL.Grass;
  }
}

export interface Tile {
  /** Quantized surface height per cell, row-major (z * n + x). */
  heights: Float32Array;
  materials: Uint8Array;
  /** Cells per side. */
  n: number;
  /** World size of one cell in this tile (resolution * lodStep). */
  cell: number;
  /** Tile origin in world blocks. */
  x0: number;
  z0: number;
}

const CLIMATE_KEYS = [
  'continentalness',
  'erosion',
  'peaksValleys',
  'temperature',
  'humidity',
  'wx',
  'wz',
  'river',
  'valleyFactor',
  'ridgeStrength',
  'mountainFactor',
] as const;

const NUM_CLIMATE_KEYS = CLIMATE_KEYS.length;

function lerpClimate(a: ClimateSample, b: ClimateSample, t: number): ClimateSample {
  const out = {} as ClimateSample;
  for (const k of CLIMATE_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

/**
 * Samples terrain height at arbitrary resolution.
 *
 * Climate is always evaluated on the 1-block grid and bilinearly interpolated,
 * at every resolution. That keeps the macro landform field identical across
 * runs so the only thing that changes is surface sampling density.
 */
export class TerrainField {
  readonly seed: WorldSeed;
  private climate: ClimateSampler;
  private shape: TerrainShape;
  private climateCache = new Map<string, ClimateSample>();

  /** Sea level for this field, which a world style can move. */
  readonly seaLevel: number;
  readonly snowLine: number;
  /** Vegetation densities, shared with real chunk generation. */
  readonly vegetation: VegetationTuning;
  /** Same salt the chunk generator derives, so plants land in the same spots. */
  readonly vegetationSalt: number;

  constructor(
    seedSource: string,
    terrain: TerrainType = 'balanced',
    /** Style tuning; neutral reproduces stock terrain. */
    tuning: TerrainTuning = NEUTRAL_TUNING,
  ) {
    this.seed = new WorldSeed(seedSource);
    this.climate = new ClimateSampler(this.seed, tuning);
    this.shape = new TerrainShape(this.seed, terrain, tuning);
    this.seaLevel = tuning.seaLevel;
    this.snowLine = tuning.snowLine;
    this.vegetation = tuning.vegetation;
    this.vegetationSalt = this.seed.derive('trees');
  }

  /** Climate at a world position, on the same lattice the generator uses. */
  sampleClimate(wx: number, wz: number): ClimateSample {
    return this.climateAt(Math.floor(wx), Math.floor(wz));
  }

  /** Biome via the canonical selector, so preview and world agree. */
  biomeAt(wx: number, wz: number): BiomeId {
    return selectBiome(this.sampleClimate(wx, wz), this.heightAt(wx, wz));
  }

  /** Grade over a one-block baseline, measured as chunk generation does. */
  slopeAt(wx: number, wz: number, h = this.heightAt(wx, wz)): number {
    return Math.max(
      Math.abs(this.heightAt(wx + 1, wz) - h),
      Math.abs(this.heightAt(wx, wz + 1) - h),
    );
  }

  /** Build a field directly from a world style, seed included. */
  static fromStyle(style: VytheraWorldStyle, terrain: TerrainType = 'balanced'): TerrainField {
    return new TerrainField(style.seed, terrain, tuningFromStyle(style));
  }

  private climateAt(bx: number, bz: number): ClimateSample {
    const key = `${bx},${bz}`;
    let c = this.climateCache.get(key);
    if (!c) {
      c = this.climate.sample(bx, bz);
      this.climateCache.set(key, c);
    }
    return c;
  }

  /** Bilinear climate at fractional world coordinates. */
  private climateLerp(wx: number, wz: number): ClimateSample {
    const x0 = Math.floor(wx);
    const z0 = Math.floor(wz);
    const tx = wx - x0;
    const tz = wz - z0;
    if (tx === 0 && tz === 0) return this.climateAt(x0, z0);
    const c00 = this.climateAt(x0, z0);
    const c10 = this.climateAt(x0 + 1, z0);
    const c01 = this.climateAt(x0, z0 + 1);
    const c11 = this.climateAt(x0 + 1, z0 + 1);
    return lerpClimate(lerpClimate(c00, c10, tx), lerpClimate(c01, c11, tx), tz);
  }

  /** Continuous surface height at fractional world coordinates. */
  heightAt(wx: number, wz: number): number {
    return this.shape.surfaceHeightExact(wx, wz, this.climateLerp(wx, wz));
  }

  /**
   * Build one tile of the surface heightfield.
   *
   * `lodStep` multiplies the cell size for distant tiles, which is how the
   * comparison keeps 0.125 tractable without changing the generator.
   */
  buildTile(
    x0: number,
    z0: number,
    blocks: number,
    r: TerrainResolution,
    lodStep = 1,
  ): Tile {
    const cell = r * lodStep;
    const n = Math.max(1, Math.round(blocks / cell));
    const heights = new Float32Array(n * n);
    const materials = new Uint8Array(n * n);

    // Local climate grid on the 1-block lattice. Sampling climate per cell at
    // 0.125 would dominate the measurement and allocate millions of objects.
    const gw = blocks + 2;
    const grid = new Float32Array(gw * gw * NUM_CLIMATE_KEYS);
    for (let j = 0; j < gw; j++) {
      for (let i = 0; i < gw; i++) {
        const c = this.climate.sample(x0 + i, z0 + j);
        const base = (j * gw + i) * NUM_CLIMATE_KEYS;
        for (let k = 0; k < NUM_CLIMATE_KEYS; k++) grid[base + k] = c[CLIMATE_KEYS[k]!];
      }
    }

    const scratch = {} as ClimateSample;
    const sampleGrid = (lx: number, lz: number): ClimateSample => {
      const i0 = Math.min(gw - 2, Math.floor(lx));
      const j0 = Math.min(gw - 2, Math.floor(lz));
      const tx = lx - i0;
      const tz = lz - j0;
      const b00 = (j0 * gw + i0) * NUM_CLIMATE_KEYS;
      const b10 = b00 + NUM_CLIMATE_KEYS;
      const b01 = ((j0 + 1) * gw + i0) * NUM_CLIMATE_KEYS;
      const b11 = b01 + NUM_CLIMATE_KEYS;
      for (let k = 0; k < NUM_CLIMATE_KEYS; k++) {
        const top = grid[b00 + k]! + (grid[b10 + k]! - grid[b00 + k]!) * tx;
        const bot = grid[b01 + k]! + (grid[b11 + k]! - grid[b01 + k]!) * tx;
        scratch[CLIMATE_KEYS[k]!] = top + (bot - top) * tz;
      }
      return scratch;
    };

    // Continuous heights are kept alongside the quantized ones: geometry needs
    // the cell grid, but material choice must follow the true terrain grade.
    // Deriving slope from quantized heights instead makes every stair riser
    // read as a cliff, which paints contour rings across gentle ground and
    // changes with resolution — ruining the comparison this lab exists for.
    const raw = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      const lz = j * cell;
      const wz = z0 + lz;
      for (let i = 0; i < n; i++) {
        const lx = i * cell;
        const wx = x0 + lx;
        const c = sampleGrid(lx, lz);
        const h = this.shape.surfaceHeightExact(wx, wz, c);
        raw[j * n + i] = h;
        heights[j * n + i] = quantizeToCell(h, cell);
      }
    }

    // Slope is measured over a fixed one-block baseline so the thresholds mean
    // the same thing at every resolution.
    const span = Math.max(1, Math.round(1 / cell));
    for (let j = 0; j < n; j++) {
      const lz = j * cell;
      for (let i = 0; i < n; i++) {
        const idx = j * n + i;
        const h = raw[idx]!;
        const hx = raw[j * n + Math.min(n - 1, i + span)]!;
        const hz = raw[Math.min(n - 1, j + span) * n + i]!;
        const run = span * cell;
        const slope = Math.max(Math.abs(hx - h), Math.abs(hz - h)) / run;
        const biome = selectBiome(sampleGrid(i * cell, lz), h);
        materials[idx] = this.materialFor(h, slope, biome);
      }
    }

    return { heights, materials, n, cell, x0, z0 };
  }

  /**
   * Surface material for a cell.
   *
   * Biome choice comes from the canonical selector, and the biome's own surface
   * block decides the base material, so a desert previews as sand and a taiga
   * as snow exactly as the generated world would. Height and grade then apply
   * the same overrides chunk generation applies: shoreline sand, snow above the
   * style's snow line, and bare rock where the ground is too steep to hold soil.
   */
  private materialFor(h: number, slope: number, biome: BiomeId): SurfaceMaterial {
    if (h <= this.seaLevel + 0.5) return MATERIAL.Sand;
    if (h > this.snowLine) return MATERIAL.Snow;
    if (slope > 1.4) return MATERIAL.Rock;
    const base = materialForBlock(BIOME_GEN[biome]?.surface ?? Block.Grass);
    if (slope > 0.7) return base === MATERIAL.Snow ? MATERIAL.Rock : MATERIAL.Dirt;
    return base;
  }

  /** Theoretical surface cell count for a square region at this resolution. */
  static surfaceCells(blocks: number, r: TerrainResolution): number {
    return (blocks / r) ** 2;
  }

  /** Theoretical volumetric cell count if terrain were a full 3D grid. */
  static volumeCells(blocks: number, heightBlocks: number, r: TerrainResolution): number {
    return (blocks / r) ** 2 * (heightBlocks / r);
  }
}


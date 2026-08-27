/**
 * Translates a world style into the numeric tuning the generator consumes.
 *
 * The generator's shaping constants stay where they are; tuning scales them.
 * NEUTRAL_TUNING is exactly "no change", so a world generated without a style —
 * or with a default style — is identical to stock VYTHERA terrain. That is what
 * lets styles be introduced without invalidating existing saves.
 */
import { SEA_LEVEL } from '../blocks';
import { NEUTRAL_VEGETATION, type VegetationTuning } from '../gen/VegetationPlacement';
import type { VytheraWorldStyle } from './WorldStyle';

export interface TerrainTuning {
  /** Frequency multipliers: >1 means smaller, more frequent features. */
  macroFreq: number;
  regionalFreq: number;
  detailFreq: number;

  heightScale: number;
  hillStrength: number;
  hillSmoothness: number;
  valleyStrength: number;
  valleyFreq: number;
  mountainStrength: number;
  mountainFreq: number;
  ridgeStrength: number;
  peakSharpness: number;
  cliffStrength: number;
  plateauStrength: number;
  erosionStrength: number;

  seaLevel: number;
  snowLine: number;
  riverStrength: number;
  riverWidth: number;
  riverFreq: number;

  biomeFreq: number;
  temperatureOffset: number;
  moistureOffset: number;
  biomeVariation: number;

  /** Vegetation densities, consumed by the shared placement rules. */
  vegetation: VegetationTuning;
}

export const NEUTRAL_TUNING: TerrainTuning = {
  macroFreq: 1,
  regionalFreq: 1,
  detailFreq: 1,
  heightScale: 1,
  hillStrength: 1,
  hillSmoothness: 1,
  valleyStrength: 1,
  valleyFreq: 1,
  mountainStrength: 1,
  mountainFreq: 1,
  ridgeStrength: 1,
  peakSharpness: 1,
  cliffStrength: 1,
  plateauStrength: 1,
  erosionStrength: 1,
  seaLevel: SEA_LEVEL,
  snowLine: SEA_LEVEL + 44,
  riverStrength: 1,
  riverWidth: 1,
  riverFreq: 1,
  biomeFreq: 1,
  temperatureOffset: 0,
  moistureOffset: 0,
  biomeVariation: 1,
  vegetation: NEUTRAL_VEGETATION,
};

/** Guard against a zero scale collapsing a frequency to infinity. */
function inverse(scale: number): number {
  return 1 / Math.max(0.05, scale);
}

export function tuningFromStyle(style: VytheraWorldStyle): TerrainTuning {
  const { terrain, water, biome, vegetation } = style;
  return {
    macroFreq: inverse(terrain.macroScale),
    regionalFreq: inverse(terrain.regionalScale),
    detailFreq: inverse(terrain.detailScale),

    heightScale: terrain.heightScale,
    hillStrength: terrain.hillStrength,
    hillSmoothness: terrain.hillSmoothness,
    valleyStrength: terrain.valleyStrength,
    valleyFreq: inverse(terrain.valleyWidth),
    mountainStrength: terrain.mountainStrength,
    mountainFreq: inverse(terrain.mountainWidth),
    ridgeStrength: terrain.ridgeStrength,
    peakSharpness: terrain.peakSharpness,
    cliffStrength: terrain.cliffStrength,
    plateauStrength: terrain.plateauStrength,
    erosionStrength: terrain.erosionStrength,

    seaLevel: water.seaLevel,
    snowLine: terrain.snowLine,
    riverStrength: water.riverFrequency,
    riverWidth: water.riverWidth,
    riverFreq: inverse(water.riverWidth),

    biomeFreq: inverse(biome.scale),
    temperatureOffset: biome.temperature,
    moistureOffset: biome.moisture,
    biomeVariation: biome.variation,

    vegetation: {
      treeDensity: vegetation.treeDensity,
      grassDensity: vegetation.grassDensity,
      flowerDensity: vegetation.flowerDensity,
      rockDensity: vegetation.rockDensity,
      bushDensity: vegetation.bushDensity,
      variation: vegetation.variation ?? 1,
    },
  };
}

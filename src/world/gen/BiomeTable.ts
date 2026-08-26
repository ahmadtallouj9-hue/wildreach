import type { ClimateSample } from './Climate';
import { SEA_LEVEL } from '../blocks';
import { Block } from '../blocks';
import { BiomeId } from '../Biomes';

export interface BiomeGenDef {
  id: BiomeId;
  name: string;
  /** Preferred temperature / humidity centers (0..1). */
  temp: number;
  humid: number;
  /** Continentalness preference: ocean < beach < inland. */
  contMin: number;
  contMax: number;
  surface: number;
  subsoil: number;
  underground: number;
  deep: number;
  treeChance: number;
  treeKind: 'none' | 'oak' | 'birch' | 'canopy' | 'pine' | 'jungle' | 'willow' | 'cactus';
  grassChance: number;
  snow: boolean;
  waterIce: boolean;
}

/**
 * Data-driven biome table. Visual fog/tint stay in Biomes.ts;
 * generation rules live here.
 */
export const BIOME_GEN: Record<BiomeId, BiomeGenDef> = {
  [BiomeId.Ocean]: {
    id: BiomeId.Ocean,
    name: 'Ocean',
    temp: 0.5,
    humid: 0.6,
    contMin: 0,
    contMax: 0.38,
    surface: Block.Sand,
    subsoil: Block.Sand,
    underground: Block.Stone,
    deep: Block.DarkStone,
    treeChance: 0,
    treeKind: 'none',
    grassChance: 0,
    snow: false,
    waterIce: false,
  },
  [BiomeId.DeepOcean]: {
    id: BiomeId.DeepOcean,
    name: 'Deep Ocean',
    temp: 0.45,
    humid: 0.65,
    contMin: 0,
    contMax: 0.28,
    surface: Block.DarkStone,
    subsoil: Block.Clay,
    underground: Block.Stone,
    deep: Block.DarkStone,
    treeChance: 0,
    treeKind: 'none',
    grassChance: 0,
    snow: false,
    waterIce: false,
  },
  [BiomeId.Beach]: {
    id: BiomeId.Beach,
    name: 'Beach',
    temp: 0.55,
    humid: 0.5,
    contMin: 0.35,
    contMax: 0.48,
    surface: Block.Sand,
    subsoil: Block.Sand,
    underground: Block.Stone,
    deep: Block.DarkStone,
    treeChance: 0,
    treeKind: 'none',
    grassChance: 0,
    snow: false,
    waterIce: false,
  },
  [BiomeId.River]: {
    id: BiomeId.River,
    name: 'River',
    temp: 0.5,
    humid: 0.7,
    contMin: 0.4,
    contMax: 1,
    surface: Block.Sand,
    subsoil: Block.Clay,
    underground: Block.Stone,
    deep: Block.DarkStone,
    treeChance: 0.01,
    treeKind: 'willow',
    grassChance: 0.04,
    snow: false,
    waterIce: false,
  },
  [BiomeId.Plains]: {
    id: BiomeId.Plains,
    name: 'Windplain',
    temp: 0.55,
    humid: 0.4,
    contMin: 0.45,
    contMax: 1,
    surface: Block.Grass,
    subsoil: Block.Dirt,
    underground: Block.Stone,
    deep: Block.DarkStone,
    treeChance: 0.01,
    treeKind: 'oak',
    grassChance: 0.04,
    snow: false,
    waterIce: false,
  },
  [BiomeId.Forest]: {
    id: BiomeId.Forest,
    name: 'Deepwood',
    temp: 0.5,
    humid: 0.62,
    contMin: 0.45,
    contMax: 1,
    surface: Block.Grass,
    subsoil: Block.Dirt,
    underground: Block.Stone,
    deep: Block.DarkStone,
    treeChance: 0.035,
    treeKind: 'canopy',
    grassChance: 0.03,
    snow: false,
    waterIce: false,
  },
  [BiomeId.DenseForest]: {
    id: BiomeId.DenseForest,
    name: 'Oldgrowth',
    temp: 0.48,
    humid: 0.78,
    contMin: 0.48,
    contMax: 1,
    surface: Block.Grass,
    subsoil: Block.Dirt,
    underground: Block.Stone,
    deep: Block.DarkStone,
    treeChance: 0.055,
    treeKind: 'canopy',
    grassChance: 0.05,
    snow: false,
    waterIce: false,
  },
  [BiomeId.BirchForest]: {
    id: BiomeId.BirchForest,
    name: 'Palewood',
    temp: 0.42,
    humid: 0.55,
    contMin: 0.48,
    contMax: 1,
    surface: Block.Grass,
    subsoil: Block.Dirt,
    underground: Block.Stone,
    deep: Block.DarkStone,
    treeChance: 0.035,
    treeKind: 'birch',
    grassChance: 0.03,
    snow: false,
    waterIce: false,
  },
  [BiomeId.Desert]: {
    id: BiomeId.Desert,
    name: 'Sunscorch',
    temp: 0.85,
    humid: 0.15,
    contMin: 0.45,
    contMax: 1,
    surface: Block.Sand,
    subsoil: Block.Sand,
    underground: Block.Sand,
    deep: Block.Stone,
    treeChance: 0.012,
    treeKind: 'cactus',
    grassChance: 0,
    snow: false,
    waterIce: false,
  },
  [BiomeId.Savanna]: {
    id: BiomeId.Savanna,
    name: 'Dryreach',
    temp: 0.78,
    humid: 0.32,
    contMin: 0.48,
    contMax: 1,
    surface: Block.Grass,
    subsoil: Block.Dirt,
    underground: Block.Stone,
    deep: Block.DarkStone,
    treeChance: 0.015,
    treeKind: 'oak',
    grassChance: 0.02,
    snow: false,
    waterIce: false,
  },
  [BiomeId.Jungle]: {
    id: BiomeId.Jungle,
    name: 'Verdant',
    temp: 0.82,
    humid: 0.88,
    contMin: 0.5,
    contMax: 1,
    surface: Block.Grass,
    subsoil: Block.Dirt,
    underground: Block.Stone,
    deep: Block.DarkStone,
    treeChance: 0.05,
    treeKind: 'jungle',
    grassChance: 0.06,
    snow: false,
    waterIce: false,
  },
  [BiomeId.Wetlands]: {
    id: BiomeId.Wetlands,
    name: 'Mirefen',
    temp: 0.55,
    humid: 0.9,
    contMin: 0.4,
    contMax: 0.7,
    surface: Block.Moss,
    subsoil: Block.Clay,
    underground: Block.Stone,
    deep: Block.DarkStone,
    treeChance: 0.02,
    treeKind: 'willow',
    grassChance: 0.05,
    snow: false,
    waterIce: false,
  },
  [BiomeId.Taiga]: {
    id: BiomeId.Taiga,
    name: 'Frostwood',
    temp: 0.22,
    humid: 0.55,
    contMin: 0.48,
    contMax: 1,
    surface: Block.Grass,
    subsoil: Block.Dirt,
    underground: Block.Stone,
    deep: Block.DarkStone,
    treeChance: 0.035,
    treeKind: 'pine',
    grassChance: 0.02,
    snow: true,
    waterIce: true,
  },
  [BiomeId.SnowyTaiga]: {
    id: BiomeId.SnowyTaiga,
    name: 'Snowpine',
    temp: 0.12,
    humid: 0.5,
    contMin: 0.48,
    contMax: 1,
    surface: Block.Snow,
    subsoil: Block.Dirt,
    underground: Block.Stone,
    deep: Block.DarkStone,
    treeChance: 0.03,
    treeKind: 'pine',
    grassChance: 0,
    snow: true,
    waterIce: true,
  },
  [BiomeId.Mountains]: {
    id: BiomeId.Mountains,
    name: 'Highreach',
    temp: 0.3,
    humid: 0.35,
    contMin: 0.55,
    contMax: 1,
    surface: Block.Gravel,
    subsoil: Block.Stone,
    underground: Block.Stone,
    deep: Block.DarkStone,
    treeChance: 0.012,
    treeKind: 'pine',
    grassChance: 0,
    snow: false,
    waterIce: false,
  },
  [BiomeId.SnowyMountains]: {
    id: BiomeId.SnowyMountains,
    name: 'Whitecap',
    temp: 0.1,
    humid: 0.4,
    contMin: 0.55,
    contMax: 1,
    surface: Block.Snow,
    subsoil: Block.Stone,
    underground: Block.Stone,
    deep: Block.DarkStone,
    treeChance: 0.008,
    treeKind: 'pine',
    grassChance: 0,
    snow: true,
    waterIce: true,
  },
  [BiomeId.Tundra]: {
    id: BiomeId.Tundra,
    name: 'Frostflat',
    temp: 0.15,
    humid: 0.3,
    contMin: 0.45,
    contMax: 1,
    surface: Block.Snow,
    subsoil: Block.Dirt,
    underground: Block.Stone,
    deep: Block.DarkStone,
    treeChance: 0.005,
    treeKind: 'oak',
    grassChance: 0,
    snow: true,
    waterIce: true,
  },
};

/** Pick biome from climate + approximate surface height. */
export function selectBiome(c: ClimateSample, surfaceY: number): BiomeId {
  const { continentalness: cont, temperature: t, humidity: h, river, mountainFactor } = c;

  if (river > 0.55 && cont > 0.42 && surfaceY < SEA_LEVEL + 6) return BiomeId.River;

  if (cont < 0.28) return BiomeId.DeepOcean;
  if (cont < 0.38) return BiomeId.Ocean;
  if (cont < 0.46 && surfaceY <= SEA_LEVEL + 3) return BiomeId.Beach;

  if (mountainFactor > 0.45 || (surfaceY > SEA_LEVEL + 38 && cont > 0.5)) {
    if (t < 0.28 || surfaceY > SEA_LEVEL + 50) return BiomeId.SnowyMountains;
    return BiomeId.Mountains;
  }

  // Score land biomes by climate distance
  const land: BiomeId[] = [
    BiomeId.Plains,
    BiomeId.Forest,
    BiomeId.DenseForest,
    BiomeId.BirchForest,
    BiomeId.Desert,
    BiomeId.Savanna,
    BiomeId.Jungle,
    BiomeId.Wetlands,
    BiomeId.Taiga,
    BiomeId.SnowyTaiga,
    BiomeId.Tundra,
  ];

  let best = BiomeId.Plains;
  let bestScore = Infinity;
  for (const id of land) {
    const d = BIOME_GEN[id]!;
    if (cont < d.contMin || cont > d.contMax) continue;
    const dt = t - d.temp;
    const dh = h - d.humid;
    const score = dt * dt * 1.4 + dh * dh;
    if (score < bestScore) {
      bestScore = score;
      best = id;
    }
  }

  // Soft overrides for extremes
  if (t < 0.18 && h < 0.4) return BiomeId.Tundra;
  if (t < 0.22 && h > 0.45) return BiomeId.SnowyTaiga;
  if (t > 0.72 && h < 0.28) return BiomeId.Desert;
  if (t > 0.7 && h > 0.75) return BiomeId.Jungle;
  if (h > 0.82 && cont < 0.72) return BiomeId.Wetlands;
  if (t > 0.68 && h > 0.25 && h < 0.45) return BiomeId.Savanna;

  return best;
}

export function surfaceBlockFor(biome: BiomeId, height: number, beach: boolean): number {
  if (beach) return Block.Sand;
  if (height < SEA_LEVEL) {
    if (height < SEA_LEVEL - 14) return Block.DarkStone;
    if (height < SEA_LEVEL - 7) return Block.Clay;
    return Block.Sand;
  }
  const def = BIOME_GEN[biome]!;
  if (def.snow && height > SEA_LEVEL + 22) return Block.Snow;
  if (biome === BiomeId.Mountains) {
    if (height > SEA_LEVEL + 42) return Block.Snow;
    if (height > SEA_LEVEL + 28) return Block.Stone;
    return Block.Gravel;
  }
  if (biome === BiomeId.SnowyMountains && height > SEA_LEVEL + 20) return Block.Snow;
  return def.surface;
}

export function subsoilFor(biome: BiomeId, height: number, beach: boolean): number {
  if (beach || height < SEA_LEVEL) return height < SEA_LEVEL - 8 ? Block.Stone : Block.Sand;
  return BIOME_GEN[biome]!.subsoil;
}

export function dirtDepth(biome: BiomeId, hash: number): number {
  const base = biome === BiomeId.Desert ? 4 : biome === BiomeId.Mountains ? 2 : 3;
  return base + Math.floor(hash * 3);
}

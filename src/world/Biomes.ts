export const enum BiomeId {
  Plains = 0,
  Forest = 1,
  Mountains = 2,
  Desert = 3,
  Wetlands = 4,
  Taiga = 5,
  Ocean = 6,
  DeepOcean = 7,
  Beach = 8,
  DenseForest = 9,
  BirchForest = 10,
  Savanna = 11,
  Jungle = 12,
  SnowyTaiga = 13,
  SnowyMountains = 14,
  Tundra = 15,
  River = 16,
}

export interface BiomeDef {
  id: BiomeId;
  name: string;
  color: string;
  fogRgb: [number, number, number];
  surfaceTint: [number, number, number];
}

function def(
  id: BiomeId,
  name: string,
  color: string,
  fogRgb: [number, number, number],
  surfaceTint: [number, number, number],
): BiomeDef {
  return { id, name, color, fogRgb, surfaceTint };
}

export const BIOMES: Record<BiomeId, BiomeDef> = {
  [BiomeId.Plains]: def(BiomeId.Plains, 'Windplain', '#6a9e78', [0.58, 0.74, 0.78], [0.32, 0.6, 0.38]),
  [BiomeId.Forest]: def(BiomeId.Forest, 'Deepwood', '#3d6b52', [0.38, 0.52, 0.48], [0.2, 0.46, 0.3]),
  [BiomeId.Mountains]: def(BiomeId.Mountains, 'Highreach', '#7a8894', [0.62, 0.68, 0.76], [0.48, 0.5, 0.54]),
  [BiomeId.Desert]: def(BiomeId.Desert, 'Sunscorch', '#c4a86a', [0.82, 0.74, 0.56], [0.84, 0.74, 0.5]),
  [BiomeId.Wetlands]: def(BiomeId.Wetlands, 'Mirefen', '#4a7a6a', [0.42, 0.56, 0.54], [0.26, 0.44, 0.36]),
  [BiomeId.Taiga]: def(BiomeId.Taiga, 'Frostwood', '#5a7a72', [0.55, 0.64, 0.7], [0.28, 0.42, 0.38]),
  [BiomeId.Ocean]: def(BiomeId.Ocean, 'Open Sea', '#3a6a8a', [0.45, 0.62, 0.72], [0.2, 0.4, 0.55]),
  [BiomeId.DeepOcean]: def(BiomeId.DeepOcean, 'Abyss', '#2a4a6a', [0.32, 0.42, 0.55], [0.15, 0.28, 0.4]),
  [BiomeId.Beach]: def(BiomeId.Beach, 'Shore', '#c8b88a', [0.75, 0.78, 0.72], [0.86, 0.76, 0.52]),
  [BiomeId.DenseForest]: def(BiomeId.DenseForest, 'Oldgrowth', '#2d5a42', [0.32, 0.45, 0.4], [0.16, 0.4, 0.26]),
  [BiomeId.BirchForest]: def(BiomeId.BirchForest, 'Palewood', '#6a9a72', [0.55, 0.68, 0.62], [0.35, 0.55, 0.4]),
  [BiomeId.Savanna]: def(BiomeId.Savanna, 'Dryreach', '#b09a58', [0.78, 0.72, 0.52], [0.55, 0.58, 0.32]),
  [BiomeId.Jungle]: def(BiomeId.Jungle, 'Verdant', '#2a7a48', [0.35, 0.55, 0.42], [0.18, 0.5, 0.28]),
  [BiomeId.SnowyTaiga]: def(BiomeId.SnowyTaiga, 'Snowpine', '#8aa0a8', [0.7, 0.78, 0.84], [0.85, 0.9, 0.94]),
  [BiomeId.SnowyMountains]: def(BiomeId.SnowyMountains, 'Whitecap', '#a8b4c0', [0.72, 0.78, 0.86], [0.9, 0.93, 0.96]),
  [BiomeId.Tundra]: def(BiomeId.Tundra, 'Frostflat', '#9aa8b0', [0.68, 0.74, 0.8], [0.88, 0.92, 0.95]),
  [BiomeId.River]: def(BiomeId.River, 'River', '#5a8a7a', [0.5, 0.65, 0.68], [0.3, 0.5, 0.42]),
};

/** Legacy 2-arg picker kept for callers; prefer Climate + selectBiome. */
export function pickBiome(temp: number, moist: number): BiomeId {
  if (temp < 0.18 && moist < 0.4) return BiomeId.Tundra;
  if (temp < 0.22) return moist > 0.4 ? BiomeId.SnowyTaiga : BiomeId.SnowyMountains;
  if (temp < 0.28) return moist > 0.4 ? BiomeId.Taiga : BiomeId.Mountains;
  if (temp < 0.34 && moist < 0.42) return BiomeId.Mountains;
  if (temp > 0.78 && moist > 0.75) return BiomeId.Jungle;
  if (temp > 0.7 && moist < 0.28) return BiomeId.Desert;
  if (temp > 0.68 && moist < 0.45) return BiomeId.Savanna;
  if (moist > 0.82) return BiomeId.Wetlands;
  if (moist > 0.7 && temp > 0.4) return BiomeId.DenseForest;
  if (moist > 0.5 && temp > 0.35 && temp < 0.55) return BiomeId.BirchForest;
  if (moist > 0.48 && temp > 0.32 && temp < 0.72) return BiomeId.Forest;
  return BiomeId.Plains;
}

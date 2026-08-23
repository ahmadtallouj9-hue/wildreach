export const enum BiomeId {
  Plains = 0,
  Forest = 1,
  Mountains = 2,
  Desert = 3,
  Wetlands = 4,
}

export interface BiomeDef {
  id: BiomeId;
  name: string;
  color: string;
  fogRgb: [number, number, number];
  surfaceTint: [number, number, number];
}

export const BIOMES: Record<BiomeId, BiomeDef> = {
  [BiomeId.Plains]: {
    id: BiomeId.Plains,
    name: 'Windplain',
    color: '#6a9e78',
    fogRgb: [0.55, 0.72, 0.7],
    surfaceTint: [0.3, 0.58, 0.4],
  },
  [BiomeId.Forest]: {
    id: BiomeId.Forest,
    name: 'Deepwood',
    color: '#3d6b52',
    fogRgb: [0.4, 0.55, 0.5],
    surfaceTint: [0.22, 0.48, 0.32],
  },
  [BiomeId.Mountains]: {
    id: BiomeId.Mountains,
    name: 'Highreach',
    color: '#7a8894',
    fogRgb: [0.6, 0.65, 0.72],
    surfaceTint: [0.5, 0.52, 0.55],
  },
  [BiomeId.Desert]: {
    id: BiomeId.Desert,
    name: 'Sunscorch',
    color: '#c4a86a',
    fogRgb: [0.78, 0.72, 0.55],
    surfaceTint: [0.82, 0.74, 0.52],
  },
  [BiomeId.Wetlands]: {
    id: BiomeId.Wetlands,
    name: 'Mirefen',
    color: '#4a7a6a',
    fogRgb: [0.45, 0.58, 0.55],
    surfaceTint: [0.28, 0.45, 0.38],
  },
};

export function pickBiome(temp: number, moist: number): BiomeId {
  if (temp < 0.28 && moist < 0.45) return BiomeId.Mountains;
  if (temp > 0.65 && moist < 0.35) return BiomeId.Desert;
  if (moist > 0.62) return BiomeId.Wetlands;
  if (moist > 0.45 && temp > 0.3) return BiomeId.Forest;
  return BiomeId.Plains;
}

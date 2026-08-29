/**
 * VYTHERA world style: the complete, portable description of how a world
 * generates. A style is pure data — never code — so it can be saved, exported,
 * imported and shared without executing anything.
 *
 * Every strength/scale parameter is a multiplier whose default is 1, and every
 * offset defaults to 0. A default style therefore reproduces stock VYTHERA
 * terrain exactly, which keeps existing worlds byte-identical.
 */
import { SEA_LEVEL } from '../blocks';
import { WORLD_GENERATION_VERSION } from '../gen/version';
import {
  DEFAULT_WORLD_VOXEL_SIZE,
  makeWorldScale,
  type WorldScaleConfig,
} from '../worldScale';

/** Bumped when the meaning of style fields changes incompatibly. */
export const WORLD_STYLE_FORMAT = 1;

export const TERRAIN_RESOLUTIONS = [1, 0.5, 0.25, 0.125] as const;
export type TerrainResolution = (typeof TERRAIN_RESOLUTIONS)[number];

export const RESOLUTION_LABELS: Record<string, { name: string; note: string; costly: boolean }> = {
  '1': { name: 'Classic', note: 'Large blocks. Cheapest, boldest stepping.', costly: false },
  '0.5': { name: 'Detailed', note: 'Slopes read as slopes. Good balance.', costly: false },
  '0.25': { name: 'High', note: 'Small voxels, natural landforms. Recommended.', costly: true },
  '0.125': {
    name: 'Ultra',
    note: 'Rarely looks better than High, but costs far more memory.',
    costly: true,
  },
};

export type LandscapeStyle =
  | 'rolling'
  | 'mountainous'
  | 'flat'
  | 'valley'
  | 'plateau'
  | 'canyon'
  | 'island'
  | 'archipelago';

export type SkyStyle = 'clear' | 'cloudy' | 'stormy' | 'dawn' | 'dusk';
export type CloudStyle = 'sparse' | 'natural' | 'heavy';
export type WeatherStyle = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow';

export interface WorldStyleTerrain {
  macroScale: number;
  regionalScale: number;
  detailScale: number;
  heightScale: number;
  hillStrength: number;
  hillSmoothness: number;
  valleyStrength: number;
  valleyWidth: number;
  mountainStrength: number;
  mountainWidth: number;
  ridgeStrength: number;
  peakSharpness: number;
  cliffStrength: number;
  plateauStrength: number;
  erosionStrength: number;
  snowLine: number;
}

export interface WorldStyleWater {
  seaLevel: number;
  riverFrequency: number;
  riverWidth: number;
  lakeFrequency: number;
  lakeSize: number;
}

export interface WorldStyleBiome {
  scale: number;
  temperature: number;
  moisture: number;
  variation: number;
}

export interface WorldStyleVegetation {
  treeDensity: number;
  grassDensity: number;
  flowerDensity: number;
  rockDensity: number;
  bushDensity: number;
  /** Spread of tree size/shape within a species. 0 makes a plantation. */
  variation: number;
}

export interface WorldStyleAtmosphere {
  fogDistance: number;
  /** 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset. */
  timeOfDay: number;
  /** Compass bearing of the sun in turns, so shadows can be aimed. */
  sunBearing: number;
  ambientIntensity: number;
  cloudDensity: number;
  cloudSize: number;
  cloudSpeed: number;
  skyStyle: SkyStyle;
  cloudStyle: CloudStyle;
  weather: WeatherStyle;
}

export interface WorldStyleScale {
  /** World units per gameplay block. */
  worldVoxelSize: number;
}

export interface VytheraWorldStyle {
  id: string;
  name: string;
  description: string;
  author: string;
  /** Style revision, incremented on publish so downloads stay stable. */
  version: number;
  landscape: LandscapeStyle;
  seed: string;
  terrainVoxelSize: TerrainResolution;
  /**
   * Physical size of one gameplay block, distinct from `terrainVoxelSize`,
   * which only controls how finely terrain elevation is represented within a
   * block. Optional because every style written before the field existed
   * describes a stock world, and those must keep loading as 1.0 rather than
   * being silently rescaled.
   */
  worldScale?: WorldStyleScale;
  terrain: WorldStyleTerrain;
  water: WorldStyleWater;
  biome: WorldStyleBiome;
  vegetation: WorldStyleVegetation;
  atmosphere: WorldStyleAtmosphere;
  /** Worldgen algorithm version this style was authored against. */
  generationVersion: number;
  /** Style file format version. */
  formatVersion: number;
  createdAt: number;
  updatedAt: number;
  /**
   * How this style came to exist. Optional so every style saved before the
   * field existed still loads unchanged.
   */
  origin?: StyleOrigin;
}

/**
 * Provenance of a style.
 *
 * 'vision' is reserved for the planned reference-image pipeline. Recording it
 * lets the library show where a style came from without the loader having to
 * guess, and gives that feature somewhere to write without a format change.
 */
export type StyleOrigin = {
  kind: 'manual' | 'preset' | 'imported' | 'randomized' | 'vision';
  /** Free-form, e.g. the preset name or a short description of the source. */
  label?: string;
  /**
   * Colours sampled from the source, as '#rrggbb'. The preview does not read
   * these yet; they exist so an image-derived style can carry its palette
   * forward instead of losing it on save.
   */
  palette?: string[];
};

export type StyleGroup = 'terrain' | 'water' | 'biome' | 'vegetation' | 'atmosphere';

/** Groups that can be locked against randomization and preset application. */
export const LOCKABLE_GROUPS: StyleGroup[] = [
  'terrain',
  'water',
  'biome',
  'vegetation',
  'atmosphere',
];

export type LockState = Record<StyleGroup, boolean>;

export interface ParamSpec {
  group: StyleGroup;
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** Shown in Basic mode; the rest are Advanced-only. */
  basic?: boolean;
  /** Short explanation of what moving this does. */
  hint?: string;
  /** Rendered suffix, e.g. 'blocks'. Omitted for plain multipliers. */
  unit?: string;
}

/**
 * Single source of truth for every numeric parameter: drives the UI controls,
 * clamping of untrusted imports, and randomization ranges. Adding a parameter
 * here is enough to make it appear and be validated everywhere.
 */
export const PARAM_SPECS: ParamSpec[] = [
  // --- Terrain ---
  { group: 'terrain', key: 'heightScale', label: 'Elevation', min: 0.2, max: 3, step: 0.05, default: 1, basic: true, hint: 'Overall height of the land above sea level.' },
  { group: 'terrain', key: 'macroScale', label: 'Continent size', min: 0.3, max: 3, step: 0.05, default: 1, hint: 'Wavelength of continents and oceans.' },
  { group: 'terrain', key: 'regionalScale', label: 'Region size', min: 0.3, max: 3, step: 0.05, default: 1, hint: 'Size of regional highs and lows.' },
  { group: 'terrain', key: 'detailScale', label: 'Detail size', min: 0.3, max: 3, step: 0.05, default: 1, hint: 'Size of small surface variation.' },
  { group: 'terrain', key: 'hillStrength', label: 'Hill size', min: 0, max: 3, step: 0.05, default: 1, basic: true, hint: 'How tall rolling hills grow.' },
  { group: 'terrain', key: 'hillSmoothness', label: 'Hill smoothness', min: 0, max: 2, step: 0.05, default: 1, hint: 'Higher smooths hills into gentle swells.' },
  { group: 'terrain', key: 'valleyStrength', label: 'Valley depth', min: 0, max: 3, step: 0.05, default: 1, basic: true, hint: 'How deeply valleys cut into the land.' },
  { group: 'terrain', key: 'valleyWidth', label: 'Valley width', min: 0.3, max: 3, step: 0.05, default: 1, hint: 'How broad valley floors are.' },
  { group: 'terrain', key: 'mountainStrength', label: 'Mountain height', min: 0, max: 3, step: 0.05, default: 1, basic: true, hint: 'Height of mountain chains.' },
  { group: 'terrain', key: 'mountainWidth', label: 'Mountain width', min: 0.3, max: 3, step: 0.05, default: 1, hint: 'How wide ranges spread.' },
  { group: 'terrain', key: 'ridgeStrength', label: 'Ridge sharpness', min: 0, max: 3, step: 0.05, default: 1, hint: 'Sharpness of ridgelines.' },
  { group: 'terrain', key: 'peakSharpness', label: 'Peak sharpness', min: 0, max: 3, step: 0.05, default: 1, hint: 'Pointiness of summits.' },
  { group: 'terrain', key: 'cliffStrength', label: 'Cliff frequency', min: 0, max: 3, step: 0.05, default: 1, hint: 'Higher allows steeper, less walkable drops.' },
  { group: 'terrain', key: 'plateauStrength', label: 'Plateau frequency', min: 0, max: 3, step: 0.05, default: 1, hint: 'How strongly highlands flatten into tables.' },
  { group: 'terrain', key: 'erosionStrength', label: 'Erosion', min: 0, max: 3, step: 0.05, default: 1, hint: 'Higher wears terrain into softer forms.' },
  { group: 'terrain', key: 'snowLine', label: 'Snow line', min: 0, max: 200, step: 1, default: SEA_LEVEL + 44, unit: 'blocks', hint: 'Height where snow begins.' },

  // --- Water ---
  { group: 'water', key: 'seaLevel', label: 'Sea level', min: 8, max: 160, step: 1, default: SEA_LEVEL, basic: true, unit: 'blocks' },
  { group: 'water', key: 'riverFrequency', label: 'River frequency', min: 0, max: 3, step: 0.05, default: 1, basic: true },
  { group: 'water', key: 'riverWidth', label: 'River width', min: 0.2, max: 3, step: 0.05, default: 1 },
  { group: 'water', key: 'lakeFrequency', label: 'Lake frequency', min: 0, max: 3, step: 0.05, default: 1 },
  { group: 'water', key: 'lakeSize', label: 'Lake size', min: 0.2, max: 3, step: 0.05, default: 1 },

  // --- Biome ---
  { group: 'biome', key: 'scale', label: 'Biome size', min: 0.3, max: 3, step: 0.05, default: 1, basic: true },
  { group: 'biome', key: 'temperature', label: 'Temperature', min: -1, max: 1, step: 0.02, default: 0, basic: true, hint: 'Shifts the whole world colder or warmer.' },
  { group: 'biome', key: 'moisture', label: 'Moisture', min: -1, max: 1, step: 0.02, default: 0, basic: true },
  { group: 'biome', key: 'variation', label: 'Biome variation', min: 0, max: 3, step: 0.05, default: 1 },

  // --- Vegetation ---
  { group: 'vegetation', key: 'treeDensity', label: 'Trees', min: 0, max: 3, step: 0.05, default: 1, basic: true },
  { group: 'vegetation', key: 'grassDensity', label: 'Grass', min: 0, max: 3, step: 0.05, default: 1, basic: true },
  { group: 'vegetation', key: 'flowerDensity', label: 'Flowers', min: 0, max: 3, step: 0.05, default: 1 },
  { group: 'vegetation', key: 'rockDensity', label: 'Rocks', min: 0, max: 3, step: 0.05, default: 1 },
  { group: 'vegetation', key: 'bushDensity', label: 'Bushes', min: 0, max: 3, step: 0.05, default: 1 },
  { group: 'vegetation', key: 'variation', label: 'Plant variation', min: 0, max: 2, step: 0.05, default: 1, hint: 'Spread of plant sizes. 0 makes every tree identical.' },

  // --- Atmosphere ---
  { group: 'atmosphere', key: 'timeOfDay', label: 'Time of day', min: 0, max: 1, step: 0.01, default: 0.32, basic: true, hint: '0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset.' },
  { group: 'atmosphere', key: 'cloudDensity', label: 'Cloud density', min: 0, max: 2, step: 0.05, default: 1, basic: true, hint: 'How much of the sky the clouds cover.' },
  { group: 'atmosphere', key: 'cloudSize', label: 'Cloud size', min: 0.3, max: 3, step: 0.05, default: 1 },
  { group: 'atmosphere', key: 'cloudSpeed', label: 'Cloud speed', min: 0, max: 3, step: 0.05, default: 1 },
  { group: 'atmosphere', key: 'ambientIntensity', label: 'Ambient light', min: 0.2, max: 2, step: 0.05, default: 1, hint: 'Fill light in shadowed areas.' },
  { group: 'atmosphere', key: 'sunBearing', label: 'Sun direction', min: 0, max: 1, step: 0.01, default: 0.15, hint: 'Compass bearing the sun rises from.' },
  { group: 'atmosphere', key: 'fogDistance', label: 'Fog distance', min: 60, max: 1200, step: 10, default: 640, unit: 'blocks' },
];

export const SKY_STYLES: SkyStyle[] = ['clear', 'cloudy', 'stormy', 'dawn', 'dusk'];
export const CLOUD_STYLES: CloudStyle[] = ['sparse', 'natural', 'heavy'];
export const WEATHER_STYLES: WeatherStyle[] = ['clear', 'cloudy', 'fog', 'rain', 'snow'];

export const LANDSCAPE_STYLES: { id: LandscapeStyle; label: string }[] = [
  { id: 'rolling', label: 'Rolling' },
  { id: 'mountainous', label: 'Mountainous' },
  { id: 'flat', label: 'Flat' },
  { id: 'valley', label: 'Valley' },
  { id: 'plateau', label: 'High plateau' },
  { id: 'canyon', label: 'Canyon' },
  { id: 'island', label: 'Island' },
  { id: 'archipelago', label: 'Archipelago' },
];

export const MAX_NAME_LENGTH = 60;
export const MAX_DESCRIPTION_LENGTH = 400;
export const MAX_AUTHOR_LENGTH = 40;
export const MAX_SEED_LENGTH = 64;

function defaultsFor(group: StyleGroup): Record<string, number> {
  const out: Record<string, number> = {};
  for (const spec of PARAM_SPECS) if (spec.group === group) out[spec.key] = spec.default;
  return out;
}

/**
 * The scale a style describes, as one config every system can read.
 *
 * Pairs the block size with the terrain resolution so callers never have to
 * fetch them from two places and risk using one without the other. A style
 * predating `worldScale` resolves to a stock 1.0 world.
 */
export function worldScaleOf(style: VytheraWorldStyle): WorldScaleConfig {
  return makeWorldScale({
    worldVoxelSize: style.worldScale?.worldVoxelSize ?? DEFAULT_WORLD_VOXEL_SIZE,
    terrainVoxelSize: style.terrainVoxelSize,
  });
}

export function createDefaultStyle(overrides: Partial<VytheraWorldStyle> = {}): VytheraWorldStyle {
  const now = Date.now();
  return {
    id: newStyleId(),
    name: 'Custom World',
    description: '',
    author: '',
    version: 1,
    landscape: 'rolling',
    seed: 'vythera',
    terrainVoxelSize: 0.25,
    worldScale: { worldVoxelSize: DEFAULT_WORLD_VOXEL_SIZE },
    terrain: defaultsFor('terrain') as unknown as WorldStyleTerrain,
    water: defaultsFor('water') as unknown as WorldStyleWater,
    biome: defaultsFor('biome') as unknown as WorldStyleBiome,
    vegetation: defaultsFor('vegetation') as unknown as WorldStyleVegetation,
    atmosphere: {
      ...(defaultsFor('atmosphere') as unknown as Omit<
        WorldStyleAtmosphere,
        'skyStyle' | 'cloudStyle' | 'weather'
      >),
      skyStyle: 'clear',
      cloudStyle: 'natural',
      weather: 'clear',
    },
    generationVersion: WORLD_GENERATION_VERSION,
    formatVersion: WORLD_STYLE_FORMAT,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function newStyleId(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 18);
  return `vws_${rand}`;
}

export function cloneStyle(style: VytheraWorldStyle): VytheraWorldStyle {
  return {
    ...style,
    terrain: { ...style.terrain },
    water: { ...style.water },
    biome: { ...style.biome },
    vegetation: { ...style.vegetation },
    atmosphere: { ...style.atmosphere },
  };
}

export function readParam(style: VytheraWorldStyle, spec: ParamSpec): number {
  const group = style[spec.group] as unknown as Record<string, number>;
  return group[spec.key] ?? spec.default;
}

export function writeParam(
  style: VytheraWorldStyle,
  spec: ParamSpec,
  value: number,
): VytheraWorldStyle {
  const next = cloneStyle(style);
  const group = next[spec.group] as unknown as Record<string, number>;
  group[spec.key] = clampToSpec(spec, value);
  next.updatedAt = Date.now();
  return next;
}

export function clampToSpec(spec: ParamSpec, value: number): number {
  if (!Number.isFinite(value)) return spec.default;
  return Math.min(spec.max, Math.max(spec.min, value));
}

/**
 * Landscape starting points and safe randomization.
 *
 * Presets are partial overrides applied on top of defaults, so a preset is a
 * starting point the creator then edits rather than a fixed outcome.
 */
import {
  PARAM_SPECS,
  cloneStyle,
  createDefaultStyle,
  type LandscapeStyle,
  type LockState,
  type StyleGroup,
  type VytheraWorldStyle,
} from './WorldStyle';

type GroupOverrides = Partial<Record<StyleGroup, Record<string, number>>>;

const PRESETS: Record<LandscapeStyle, GroupOverrides> = {
  rolling: {
    terrain: { heightScale: 0.9, hillStrength: 1.2, hillSmoothness: 1.3, mountainStrength: 0.6, valleyStrength: 0.9 },
    water: { riverFrequency: 1.2 },
  },
  mountainous: {
    terrain: { heightScale: 1.6, mountainStrength: 2.2, ridgeStrength: 1.7, peakSharpness: 1.6, valleyStrength: 1.4, plateauStrength: 0.5 },
    biome: { temperature: -0.2 },
  },
  flat: {
    terrain: { heightScale: 0.35, hillStrength: 0.3, hillSmoothness: 1.6, mountainStrength: 0.05, valleyStrength: 0.2, ridgeStrength: 0.1, plateauStrength: 1.4 },
  },
  valley: {
    terrain: { valleyStrength: 2.2, valleyWidth: 1.7, mountainStrength: 1.2, ridgeStrength: 1.2, hillSmoothness: 1.2 },
    water: { riverFrequency: 1.8, riverWidth: 1.4 },
  },
  plateau: {
    terrain: { heightScale: 1.4, plateauStrength: 2.4, erosionStrength: 1.6, hillStrength: 0.6, cliffStrength: 1.6, mountainStrength: 0.8 },
  },
  canyon: {
    terrain: { valleyStrength: 2.6, valleyWidth: 0.5, cliffStrength: 2.4, plateauStrength: 1.8, erosionStrength: 0.4, hillStrength: 0.4 },
    water: { riverFrequency: 2, riverWidth: 0.6 },
    biome: { moisture: -0.4 },
  },
  island: {
    terrain: { macroScale: 0.6, heightScale: 1.1, hillStrength: 1.1, mountainStrength: 0.9 },
    water: { seaLevel: 64, lakeFrequency: 0.4 },
  },
  archipelago: {
    terrain: { macroScale: 0.4, heightScale: 0.9, hillStrength: 1, mountainStrength: 0.6 },
    water: { seaLevel: 68, lakeFrequency: 0.2, riverFrequency: 0.4 },
  },
};

/**
 * Apply a landscape preset. Locked groups keep their current values, so a
 * creator who has tuned water can try different landforms without losing it.
 */
export function applyLandscapePreset(
  style: VytheraWorldStyle,
  landscape: LandscapeStyle,
  locks?: LockState,
): VytheraWorldStyle {
  const next = cloneStyle(style);
  const defaults = createDefaultStyle();
  const overrides = PRESETS[landscape] ?? {};

  for (const spec of PARAM_SPECS) {
    if (locks?.[spec.group]) continue;
    const preset = overrides[spec.group]?.[spec.key];
    const fallback = (defaults[spec.group] as unknown as Record<string, number>)[spec.key]!;
    (next[spec.group] as unknown as Record<string, number>)[spec.key] = preset ?? fallback;
  }

  next.landscape = landscape;
  next.updatedAt = Date.now();
  return next;
}

/** Vegetation quick-set, independent of landform. */
export const VEGETATION_PRESETS: Record<string, Record<string, number>> = {
  sparse: { treeDensity: 0.3, grassDensity: 0.4, flowerDensity: 0.2, bushDensity: 0.3, rockDensity: 1.2 },
  natural: { treeDensity: 1, grassDensity: 1, flowerDensity: 1, bushDensity: 1, rockDensity: 1 },
  dense: { treeDensity: 2.2, grassDensity: 2, flowerDensity: 1.8, bushDensity: 2, rockDensity: 0.7 },
};

export function applyVegetationPreset(
  style: VytheraWorldStyle,
  preset: keyof typeof VEGETATION_PRESETS,
): VytheraWorldStyle {
  const next = cloneStyle(style);
  const values = VEGETATION_PRESETS[preset];
  if (values) {
    for (const [key, value] of Object.entries(values)) {
      (next.vegetation as unknown as Record<string, number>)[key] = value;
    }
  }
  next.updatedAt = Date.now();
  return next;
}

/**
 * Randomize within a band around each parameter's default rather than across
 * its full legal range: the extremes are individually valid but combine into
 * unplayable worlds, and "Surprise me" should always produce something worth
 * looking at.
 */
export function randomizeStyle(
  style: VytheraWorldStyle,
  locks: LockState,
  random: () => number = Math.random,
): VytheraWorldStyle {
  const landscapes = Object.keys(PRESETS) as LandscapeStyle[];
  const landscape = locks.terrain
    ? style.landscape
    : landscapes[Math.floor(random() * landscapes.length)]!;

  const next = applyLandscapePreset(style, landscape, locks);

  for (const spec of PARAM_SPECS) {
    if (locks[spec.group]) continue;
    const current = (next[spec.group] as unknown as Record<string, number>)[spec.key]!;
    const band = (spec.max - spec.min) * 0.16;
    const jittered = current + (random() * 2 - 1) * band;
    const stepped = Math.round(jittered / spec.step) * spec.step;
    (next[spec.group] as unknown as Record<string, number>)[spec.key] = Math.min(
      spec.max,
      Math.max(spec.min, Number(stepped.toFixed(4))),
    );
  }

  next.landscape = landscape;
  next.updatedAt = Date.now();
  return next;
}

export function randomSeed(random: () => number = Math.random): string {
  return Math.floor(random() * 0xffffffff)
    .toString(36)
    .padStart(6, '0');
}

export const LANDSCAPE_PRESET_IDS = Object.keys(PRESETS) as LandscapeStyle[];

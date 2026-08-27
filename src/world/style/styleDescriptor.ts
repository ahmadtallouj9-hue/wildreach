/**
 * The boundary between landscape analysis and a world style.
 *
 *   REFERENCE IMAGE -> VYTHERA VISION -> LANDSCAPE ANALYSIS -> WORLD STYLE
 *
 * This module defines the middle of that chain and nothing else. Image analysis
 * is deliberately not implemented here: what exists is the vocabulary an
 * analyser must produce and the pure function that turns it into style
 * parameters. Anything upstream — a vision model, a preset importer, a text
 * prompt — only has to emit a WorldStyleDescriptor.
 *
 * The descriptor is intentionally semantic rather than numeric. An analyser
 * should be able to say "tall sharp mountains, deep valleys, sparse conifers"
 * without knowing that mountainStrength happens to be a 0..3 multiplier, so
 * tuning the generator later does not invalidate anything upstream of here.
 */
import {
  PARAM_SPECS,
  cloneStyle,
  writeParam,
  type LandscapeStyle,
  type StyleOrigin,
  type VytheraWorldStyle,
} from './WorldStyle';

/** Normalised 0..1 strength. 0.5 means "unremarkable, like most places". */
export type Level = number;

export interface TerrainCharacter {
  /** Overall relief, from flat plain to towering. */
  elevation?: Level;
  /** How broad the landforms are: 0 busy and local, 1 vast and continental. */
  scale?: Level;
  /** Rolling hill presence. */
  hills?: Level;
  /** How smooth or rugged the surface reads. */
  smoothness?: Level;
  /** Bare rock, cliffs and exposed faces. */
  ruggedness?: Level;
}

export interface MountainCharacter {
  height?: Level;
  /** Knife-edge ridges versus rounded massifs. */
  sharpness?: Level;
  /** How much of the frame mountains occupy. */
  coverage?: Level;
  /** Flat-topped mesas and tablelands. */
  plateaus?: Level;
}

export interface ValleyCharacter {
  depth?: Level;
  width?: Level;
  /** Visible erosion: gullies, worn slopes, softened edges. */
  erosion?: Level;
}

export interface VegetationCharacter {
  trees?: Level;
  undergrowth?: Level;
  groundCover?: Level;
  flowers?: Level;
  rocks?: Level;
  /** Uniform plantation versus wild mixed growth. */
  variety?: Level;
}

export interface WaterCharacter {
  /** How much water is present, which maps onto sea level. */
  amount?: Level;
  rivers?: Level;
  lakes?: Level;
}

export interface AtmosphereCharacter {
  /** 0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset. */
  timeOfDay?: Level;
  cloudCover?: Level;
  cloudSize?: Level;
  /** Haze and visibility; 1 is crystal clear. */
  clarity?: Level;
  brightness?: Level;
}

/**
 * A complete landscape description. Every field is optional: an analyser that
 * can only judge mountains still produces a usable descriptor, and everything
 * it says nothing about keeps the style's existing value.
 */
export interface WorldStyleDescriptor {
  /** Closest named landform family, applied before the finer adjustments. */
  landscape?: LandscapeStyle;
  terrain?: TerrainCharacter;
  mountains?: MountainCharacter;
  valleys?: ValleyCharacter;
  vegetation?: VegetationCharacter;
  water?: WaterCharacter;
  atmosphere?: AtmosphereCharacter;
  /** Colours sampled from the source, carried through onto the style. */
  palette?: string[];
  /** Human-readable note about the source, shown in the style library. */
  label?: string;
}

const SPEC_BY_KEY = new Map(PARAM_SPECS.map((s) => [`${s.group}.${s.key}`, s]));

/** Plain six-digit hex only; anything else is not a colour we will store. */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Map a 0..1 level onto a parameter's real range.
 *
 * 0.5 lands on the parameter's default rather than the midpoint of its range,
 * so a descriptor that calls everything "average" reproduces the stock world
 * instead of drifting toward whatever the numeric middle happens to be.
 */
function levelToParam(path: string, level: Level): { path: string; value: number } | null {
  const spec = SPEC_BY_KEY.get(path);
  if (!spec) return null;
  const t = clamp01(level);
  const value =
    t <= 0.5
      ? spec.min + (spec.default - spec.min) * (t / 0.5)
      : spec.default + (spec.max - spec.default) * ((t - 0.5) / 0.5);
  return { path, value };
}

/**
 * Every level field an analyser can set, and the style parameter it drives.
 *
 * Kept as data so the mapping is inspectable and testable rather than buried in
 * branching, and so a future parameter only needs one line here.
 */
const MAPPING: { get: (d: WorldStyleDescriptor) => Level | undefined; path: string }[] = [
  { get: (d) => d.terrain?.elevation, path: 'terrain.heightScale' },
  { get: (d) => d.terrain?.scale, path: 'terrain.macroScale' },
  { get: (d) => d.terrain?.hills, path: 'terrain.hillStrength' },
  { get: (d) => d.terrain?.smoothness, path: 'terrain.hillSmoothness' },
  { get: (d) => d.terrain?.ruggedness, path: 'terrain.cliffStrength' },

  { get: (d) => d.mountains?.height, path: 'terrain.mountainStrength' },
  { get: (d) => d.mountains?.sharpness, path: 'terrain.peakSharpness' },
  { get: (d) => d.mountains?.coverage, path: 'terrain.mountainWidth' },
  { get: (d) => d.mountains?.plateaus, path: 'terrain.plateauStrength' },

  { get: (d) => d.valleys?.depth, path: 'terrain.valleyStrength' },
  { get: (d) => d.valleys?.width, path: 'terrain.valleyWidth' },
  { get: (d) => d.valleys?.erosion, path: 'terrain.erosionStrength' },

  { get: (d) => d.vegetation?.trees, path: 'vegetation.treeDensity' },
  { get: (d) => d.vegetation?.undergrowth, path: 'vegetation.bushDensity' },
  { get: (d) => d.vegetation?.groundCover, path: 'vegetation.grassDensity' },
  { get: (d) => d.vegetation?.flowers, path: 'vegetation.flowerDensity' },
  { get: (d) => d.vegetation?.rocks, path: 'vegetation.rockDensity' },
  { get: (d) => d.vegetation?.variety, path: 'vegetation.variation' },

  { get: (d) => d.water?.amount, path: 'water.seaLevel' },
  { get: (d) => d.water?.rivers, path: 'water.riverFrequency' },
  { get: (d) => d.water?.lakes, path: 'water.lakeFrequency' },

  { get: (d) => d.atmosphere?.cloudCover, path: 'atmosphere.cloudDensity' },
  { get: (d) => d.atmosphere?.cloudSize, path: 'atmosphere.cloudSize' },
  { get: (d) => d.atmosphere?.brightness, path: 'atmosphere.ambientIntensity' },
];

/**
 * Apply a descriptor onto a style, returning a new style.
 *
 * Pure and total: unknown fields are ignored, out-of-range levels are clamped,
 * and every value still goes through writeParam, so a descriptor from an
 * untrusted source cannot produce a style outside the declared ranges. That is
 * what makes this safe to point a future vision model at.
 */
export function applyDescriptor(
  style: VytheraWorldStyle,
  descriptor: WorldStyleDescriptor,
  origin: StyleOrigin['kind'] = 'vision',
): VytheraWorldStyle {
  let next = cloneStyle(style);

  if (descriptor.landscape) next.landscape = descriptor.landscape;

  for (const entry of MAPPING) {
    const level = entry.get(descriptor);
    if (level === undefined || !Number.isFinite(level)) continue;
    const mapped = levelToParam(entry.path, level);
    if (!mapped) continue;
    const spec = SPEC_BY_KEY.get(mapped.path);
    if (spec) next = writeParam(next, spec, mapped.value);
  }

  // Time of day is already a 0..1 turn of the clock, so it passes through
  // directly rather than through the default-centred level mapping.
  const tod = descriptor.atmosphere?.timeOfDay;
  if (tod !== undefined && Number.isFinite(tod)) {
    const spec = SPEC_BY_KEY.get('atmosphere.timeOfDay');
    if (spec) next = writeParam(next, spec, clamp01(tod));
  }

  // Clarity is inverted: a hazy photograph means a short fog distance.
  const clarity = descriptor.atmosphere?.clarity;
  if (clarity !== undefined && Number.isFinite(clarity)) {
    const mapped = levelToParam('atmosphere.fogDistance', clamp01(clarity));
    const spec = SPEC_BY_KEY.get('atmosphere.fogDistance');
    if (mapped && spec) next = writeParam(next, spec, mapped.value);
  }

  // Provenance is sanitised here as well as on save. A descriptor is the point
  // an untrusted analyser writes into the style, so it should not be able to
  // put anything into the record that only the save path would catch.
  const palette = (descriptor.palette ?? [])
    .filter((c) => typeof c === 'string' && HEX_COLOR.test(c))
    .slice(0, 16);
  const label = typeof descriptor.label === 'string' ? descriptor.label.trim().slice(0, 120) : '';

  next.origin = {
    kind: origin,
    ...(label ? { label } : {}),
    ...(palette.length ? { palette } : {}),
  };

  return next;
}

/** Parameter paths a descriptor can reach, exposed for tests and tooling. */
export function descriptorTargets(): string[] {
  return MAPPING.map((m) => m.path);
}

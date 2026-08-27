/**
 * Canonical vegetation placement.
 *
 * This module decides WHAT grows WHERE. It is the single source of truth shared
 * by real chunk generation (VegetationGenerator, which stamps blocks) and the
 * Custom World preview (which draws instanced props). Neither owns its own
 * placement rules, so the preview cannot drift away from the world a player
 * actually gets — that parity is structural, not a convention.
 *
 * Everything here is pure and deterministic: the same lattice cell, seed salt
 * and style tuning always yield the same result, with no allocation-order or
 * iteration-order dependence. Density is applied as a threshold on a fixed
 * roll, so raising a density only ever ADDS plants — it never relocates the
 * ones already there.
 */
import { BiomeId } from '../Biomes';
import { BIOME_GEN } from './BiomeTable';
import { vegetationDensity } from './BiomeBlend';
import type { ClimateSample } from './Climate';

export type PlantKind = 'tree' | 'bush' | 'grass' | 'flower' | 'rock';

export type TreeKind = Exclude<(typeof BIOME_GEN)[BiomeId.Plains]['treeKind'], 'none'>;

/** Vegetation densities from a world style. All 1 reproduces stock VYTHERA. */
export interface VegetationTuning {
  treeDensity: number;
  grassDensity: number;
  flowerDensity: number;
  rockDensity: number;
  bushDensity: number;
  /** Spread of per-plant size. 0 makes every plant of a kind identical. */
  variation: number;
}

export const NEUTRAL_VEGETATION: VegetationTuning = {
  treeDensity: 1,
  grassDensity: 1,
  flowerDensity: 1,
  rockDensity: 1,
  bushDensity: 1,
  variation: 1,
};

/**
 * One candidate site every 3 blocks. This is the lattice the shipped generator
 * has always used; preview and world must walk the same one or their plants
 * would land in different places.
 */
export const SITE_STEP = 3;

/**
 * Above this grade (world units risen per unit travelled) a slope is a cliff
 * face and holds no rooted plants. Loose rock still collects on it.
 */
const CLIFF_SLOPE = 1.35;

/** Base chances for the kinds the biome table does not itself specify. */
const BUSH_BASE = 0.05;
const FLOWER_BASE = 0.06;
const ROCK_BASE = 0.035;

export interface PlantContext {
  biome: BiomeId;
  climate: ClimateSample;
  /** Surface height at the jittered position. */
  height: number;
  /** Grade at the site, world units per world unit. */
  slope: number;
  seaLevel: number;
  veg: VegetationTuning;
}

export interface PlantSite {
  /** Jittered world position of the plant. */
  x: number;
  z: number;
  kind: PlantKind;
  /** Species, meaningful for kind 'tree'. */
  treeKind: TreeKind;
  /** Trunk height for trees, coarse size for props. */
  size: number;
  /** The site's primary roll, so callers can derive further variation. */
  roll: number;
}

/**
 * Integer hash in [0,1). Identical to the one the shipped tree generator has
 * always used, so existing worlds keep the tree layout players already know.
 */
export function vegHash(x: number, z: number, salt: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ (salt | 0);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The jittered world position for a lattice cell. */
export function sitePosition(gx: number, gz: number, salt: number): { x: number; z: number } {
  return {
    x: gx + Math.floor(vegHash(gx, gz, salt + 3) * 2),
    z: gz + Math.floor(vegHash(gx + 5, gz + 7, salt + 5) * 2),
  };
}

function treeTrunk(kind: TreeKind, x: number, z: number, salt: number, variation: number): number {
  const r = vegHash(x * 3, z * 5, salt + 9);
  // variation scales the random span around the species' minimum, so 0 yields
  // a uniform plantation and 2 exaggerates the spread.
  const spread = (base: number, span: number): number =>
    base + Math.floor(r * span * Math.max(0, variation));
  switch (kind) {
    case 'oak':
      return spread(4, 3);
    case 'birch':
      return spread(5, 4);
    case 'canopy':
      return spread(5, 5);
    case 'pine':
      return spread(7, 5);
    case 'jungle':
      return spread(8, 6);
    case 'willow':
      return spread(5, 2);
    case 'cactus':
      return spread(3, 3);
    default:
      return 4;
  }
}

/**
 * Decide what grows at one lattice cell, or null for bare ground.
 *
 * Kinds are mutually exclusive and resolved in priority order — a tree wins
 * over a bush, a bush over ground cover — because a single lattice cell
 * represents one patch of ground in both renderers.
 */
export function plantAt(gx: number, gz: number, salt: number, ctx: PlantContext): PlantSite | null {
  const { x, z } = sitePosition(gx, gz, salt);
  const { biome, climate, height, slope, seaLevel, veg } = ctx;
  const def = BIOME_GEN[biome];
  const roll = vegHash(x, z, salt);

  const underwater = height <= seaLevel;
  const isOcean = biome === BiomeId.Ocean || biome === BiomeId.DeepOcean;

  // Loose rock is the only thing that gathers on cliffs and bare mountain
  // ground, so it is resolved before the rooted kinds.
  const mountain = biome === BiomeId.Mountains || biome === BiomeId.SnowyMountains;
  const rockRoll = vegHash(x + 11, z + 23, salt + 17);
  const rockChance = ROCK_BASE * veg.rockDensity * (mountain ? 2.2 : slope > 0.6 ? 1.4 : 0.35);
  if (!underwater && !isOcean && rockRoll < rockChance) {
    return { x, z, kind: 'rock', treeKind: 'oak', size: 1 + (rockRoll < rockChance * 0.4 ? 1 : 0), roll: rockRoll };
  }

  if (underwater || isOcean || !def) return null;
  // Nothing roots on a cliff face.
  if (slope > CLIFF_SLOPE) return null;

  // Trees keep the shipped chance, elevation/moisture modulation and hash, so
  // a default style reproduces the existing forest layout exactly.
  if (def.treeKind !== 'none') {
    const mod = vegetationDensity(climate, height, seaLevel);
    if (roll < def.treeChance * veg.treeDensity * mod) {
      return {
        x,
        z,
        kind: 'tree',
        treeKind: def.treeKind,
        size: treeTrunk(def.treeKind, x, z, salt, veg.variation),
        roll,
      };
    }
  }

  // Bushes favour the same ground trees like, but tolerate more open country.
  const bushRoll = vegHash(x + 31, z + 47, salt + 29);
  const canBush = def.treeKind !== 'none' && def.treeKind !== 'cactus';
  if (canBush && bushRoll < BUSH_BASE * veg.bushDensity * (def.grassChance > 0 ? 1 : 0.4)) {
    return { x, z, kind: 'bush', treeKind: def.treeKind as TreeKind, size: 1, roll: bushRoll };
  }

  // Ground cover. Grass follows the biome's own grassChance; flowers are a
  // fraction of the same ground, biased towards damp, temperate places.
  if (def.grassChance > 0) {
    const flowerRoll = vegHash(x + 71, z + 89, salt + 41);
    const damp = 0.5 + (climate.humidity - 0.5) * 0.8;
    if (flowerRoll < FLOWER_BASE * veg.flowerDensity * def.grassChance * 12 * Math.max(0, damp)) {
      return { x, z, kind: 'flower', treeKind: 'oak', size: 1, roll: flowerRoll };
    }
    const grassRoll = vegHash(x + 101, z + 131, salt + 53);
    if (grassRoll < def.grassChance * veg.grassDensity * 6) {
      return { x, z, kind: 'grass', treeKind: 'oak', size: 1, roll: grassRoll };
    }
  }

  return null;
}

/**
 * Walk every lattice cell whose site can fall inside a region, calling back
 * with each plant. The margin covers plants rooted just outside whose canopy
 * reaches in.
 */
export function forEachPlant(
  x0: number,
  z0: number,
  blocks: number,
  salt: number,
  margin: number,
  context: (x: number, z: number) => PlantContext | null,
  visit: (site: PlantSite) => void,
): void {
  const start = Math.floor((x0 - margin) / SITE_STEP) * SITE_STEP;
  const startZ = Math.floor((z0 - margin) / SITE_STEP) * SITE_STEP;
  for (let gz = startZ; gz < z0 + blocks + margin; gz += SITE_STEP) {
    for (let gx = start; gx < x0 + blocks + margin; gx += SITE_STEP) {
      const { x, z } = sitePosition(gx, gz, salt);
      const ctx = context(x, z);
      if (!ctx) continue;
      const site = plantAt(gx, gz, salt, ctx);
      if (site) visit(site);
    }
  }
}

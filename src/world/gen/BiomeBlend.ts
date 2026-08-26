import { Block, SEA_LEVEL } from '../blocks';
import { BiomeId } from '../Biomes';
import type { ClimateSample } from './Climate';
import { surfaceBlockFor } from './BiomeTable';

/** Soft biome surface blend weight from neighbor influence. */
export function blendedSurfaceBlock(
  wx: number,
  wz: number,
  height: number,
  biome: BiomeId,
  beach: boolean,
  sample: (x: number, z: number) => { biome: BiomeId; height: number },
): number {
  if (beach || height < SEA_LEVEL + 2) return surfaceBlockFor(biome, height, beach);

  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  const radius = 6;
  for (let dz = -radius; dz <= radius; dz += radius) {
    for (let dx = -radius; dx <= radius; dx += radius) {
      if (dx === 0 && dz === 0) continue;
      const n = sample(wx + dx, wz + dz);
      const blend = 0.22 * (1 - (Math.abs(dx) + Math.abs(dz)) / (radius * 2));
      const block = surfaceBlockFor(n.biome, n.height, false);
      const [cr, cg, cb] = blockTint(block);
      r += cr * blend;
      g += cg * blend;
      b += cb * blend;
      w += blend;
    }
  }

  const core = surfaceBlockFor(biome, height, false);
  const [tr, tg, tb] = blockTint(core);
  const coreW = 1 - Math.min(0.45, w);
  r += tr * coreW;
  g += tg * coreW;
  b += tb * coreW;
  w += coreW;

  const target = nearestBlock(r / w, g / w, b / w, core);
  return target;
}

function blockTint(block: number): [number, number, number] {
  switch (block) {
    case Block.Grass:
      return [58, 132, 52];
    case Block.Sand:
      return [212, 194, 132];
    case Block.Snow:
      return [234, 236, 240];
    case Block.Gravel:
      return [110, 108, 100];
    case Block.Stone:
      return [128, 130, 136];
    case Block.Moss:
      return [34, 108, 50];
    default:
      return [120, 120, 120];
  }
}

function nearestBlock(r: number, g: number, b: number, fallback: number): number {
  const candidates: Array<[number, number, number, number]> = [
    [Block.Grass, 58, 132, 52],
    [Block.Sand, 212, 194, 132],
    [Block.Snow, 234, 236, 240],
    [Block.Gravel, 110, 108, 100],
    [Block.Stone, 128, 130, 136],
    [Block.Moss, 34, 108, 50],
    [Block.Dirt, 120, 80, 50],
  ];
  let best = fallback;
  let bestD = Infinity;
  for (const [id, cr, cg, cb] of candidates) {
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

/** Tree density multiplier from elevation + moisture. */
export function vegetationDensity(c: ClimateSample, height: number, seaLevel: number): number {
  const elev = height - seaLevel;
  let d = 1;
  if (elev > 38) d *= 0.35;
  else if (elev > 24) d *= 0.65;
  if (c.valleyFactor > 0.45 && c.humidity > 0.45) d *= 1.35;
  if (c.ridgeStrength > 0.62) d *= 0.55;
  if (c.river > 0.35) d *= 0.75;
  return Math.max(0.15, Math.min(1.6, d));
}

export function treeChanceAt(
  baseChance: number,
  c: ClimateSample,
  height: number,
  seaLevel: number,
  hash: number,
): boolean {
  const mod = vegetationDensity(c, height, seaLevel);
  return hash < baseChance * mod;
}

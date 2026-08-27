/**
 * The one place VYTHERA's surface colours are defined.
 *
 * Both renderers read from here: the Custom World preview colours its voxels
 * directly from these values, and the in-game texture atlas flattens its tiles
 * to them. Keeping a single table is what stops the game and the preview from
 * drifting into looking like two different worlds.
 */
import { Block } from './blocks';

export type SurfaceMaterial = 0 | 1 | 2 | 3 | 4 | 5;

export const MATERIAL = {
  Grass: 0 as SurfaceMaterial,
  Dirt: 1 as SurfaceMaterial,
  Rock: 2 as SurfaceMaterial,
  Sand: 3 as SurfaceMaterial,
  Snow: 4 as SurfaceMaterial,
  Water: 5 as SurfaceMaterial,
};

/** Original VYTHERA palette, linear 0..1. Not derived from any reference artwork. */
export const MATERIAL_COLORS: Record<SurfaceMaterial, [number, number, number]> = {
  0: [0.36, 0.55, 0.24],
  1: [0.44, 0.33, 0.21],
  2: [0.47, 0.46, 0.44],
  3: [0.79, 0.72, 0.49],
  4: [0.92, 0.93, 0.95],
  5: [0.16, 0.44, 0.52],
};

/** Trunks and foliage, kept beside the terrain palette so trees match too. */
export const WOOD_COLOR: [number, number, number] = [0.29, 0.19, 0.11];
export const LEAF_COLOR: [number, number, number] = [0.24, 0.5, 0.24];

/** Map a world block id onto the small surface palette. */
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

/** Palette entry as 0..255 bytes, for painting into the texture atlas. */
export function materialBytes(c: [number, number, number]): [number, number, number] {
  return [Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255)];
}

export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 96;
export const SEA_LEVEL = 42;
export const RENDER_DISTANCE = 6;

export const enum Block {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Sand = 4,
  Water = 5,
  Wood = 6,
  Leaves = 7,
  Snow = 8,
  Clay = 9,
  Crystal = 10,
  Ruin = 11,
  Moss = 12,
}

export const BLOCK_COLORS: Record<number, [number, number, number]> = {
  [Block.Grass]: [0.28, 0.55, 0.38],
  [Block.Dirt]: [0.42, 0.3, 0.2],
  [Block.Stone]: [0.45, 0.48, 0.52],
  [Block.Sand]: [0.82, 0.74, 0.52],
  [Block.Water]: [0.18, 0.42, 0.62],
  [Block.Wood]: [0.38, 0.26, 0.14],
  [Block.Leaves]: [0.22, 0.48, 0.32],
  [Block.Snow]: [0.9, 0.93, 0.96],
  [Block.Clay]: [0.55, 0.48, 0.42],
  [Block.Crystal]: [0.45, 0.85, 0.9],
  [Block.Ruin]: [0.55, 0.52, 0.48],
  [Block.Moss]: [0.25, 0.5, 0.35],
};

export function isSolid(block: number): boolean {
  return block !== Block.Air && block !== Block.Water;
}

export function isOpaque(block: number): boolean {
  return block !== Block.Air && block !== Block.Water && block !== Block.Leaves && block !== Block.Crystal;
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

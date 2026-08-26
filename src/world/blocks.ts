export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 144;
export const SEA_LEVEL = 48;
export const RENDER_DISTANCE = 7;

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
  Gravel = 13,
  Ice = 14,
  DarkStone = 15,
  Torch = 16,
  Lava = 17,
}

export const BLOCK_COLORS: Record<number, [number, number, number]> = {
  [Block.Grass]: [0.3, 0.58, 0.36],
  [Block.Dirt]: [0.45, 0.32, 0.2],
  [Block.Stone]: [0.48, 0.5, 0.54],
  [Block.Sand]: [0.86, 0.76, 0.52],
  [Block.Water]: [0.16, 0.42, 0.64],
  [Block.Wood]: [0.4, 0.26, 0.14],
  [Block.Leaves]: [0.24, 0.52, 0.3],
  [Block.Snow]: [0.92, 0.95, 0.98],
  [Block.Clay]: [0.58, 0.44, 0.36],
  [Block.Crystal]: [0.42, 0.86, 0.92],
  [Block.Ruin]: [0.52, 0.48, 0.42],
  [Block.Moss]: [0.28, 0.52, 0.32],
  [Block.Gravel]: [0.42, 0.42, 0.4],
  [Block.Ice]: [0.62, 0.82, 0.92],
  [Block.DarkStone]: [0.22, 0.24, 0.28],
  [Block.Torch]: [0.95, 0.72, 0.28],
  [Block.Lava]: [0.92, 0.32, 0.08],
};

export function isSolid(block: number): boolean {
  return block !== Block.Air && block !== Block.Water && block !== Block.Lava && block !== Block.Torch;
}

export function isOpaque(block: number): boolean {
  return (
    block !== Block.Air &&
    block !== Block.Water &&
    block !== Block.Leaves &&
    block !== Block.Crystal &&
    block !== Block.Ice &&
    block !== Block.Torch &&
    block !== Block.Lava
  );
}

/** Blocks that do not fully block sky/block light. */
export function lightPasses(block: number): boolean {
  return !isOpaque(block);
}

/** Emitted block-light (0 = none). Spec: torches 14. */
export function lightEmission(block: number): number {
  if (block === Block.Torch) return 14;
  if (block === Block.Crystal) return 12;
  if (block === Block.Lava) return 13;
  return 0;
}

export function isFluid(block: number): boolean {
  return block === Block.Water || block === Block.Lava;
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

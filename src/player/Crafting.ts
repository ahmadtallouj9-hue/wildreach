import { Block } from '../world/blocks';
import type { ItemStack } from './Inventory';

export interface Recipe {
  id: string;
  name: string;
  pattern: number[];
  result: ItemStack;
  hint: string;
}

export const RECIPES: Recipe[] = [
  {
    id: 'grass',
    name: 'Grass tuft',
    pattern: [Block.Dirt, Block.Dirt, 0, Block.Dirt, Block.Dirt, 0, 0, 0, 0],
    result: { id: Block.Grass, count: 4 },
    hint: '2×2 Dirt → Grass',
  },
  {
    id: 'moss',
    name: 'Moss pad',
    pattern: [Block.Leaves, Block.Leaves, 0, Block.Leaves, Block.Leaves, 0, 0, 0, 0],
    result: { id: Block.Moss, count: 4 },
    hint: '2×2 Leaves → Moss',
  },
  {
    id: 'clay',
    name: 'River clay',
    pattern: [Block.Sand, Block.Dirt, 0, Block.Dirt, Block.Sand, 0, 0, 0, 0],
    result: { id: Block.Clay, count: 2 },
    hint: 'Sand + Dirt checker → Clay',
  },
  {
    id: 'crystal',
    name: 'Facet crystal',
    pattern: [0, Block.Stone, 0, Block.Stone, Block.Crystal, Block.Stone, 0, Block.Stone, 0],
    result: { id: Block.Crystal, count: 2 },
    hint: 'Crystal ringed by Stone → Crystal×2',
  },
  {
    id: 'ruin',
    name: 'Ruin brick',
    pattern: [Block.Stone, Block.Stone, 0, Block.Stone, Block.Crystal, 0, 0, 0, 0],
    result: { id: Block.Ruin, count: 4 },
    hint: 'Stone + Crystal → Ruin',
  },
  {
    id: 'snow',
    name: 'Packed snow',
    pattern: [Block.Sand, Block.Sand, 0, Block.Sand, Block.Sand, 0, 0, 0, 0],
    result: { id: Block.Snow, count: 4 },
    hint: '2×2 Sand → Snow',
  },
  {
    id: 'woodpack',
    name: 'Timber bundle',
    pattern: [Block.Wood, Block.Wood, Block.Wood, 0, 0, 0, 0, 0, 0],
    result: { id: Block.Wood, count: 6 },
    hint: '3 Wood in a row → Wood×6',
  },
  {
    id: 'gravel',
    name: 'River gravel',
    pattern: [Block.Stone, Block.Sand, 0, Block.Sand, Block.Stone, 0, 0, 0, 0],
    result: { id: Block.Gravel, count: 4 },
    hint: 'Stone + Sand checker → Gravel',
  },
  {
    id: 'ice',
    name: 'Clear ice',
    pattern: [Block.Snow, Block.Snow, 0, Block.Snow, Block.Snow, 0, 0, 0, 0],
    result: { id: Block.Ice, count: 4 },
    hint: '2×2 Snow → Ice',
  },
];

export class CraftingGrid {
  cells: (ItemStack | null)[] = Array.from({ length: 9 }, () => null);

  setCell(i: number, stack: ItemStack | null): void {
    if (i < 0 || i >= 9) return;
    this.cells[i] = stack && stack.count > 0 ? { id: stack.id, count: stack.count } : null;
  }

  match(): Recipe | null {
    const ids = this.cells.map((c) => (c ? c.id : 0));
    for (const recipe of RECIPES) {
      if (patternsMatch(ids, recipe.pattern)) return recipe;
    }
    return null;
  }

  peekResult(): ItemStack | null {
    const r = this.match();
    return r ? { id: r.result.id, count: r.result.count } : null;
  }

  craftOnce(): ItemStack | null {
    const recipe = this.match();
    if (!recipe) return null;
    for (let i = 0; i < 9; i++) {
      const c = this.cells[i];
      if (!c) continue;
      c.count -= 1;
      if (c.count <= 0) this.cells[i] = null;
    }
    return { id: recipe.result.id, count: recipe.result.count };
  }
}

function normalize(ids: number[]): { map: number[]; w: number; h: number } {
  let minX = 3;
  let minY = 3;
  let maxX = -1;
  let maxY = -1;
  for (let i = 0; i < 9; i++) {
    if (!ids[i]) continue;
    const x = i % 3;
    const y = Math.floor(i / 3);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (maxX < 0) return { map: Array(9).fill(0), w: 0, h: 0 };
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const map = Array(9).fill(0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      map[y * 3 + x] = ids[(y + minY) * 3 + (x + minX)];
    }
  }
  return { map, w, h };
}

function patternsMatch(gridIds: number[], pattern: number[]): boolean {
  const g = normalize(gridIds);
  const p = normalize(pattern);
  if (g.w !== p.w || g.h !== p.h) return false;
  for (let i = 0; i < 9; i++) {
    if (g.map[i] !== p.map[i]) return false;
  }
  return true;
}

import { Block } from '../world/blocks';
import type { ItemStack } from './Inventory';
import { Item, createItemStack } from './items';

export interface Recipe {
  id: string;
  name: string;
  pattern: number[];
  result: ItemStack;
  hint: string;
  gridRequired?: '2x2' | '3x3';
}

export const RECIPES: Recipe[] = [
  // --- Basic Survival Recipes ---
  {
    id: 'planks',
    name: 'Oak Planks',
    pattern: [Block.Wood, 0, 0, 0, 0, 0, 0, 0, 0],
    result: { id: Block.Planks, count: 4 },
    hint: '1 Oak Log → 4 Planks',
  },
  {
    id: 'sticks',
    name: 'Sticks',
    pattern: [Block.Planks, 0, 0, Block.Planks, 0, 0, 0, 0, 0],
    result: { id: Item.Stick, count: 4 },
    hint: '2 Planks (vertical) → 4 Sticks',
  },
  {
    id: 'crafting_table',
    name: 'Crafting Table',
    pattern: [Block.Planks, Block.Planks, 0, Block.Planks, Block.Planks, 0, 0, 0, 0],
    result: { id: Block.CraftingTable, count: 1 },
    hint: '4 Planks (2×2) → Crafting Table',
  },
  {
    id: 'torches',
    name: 'Torches',
    pattern: [Item.Coal, 0, 0, Item.Stick, 0, 0, 0, 0, 0],
    result: { id: Block.Torch, count: 4 },
    hint: 'Coal over Stick → 4 Torches',
  },

  // --- Wooden Tools (3x3 recommended) ---
  {
    id: 'wooden_pickaxe',
    name: 'Wooden Pickaxe',
    pattern: [
      Block.Planks, Block.Planks, Block.Planks,
      0, Item.Stick, 0,
      0, Item.Stick, 0,
    ],
    result: createItemStack(Item.WoodenPickaxe, 1),
    hint: '3 Planks top row + 2 Sticks center → Wooden Pickaxe',
    gridRequired: '3x3',
  },
  {
    id: 'wooden_axe',
    name: 'Wooden Axe',
    pattern: [
      Block.Planks, Block.Planks, 0,
      Block.Planks, Item.Stick, 0,
      0, Item.Stick, 0,
    ],
    result: createItemStack(Item.WoodenAxe, 1),
    hint: '3 Planks L-shape + 2 Sticks → Wooden Axe',
    gridRequired: '3x3',
  },
  {
    id: 'wooden_sword',
    name: 'Wooden Sword',
    pattern: [
      Block.Planks, 0, 0,
      Block.Planks, 0, 0,
      Item.Stick, 0, 0,
    ],
    result: createItemStack(Item.WoodenSword, 1),
    hint: '2 Planks vertical + 1 Stick → Wooden Sword',
  },

  // --- Stone Tools ---
  {
    id: 'stone_pickaxe',
    name: 'Stone Pickaxe',
    pattern: [
      Block.Cobblestone, Block.Cobblestone, Block.Cobblestone,
      0, Item.Stick, 0,
      0, Item.Stick, 0,
    ],
    result: createItemStack(Item.StonePickaxe, 1),
    hint: '3 Cobblestone top row + 2 Sticks center → Stone Pickaxe',
    gridRequired: '3x3',
  },
  {
    id: 'stone_axe',
    name: 'Stone Axe',
    pattern: [
      Block.Cobblestone, Block.Cobblestone, 0,
      Block.Cobblestone, Item.Stick, 0,
      0, Item.Stick, 0,
    ],
    result: createItemStack(Item.StoneAxe, 1),
    hint: '3 Cobblestone L-shape + 2 Sticks → Stone Axe',
    gridRequired: '3x3',
  },
  {
    id: 'stone_sword',
    name: 'Stone Sword',
    pattern: [
      Block.Cobblestone, 0, 0,
      Block.Cobblestone, 0, 0,
      Item.Stick, 0, 0,
    ],
    result: createItemStack(Item.StoneSword, 1),
    hint: '2 Cobblestone vertical + 1 Stick → Stone Sword',
  },

  // --- World Material Recipes ---
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
    gridRequired: '3x3',
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
    this.cells[i] =
      stack && stack.count > 0
        ? {
            id: stack.id,
            count: stack.count,
            durability: stack.durability,
            maxDurability: stack.maxDurability,
            meta: stack.meta ? { ...stack.meta } : undefined,
          }
        : null;
  }

  set(i: number, stack: ItemStack | null): void {
    this.setCell(i, stack);
  }

  match(is3x3 = true): Recipe | null {
    const ids = this.cells.map((c) => (c ? c.id : 0));
    for (const recipe of RECIPES) {
      if (!is3x3 && recipe.gridRequired === '3x3') continue;
      if (patternsMatch(ids, recipe.pattern)) return recipe;
    }
    return null;
  }

  peekResult(is3x3 = true): ItemStack | null {
    const r = this.match(is3x3);
    return r ? { ...r.result } : null;
  }

  craftOnce(is3x3 = true): ItemStack | null {
    const recipe = this.match(is3x3);
    if (!recipe) return null;
    for (let i = 0; i < 9; i++) {
      const c = this.cells[i];
      if (!c) continue;
      c.count -= 1;
      if (c.count <= 0) this.cells[i] = null;
    }
    return { ...recipe.result };
  }

  clear(): (ItemStack | null)[] {
    const items = [...this.cells];
    this.cells = Array.from({ length: 9 }, () => null);
    return items;
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

import { Block } from '../world/blocks';
import type { ItemStack } from './Inventory';
import { Item, createItemStack } from './items';
import { CraftingSystem as UnifiedCraftingSystem } from '../crafting/CraftingSystem';

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
  private readonly sys = new UnifiedCraftingSystem();

  get cells(): (ItemStack | null)[] {
    return this.sys.cells;
  }

  setCell(i: number, stack: ItemStack | null): void {
    this.sys.set(i, stack);
  }

  set(i: number, stack: ItemStack | null): void {
    this.sys.set(i, stack);
  }

  match(is3x3 = true): Recipe | null {
    return this.sys.match(is3x3) as Recipe | null;
  }

  peekResult(is3x3 = true): ItemStack | null {
    return this.sys.peekResult(is3x3);
  }

  craftOnce(is3x3 = true): ItemStack | null {
    return this.sys.craftOnce(is3x3);
  }

  clear(): (ItemStack | null)[] {
    return this.sys.clear();
  }
}


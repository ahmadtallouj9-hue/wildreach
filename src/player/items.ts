import { Block, BLOCK_COLORS } from '../world/blocks';
import type { ItemStack } from './Inventory';

export interface CustomItemResolver {
  isFood: (id: number) => boolean;
  foodValue: (id: number) => number;
  isTool: (id: number) => boolean;
  toolMaxDurability: (id: number) => number;
  toolMiningMultiplier: (toolId: number, blockId: number) => number;
  toolMeleeDamage: (toolId: number) => number;
  toolAttackCooldown: (toolId: number) => number;
  getCustomBlockHardness: (blockId: number) => number;
}

let activeCustomItemResolver: CustomItemResolver | null = null;
export function setCustomItemResolver(resolver: CustomItemResolver | null): void {
  activeCustomItemResolver = resolver;
}

export const Item = {
  // Items starting at 100+
  Stick: 101,
  WoodenPickaxe: 102,
  WoodenAxe: 103,
  WoodenSword: 104,
  StonePickaxe: 105,
  StoneAxe: 106,
  StoneSword: 107,
  Apple: 108,
  Bread: 109,
  Porkchop: 110,
  CookedPorkchop: 111,
  Beef: 112,
  CookedBeef: 113,
  Coal: 114,
  IronIngot: 115,
  // Iron Tools
  IronPickaxe: 116,
  IronAxe: 117,
  IronSword: 118,
  // Armor
  IronHelmet: 120,
  IronChestplate: 121,
  IronLeggings: 122,
  IronBoots: 123,
} as const;

export type ItemId = (typeof Item)[keyof typeof Item];

export const ITEM_NAMES: Record<number, string> = {
  [Block.Grass]: 'Grass Block',
  [Block.Dirt]: 'Dirt',
  [Block.Stone]: 'Stone',
  [Block.Sand]: 'Sand',
  [Block.Water]: 'Water',
  [Block.Wood]: 'Oak Log',
  [Block.Leaves]: 'Oak Leaves',
  [Block.Snow]: 'Snow',
  [Block.Clay]: 'Clay',
  [Block.Crystal]: 'Crystal',
  [Block.Ruin]: 'Ruin Brick',
  [Block.Moss]: 'Moss',
  [Block.Gravel]: 'Gravel',
  [Block.Ice]: 'Ice',
  [Block.DarkStone]: 'Dark Stone',
  [Block.Torch]: 'Torch',
  [Block.Lava]: 'Lava',
  [Block.Planks]: 'Oak Planks',
  [Block.CraftingTable]: 'Crafting Table',
  [Block.Cobblestone]: 'Cobblestone',
  [Block.CoalOre]: 'Coal Ore',
  [Block.IronOre]: 'Iron Ore',

  // Items
  [Item.Stick]: 'Stick',
  [Item.WoodenPickaxe]: 'Wooden Pickaxe',
  [Item.WoodenAxe]: 'Wooden Axe',
  [Item.WoodenSword]: 'Wooden Sword',
  [Item.StonePickaxe]: 'Stone Pickaxe',
  [Item.StoneAxe]: 'Stone Axe',
  [Item.StoneSword]: 'Stone Sword',
  [Item.Apple]: 'Apple',
  [Item.Bread]: 'Bread',
  [Item.Porkchop]: 'Raw Porkchop',
  [Item.CookedPorkchop]: 'Cooked Porkchop',
  [Item.Beef]: 'Raw Beef',
  [Item.CookedBeef]: 'Steak',
  [Item.Coal]: 'Coal',
  [Item.IronIngot]: 'Iron Ingot',
  [Item.IronPickaxe]: 'Iron Pickaxe',
  [Item.IronAxe]: 'Iron Axe',
  [Item.IronSword]: 'Iron Sword',
  [Item.IronHelmet]: 'Iron Helmet',
  [Item.IronChestplate]: 'Iron Chestplate',
  [Item.IronLeggings]: 'Iron Leggings',
  [Item.IronBoots]: 'Iron Boots',
};

export const ITEM_KINDS: Record<number, string> = {
  [Block.Grass]: 'Surface block',
  [Block.Dirt]: 'Soil',
  [Block.Stone]: 'Building block',
  [Block.Sand]: 'Loose sediment',
  [Block.Water]: 'Fluid',
  [Block.Wood]: 'Natural material',
  [Block.Leaves]: 'Foliage',
  [Block.Snow]: 'Surface cover',
  [Block.Clay]: 'Sediment',
  [Block.Crystal]: 'Rare mineral',
  [Block.Ruin]: 'Structure block',
  [Block.Moss]: 'Growth',
  [Block.Gravel]: 'Loose rock',
  [Block.Ice]: 'Frozen water',
  [Block.DarkStone]: 'Deep rock',
  [Block.Torch]: 'Light source',
  [Block.Lava]: 'Molten fluid',
  [Block.Planks]: 'Building block',
  [Block.CraftingTable]: 'Utility workbench',
  [Block.Cobblestone]: 'Building block',
  [Block.CoalOre]: 'Mineral ore',
  [Block.IronOre]: 'Mineral ore',

  [Item.Stick]: 'Crafting material',
  [Item.WoodenPickaxe]: 'Mining tool',
  [Item.WoodenAxe]: 'Harvesting tool',
  [Item.WoodenSword]: 'Weapon',
  [Item.StonePickaxe]: 'Mining tool',
  [Item.StoneAxe]: 'Harvesting tool',
  [Item.StoneSword]: 'Weapon',
  [Item.Apple]: 'Food item',
  [Item.Bread]: 'Food item',
  [Item.Porkchop]: 'Raw food',
  [Item.CookedPorkchop]: 'Cooked food',
  [Item.Beef]: 'Raw food',
  [Item.CookedBeef]: 'Cooked food',
  [Item.Coal]: 'Fuel / Mineral',
  [Item.IronIngot]: 'Refined metal',
  [Item.IronPickaxe]: 'Mining tool',
  [Item.IronAxe]: 'Harvesting tool',
  [Item.IronSword]: 'Weapon',
  [Item.IronHelmet]: 'Armor (Head)',
  [Item.IronChestplate]: 'Armor (Chest)',
  [Item.IronLeggings]: 'Armor (Legs)',
  [Item.IronBoots]: 'Armor (Feet)',
};

export const ITEM_ICONS: Record<number, string> = {
  [Item.Stick]: '/textures/goodvibes/item/stick.png',
  [Item.WoodenPickaxe]: '/textures/goodvibes/item/wooden_pickaxe.png',
  [Item.WoodenAxe]: '/textures/goodvibes/item/wooden_axe.png',
  [Item.WoodenSword]: '/textures/goodvibes/item/wooden_sword.png',
  [Item.StonePickaxe]: '/textures/goodvibes/item/stone_pickaxe.png',
  [Item.StoneAxe]: '/textures/goodvibes/item/stone_axe.png',
  [Item.StoneSword]: '/textures/goodvibes/item/stone_sword.png',
  [Item.Apple]: '/textures/goodvibes/item/apple.png',
  [Item.Bread]: '/textures/goodvibes/item/bread.png',
  [Item.Porkchop]: '/textures/goodvibes/item/porkchop.png',
  [Item.CookedPorkchop]: '/textures/goodvibes/item/cooked_porkchop.png',
  [Item.Beef]: '/textures/goodvibes/item/beef.png',
  [Item.CookedBeef]: '/textures/goodvibes/item/cooked_beef.png',
  [Item.Coal]: '/textures/goodvibes/item/coal.png',
  [Item.IronIngot]: '/textures/goodvibes/item/iron_ingot.png',

  // Blocks
  [Block.Wood]: '/textures/goodvibes/block/oak_log.png',
  [Block.Planks]: '/textures/goodvibes/block/oak_planks.png',
  [Block.CraftingTable]: '/textures/goodvibes/block/crafting_table_top.png',
  [Block.Cobblestone]: '/textures/goodvibes/block/cobblestone.png',
  [Block.Stone]: '/textures/goodvibes/block/stone.png',
  [Block.Dirt]: '/textures/goodvibes/block/dirt.png',
  [Block.Grass]: '/textures/goodvibes/block/grass_block_side.png',
  [Block.Leaves]: '/textures/goodvibes/block/oak_leaves.png',
  [Block.Sand]: '/textures/goodvibes/block/sand.png',
  [Block.CoalOre]: '/textures/goodvibes/block/coal_ore.png',
  [Block.IronOre]: '/textures/goodvibes/block/iron_ore.png',
  [Block.Torch]: '/textures/goodvibes/block/torch.png',
};

export const ITEM_COLORS: Record<number, [number, number, number]> = {
  ...BLOCK_COLORS,
  [Item.Stick]: [0.55, 0.38, 0.22],
  [Item.WoodenPickaxe]: [0.65, 0.48, 0.28],
  [Item.WoodenAxe]: [0.65, 0.48, 0.28],
  [Item.WoodenSword]: [0.65, 0.48, 0.28],
  [Item.StonePickaxe]: [0.52, 0.52, 0.52],
  [Item.StoneAxe]: [0.52, 0.52, 0.52],
  [Item.StoneSword]: [0.52, 0.52, 0.52],
  [Item.Apple]: [0.85, 0.15, 0.15],
  [Item.Bread]: [0.82, 0.62, 0.32],
  [Item.Porkchop]: [0.92, 0.58, 0.58],
  [Item.CookedPorkchop]: [0.72, 0.42, 0.28],
  [Item.Beef]: [0.78, 0.22, 0.22],
  [Item.CookedBeef]: [0.55, 0.32, 0.22],
  [Item.Coal]: [0.18, 0.18, 0.18],
  [Item.IronIngot]: [0.82, 0.82, 0.82],
  [Item.IronPickaxe]: [0.82, 0.82, 0.82],
  [Item.IronAxe]: [0.82, 0.82, 0.82],
  [Item.IronSword]: [0.82, 0.82, 0.82],
  [Item.IronHelmet]: [0.85, 0.85, 0.85],
  [Item.IronChestplate]: [0.85, 0.85, 0.85],
  [Item.IronLeggings]: [0.85, 0.85, 0.85],
  [Item.IronBoots]: [0.85, 0.85, 0.85],
};

export function isFood(id: number): boolean {
  if (id >= 200 && activeCustomItemResolver) {
    return activeCustomItemResolver.isFood(id);
  }
  return (
    id === Item.Apple ||
    id === Item.Bread ||
    id === Item.Porkchop ||
    id === Item.CookedPorkchop ||
    id === Item.Beef ||
    id === Item.CookedBeef
  );
}

export function foodValue(id: number): number {
  if (id >= 200 && activeCustomItemResolver) {
    return activeCustomItemResolver.foodValue(id);
  }
  switch (id) {
    case Item.Apple:
      return 4;
    case Item.Bread:
      return 5;
    case Item.Porkchop:
    case Item.Beef:
      return 3;
    case Item.CookedPorkchop:
    case Item.CookedBeef:
      return 8;
    default:
      return 0;
  }
}

export function isTool(id: number): boolean {
  if (id >= 200 && activeCustomItemResolver) {
    return activeCustomItemResolver.isTool(id);
  }
  return (
    id === Item.WoodenPickaxe ||
    id === Item.WoodenAxe ||
    id === Item.WoodenSword ||
    id === Item.StonePickaxe ||
    id === Item.StoneAxe ||
    id === Item.StoneSword
  );
}

export function toolMaxDurability(id: number): number {
  if (id >= 200 && activeCustomItemResolver) {
    return activeCustomItemResolver.toolMaxDurability(id);
  }
  switch (id) {
    case Item.WoodenPickaxe:
    case Item.WoodenAxe:
    case Item.WoodenSword:
      return 60;
    case Item.StonePickaxe:
    case Item.StoneAxe:
    case Item.StoneSword:
      return 132;
    default:
      return 0;
  }
}

export function toolMiningMultiplier(toolId: number, blockId: number): number {
  if (toolId >= 200 && activeCustomItemResolver) {
    return activeCustomItemResolver.toolMiningMultiplier(toolId, blockId);
  }
  if (blockId >= 32 && activeCustomItemResolver) {
    const hardness = activeCustomItemResolver.getCustomBlockHardness(blockId);
    return Math.max(0.2, 2.0 / hardness);
  }
  // Stone / Ores / Cobble / Ruin / DarkStone / Crystal
  if (
    blockId === Block.Stone ||
    blockId === Block.Cobblestone ||
    blockId === Block.CoalOre ||
    blockId === Block.IronOre ||
    blockId === Block.Ruin ||
    blockId === Block.DarkStone ||
    blockId === Block.Crystal
  ) {
    if (toolId === Item.StonePickaxe) return 4.5;
    if (toolId === Item.WoodenPickaxe) return 2.8;
    return 0.7; // Hand or non-pickaxe is slower
  }

  // Wood / Planks / Crafting table
  if (
    blockId === Block.Wood ||
    blockId === Block.Planks ||
    blockId === Block.CraftingTable
  ) {
    if (toolId === Item.StoneAxe) return 4.0;
    if (toolId === Item.WoodenAxe) return 2.6;
    return 1.2;
  }

  // Dirt / Sand / Gravel / Leaves / Grass / Snow
  return 1.5;
}

export function toolMeleeDamage(toolId: number): number {
  if (toolId >= 200 && activeCustomItemResolver) {
    return activeCustomItemResolver.toolMeleeDamage(toolId);
  }
  switch (toolId) {
    case Item.StoneSword:
      return 6;
    case Item.WoodenSword:
      return 4;
    case Item.StoneAxe:
      return 5;
    case Item.WoodenAxe:
      return 3;
    case Item.StonePickaxe:
      return 3;
    case Item.WoodenPickaxe:
      return 2;
    default:
      return 1; // Fist
  }
}

export function toolAttackCooldown(toolId: number): number {
  if (toolId >= 200 && activeCustomItemResolver) {
    return activeCustomItemResolver.toolAttackCooldown(toolId);
  }
  switch (toolId) {
    case Item.StoneSword:
    case Item.WoodenSword:
      return 0.4;
    case Item.StoneAxe:
    case Item.WoodenAxe:
      return 0.55;
    case Item.StonePickaxe:
    case Item.WoodenPickaxe:
      return 0.5;
    default:
      return 0.65; // Fist swing cooldown
  }
}

export function createItemStack(id: number, count = 1): ItemStack {
  const maxDur = toolMaxDurability(id);
  return {
    id,
    count,
    durability: maxDur > 0 ? maxDur : undefined,
    maxDurability: maxDur > 0 ? maxDur : undefined,
  };
}

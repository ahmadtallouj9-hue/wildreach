import { Block } from '../world/blocks';
import { Item } from '../player/items';
import { ModManager } from '../modding/ModSystem';

export type ToolCategory = 'pickaxe' | 'axe' | 'shovel' | 'sword' | 'none';
export type ToolTier = 'hand' | 'wood' | 'stone' | 'iron' | 'diamond';

export interface ToolDefinition {
  id: number;
  name: string;
  category: ToolCategory;
  tier: ToolTier;
  blockSpeedMultiplier: number;
  validBlockTags: string[];
  durability: number;
  baseDamage: number;
  attackCooldown: number; // in seconds
}

export interface BlockInteractionProperties {
  hardness: number;
  baseBreakTime: number; // in seconds with bare hand
  preferredToolCategory: ToolCategory;
  minToolTier: ToolTier;
  requiresCorrectToolForDrop: boolean;
  drops: (blockId: number, toolId: number) => { itemId: number; count: number }[];
  interactable: boolean;
  replaceable: boolean;
}

export const TOOLS: Record<number, ToolDefinition> = {
  0: {
    id: 0,
    name: 'Fist',
    category: 'none',
    tier: 'hand',
    blockSpeedMultiplier: 1.0,
    validBlockTags: [],
    durability: Infinity,
    baseDamage: 1,
    attackCooldown: 0.5,
  },
  [Item.WoodenPickaxe]: {
    id: Item.WoodenPickaxe,
    name: 'Wooden Pickaxe',
    category: 'pickaxe',
    tier: 'wood',
    blockSpeedMultiplier: 2.8,
    validBlockTags: ['stone', 'rock', 'ore'],
    durability: 60,
    baseDamage: 2,
    attackCooldown: 0.5,
  },
  [Item.StonePickaxe]: {
    id: Item.StonePickaxe,
    name: 'Stone Pickaxe',
    category: 'pickaxe',
    tier: 'stone',
    blockSpeedMultiplier: 4.5,
    validBlockTags: ['stone', 'rock', 'ore'],
    durability: 132,
    baseDamage: 3,
    attackCooldown: 0.5,
  },
  [Item.WoodenAxe]: {
    id: Item.WoodenAxe,
    name: 'Wooden Axe',
    category: 'axe',
    tier: 'wood',
    blockSpeedMultiplier: 2.6,
    validBlockTags: ['wood', 'planks'],
    durability: 60,
    baseDamage: 3,
    attackCooldown: 0.55,
  },
  [Item.StoneAxe]: {
    id: Item.StoneAxe,
    name: 'Stone Axe',
    category: 'axe',
    tier: 'stone',
    blockSpeedMultiplier: 4.0,
    validBlockTags: ['wood', 'planks'],
    durability: 132,
    baseDamage: 5,
    attackCooldown: 0.55,
  },
  [Item.WoodenSword]: {
    id: Item.WoodenSword,
    name: 'Wooden Sword',
    category: 'sword',
    tier: 'wood',
    blockSpeedMultiplier: 1.5,
    validBlockTags: ['foliage', 'web'],
    durability: 60,
    baseDamage: 4,
    attackCooldown: 0.4,
  },
  [Item.StoneSword]: {
    id: Item.StoneSword,
    name: 'Stone Sword',
    category: 'sword',
    tier: 'stone',
    blockSpeedMultiplier: 1.8,
    validBlockTags: ['foliage', 'web'],
    durability: 132,
    baseDamage: 6,
    attackCooldown: 0.4,
  },
};

export function getToolDefinition(toolId: number): ToolDefinition {
  if (TOOLS[toolId]) return TOOLS[toolId];
  return {
    id: toolId,
    name: 'Item',
    category: 'none',
    tier: 'hand',
    blockSpeedMultiplier: 1.0,
    validBlockTags: [],
    durability: 60,
    baseDamage: 1,
    attackCooldown: 0.5,
  };
}

/**
 * Registry of block hardness and interaction properties.
 */
export function getBlockInteractionProperties(blockId: number): BlockInteractionProperties {
  // Custom modded blocks
  if (blockId >= 32) {
    const mod = ModManager.get();
    const hardness = mod.getCustomBlockHardness(blockId);
    return {
      hardness,
      baseBreakTime: Math.max(0.2, hardness * 0.75),
      preferredToolCategory: 'pickaxe',
      minToolTier: 'hand',
      requiresCorrectToolForDrop: false,
      drops: (id) => {
        const drop = mod.getCustomBlockDrop(id);
        return [{ itemId: drop.itemId, count: drop.count }];
      },
      interactable: false,
      replaceable: false,
    };
  }

  switch (blockId) {
    case Block.Air:
      return {
        hardness: 0,
        baseBreakTime: 0,
        preferredToolCategory: 'none',
        minToolTier: 'hand',
        requiresCorrectToolForDrop: false,
        drops: () => [],
        interactable: false,
        replaceable: true,
      };

    case Block.Water:
    case Block.Lava:
      return {
        hardness: 100,
        baseBreakTime: 100,
        preferredToolCategory: 'none',
        minToolTier: 'hand',
        requiresCorrectToolForDrop: false,
        drops: () => [],
        interactable: false,
        replaceable: true,
      };

    case Block.Dirt:
    case Block.Grass:
    case Block.Sand:
    case Block.Gravel:
    case Block.Snow:
    case Block.Clay:
      return {
        hardness: 0.5,
        baseBreakTime: 0.35,
        preferredToolCategory: 'shovel',
        minToolTier: 'hand',
        requiresCorrectToolForDrop: false,
        drops: (id) => [{ itemId: id === Block.Grass ? Block.Dirt : id, count: 1 }],
        interactable: false,
        replaceable: false,
      };

    case Block.Leaves:
      return {
        hardness: 0.2,
        baseBreakTime: 0.15,
        preferredToolCategory: 'sword',
        minToolTier: 'hand',
        requiresCorrectToolForDrop: false,
        drops: () => {
          const roll = Math.random();
          if (roll < 0.12) return [{ itemId: Item.Apple, count: 1 }];
          if (roll < 0.28) return [{ itemId: Item.Stick, count: 1 }];
          return [{ itemId: Block.Leaves, count: 1 }];
        },
        interactable: false,
        replaceable: false,
      };

    case Block.Wood:
    case Block.Planks:
      return {
        hardness: 2.0,
        baseBreakTime: 1.5,
        preferredToolCategory: 'axe',
        minToolTier: 'hand',
        requiresCorrectToolForDrop: false,
        drops: (id) => [{ itemId: id, count: 1 }],
        interactable: false,
        replaceable: false,
      };

    case Block.CraftingTable:
      return {
        hardness: 2.5,
        baseBreakTime: 1.8,
        preferredToolCategory: 'axe',
        minToolTier: 'hand',
        requiresCorrectToolForDrop: false,
        drops: () => [{ itemId: Block.CraftingTable, count: 1 }],
        interactable: true,
        replaceable: false,
      };

    case Block.Stone:
      return {
        hardness: 1.5,
        baseBreakTime: 2.2,
        preferredToolCategory: 'pickaxe',
        minToolTier: 'wood',
        requiresCorrectToolForDrop: true,
        drops: (_id, toolId) => {
          const tool = getToolDefinition(toolId);
          if (tool.category === 'pickaxe') {
            return [{ itemId: Block.Cobblestone, count: 1 }];
          }
          return []; // Hand breaks stone into nothing
        },
        interactable: false,
        replaceable: false,
      };

    case Block.Cobblestone:
    case Block.DarkStone:
    case Block.Ruin:
      return {
        hardness: 2.0,
        baseBreakTime: 2.5,
        preferredToolCategory: 'pickaxe',
        minToolTier: 'wood',
        requiresCorrectToolForDrop: true,
        drops: (id, toolId) => {
          const tool = getToolDefinition(toolId);
          if (tool.category === 'pickaxe') {
            return [{ itemId: id, count: 1 }];
          }
          return [];
        },
        interactable: false,
        replaceable: false,
      };

    case Block.CoalOre:
      return {
        hardness: 3.0,
        baseBreakTime: 3.0,
        preferredToolCategory: 'pickaxe',
        minToolTier: 'wood',
        requiresCorrectToolForDrop: true,
        drops: (_id, toolId) => {
          const tool = getToolDefinition(toolId);
          if (tool.category === 'pickaxe') {
            return [{ itemId: Item.Coal, count: 1 }];
          }
          return [];
        },
        interactable: false,
        replaceable: false,
      };

    case Block.IronOre:
      return {
        hardness: 3.0,
        baseBreakTime: 3.5,
        preferredToolCategory: 'pickaxe',
        minToolTier: 'stone',
        requiresCorrectToolForDrop: true,
        drops: (_id, toolId) => {
          const tool = getToolDefinition(toolId);
          if (tool.category === 'pickaxe' && (tool.tier === 'stone' || tool.tier === 'iron' || tool.tier === 'diamond')) {
            return [{ itemId: Block.IronOre, count: 1 }];
          }
          return [];
        },
        interactable: false,
        replaceable: false,
      };

    case Block.Torch:
      return {
        hardness: 0,
        baseBreakTime: 0.05,
        preferredToolCategory: 'none',
        minToolTier: 'hand',
        requiresCorrectToolForDrop: false,
        drops: () => [{ itemId: Block.Torch, count: 1 }],
        interactable: false,
        replaceable: false,
      };

    default:
      return {
        hardness: 1.0,
        baseBreakTime: 1.0,
        preferredToolCategory: 'none',
        minToolTier: 'hand',
        requiresCorrectToolForDrop: false,
        drops: (id) => [{ itemId: id, count: 1 }],
        interactable: false,
        replaceable: false,
      };
  }
}

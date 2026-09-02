import { Block } from '../world/blocks';
import { Item } from '../player/items';
import type { ToolDefinition } from '../interaction/BlockInteractionProperties';
import { getToolDefinition } from '../interaction/BlockInteractionProperties';

export type ItemType = 'BLOCK' | 'TOOL' | 'WEAPON' | 'ARMOR' | 'FOOD' | 'MATERIAL' | 'SPECIAL';

export interface ItemDefinition {
  id: number;
  displayName: string;
  maxStackSize: number;
  durability?: number;
  itemType: ItemType;
  toolDefinition?: ToolDefinition;
  placeableBlockId?: number;
  foodValue?: number;
  tags: string[];
}

export class ItemRegistry {
  private static instance: ItemRegistry | null = null;
  private readonly definitions = new Map<number, ItemDefinition>();

  static get(): ItemRegistry {
    if (!this.instance) {
      this.instance = new ItemRegistry();
      this.instance.registerDefaults();
    }
    return this.instance;
  }

  register(def: ItemDefinition): void {
    this.definitions.set(def.id, Object.freeze({ ...def }));
  }

  get(id: number): ItemDefinition | undefined {
    return this.definitions.get(id);
  }

  has(id: number): boolean {
    return this.definitions.has(id);
  }

  getAll(): ItemDefinition[] {
    return Array.from(this.definitions.values());
  }

  private registerDefaults(): void {
    // ── BLOCKS (1..99) ──
    const defaultBlocks: [number, string, string[]][] = [
      [Block.Grass, 'Grass Block', ['block', 'soil', 'surface']],
      [Block.Dirt, 'Dirt', ['block', 'soil']],
      [Block.Stone, 'Stone', ['block', 'rock', 'stone']],
      [Block.Sand, 'Sand', ['block', 'soil', 'gravity']],
      [Block.Water, 'Water', ['fluid']],
      [Block.Wood, 'Oak Log', ['block', 'wood', 'log']],
      [Block.Leaves, 'Oak Leaves', ['block', 'foliage']],
      [Block.Snow, 'Snow', ['block', 'surface']],
      [Block.Clay, 'Clay', ['block', 'soil']],
      [Block.Crystal, 'Crystal', ['block', 'mineral', 'gem']],
      [Block.Ruin, 'Ruin Brick', ['block', 'stone', 'brick']],
      [Block.Moss, 'Moss', ['block', 'growth']],
      [Block.Gravel, 'Gravel', ['block', 'soil', 'rock']],
      [Block.Ice, 'Ice', ['block', 'ice']],
      [Block.DarkStone, 'Dark Stone', ['block', 'stone', 'deep']],
      [Block.Torch, 'Torch', ['block', 'light']],
      [Block.Lava, 'Lava', ['fluid']],
      [Block.Planks, 'Oak Planks', ['block', 'wood', 'planks']],
      [Block.CraftingTable, 'Crafting Table', ['block', 'utility', 'workbench']],
      [Block.Cobblestone, 'Cobblestone', ['block', 'stone', 'rock']],
      [Block.CoalOre, 'Coal Ore', ['block', 'ore', 'mineral']],
      [Block.IronOre, 'Iron Ore', ['block', 'ore', 'metal']],
    ];

    for (const [id, name, tags] of defaultBlocks) {
      this.register({
        id,
        displayName: name,
        maxStackSize: id === Block.Water || id === Block.Lava ? 1 : 64,
        itemType: 'BLOCK',
        placeableBlockId: id,
        tags,
      });
    }

    // ── TOOLS & WEAPONS (100+) ──
    const tools: [number, string, ItemType, number][] = [
      [Item.WoodenPickaxe, 'Wooden Pickaxe', 'TOOL', 60],
      [Item.StonePickaxe, 'Stone Pickaxe', 'TOOL', 132],
      [Item.WoodenAxe, 'Wooden Axe', 'TOOL', 60],
      [Item.StoneAxe, 'Stone Axe', 'TOOL', 132],
      [Item.WoodenSword, 'Wooden Sword', 'WEAPON', 60],
      [Item.StoneSword, 'Stone Sword', 'WEAPON', 132],
      [Item.IronPickaxe, 'Iron Pickaxe', 'TOOL', 251],
      [Item.IronAxe, 'Iron Axe', 'TOOL', 251],
      [Item.IronSword, 'Iron Sword', 'WEAPON', 251],
    ];

    for (const [id, name, type, maxDur] of tools) {
      const toolDef = getToolDefinition(id);
      this.register({
        id,
        displayName: name,
        maxStackSize: 1,
        durability: maxDur,
        itemType: type,
        toolDefinition: toolDef,
        tags: [type.toLowerCase(), toolDef.category, toolDef.tier],
      });
    }

    // ── ARMOR (120+) ──
    const armorPieces: [number, string, number][] = [
      [Item.IronHelmet, 'Iron Helmet', 165],
      [Item.IronChestplate, 'Iron Chestplate', 240],
      [Item.IronLeggings, 'Iron Leggings', 225],
      [Item.IronBoots, 'Iron Boots', 195],
    ];

    for (const [id, name, maxDur] of armorPieces) {
      this.register({
        id,
        displayName: name,
        maxStackSize: 1,
        durability: maxDur,
        itemType: 'ARMOR',
        tags: ['armor', 'iron', 'equipment'],
      });
    }

    // ── FOODS ──
    const foods: [number, string, number][] = [
      [Item.Apple, 'Apple', 4],
      [Item.Bread, 'Bread', 5],
      [Item.Porkchop, 'Raw Porkchop', 3],
      [Item.CookedPorkchop, 'Cooked Porkchop', 8],
      [Item.Beef, 'Raw Beef', 3],
      [Item.CookedBeef, 'Steak', 8],
    ];

    for (const [id, name, foodVal] of foods) {
      this.register({
        id,
        displayName: name,
        maxStackSize: 64,
        itemType: 'FOOD',
        foodValue: foodVal,
        tags: ['food', 'consumable'],
      });
    }

    // ── MATERIALS ──
    const materials: [number, string, string[]][] = [
      [Item.Stick, 'Stick', ['material', 'crafting', 'wood']],
      [Item.Coal, 'Coal', ['material', 'fuel', 'ore']],
      [Item.IronIngot, 'Iron Ingot', ['material', 'metal', 'refined']],
    ];

    for (const [id, name, tags] of materials) {
      this.register({
        id,
        displayName: name,
        maxStackSize: 64,
        itemType: 'MATERIAL',
        tags,
      });
    }
  }
}

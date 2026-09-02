import { Block } from '../world/blocks';
import { Item } from '../player/items';
import type { RecipeDefinition } from './RecipeDefinition';

export class RecipeRegistry {
  private static instance: RecipeRegistry | null = null;
  private readonly recipes = new Map<string, RecipeDefinition>();

  static get(): RecipeRegistry {
    if (!this.instance) {
      this.instance = new RecipeRegistry();
      this.instance.registerDefaults();
    }
    return this.instance;
  }

  register(recipe: RecipeDefinition): void {
    this.recipes.set(recipe.id, Object.freeze({ ...recipe }));
  }

  get(id: string): RecipeDefinition | undefined {
    return this.recipes.get(id);
  }

  has(id: string): boolean {
    return this.recipes.has(id);
  }

  getAll(): RecipeDefinition[] {
    return Array.from(this.recipes.values());
  }

  private registerDefaults(): void {
    // ── BASIC CRAFTING ──
    this.register({
      id: 'planks',
      name: 'Oak Planks',
      type: 'SHAPELESS',
      ingredients: [Block.Wood],
      result: { id: Block.Planks, count: 4 },
      hint: '1 Oak Log → 4 Planks',
    });

    this.register({
      id: 'sticks',
      name: 'Sticks',
      type: 'SHAPED',
      ingredients: [
        Block.Planks, 0, 0,
        Block.Planks, 0, 0,
        0, 0, 0,
      ],
      result: { id: Item.Stick, count: 4 },
      hint: '2 Planks (vertical) → 4 Sticks',
    });

    this.register({
      id: 'crafting_table',
      name: 'Crafting Table',
      type: 'SHAPED',
      ingredients: [
        Block.Planks, Block.Planks, 0,
        Block.Planks, Block.Planks, 0,
        0, 0, 0,
      ],
      result: { id: Block.CraftingTable, count: 1 },
      hint: '4 Planks (2×2) → Crafting Table',
    });

    this.register({
      id: 'torches',
      name: 'Torches',
      type: 'SHAPED',
      ingredients: [
        Item.Coal, 0, 0,
        Item.Stick, 0, 0,
        0, 0, 0,
      ],
      result: { id: Block.Torch, count: 4 },
      hint: 'Coal over Stick → 4 Torches',
    });

    // ── WOODEN TOOLS (3x3) ──
    this.register({
      id: 'wooden_pickaxe',
      name: 'Wooden Pickaxe',
      type: 'SHAPED',
      ingredients: [
        Block.Planks, Block.Planks, Block.Planks,
        0, Item.Stick, 0,
        0, Item.Stick, 0,
      ],
      result: { id: Item.WoodenPickaxe, count: 1, durability: 60, maxDurability: 60 },
      hint: '3 Planks top row + 2 Sticks center → Wooden Pickaxe',
      gridRequired: '3x3',
    });

    this.register({
      id: 'wooden_axe',
      name: 'Wooden Axe',
      type: 'SHAPED',
      ingredients: [
        Block.Planks, Block.Planks, 0,
        Block.Planks, Item.Stick, 0,
        0, Item.Stick, 0,
      ],
      result: { id: Item.WoodenAxe, count: 1, durability: 60, maxDurability: 60 },
      hint: '3 Planks corner + 2 Sticks → Wooden Axe',
      gridRequired: '3x3',
    });

    this.register({
      id: 'wooden_sword',
      name: 'Wooden Sword',
      type: 'SHAPED',
      ingredients: [
        Block.Planks, 0, 0,
        Block.Planks, 0, 0,
        Item.Stick, 0, 0,
      ],
      result: { id: Item.WoodenSword, count: 1, durability: 60, maxDurability: 60 },
      hint: '2 Planks over 1 Stick → Wooden Sword',
    });

    // ── STONE TOOLS (3x3) ──
    this.register({
      id: 'stone_pickaxe',
      name: 'Stone Pickaxe',
      type: 'SHAPED',
      ingredients: [
        Block.Cobblestone, Block.Cobblestone, Block.Cobblestone,
        0, Item.Stick, 0,
        0, Item.Stick, 0,
      ],
      result: { id: Item.StonePickaxe, count: 1, durability: 132, maxDurability: 132 },
      hint: '3 Cobblestone top row + 2 Sticks center → Stone Pickaxe',
      gridRequired: '3x3',
    });

    this.register({
      id: 'stone_axe',
      name: 'Stone Axe',
      type: 'SHAPED',
      ingredients: [
        Block.Cobblestone, Block.Cobblestone, 0,
        Block.Cobblestone, Item.Stick, 0,
        0, Item.Stick, 0,
      ],
      result: { id: Item.StoneAxe, count: 1, durability: 132, maxDurability: 132 },
      hint: '3 Cobblestone corner + 2 Sticks → Stone Axe',
      gridRequired: '3x3',
    });

    this.register({
      id: 'stone_sword',
      name: 'Stone Sword',
      type: 'SHAPED',
      ingredients: [
        Block.Cobblestone, 0, 0,
        Block.Cobblestone, 0, 0,
        Item.Stick, 0, 0,
      ],
      result: { id: Item.StoneSword, count: 1, durability: 132, maxDurability: 132 },
      hint: '2 Cobblestone over 1 Stick → Stone Sword',
    });

    // ── IRON TOOLS & ARMOR (3x3) ──
    this.register({
      id: 'iron_pickaxe',
      name: 'Iron Pickaxe',
      type: 'SHAPED',
      ingredients: [
        Item.IronIngot, Item.IronIngot, Item.IronIngot,
        0, Item.Stick, 0,
        0, Item.Stick, 0,
      ],
      result: { id: Item.IronPickaxe, count: 1, durability: 251, maxDurability: 251 },
      hint: '3 Iron Ingots + 2 Sticks → Iron Pickaxe',
      gridRequired: '3x3',
    });

    this.register({
      id: 'iron_sword',
      name: 'Iron Sword',
      type: 'SHAPED',
      ingredients: [
        Item.IronIngot, 0, 0,
        Item.IronIngot, 0, 0,
        Item.Stick, 0, 0,
      ],
      result: { id: Item.IronSword, count: 1, durability: 251, maxDurability: 251 },
      hint: '2 Iron Ingots over 1 Stick → Iron Sword',
    });

    this.register({
      id: 'iron_helmet',
      name: 'Iron Helmet',
      type: 'SHAPED',
      ingredients: [
        Item.IronIngot, Item.IronIngot, Item.IronIngot,
        Item.IronIngot, 0, Item.IronIngot,
        0, 0, 0,
      ],
      result: { id: Item.IronHelmet, count: 1, durability: 165, maxDurability: 165 },
      hint: '5 Iron Ingots in arch → Iron Helmet',
      gridRequired: '3x3',
    });

    this.register({
      id: 'iron_chestplate',
      name: 'Iron Chestplate',
      type: 'SHAPED',
      ingredients: [
        Item.IronIngot, 0, Item.IronIngot,
        Item.IronIngot, Item.IronIngot, Item.IronIngot,
        Item.IronIngot, Item.IronIngot, Item.IronIngot,
      ],
      result: { id: Item.IronChestplate, count: 1, durability: 240, maxDurability: 240 },
      hint: '8 Iron Ingots in shirt pattern → Iron Chestplate',
      gridRequired: '3x3',
    });

    this.register({
      id: 'iron_leggings',
      name: 'Iron Leggings',
      type: 'SHAPED',
      ingredients: [
        Item.IronIngot, Item.IronIngot, Item.IronIngot,
        Item.IronIngot, 0, Item.IronIngot,
        Item.IronIngot, 0, Item.IronIngot,
      ],
      result: { id: Item.IronLeggings, count: 1, durability: 225, maxDurability: 225 },
      hint: '7 Iron Ingots in pants pattern → Iron Leggings',
      gridRequired: '3x3',
    });

    this.register({
      id: 'iron_boots',
      name: 'Iron Boots',
      type: 'SHAPED',
      ingredients: [
        Item.IronIngot, 0, Item.IronIngot,
        Item.IronIngot, 0, Item.IronIngot,
        0, 0, 0,
      ],
      result: { id: Item.IronBoots, count: 1, durability: 195, maxDurability: 195 },
      hint: '4 Iron Ingots in 2 columns → Iron Boots',
      gridRequired: '3x3',
    });
  }
}

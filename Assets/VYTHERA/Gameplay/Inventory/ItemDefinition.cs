using System;
using System.Collections.Generic;
using VYTHERA.Voxel.Data;

namespace VYTHERA.Gameplay.Inventory
{
    public enum ItemCategory : byte
    {
        Block = 0,
        Tool = 1,
        Weapon = 2,
        Armor = 3,
        Food = 4,
        Material = 5,
        Special = 6
    }

    public enum ToolCategory : byte
    {
        None = 0,
        Pickaxe = 1,
        Axe = 2,
        Shovel = 3,
        Sword = 4
    }

    public enum ToolTier : byte
    {
        Hand = 0,
        Wood = 1,
        Stone = 2,
        Iron = 3,
        Diamond = 4
    }

    public struct ItemDefinition
    {
        public int Id;
        public string DisplayName;
        public int MaxStackSize;
        public int Durability;
        public ItemCategory Category;
        public ToolCategory ToolType;
        public ToolTier Tier;
        public byte PlaceableBlockId;
        public int FoodValue;
    }

    [Serializable]
    public struct ItemStack
    {
        public int ItemId;
        public int Count;
        public int Durability;
        public int MaxDurability;

        public bool IsEmpty => ItemId == 0 || Count <= 0;

        public static ItemStack Empty => new ItemStack { ItemId = 0, Count = 0, Durability = 0, MaxDurability = 0 };

        public ItemStack(int itemId, int count = 1, int durability = 0, int maxDurability = 0)
        {
            ItemId = itemId;
            Count = count;
            Durability = durability;
            MaxDurability = maxDurability;
        }
    }

    public static class ItemRegistry
    {
        public const int ItemWoodenPickaxe = 100;
        public const int ItemStonePickaxe = 101;
        public const int ItemIronPickaxe = 102;
        public const int ItemWoodenAxe = 103;
        public const int ItemStoneAxe = 104;
        public const int ItemIronAxe = 105;
        public const int ItemWoodenSword = 106;
        public const int ItemStoneSword = 107;
        public const int ItemIronSword = 108;

        public const int ItemIronHelmet = 120;
        public const int ItemIronChestplate = 121;
        public const int ItemIronLeggings = 122;
        public const int ItemIronBoots = 123;

        public const int ItemApple = 140;
        public const int ItemBread = 141;
        public const int ItemPorkchop = 142;
        public const int ItemCookedPorkchop = 143;

        public const int ItemStick = 160;
        public const int ItemCoal = 161;
        public const int ItemIronIngot = 162;

        private static readonly Dictionary<int, ItemDefinition> Definitions = new Dictionary<int, ItemDefinition>(128);

        static ItemRegistry()
        {
            // Register Blocks (1..99)
            RegisterBlock(BlockType.Grass, "Grass Block");
            RegisterBlock(BlockType.Dirt, "Dirt");
            RegisterBlock(BlockType.Stone, "Stone");
            RegisterBlock(BlockType.Sand, "Sand");
            RegisterBlock(BlockType.Water, "Water", 1);
            RegisterBlock(BlockType.Wood, "Oak Log");
            RegisterBlock(BlockType.Leaves, "Oak Leaves");
            RegisterBlock(BlockType.Snow, "Snow");
            RegisterBlock(BlockType.Clay, "Clay");
            RegisterBlock(BlockType.Crystal, "Crystal");
            RegisterBlock(BlockType.Ruin, "Ruin Brick");
            RegisterBlock(BlockType.Moss, "Moss");
            RegisterBlock(BlockType.Gravel, "Gravel");
            RegisterBlock(BlockType.Ice, "Ice");
            RegisterBlock(BlockType.DarkStone, "Dark Stone");
            RegisterBlock(BlockType.Torch, "Torch");
            RegisterBlock(BlockType.Lava, "Lava", 1);
            RegisterBlock(BlockType.Planks, "Oak Planks");
            RegisterBlock(BlockType.CraftingTable, "Crafting Table");
            RegisterBlock(BlockType.Cobblestone, "Cobblestone");
            RegisterBlock(BlockType.CoalOre, "Coal Ore");
            RegisterBlock(BlockType.IronOre, "Iron Ore");

            // Tools & Weapons
            RegisterTool(ItemWoodenPickaxe, "Wooden Pickaxe", ItemCategory.Tool, ToolCategory.Pickaxe, ToolTier.Wood, 60);
            RegisterTool(ItemStonePickaxe, "Stone Pickaxe", ItemCategory.Tool, ToolCategory.Pickaxe, ToolTier.Stone, 132);
            RegisterTool(ItemIronPickaxe, "Iron Pickaxe", ItemCategory.Tool, ToolCategory.Pickaxe, ToolTier.Iron, 251);

            RegisterTool(ItemWoodenAxe, "Wooden Axe", ItemCategory.Tool, ToolCategory.Axe, ToolTier.Wood, 60);
            RegisterTool(ItemStoneAxe, "Stone Axe", ItemCategory.Tool, ToolCategory.Axe, ToolTier.Stone, 132);
            RegisterTool(ItemIronAxe, "Iron Axe", ItemCategory.Tool, ToolCategory.Axe, ToolTier.Iron, 251);

            RegisterTool(ItemWoodenSword, "Wooden Sword", ItemCategory.Weapon, ToolCategory.Sword, ToolTier.Wood, 60);
            RegisterTool(ItemStoneSword, "Stone Sword", ItemCategory.Weapon, ToolCategory.Sword, ToolTier.Stone, 132);
            RegisterTool(ItemIronSword, "Iron Sword", ItemCategory.Weapon, ToolCategory.Sword, ToolTier.Iron, 251);

            // Armor
            RegisterArmor(ItemIronHelmet, "Iron Helmet", 165);
            RegisterArmor(ItemIronChestplate, "Iron Chestplate", 240);
            RegisterArmor(ItemIronLeggings, "Iron Leggings", 225);
            RegisterArmor(ItemIronBoots, "Iron Boots", 195);

            // Food
            RegisterFood(ItemApple, "Apple", 4);
            RegisterFood(ItemBread, "Bread", 5);
            RegisterFood(ItemPorkchop, "Raw Porkchop", 3);
            RegisterFood(ItemCookedPorkchop, "Cooked Porkchop", 8);

            // Materials
            RegisterMaterial(ItemStick, "Stick");
            RegisterMaterial(ItemCoal, "Coal");
            RegisterMaterial(ItemIronIngot, "Iron Ingot");
        }

        private static void RegisterBlock(BlockType block, string name, int stack = 64)
        {
            int id = (int)block;
            Definitions[id] = new ItemDefinition
            {
                Id = id,
                DisplayName = name,
                MaxStackSize = stack,
                Category = ItemCategory.Block,
                PlaceableBlockId = (byte)block
            };
        }

        private static void RegisterTool(int id, string name, ItemCategory cat, ToolCategory tool, ToolTier tier, int durability)
        {
            Definitions[id] = new ItemDefinition
            {
                Id = id,
                DisplayName = name,
                MaxStackSize = 1,
                Durability = durability,
                Category = cat,
                ToolType = tool,
                Tier = tier
            };
        }

        private static void RegisterArmor(int id, string name, int durability)
        {
            Definitions[id] = new ItemDefinition
            {
                Id = id,
                DisplayName = name,
                MaxStackSize = 1,
                Durability = durability,
                Category = ItemCategory.Armor
            };
        }

        private static void RegisterFood(int id, string name, int foodValue)
        {
            Definitions[id] = new ItemDefinition
            {
                Id = id,
                DisplayName = name,
                MaxStackSize = 64,
                Category = ItemCategory.Food,
                FoodValue = foodValue
            };
        }

        private static void RegisterMaterial(int id, string name)
        {
            Definitions[id] = new ItemDefinition
            {
                Id = id,
                DisplayName = name,
                MaxStackSize = 64,
                Category = ItemCategory.Material
            };
        }

        public static ItemDefinition Get(int id)
        {
            Definitions.TryGetValue(id, out var def);
            return def;
        }
    }
}

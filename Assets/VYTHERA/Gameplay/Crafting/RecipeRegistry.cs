using System;
using System.Collections.Generic;
using VYTHERA.Gameplay.Inventory;
using VYTHERA.Voxel.Data;

namespace VYTHERA.Gameplay.Crafting
{
    public enum RecipeType
    {
        Shaped,
        Shapeless
    }

    public struct RecipeDefinition
    {
        public string Id;
        public string Name;
        public RecipeType Type;
        public int[] Ingredients; // 3x3 matrix (9 items) or shapeless list
        public ItemStack Result;
        public bool Requires3x3;
    }

    public static class RecipeRegistry
    {
        public static readonly List<RecipeDefinition> Recipes = new List<RecipeDefinition>(32);

        static RecipeRegistry()
        {
            // Planks (1 Wood -> 4 Planks)
            Recipes.Add(new RecipeDefinition
            {
                Id = "planks",
                Name = "Oak Planks",
                Type = RecipeType.Shapeless,
                Ingredients = new int[] { (int)BlockType.Wood },
                Result = new ItemStack((int)BlockType.Planks, 4),
                Requires3x3 = false
            });

            // Sticks (2 Planks vertical -> 4 Sticks)
            Recipes.Add(new RecipeDefinition
            {
                Id = "sticks",
                Name = "Sticks",
                Type = RecipeType.Shaped,
                Ingredients = new int[]
                {
                    (int)BlockType.Planks, 0, 0,
                    (int)BlockType.Planks, 0, 0,
                    0, 0, 0
                },
                Result = new ItemStack(ItemRegistry.ItemStick, 4),
                Requires3x3 = false
            });

            // Crafting Table (4 Planks 2x2 -> 1 Crafting Table)
            Recipes.Add(new RecipeDefinition
            {
                Id = "crafting_table",
                Name = "Crafting Table",
                Type = RecipeType.Shaped,
                Ingredients = new int[]
                {
                    (int)BlockType.Planks, (int)BlockType.Planks, 0,
                    (int)BlockType.Planks, (int)BlockType.Planks, 0,
                    0, 0, 0
                },
                Result = new ItemStack((int)BlockType.CraftingTable, 1),
                Requires3x3 = false
            });

            // Torches (1 Coal over 1 Stick -> 4 Torches)
            Recipes.Add(new RecipeDefinition
            {
                Id = "torches",
                Name = "Torches",
                Type = RecipeType.Shaped,
                Ingredients = new int[]
                {
                    ItemRegistry.ItemCoal, 0, 0,
                    ItemRegistry.ItemStick, 0, 0,
                    0, 0, 0
                },
                Result = new ItemStack((int)BlockType.Torch, 4),
                Requires3x3 = false
            });

            // Wooden Pickaxe (3 Planks top row, 2 Sticks center column)
            Recipes.Add(new RecipeDefinition
            {
                Id = "wooden_pickaxe",
                Name = "Wooden Pickaxe",
                Type = RecipeType.Shaped,
                Ingredients = new int[]
                {
                    (int)BlockType.Planks, (int)BlockType.Planks, (int)BlockType.Planks,
                    0, ItemRegistry.ItemStick, 0,
                    0, ItemRegistry.ItemStick, 0
                },
                Result = new ItemStack(ItemRegistry.ItemWoodenPickaxe, 1, 60, 60),
                Requires3x3 = true
            });

            // Stone Pickaxe (3 Cobblestone top row, 2 Sticks center column)
            Recipes.Add(new RecipeDefinition
            {
                Id = "stone_pickaxe",
                Name = "Stone Pickaxe",
                Type = RecipeType.Shaped,
                Ingredients = new int[]
                {
                    (int)BlockType.Cobblestone, (int)BlockType.Cobblestone, (int)BlockType.Cobblestone,
                    0, ItemRegistry.ItemStick, 0,
                    0, ItemRegistry.ItemStick, 0
                },
                Result = new ItemStack(ItemRegistry.ItemStonePickaxe, 1, 132, 132),
                Requires3x3 = true
            });

            // Iron Pickaxe (3 Iron Ingots top row, 2 Sticks center column)
            Recipes.Add(new RecipeDefinition
            {
                Id = "iron_pickaxe",
                Name = "Iron Pickaxe",
                Type = RecipeType.Shaped,
                Ingredients = new int[]
                {
                    ItemRegistry.ItemIronIngot, ItemRegistry.ItemIronIngot, ItemRegistry.ItemIronIngot,
                    0, ItemRegistry.ItemStick, 0,
                    0, ItemRegistry.ItemStick, 0
                },
                Result = new ItemStack(ItemRegistry.ItemIronPickaxe, 1, 251, 251),
                Requires3x3 = true
            });

            // Wooden Sword (2 Planks over 1 Stick)
            Recipes.Add(new RecipeDefinition
            {
                Id = "wooden_sword",
                Name = "Wooden Sword",
                Type = RecipeType.Shaped,
                Ingredients = new int[]
                {
                    (int)BlockType.Planks, 0, 0,
                    (int)BlockType.Planks, 0, 0,
                    ItemRegistry.ItemStick, 0, 0
                },
                Result = new ItemStack(ItemRegistry.ItemWoodenSword, 1, 60, 60),
                Requires3x3 = false
            });

            // Iron Sword (2 Iron Ingots over 1 Stick)
            Recipes.Add(new RecipeDefinition
            {
                Id = "iron_sword",
                Name = "Iron Sword",
                Type = RecipeType.Shaped,
                Ingredients = new int[]
                {
                    ItemRegistry.ItemIronIngot, 0, 0,
                    ItemRegistry.ItemIronIngot, 0, 0,
                    ItemRegistry.ItemStick, 0, 0
                },
                Result = new ItemStack(ItemRegistry.ItemIronSword, 1, 251, 251),
                Requires3x3 = false
            });

            // Iron Chestplate (8 Iron Ingots shirt pattern)
            Recipes.Add(new RecipeDefinition
            {
                Id = "iron_chestplate",
                Name = "Iron Chestplate",
                Type = RecipeType.Shaped,
                Ingredients = new int[]
                {
                    ItemRegistry.ItemIronIngot, 0, ItemRegistry.ItemIronIngot,
                    ItemRegistry.ItemIronIngot, ItemRegistry.ItemIronIngot, ItemRegistry.ItemIronIngot,
                    ItemRegistry.ItemIronIngot, ItemRegistry.ItemIronIngot, ItemRegistry.ItemIronIngot
                },
                Result = new ItemStack(ItemRegistry.ItemIronChestplate, 1, 240, 240),
                Requires3x3 = true
            });
        }

        public static ItemStack MatchRecipe(int[] grid, int width, int height)
        {
            if (grid == null) return ItemStack.Empty;

            for (int r = 0; r < Recipes.Count; r++)
            {
                var recipe = Recipes[r];
                if (recipe.Requires3x3 && (width < 3 || height < 3)) continue;

                if (recipe.Type == RecipeType.Shapeless)
                {
                    if (MatchShapeless(grid, recipe.Ingredients)) return recipe.Result;
                }
                else
                {
                    if (MatchShaped(grid, width, height, recipe.Ingredients)) return recipe.Result;
                }
            }

            return ItemStack.Empty;
        }

        private static bool MatchShapeless(int[] grid, int[] ingredients)
        {
            var gridItems = new List<int>();
            for (int i = 0; i < grid.Length; i++)
            {
                if (grid[i] != 0) gridItems.Add(grid[i]);
            }

            if (gridItems.Count != ingredients.Length) return false;

            var ingList = new List<int>(ingredients);
            for (int i = 0; i < gridItems.Count; i++)
            {
                if (!ingList.Remove(gridItems[i])) return false;
            }

            return ingList.Count == 0;
        }

        private static bool MatchShaped(int[] grid, int width, int height, int[] recipe3x3)
        {
            // Pad or test 3x3 matrix directly
            if (width == 3 && height == 3)
            {
                for (int i = 0; i < 9; i++)
                {
                    if (grid[i] != recipe3x3[i]) return false;
                }
                return true;
            }
            return false;
        }
    }
}

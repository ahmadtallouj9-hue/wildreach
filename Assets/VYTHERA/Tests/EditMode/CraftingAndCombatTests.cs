using NUnit.Framework;
using VYTHERA.Gameplay.Crafting;
using VYTHERA.Gameplay.Equipment;
using VYTHERA.Gameplay.Inventory;
using VYTHERA.Voxel.Data;

namespace VYTHERA.Tests.EditMode
{
    public class CraftingAndCombatTests
    {
        [Test]
        public void RecipeRegistry_PlanksShapeless_Produces4Planks()
        {
            int[] grid = new int[] { (int)BlockType.Wood };
            var result = RecipeRegistry.MatchRecipe(grid, 1, 1);

            Assert.IsFalse(result.IsEmpty);
            Assert.AreEqual((int)BlockType.Planks, result.ItemId);
            Assert.AreEqual(4, result.Count);
        }

        [Test]
        public void RecipeRegistry_WoodenPickaxe_ProducesPickaxe()
        {
            int[] grid = new int[]
            {
                (int)BlockType.Planks, (int)BlockType.Planks, (int)BlockType.Planks,
                0, ItemRegistry.ItemStick, 0,
                0, ItemRegistry.ItemStick, 0
            };

            var result = RecipeRegistry.MatchRecipe(grid, 3, 3);

            Assert.IsFalse(result.IsEmpty);
            Assert.AreEqual(ItemRegistry.ItemWoodenPickaxe, result.ItemId);
            Assert.AreEqual(1, result.Count);
            Assert.AreEqual(60, result.Durability);
        }

        [Test]
        public void ArmorDamageCalculator_StandardFormula_ReducesDamageCorrectly()
        {
            // 20 Armor points vs 10 base damage with 0 toughness
            // effectiveArmor = max(20/5, 20-10/2) = max(4, 15) = 15  →  15/25 = 60% reduction  →  4 damage
            var res = ArmorDamageCalculator.CalculateDamage(10, 20, 0f, "physical");

            Assert.AreEqual(60f, res.ReductionPercentage, 0.01f);
            Assert.AreEqual(4, res.FinalDamage);
            Assert.AreEqual(6, res.DamageReduced);
        }

        [Test]
        public void ArmorDamageCalculator_StarvationAndVoid_BypassesArmor()
        {
            var res = ArmorDamageCalculator.CalculateDamage(5, 20, 0f, "starvation");

            Assert.AreEqual(5, res.FinalDamage);
            Assert.AreEqual(0, res.DamageReduced);
            Assert.AreEqual(0f, res.ReductionPercentage);
        }
    }
}

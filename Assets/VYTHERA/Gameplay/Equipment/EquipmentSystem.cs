using System;
using UnityEngine;
using VYTHERA.Gameplay.Inventory;

namespace VYTHERA.Gameplay.Equipment
{
    public enum EquipmentSlot : byte
    {
        Helmet = 0,
        Chestplate = 1,
        Leggings = 2,
        Boots = 3,
        MainHand = 4,
        OffHand = 5
    }

    public static class ArmorDamageCalculator
    {
        public struct DamageResult
        {
            public int FinalDamage;
            public int DamageReduced;
            public float ReductionPercentage;
        }

        public static DamageResult CalculateDamage(int baseDamage, int armorPoints, float toughness = 0f, string damageType = "physical")
        {
            if (damageType == "starvation" || damageType == "void" || damageType == "fall")
            {
                return new DamageResult
                {
                    FinalDamage = baseDamage,
                    DamageReduced = 0,
                    ReductionPercentage = 0f
                };
            }

            if (armorPoints <= 0 || baseDamage <= 0)
            {
                return new DamageResult
                {
                    FinalDamage = baseDamage,
                    DamageReduced = 0,
                    ReductionPercentage = 0f
                };
            }

            float effectiveArmor = MathF.Max(
                armorPoints / 5f,
                armorPoints - baseDamage / (2f + toughness / 4f)
            );
            float clampedArmor = Math.Clamp(effectiveArmor, 0f, 20f);
            float reductionFactor = clampedArmor / 25f; // max 80% reduction

            float reducedAmount = baseDamage * reductionFactor;
            int finalDamage = Math.Max(1, (int)MathF.Round(baseDamage - reducedAmount));

            return new DamageResult
            {
                FinalDamage = finalDamage,
                DamageReduced = baseDamage - finalDamage,
                ReductionPercentage = reductionFactor * 100f
            };
        }
    }

    public sealed class EquipmentSystem : MonoBehaviour
    {
        [SerializeField] private ItemStack[] _equipment = new ItemStack[6];

        public event Action OnEquipmentChanged;

        public ItemStack GetEquipment(EquipmentSlot slot)
        {
            int idx = (int)slot;
            if (idx >= 0 && idx < _equipment.Length) return _equipment[idx];
            return ItemStack.Empty;
        }

        public void SetEquipment(EquipmentSlot slot, ItemStack item)
        {
            int idx = (int)slot;
            if (idx >= 0 && idx < _equipment.Length)
            {
                _equipment[idx] = item;
                OnEquipmentChanged?.Invoke();
            }
        }

        public ItemStack Equip(EquipmentSlot slot, ItemStack item)
        {
            var prev = GetEquipment(slot);
            SetEquipment(slot, item);
            return prev;
        }

        public int GetTotalDefense() => GetTotalArmorPoints();

        public int GetTotalArmorPoints()
        {
            int total = 0;
            for (int i = 0; i < 4; i++) // Helmet, Chest, Legs, Boots
            {
                var item = _equipment[i];
                if (!item.IsEmpty)
                {
                    total += GetArmorPointsFor(item.ItemId);
                }
            }
            return total;
        }

        private static int GetArmorPointsFor(int itemId)
        {
            return itemId switch
            {
                ItemRegistry.ItemIronHelmet => 2,
                ItemRegistry.ItemIronChestplate => 6,
                ItemRegistry.ItemIronLeggings => 5,
                ItemRegistry.ItemIronBoots => 2,
                _ => 0
            };
        }
    }
}

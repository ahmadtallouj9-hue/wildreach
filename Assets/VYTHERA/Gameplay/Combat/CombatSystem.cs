using System;
using UnityEngine;
using VYTHERA.Gameplay.Equipment;
using VYTHERA.Gameplay.Inventory;
using VYTHERA.Player.Physics;

namespace VYTHERA.Gameplay.Combat
{
    public sealed class CombatSystem : MonoBehaviour
    {
        [SerializeField] private PlayerPhysics _physics;
        [SerializeField] private InventorySystem _inventory;

        private float _lastAttackTime;
        public const float BaseAttackCooldown = 0.5f;

        public struct AttackResult
        {
            public bool Hit;
            public int Damage;
            public bool IsCritical;
            public Vector3 Knockback;
        }

        public AttackResult PerformAttack(Transform playerTransform, Transform targetTransform)
        {
            if (Time.time - _lastAttackTime < BaseAttackCooldown)
            {
                return new AttackResult { Hit = false };
            }
            _lastAttackTime = Time.time;

            var heldItem = _inventory != null ? _inventory.GetSelectedHotbarItem() : ItemStack.Empty;
            int baseDamage = GetBaseDamageFor(heldItem.ItemId);

            // Critical hit when falling
            bool isCrit = _physics != null && !_physics.Grounded && _physics.Velocity.y < -0.1f;
            int damage = isCrit ? (int)MathF.Round(baseDamage * 1.5f) : baseDamage;

            Vector3 knockbackDir = (targetTransform.position - playerTransform.position).normalized;
            Vector3 knockback = knockbackDir * 0.45f + Vector3.up * 0.2f;

            return new AttackResult
            {
                Hit = true,
                Damage = damage,
                IsCritical = isCrit,
                Knockback = knockback
            };
        }

        private static int GetBaseDamageFor(int itemId)
        {
            return itemId switch
            {
                ItemRegistry.ItemWoodenSword => 4,
                ItemRegistry.ItemStoneSword => 5,
                ItemRegistry.ItemIronSword => 6,
                ItemRegistry.ItemWoodenAxe => 3,
                ItemRegistry.ItemStoneAxe => 4,
                ItemRegistry.ItemIronAxe => 5,
                ItemRegistry.ItemWoodenPickaxe => 2,
                ItemRegistry.ItemStonePickaxe => 3,
                ItemRegistry.ItemIronPickaxe => 4,
                _ => 1 // Fist
            };
        }
    }
}

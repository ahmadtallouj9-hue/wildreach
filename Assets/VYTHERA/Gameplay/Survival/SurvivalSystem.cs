using System;
using UnityEngine;
using VYTHERA.Core.Timing;
using VYTHERA.Player.Physics;

namespace VYTHERA.Gameplay.Survival
{
    public sealed class SurvivalSystem : MonoBehaviour
    {
        [Header("Survival Stats")]
        public float Health = PlayerConfig.Survival.MaxHealth;
        public float Hunger = PlayerConfig.Survival.MaxHunger;
        public float Saturation = 5.0f;
        public float Exhaustion = 0.0f;

        public bool IsDead => Health <= 0;

        private int _regenTimerTicks;
        private int _starvationTimerTicks;

        public event Action<float, float> OnHealthChanged;
        public event Action<float, float> OnHungerChanged;
        public event Action OnDeath;
        public event Action OnDied { add => OnDeath += value; remove => OnDeath -= value; }

        private void Start()
        {
            FixedTickManager.OnFixedTick += HandleFixedTick;
        }

        private void OnDestroy()
        {
            FixedTickManager.OnFixedTick -= HandleFixedTick;
        }

        public void AddExhaustion(float amount)
        {
            Exhaustion += amount;
            while (Exhaustion >= PlayerConfig.Survival.ExhaustionThreshold)
            {
                Exhaustion -= PlayerConfig.Survival.ExhaustionThreshold;
                if (Saturation > 0)
                {
                    Saturation = MathF.Max(0, Saturation - 1f);
                }
                else if (Hunger > 0)
                {
                    Hunger = MathF.Max(0, Hunger - 1f);
                    OnHungerChanged?.Invoke(Hunger, Saturation);
                }
            }
        }

        public void TakeDamage(float amount)
        {
            if (IsDead || amount <= 0) return;

            Health = MathF.Max(0, Health - amount);
            AddExhaustion(PlayerConfig.Survival.ExhaustionHurt);
            OnHealthChanged?.Invoke(Health, PlayerConfig.Survival.MaxHealth);

            if (Health <= 0)
            {
                OnDeath?.Invoke();
            }
        }

        public void Heal(float amount)
        {
            if (IsDead || amount <= 0) return;

            Health = MathF.Min(PlayerConfig.Survival.MaxHealth, Health + amount);
            OnHealthChanged?.Invoke(Health, PlayerConfig.Survival.MaxHealth);
        }

        public void Feed(int foodValue, float saturationBonus = 0f)
        {
            if (IsDead) return;

            Hunger = MathF.Min(PlayerConfig.Survival.MaxHunger, Hunger + foodValue);
            Saturation = MathF.Min(Hunger, Saturation + saturationBonus);
            OnHungerChanged?.Invoke(Hunger, Saturation);
        }

        private void HandleFixedTick(ulong tick, float dt)
        {
            if (IsDead) return;

            // Natural regeneration
            if (Hunger >= PlayerConfig.Survival.NaturalRegenMinHunger && Health < PlayerConfig.Survival.MaxHealth)
            {
                _regenTimerTicks++;
                if (_regenTimerTicks >= PlayerConfig.Survival.RegenIntervalTicks)
                {
                    _regenTimerTicks = 0;
                    Heal(1f);
                    AddExhaustion(PlayerConfig.Survival.ExhaustionPerHealthRegen);
                }
            }
            else
            {
                _regenTimerTicks = 0;
            }

            // Starvation damage
            if (Hunger <= 0)
            {
                _starvationTimerTicks++;
                if (_starvationTimerTicks >= PlayerConfig.Survival.StarvationIntervalTicks)
                {
                    _starvationTimerTicks = 0;
                    TakeDamage(1f);
                }
            }
            else
            {
                _starvationTimerTicks = 0;
            }
        }
    }
}

using System;
using UnityEngine;

namespace VYTHERA.Player.Physics
{
    public static class PlayerConfig
    {
        public const int TickRate = 20; // 20 Hz
        public const float TickDt = 1f / TickRate; // 0.05s

        public static class Movement
        {
            public const float WalkSpeed = 4.317f; // blocks/sec
            public const float WalkSpeedTick = WalkSpeed / TickRate; // ~0.21585 blocks/tick
            public const float SprintMultiplier = 1.30f;
            public const float SneakMultiplier = 0.30f;
            public const float CrawlMultiplier = 0.30f;

            public const float WalkAccelerationFactor = 0.10f;
            public const float AirAccelerationWalk = 0.02f;
            public const float AirAccelerationSprint = 0.02f * SprintMultiplier;
            public const float AirAccelerationSneak = 0.02f * SneakMultiplier;

            public const float GroundFriction = 0.546f; // S=0.6: 0.6 * 0.91 = 0.546
            public const float AirFriction = 0.91f;

            public const float Gravity = 0.08f; // blocks/tick^2
            public const float VerticalDrag = 0.98f;

            public const float JumpVelocity = 0.42f; // blocks/tick
            public const float SprintJumpForwardBoost = 0.2f;

            public const float MaxStepHeight = 0.60f; // blocks
            public const bool AutoJumpEnabled = true;
            public const float AutoJumpMinObstacle = 0.60f;
            public const float AutoJumpMaxObstacle = 1.25f;

            public const float WaterSpeedMultiplier = 0.52f;
            public const float LavaSpeedMultiplier = 0.24f;
        }

        public static class Dimensions
        {
            public const float Width = 0.60f;
            public const float Depth = 0.60f;
            public const float StandingHeight = 1.80f;
            public const float SneakingHeight = 1.50f;
            public const float CrawlingHeight = 0.625f;
            public const float SittingHeight = 1.15f;

            public const float StandingEye = 1.62f;
            public const float SneakingEye = 1.27f;
            public const float CrawlingEye = 0.40f;
            public const float SittingEye = 1.05f;
        }

        public static class Survival
        {
            public const float MaxHealth = 20f;
            public const float MaxHunger = 20f;
            public const float MaxSaturation = 20f;
            public const float SprintMinHunger = 7f;
            public const float NaturalRegenMinHunger = 18f;
            public const float ExhaustionThreshold = 4.0f;

            public const int RegenIntervalTicks = 80;
            public const int StarvationIntervalTicks = 80;

            public const float ExhaustionSprintPerBlock = 0.10f;
            public const float ExhaustionJump = 0.05f;
            public const float ExhaustionSprintJump = 0.20f;
            public const float ExhaustionSwimPerBlock = 0.01f;
            public const float ExhaustionAttack = 0.10f;
            public const float ExhaustionHurt = 0.10f;
            public const float ExhaustionPerHealthRegen = 6.0f;
        }

        public static class Damage
        {
            public const int ImmunityTicks = 10;
            public const float SafeFallDistance = 3.0f;
            public const float HurtFlashDuration = 0.15f;
        }

        public static class Interaction
        {
            public const float BlockReachDistance = 5.0f;
            public const float EntityReachDistance = 3.5f;
            public const float PlaceCooldown = 0.15f;
        }

        public static class Camera
        {
            public const float PitchMinDeg = -89f;
            public const float PitchMaxDeg = 89f;
            public const float ThirdPersonDist = 4.4f;
            public const float FrontPersonDist = 3.6f;
            public const float CamHeightLift = 0.35f;

            public const float LandingSpringStiffness = 160f;
            public const float LandingSpringDamping = 18f;

            public const float BobVerticalAmp = 0.012f;
            public const float BobHorizontalAmp = 0.008f;
            public const float SprintFovBoost = 10f;
        }
    }
}

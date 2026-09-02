using System;
using UnityEngine;
using VYTHERA.Player.Collision;
using VYTHERA.Voxel.Data;
using VYTHERA.World.Streaming;

namespace VYTHERA.Player.Physics
{
    public struct PlayerInputSnapshot
    {
        public bool Forward;
        public bool Backward;
        public bool Left;
        public bool Right;
        public bool JumpPressed;
        public bool JumpHeld;
        public bool SprintHeld;
        public bool SneakHeld;
        public float AnalogX;
        public float AnalogZ;
    }

    public sealed class PlayerPhysics : MonoBehaviour
    {
        [Header("State")]
        public Vector3 PreviousPosition = new Vector3(0, 80, 0);
        public Vector3 Position = new Vector3(0, 80, 0);
        public Vector3 Velocity;
        public bool Grounded;
        public bool Sprinting;
        public bool Sneaking;
        public bool Crawling;
        public bool InWater;
        public bool InLava;

        public float FallDistance;
        private float? _fallStartY;

        private PlayerCollision _collision;
        private ChunkManager _chunks;
        private bool _jumpArmed = true;

        public float CurrentHeight => Sneaking ? PlayerConfig.Dimensions.SneakingHeight : (Crawling ? PlayerConfig.Dimensions.CrawlingHeight : PlayerConfig.Dimensions.StandingHeight);
        public float CurrentEyeHeight => Sneaking ? PlayerConfig.Dimensions.SneakingEye : (Crawling ? PlayerConfig.Dimensions.CrawlingEye : PlayerConfig.Dimensions.StandingEye);

        public Vector3 InterpolatedPosition =>
            Vector3.Lerp(PreviousPosition, Position, Timing.FixedTickManager.Alpha);

        public event Action<float, byte> OnLanded;

        private void Update()
        {
            transform.position = InterpolatedPosition;
        }

        public void Initialize(ChunkManager chunks)
        {
            _chunks = chunks;
            _collision = new PlayerCollision(chunks);
            Position = transform.position;
            PreviousPosition = transform.position;
        }

        public void SimulateTick(PlayerInputSnapshot input, float lookYaw)
        {
            PreviousPosition = Position;
            // 1. Headroom verification
            bool canStand = !_collision.IsBoxBlocked(Position, PlayerConfig.Dimensions.Width, PlayerConfig.Dimensions.StandingHeight);
            bool canSneak = !_collision.IsBoxBlocked(Position, PlayerConfig.Dimensions.Width, PlayerConfig.Dimensions.SneakingHeight);

            if (!canStand)
            {
                if (!canSneak) { Crawling = true; Sneaking = false; }
                else { Sneaking = true; Crawling = false; }
            }
            else
            {
                Crawling = false;
                Sneaking = input.SneakHeld;
            }

            // 2. Sprint check
            if (input.SprintHeld && input.Forward && !Sneaking && !Crawling)
            {
                Sprinting = true;
            }
            else if (!input.Forward || Sneaking || Crawling)
            {
                Sprinting = false;
            }

            // 3. Fluid check
            byte bodyBlock = _chunks != null ? _chunks.GetBlock((int)MathF.Floor(Position.x), (int)MathF.Floor(Position.y + 0.5f), (int)MathF.Floor(Position.z)) : (byte)BlockType.Air;
            InWater = bodyBlock == (byte)BlockType.Water;
            InLava = bodyBlock == (byte)BlockType.Lava;

            // 4. Wish direction
            float sinYaw = MathF.Sin(lookYaw * Mathf.Deg2Rad);
            float cosYaw = MathF.Cos(lookYaw * Mathf.Deg2Rad);
            Vector3 forward = new Vector3(sinYaw, 0, cosYaw);
            Vector3 right = new Vector3(cosYaw, 0, -sinYaw);

            Vector3 wishDir = Vector3.zero;
            if (input.Forward) wishDir += forward;
            if (input.Backward) wishDir -= forward;
            if (input.Right) wishDir += right;
            if (input.Left) wishDir -= right;

            if (input.AnalogX != 0 || input.AnalogZ != 0)
            {
                wishDir += right * input.AnalogX + forward * input.AnalogZ;
            }

            if (wishDir.sqrMagnitude > 1f) wishDir.Normalize();

            // 5. Acceleration & friction
            float groundFriction = PlayerConfig.Movement.GroundFriction;
            float airFriction = PlayerConfig.Movement.AirFriction;

            float accel;
            if (Grounded)
            {
                float factor = PlayerConfig.Movement.WalkAccelerationFactor;
                if (Sprinting) factor *= PlayerConfig.Movement.SprintMultiplier;
                else if (Sneaking) factor *= PlayerConfig.Movement.SneakMultiplier;
                else if (Crawling) factor *= PlayerConfig.Movement.CrawlMultiplier;

                float q = 0.16277136f / MathF.Pow(groundFriction, 3);
                accel = factor * q;
            }
            else
            {
                accel = Sprinting ? PlayerConfig.Movement.AirAccelerationSprint : (Sneaking ? PlayerConfig.Movement.AirAccelerationSneak : PlayerConfig.Movement.AirAccelerationWalk);
            }

            if (InWater) accel *= PlayerConfig.Movement.WaterSpeedMultiplier;
            else if (InLava) accel *= PlayerConfig.Movement.LavaSpeedMultiplier;

            if (wishDir.sqrMagnitude > 0)
            {
                Velocity.x += wishDir.x * accel;
                Velocity.z += wishDir.z * accel;
            }

            // 6. Jump
            // Re-arm jump only when grounded and jump input is released
            if (Grounded && !input.JumpHeld && !input.JumpPressed)
            {
                _jumpArmed = true;
            }

            // Jump triggers ONLY on a fresh press when grounded and armed
            if (Grounded && _jumpArmed && input.JumpPressed && !InWater && !InLava)
            {
                Velocity.y = PlayerConfig.Movement.JumpVelocity;
                if (Sprinting)
                {
                    Velocity.x += sinYaw * PlayerConfig.Movement.SprintJumpForwardBoost;
                    Velocity.z += cosYaw * PlayerConfig.Movement.SprintJumpForwardBoost;
                }
                Grounded = false;
                _jumpArmed = false; // Disarm until grounded with jump released
            }

            if (InWater)
            {
                if (input.JumpHeld) Velocity.y += 0.08f;
                if (input.SneakHeld) Velocity.y -= 0.08f;
                Grounded = false;
            }

            // 7. Fall tracking
            if (!Grounded && _fallStartY == null)
            {
                _fallStartY = Position.y;
            }

            // 8. Collision resolution
            bool prevGrounded = Grounded;
            var result = _collision.ResolveMovement(ref Position, ref Velocity, CurrentHeight, PlayerConfig.Dimensions.Width, Sneaking && Grounded);
            Grounded = result.OnGround;

            // 9. Gravity & damping
            if (!Grounded && !InWater && !InLava)
            {
                Velocity.y -= PlayerConfig.Movement.Gravity;
                Velocity.y *= PlayerConfig.Movement.VerticalDrag;
            }
            else if (InWater)
            {
                Velocity.y -= 0.02f;
                Velocity.y *= 0.88f;
            }
            else
            {
                Velocity.y = 0f;
            }

            float friction = Grounded ? groundFriction : airFriction;
            Velocity.x *= friction;
            Velocity.z *= friction;

            // 10. Landing
            if (!prevGrounded && Grounded)
            {
                float fallDist = 0f;
                if (_fallStartY != null)
                {
                    fallDist = MathF.Max(0f, _fallStartY.Value - Position.y);
                }
                _fallStartY = null;
                FallDistance = fallDist;

                // When landing while holding jump, keep disarmed so continuous jumping does not occur
                if (input.JumpHeld)
                {
                    _jumpArmed = false;
                }

                OnLanded?.Invoke(fallDist, result.GroundBlock);
            }

            transform.position = Position;
        }

        public void Teleport(Vector3 newPos)
        {
            Position = newPos;
            PreviousPosition = newPos;
            transform.position = newPos;
            Velocity = Vector3.zero;
            _fallStartY = null;
            FallDistance = 0f;
            _jumpArmed = true;
            Grounded = true;
        }
    }
}

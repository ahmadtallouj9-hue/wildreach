using System;
using System.Collections.Generic;
using UnityEngine;
using VYTHERA.Player.Physics;
using VYTHERA.Voxel.Data;
using VYTHERA.World.Streaming;

namespace VYTHERA.Player.Collision
{
    public struct AABB
    {
        public float MinX;
        public float MinY;
        public float MinZ;
        public float MaxX;
        public float MaxY;
        public float MaxZ;

        public AABB(float minX, float minY, float minZ, float maxX, float maxY, float maxZ)
        {
            MinX = minX;
            MinY = minY;
            MinZ = minZ;
            MaxX = maxX;
            MaxY = maxY;
            MaxZ = maxZ;
        }

        public bool Intersects(AABB other)
        {
            return MinX < other.MaxX && MaxX > other.MinX &&
                   MinY < other.MaxY && MaxY > other.MinY &&
                   MinZ < other.MaxZ && MaxZ > other.MinZ;
        }
    }

    public struct CollisionResult
    {
        public bool HitX;
        public bool HitY;
        public bool HitZ;
        public bool HitCeiling;
        public bool OnGround;
        public bool SteppedUp;
        public byte GroundBlock;
    }

    public sealed class PlayerCollision
    {
        private readonly ChunkManager _chunks;

        public PlayerCollision(ChunkManager chunks)
        {
            _chunks = chunks;
        }

        public AABB GetPlayerAABB(Vector3 pos, float width, float height)
        {
            float half = width * 0.5f;
            return new AABB(
                pos.x - half, pos.y, pos.z - half,
                pos.x + half, pos.y + height, pos.z + half
            );
        }

        public List<AABB> GetBlockBoxesInRegion(float minX, float minY, float minZ, float maxX, float maxY, float maxZ)
        {
            int x0 = (int)MathF.Floor(minX);
            int x1 = (int)MathF.Floor(maxX);
            int y0 = (int)MathF.Floor(minY);
            int y1 = (int)MathF.Floor(maxY);
            int z0 = (int)MathF.Floor(minZ);
            int z1 = (int)MathF.Floor(maxZ);

            var boxes = new List<AABB>(32);

            for (int y = y0; y <= y1; y++)
            {
                for (int z = z0; z <= z1; z++)
                {
                    for (int x = x0; x <= x1; x++)
                    {
                        byte b = _chunks != null ? _chunks.GetBlock(x, y, z) : (byte)BlockType.Air;
                        if (BlockUtility.IsSolid(b))
                        {
                            boxes.Add(new AABB(x, y, z, x + 1f, y + 1f, z + 1f));
                        }
                    }
                }
            }

            return boxes;
        }

        public bool IsBoxBlocked(Vector3 pos, float width, float height)
        {
            var box = GetPlayerAABB(pos, width, height);
            var blocks = GetBlockBoxesInRegion(box.MinX, box.MinY, box.MinZ, box.MaxX, box.MaxY, box.MaxZ);
            for (int i = 0; i < blocks.Count; i++)
            {
                if (box.Intersects(blocks[i])) return true;
            }
            return false;
        }

        public Vector2 RestrictSneakDelta(Vector3 pos, float dx, float dz, float width, float height)
        {
            const float edgeDropThreshold = 0.625f;
            float testX = dx;
            while (testX != 0f)
            {
                Vector3 p = new Vector3(pos.x + testX, pos.y - edgeDropThreshold, pos.z);
                if (IsBoxBlocked(p, width, height)) break;
                if (MathF.Abs(testX) < 0.02f) { testX = 0f; break; }
                testX -= MathF.Sign(testX) * 0.02f;
            }

            float testZ = dz;
            while (testZ != 0f)
            {
                Vector3 p = new Vector3(pos.x + testX, pos.y - edgeDropThreshold, pos.z + testZ);
                if (IsBoxBlocked(p, width, height)) break;
                if (MathF.Abs(testZ) < 0.02f) { testZ = 0f; break; }
                testZ -= MathF.Sign(testZ) * 0.02f;
            }

            return new Vector2(testX, testZ);
        }

        public CollisionResult ResolveMovement(
            ref Vector3 pos,
            ref Vector3 vel,
            float height,
            float width = PlayerConfig.Dimensions.Width,
            bool sneakingOnGround = false)
        {
            bool hitX = false;
            bool hitY = false;
            bool hitZ = false;
            bool hitCeiling = false;
            bool onGround = false;
            bool steppedUp = false;

            float half = width * 0.5f;
            float maxStep = PlayerConfig.Movement.MaxStepHeight;

            float moveX = vel.x;
            float moveZ = vel.z;

            if (sneakingOnGround)
            {
                var restricted = RestrictSneakDelta(pos, moveX, moveZ, width, height);
                moveX = restricted.x;
                moveZ = restricted.y;
            }

            // 1. Move X
            if (moveX != 0f)
            {
                if (MoveSingleAxis(ref pos, moveX, 0, half, height))
                {
                    if (TryStepUp(ref pos, moveX, 0f, half, height, maxStep))
                    {
                        steppedUp = true;
                    }
                    else
                    {
                        hitX = true;
                        vel.x = 0f;
                    }
                }
            }

            // 2. Move Z
            if (moveZ != 0f)
            {
                if (MoveSingleAxis(ref pos, moveZ, 2, half, height))
                {
                    if (TryStepUp(ref pos, 0f, moveZ, half, height, maxStep))
                    {
                        steppedUp = true;
                    }
                    else
                    {
                        hitZ = true;
                        vel.z = 0f;
                    }
                }
            }

            // 3. Move Y
            if (vel.y != 0f)
            {
                if (MoveSingleAxis(ref pos, vel.y, 1, half, height))
                {
                    if (vel.y < 0f)
                    {
                        onGround = true;
                        hitY = true;
                    }
                    else
                    {
                        hitCeiling = true;
                        hitY = true;
                    }
                    vel.y = 0f;
                }
            }

            if (!onGround && vel.y <= 0f)
            {
                Vector3 testPos = new Vector3(pos.x, pos.y - 0.05f, pos.z);
                if (IsBoxBlocked(testPos, width, height))
                {
                    onGround = true;
                }
            }

            byte groundBlock = GetGroundBlock(pos);

            return new CollisionResult
            {
                HitX = hitX,
                HitY = hitY,
                HitZ = hitZ,
                HitCeiling = hitCeiling,
                OnGround = onGround,
                SteppedUp = steppedUp,
                GroundBlock = groundBlock
            };
        }

        private bool MoveSingleAxis(ref Vector3 pos, float delta, int axis, float half, float height)
        {
            if (delta == 0f) return false;

            const float maxSubstep = 0.35f;
            int steps = Math.Max(1, (int)MathF.Ceiling(MathF.Abs(delta) / maxSubstep));
            float step = delta / steps;

            for (int s = 0; s < steps; s++)
            {
                if (axis == 0) pos.x += step;
                else if (axis == 1) pos.y += step;
                else if (axis == 2) pos.z += step;

                var playerBox = GetPlayerAABB(pos, half * 2f, height);
                var blockBoxes = GetBlockBoxesInRegion(playerBox.MinX, playerBox.MinY, playerBox.MinZ, playerBox.MaxX, playerBox.MaxY, playerBox.MaxZ);

                for (int i = 0; i < blockBoxes.Count; i++)
                {
                    if (axis != 1 && blockBoxes[i].MaxY <= pos.y + 0.05f)
                    {
                        continue; // Floor block beneath feet, not a wall
                    }

                    if (playerBox.Intersects(blockBoxes[i]))
                    {
                        if (axis == 0) pos.x = step > 0f ? blockBoxes[i].MinX - half : blockBoxes[i].MaxX + half;
                        else if (axis == 1) pos.y = step > 0f ? blockBoxes[i].MinY - height : blockBoxes[i].MaxY;
                        else if (axis == 2) pos.z = step > 0f ? blockBoxes[i].MinZ - half : blockBoxes[i].MaxZ + half;
                        return true;
                    }
                }
            }

            return false;
        }

        private bool TryStepUp(ref Vector3 pos, float dx, float dz, float half, float height, float maxStep)
        {
            Vector3 candidate = pos;
            candidate.y += maxStep;
            if (IsBoxBlocked(candidate, half * 2f, height)) return false;

            candidate.x += dx;
            candidate.z += dz;
            if (IsBoxBlocked(candidate, half * 2f, height)) return false;

            const float downSubstep = 0.05f;
            while (candidate.y > pos.y)
            {
                candidate.y -= downSubstep;
                if (IsBoxBlocked(candidate, half * 2f, height))
                {
                    candidate.y += downSubstep;
                    break;
                }
            }

            if (candidate.y > pos.y + 0.05f)
            {
                pos = candidate;
                return true;
            }
            return false;
        }

        public byte GetGroundBlock(Vector3 pos)
        {
            int x = (int)MathF.Floor(pos.x);
            int y = (int)MathF.Floor(pos.y - 0.1f);
            int z = (int)MathF.Floor(pos.z);
            return _chunks != null ? _chunks.GetBlock(x, y, z) : (byte)BlockType.Air;
        }
    }
}

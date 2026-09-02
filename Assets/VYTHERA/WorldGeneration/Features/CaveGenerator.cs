using System;
using VYTHERA.Core.Maths;

namespace VYTHERA.WorldGeneration.Features
{
    public sealed class CaveGenerator
    {
        private readonly SimplexNoise _worm;
        private readonly SimplexNoise _room;
        private readonly bool _enabled;

        public CaveGenerator(WorldSeed seed, bool enabled = true)
        {
            _enabled = enabled;
            var rngWorm = seed.CreateRng(SeedSalt.Caves);
            _worm = new SimplexNoise(ref rngWorm);

            var rngRoom = seed.CreateRng(0x41);
            _room = new SimplexNoise(ref rngRoom);
        }

        public bool IsCave(float wx, float y, float wz, float surface)
        {
            if (!_enabled) return false;
            if (y >= surface - 7f || y < 4f) return false;

            float depth = surface - y;

            // Medium underground cavern rooms
            float pocket = _room.Sample3D(wx * 0.012f, y * 0.016f, wz * 0.012f);
            if (pocket > 0.68f && depth > 14f && y < surface - 16f) return true;

            // Worm tunnels
            float tunnel = _worm.Sample3D(wx * 0.022f, y * 0.028f, wz * 0.022f);
            if (MathF.Abs(tunnel) < 0.12f && depth > 8f)
            {
                float branch = _worm.Sample3D(wx * 0.034f + 9f, y * 0.04f, wz * 0.034f);
                if (MathF.Abs(branch) < 0.14f || _worm.Sample3D(wx * 0.05f + 9f, y * 0.055f, wz * 0.05f) > 0.1f)
                {
                    return true;
                }
            }

            return false;
        }
    }
}

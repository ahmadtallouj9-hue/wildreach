using System;
using UnityEngine;
using VYTHERA.Core.Maths;
using VYTHERA.Voxel.Data;
using VYTHERA.WorldGeneration.Biomes;

namespace VYTHERA.WorldGeneration.Terrain
{
    public enum TerrainPreset
    {
        Balanced,
        Flat,
        Mountains,
        Islands,
        Wild
    }

    public sealed class TerrainShape
    {
        private readonly SimplexNoise _macro;
        private readonly SimplexNoise _meso;
        private readonly SimplexNoise _hills;
        private readonly SimplexNoise _detail;
        private readonly SimplexNoise _density3;
        private readonly TerrainPreset _preset;

        public TerrainShape(WorldSeed seed, TerrainPreset preset = TerrainPreset.Balanced)
        {
            _preset = preset;

            var rngMacro = seed.CreateRng(SeedSalt.Macro);
            _macro = new SimplexNoise(ref rngMacro);

            var rngMeso = seed.CreateRng(SeedSalt.Meso);
            _meso = new SimplexNoise(ref rngMeso);

            var rngHills = seed.CreateRng(0x31);
            _hills = new SimplexNoise(ref rngHills);

            var rngDetail = seed.CreateRng(SeedSalt.Detail);
            _detail = new SimplexNoise(ref rngDetail);

            var rngDensity = seed.CreateRng(SeedSalt.Density);
            _density3 = new SimplexNoise(ref rngDensity);
        }

        public float SurfaceHeightExact(float wx, float wz, ClimateSample c)
        {
            float cont = c.Continentalness;
            float erosion = c.Erosion;
            float peaks = c.PeaksValleys;
            float river = c.River;
            float mountainFactor = c.MountainFactor;
            float valleyFactor = c.ValleyFactor;
            float ridgeStrength = c.RidgeStrength;
            float wxw = c.Wx;
            float wzw = c.Wz;

            const float sea = VoxelConstants.SeaLevel;

            // Macro / Meso rolling landforms
            float macroH = NoiseKit.Fbm2(_macro, wxw * 0.00042f, wzw * 0.00042f, 4);
            float mesoH = NoiseKit.Fbm2(_meso, wxw * 0.0011f, wzw * 0.0011f, 4);
            float rolling = (macroH * 14f + mesoH * 7f);

            float hills = NoiseKit.Fbm2(_hills, wxw * 0.003f, wzw * 0.003f, 4);
            float detail = _detail.Sample2D(wx * 0.022f, wz * 0.022f);
            float micro = _detail.Sample2D(wx * 0.055f + 12f, wz * 0.055f) * 0.28f;

            float shore = NoiseKit.Smoothstep(0.28f, 0.5f, cont);
            float deepOcean = sea - 18f - MathF.Max(0f, 0.28f - cont) * 40f;
            float shallow = sea - 6f - MathF.Max(0f, 0.4f - cont) * 20f;
            float oceanFloor = NoiseKit.Lerp(deepOcean, shallow, NoiseKit.Smoothstep(0.18f, 0.38f, cont));

            float inlandBase = sea + 6f + (cont - 0.5f) * 16f + rolling + hills * (6f - erosion * 3f) + detail * 2.2f + micro;
            float h = NoiseKit.Lerp(oceanFloor, inlandBase, shore);

            // Valleys
            if (cont > 0.44f)
            {
                h -= valleyFactor * valleyFactor * (11f + erosion * 9f);
            }

            // Rivers
            if (river > 0.05f && cont > 0.42f)
            {
                h -= river * river * (12f + (1f - erosion) * 5f);
            }

            // Mountains
            float range = ridgeStrength * ridgeStrength;
            h += (ridgeStrength * 26f + range * 34f + MathF.Max(0f, peaks) * 8f) * mountainFactor;
            h += (1f - erosion) * hills * 3.5f;

            // Plateaus
            if (cont > 0.52f && erosion > 0.62f && mountainFactor < 0.35f)
            {
                float plateau = MathF.Round((h - sea) / 5f) * 5f;
                h = NoiseKit.Lerp(h, sea + plateau, 0.55f);
            }

            if (cont > 0.48f) h += MathF.Max(0f, hills) * 2.5f;

            switch (_preset)
            {
                case TerrainPreset.Flat:
                    h = sea + 6f + (macroH * 3f + mesoH * 1.5f) + detail * 0.8f;
                    break;
                case TerrainPreset.Mountains:
                    h += (ridgeStrength * 22f + range * 20f);
                    break;
                case TerrainPreset.Islands:
                    float island = NoiseKit.Smoothstep(0.1f, 0.32f, cont);
                    h = sea - 10f + island * 42f + rolling * 0.6f + hills * 6f;
                    break;
                case TerrainPreset.Wild:
                    h += (hills * 7f + ridgeStrength * 12f) + detail * 4f;
                    break;
            }

            return Math.Clamp(h, 2f, VoxelConstants.ChunkHeight - 8f);
        }

        public float Density(float wx, float y, float wz, float surface)
        {
            float n = _density3.Sample3D(wx * 0.02f, y * 0.026f, wz * 0.02f);
            float n2 = _density3.Sample3D(wx * 0.012f + 2.7f, y * 0.018f, wz * 0.012f);
            float vertical = (surface - y) * 0.08f;
            return n * 0.55f + n2 * 0.35f + vertical - 0.15f;
        }

        public bool ShouldCarveOverhang(float wx, float y, float wz, float surface)
        {
            if (y >= surface - 3f || y < surface - 24f || y < 6f) return false;
            return Density(wx, y, wz, surface) < -0.18f;
        }

        public float SoftenHeight(float height, float neighborMin)
        {
            const float threshold = 5f;
            float drop = height - neighborMin;
            if (drop <= threshold) return height;
            return height - MathF.Min((drop - threshold) * 0.35f, 8f);
        }
    }
}

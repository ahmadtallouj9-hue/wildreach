using System;
using UnityEngine;
using VYTHERA.Core.Maths;

namespace VYTHERA.WorldGeneration.Biomes
{
    public struct ClimateSample
    {
        public float Continentalness;
        public float Erosion;
        public float PeaksValleys;
        public float Temperature;
        public float Humidity;
        public float Wx;
        public float Wz;
        public float River;
        public float ValleyFactor;
        public float RidgeStrength;
        public float MountainFactor;
    }

    public sealed class ClimateSampler
    {
        private readonly SimplexNoise _continent;
        private readonly SimplexNoise _erosion;
        private readonly SimplexNoise _peaks;
        private readonly SimplexNoise _temp;
        private readonly SimplexNoise _moist;
        private readonly SimplexNoise _warp;
        private readonly SimplexNoise _river;

        public ClimateSampler(WorldSeed seed)
        {
            var rngContinent = seed.CreateRng(SeedSalt.Terrain);
            _continent = new SimplexNoise(ref rngContinent);

            var rngErosion = seed.CreateRng(0x21);
            _erosion = new SimplexNoise(ref rngErosion);

            var rngPeaks = seed.CreateRng(0x22);
            _peaks = new SimplexNoise(ref rngPeaks);

            var rngTemp = seed.CreateRng(SeedSalt.Climate);
            _temp = new SimplexNoise(ref rngTemp);

            var rngMoist = seed.CreateRng(0x23);
            _moist = new SimplexNoise(ref rngMoist);

            var rngWarp = seed.CreateRng(SeedSalt.Warp);
            _warp = new SimplexNoise(ref rngWarp);

            var rngRiver = seed.CreateRng(SeedSalt.Rivers);
            _river = new SimplexNoise(ref rngRiver);
        }

        public ClimateSample Sample(float wx, float wz)
        {
            const float warpAmt = 95f;
            float wxw = wx + NoiseKit.Fbm2(_warp, wx * 0.0015f, wz * 0.0015f, 3) * warpAmt;
            float wzw = wz + NoiseKit.Fbm2(_warp, wx * 0.0015f + 40f, wz * 0.0015f, 3) * warpAmt;

            // Continents / Oceans
            float continentalness = NoiseKit.Fbm2(_continent, wxw * 0.00038f, wzw * 0.00038f, 6) * 0.5f + 0.5f;

            // Erosion
            float erosion = NoiseKit.Fbm2(_erosion, wxw * 0.0009f, wzw * 0.0009f, 4) * 0.5f + 0.5f;

            // Peaks & Valleys
            float peaksValleys = NoiseKit.Ridged2(_peaks, wxw * 0.00072f, wzw * 0.00072f, 5);

            // Climate fields
            float rawTemp = NoiseKit.Fbm2(_temp, wxw * 0.0011f, wzw * 0.0011f, 4) * 0.5f + 0.5f;
            float rawMoist = NoiseKit.Fbm2(_moist, wxw * 0.0013f, wzw * 0.0013f, 4) * 0.5f + 0.5f;
            float temperature = Math.Clamp(rawTemp, 0f, 1f);
            float humidity = Math.Clamp(rawMoist, 0f, 1f);

            // Rivers
            float riverNoise = MathF.Abs(NoiseKit.Fbm2(_river, wxw * 0.00078f, wzw * 0.00078f, 3));
            float river = continentalness > 0.42f ? NoiseKit.Smoothstep(0.14f, 0.02f, riverNoise) : 0f;

            // Valley factor
            float valleyRaw = 1f - NoiseKit.Ridged2(_peaks, wxw * 0.00055f + 90f, wzw * 0.00055f, 4);
            float valleyFactor = continentalness > 0.44f
                ? valleyRaw * NoiseKit.Smoothstep(0.38f, 0.62f, erosion)
                : valleyRaw * 0.35f;

            float ridgeStrength = NoiseKit.Ridged2(_peaks, wxw * 0.00068f, wzw * 0.00068f, 5);

            float mountainFactor =
                NoiseKit.Smoothstep(0.42f, 0.78f, ridgeStrength) *
                NoiseKit.Smoothstep(0.55f, 0.28f, temperature) *
                NoiseKit.Smoothstep(0.35f, 0.55f, continentalness) *
                (1f - erosion * 0.28f);

            return new ClimateSample
            {
                Continentalness = continentalness,
                Erosion = erosion,
                PeaksValleys = peaksValleys,
                Temperature = temperature,
                Humidity = humidity,
                Wx = wxw,
                Wz = wzw,
                River = river,
                ValleyFactor = valleyFactor,
                RidgeStrength = ridgeStrength,
                MountainFactor = mountainFactor
            };
        }
    }
}

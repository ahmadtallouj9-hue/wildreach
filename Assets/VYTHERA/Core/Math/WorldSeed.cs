using System;
using System.Runtime.CompilerServices;

namespace VYTHERA.Core.Maths
{
    public static class SeedSalt
    {
        public const uint Terrain = 0x01;
        public const uint Climate = 0x02;
        public const uint Biomes = 0x03;
        public const uint Caves = 0x04;
        public const uint Ores = 0x05;
        public const uint Trees = 0x06;
        public const uint Structures = 0x07;
        public const uint Decorations = 0x08;
        public const uint Rivers = 0x09;
        public const uint Warp = 0x0a;
        public const uint Density = 0x0b;
        public const uint Detail = 0x0c;
        public const uint Macro = 0x0d;
        public const uint Meso = 0x0e;
        public const uint Landmarks = 0x0f;
    }

    /// <summary>
    /// Deterministic seed derivation and PRNG matching the reference JavaScript mulberry32 & FNV-1a algorithms.
    /// </summary>
    public sealed class WorldSeed
    {
        public string Source { get; }
        public uint BaseSeed { get; }

        public WorldSeed(string source)
        {
            Source = source ?? string.Empty;
            BaseSeed = HashString32(Source);
        }

        public WorldSeed(uint numericSeed)
        {
            Source = numericSeed.ToString();
            BaseSeed = numericSeed;
        }

        /// <summary>
        /// FNV-1a 32-bit hash of a string matching JS hashString32.
        /// </summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static uint HashString32(string seed)
        {
            uint h = 2166136261u;
            for (int i = 0; i < seed.Length; i++)
            {
                h ^= seed[i];
                h = unchecked(h * 16777619u);
            }
            return h;
        }

        /// <summary>
        /// Stable mix of two uint32 values matching JS mix32.
        /// </summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static uint Mix32(uint a, uint b)
        {
            uint h = unchecked(a ^ (b * 0x9e3779b1u));
            h = unchecked((h ^ (h >> 16)) * 0x85ebca6bu);
            h = unchecked((h ^ (h >> 13)) * 0xc2b2ae35u);
            return (h ^ (h >> 16));
        }

        /// <summary>
        /// Coordinate hash in [0, 1). Thread-safe and order-independent.
        /// </summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static double Hash3(int x, int y, int z, uint salt = 0)
        {
            uint h = Mix32(unchecked((uint)x), salt);
            h = Mix32(h, unchecked((uint)y));
            h = Mix32(h, unchecked((uint)z));
            return (double)h / 4294967296.0;
        }

        /// <summary>
        /// Deterministic [0, 1) float at world XZ (optional Y).
        /// </summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public double At(int x, int z, uint salt, int y = 0)
        {
            return Hash3(x, y, z, Mix32(BaseSeed, salt));
        }

        /// <summary>
        /// uint32 seed for a named subsystem salt.
        /// </summary>
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public uint Derive(uint salt)
        {
            return Mix32(BaseSeed, salt);
        }

        /// <summary>
        /// Creates a Mulberry32 PRNG instance for this subsystem.
        /// </summary>
        public Mulberry32 CreateRng(uint salt)
        {
            return new Mulberry32(Derive(salt));
        }
    }

    /// <summary>
    /// Mulberry32 pseudo-random number generator producing [0, 1) doubles.
    /// </summary>
    public struct Mulberry32
    {
        private uint _state;

        public Mulberry32(uint seed)
        {
            _state = seed;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public double NextDouble()
        {
            unchecked
            {
                _state = _state + 0x6d2b79f5u;
                uint t = (_state ^ (_state >> 15)) * (1u | _state);
                t = (t + ((t ^ (t >> 7)) * (61u | t))) ^ t;
                return (double)((t ^ (t >> 14))) / 4294967296.0;
            }
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public float NextFloat()
        {
            return (float)NextDouble();
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public int Range(int minInclusive, int maxExclusive)
        {
            if (minInclusive >= maxExclusive) return minInclusive;
            return minInclusive + (int)(NextDouble() * (maxExclusive - minInclusive));
        }
    }
}

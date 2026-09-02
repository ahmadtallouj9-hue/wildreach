using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using UnityEngine;
using VYTHERA.Core.Maths;
using VYTHERA.Voxel.Data;
using VYTHERA.Voxel.Storage;
using VYTHERA.WorldGeneration.Biomes;
using VYTHERA.WorldGeneration.Decoration;
using VYTHERA.WorldGeneration.Features;
using VYTHERA.WorldGeneration.Terrain;

namespace VYTHERA.WorldGeneration.Pipeline
{
    public struct ColumnClimate
    {
        public ClimateSample Climate;
        public int Height;
        public BiomeId Biome;
        public float RawHeight;
        public int Step; // 0..3
        public float ExactHeight;
    }

    /// <summary>
    /// Staged chunk generation pipeline. Fully deterministic for (seed, cx, cz).
    /// </summary>
    public sealed class ChunkPipeline
    {
        public const int Version = 2;

        public WorldSeed Seed { get; }
        public ClimateSampler Climate { get; }
        public TerrainShape Terrain { get; }
        public CaveGenerator Caves { get; }
        public OreGenerator Ores { get; }
        public VegetationGenerator Vegetation { get; }

        private readonly ConcurrentDictionary<long, ColumnClimate> _cache = new ConcurrentDictionary<long, ColumnClimate>();

        public ChunkPipeline(string seedSource, TerrainPreset terrainPreset = TerrainPreset.Balanced, bool enableCaves = true)
        {
            Seed = new WorldSeed(seedSource);
            Climate = new ClimateSampler(Seed);
            Terrain = new TerrainShape(Seed, terrainPreset);
            Caves = new CaveGenerator(Seed, enableCaves);
            Ores = new OreGenerator(Seed);
            Vegetation = new VegetationGenerator(Seed);
        }

        private static long GetKey(int wx, int wz)
        {
            return unchecked(((long)wx << 32) | (uint)wz);
        }

        private ColumnClimate RawColumn(int wx, int wz)
        {
            long k = GetKey(wx, wz);
            if (_cache.TryGetValue(k, out var hit)) return hit;

            var climate = Climate.Sample(wx, wz);
            float rawHeight = Terrain.SurfaceHeightExact(wx, wz, climate);
            int blockHeight = (int)MathF.Floor(rawHeight);
            int step = (int)Math.Clamp((rawHeight - blockHeight) * 4f, 0f, 3f);
            var biome = BiomeRegistry.SelectBiome(climate.Continentalness, climate.Temperature, climate.Humidity, climate.River, climate.MountainFactor, blockHeight);

            var col = new ColumnClimate
            {
                Climate = climate,
                Height = blockHeight,
                Biome = biome,
                RawHeight = rawHeight,
                Step = step,
                ExactHeight = blockHeight + step * 0.25f
            };

            _cache[k] = col;
            return col;
        }

        public ColumnClimate SampleColumn(int wx, int wz)
        {
            var baseCol = RawColumn(wx, wz);
            float nMin = baseCol.RawHeight;

            nMin = MathF.Min(nMin, RawColumn(wx - 1, wz).RawHeight);
            nMin = MathF.Min(nMin, RawColumn(wx + 1, wz).RawHeight);
            nMin = MathF.Min(nMin, RawColumn(wx, wz - 1).RawHeight);
            nMin = MathF.Min(nMin, RawColumn(wx, wz + 1).RawHeight);

            float softened = Terrain.SoftenHeight(baseCol.RawHeight, nMin);
            int blockHeight = (int)MathF.Floor(softened);
            int step = (int)Math.Clamp((softened - blockHeight) * 4f, 0f, 3f);
            var biome = BiomeRegistry.SelectBiome(baseCol.Climate.Continentalness, baseCol.Climate.Temperature, baseCol.Climate.Humidity, baseCol.Climate.River, baseCol.Climate.MountainFactor, blockHeight);

            return new ColumnClimate
            {
                Climate = baseCol.Climate,
                Height = blockHeight,
                Biome = biome,
                RawHeight = baseCol.RawHeight,
                Step = step,
                ExactHeight = blockHeight + step * 0.25f
            };
        }

        public int GetHeight(int wx, int wz)
        {
            return SampleColumn(wx, wz).Height;
        }

        public BiomeId GetBiome(int wx, int wz)
        {
            return SampleColumn(wx, wz).Biome;
        }

        public ColumnInfo[] FillChunk(int cx, int cz, byte[] voxels)
        {
            _cache.Clear();
            Array.Clear(voxels, 0, voxels.Length);

            var columns = new ColumnInfo[VoxelConstants.ChunkSize * VoxelConstants.ChunkSize];
            int ox = cx * VoxelConstants.ChunkSize;
            int oz = cz * VoxelConstants.ChunkSize;

            // Prefetch padded region
            const int pad = 2;
            for (int wz = oz - pad; wz < oz + VoxelConstants.ChunkSize + pad; wz++)
            {
                for (int wx = ox - pad; wx < ox + VoxelConstants.ChunkSize + pad; wx++)
                {
                    RawColumn(wx, wz);
                }
            }

            for (int lz = 0; lz < VoxelConstants.ChunkSize; lz++)
            {
                for (int lx = 0; lx < VoxelConstants.ChunkSize; lx++)
                {
                    int wx = ox + lx;
                    int wz = oz + lz;
                    var col = SampleColumn(wx, wz);
                    columns[lz * VoxelConstants.ChunkSize + lx] = new ColumnInfo
                    {
                        Height = col.Height,
                        Biome = (byte)col.Biome,
                        Surface = col.Height,
                        Step = col.Step
                    };
                }
            }

            // Fill Base terrain + surface + water + caves
            for (int lz = 0; lz < VoxelConstants.ChunkSize; lz++)
            {
                for (int lx = 0; lx < VoxelConstants.ChunkSize; lx++)
                {
                    int wx = ox + lx;
                    int wz = oz + lz;
                    var col = columns[lz * VoxelConstants.ChunkSize + lx];
                    int height = col.Height;
                    var biome = (BiomeId)col.Biome;
                    var def = BiomeRegistry.Biomes[(int)biome];
                    bool beach = height >= VoxelConstants.SeaLevel && height <= VoxelConstants.SeaLevel + 2 && biome != BiomeId.Wetlands && biome != BiomeId.River;
                    int depth = BiomeRegistry.DirtDepth(biome, Seed.At(wx, wz, 0x51));

                    int yMax = Math.Max(height, VoxelConstants.SeaLevel);
                    for (int y = 0; y <= yMax; y++)
                    {
                        int i = ChunkData.GetIndex(lx, y, lz);
                        byte block = (byte)BlockType.Air;

                        if (y == 0)
                        {
                            block = (byte)BlockType.DarkStone;
                        }
                        else if (y > height)
                        {
                            if (y <= VoxelConstants.SeaLevel && (height < VoxelConstants.SeaLevel || biome == BiomeId.Wetlands || biome == BiomeId.River))
                            {
                                block = def.WaterIce && y == VoxelConstants.SeaLevel ? (byte)BlockType.Ice : (byte)BlockType.Water;
                            }
                        }
                        else if (y < height - 6 && Caves.IsCave(wx, y, wz, height))
                        {
                            block = y < 6
                                ? (byte)BlockType.DarkStone
                                : (y < 8 && Seed.At(wx, wz, 0x61, y) < 0.07 ? (byte)BlockType.Lava : (byte)BlockType.Air);
                        }
                        else if (y == height)
                        {
                            block = BiomeRegistry.SurfaceBlockFor(biome, height, beach);
                        }
                        else if (y >= height - depth)
                        {
                            block = BiomeRegistry.SubsoilFor(biome, height, beach);
                        }
                        else if (y >= height - depth - 6)
                        {
                            block = biome == BiomeId.Desert ? (byte)BlockType.Sand : (byte)BlockType.Stone;
                        }
                        else
                        {
                            block = y < 16 ? def.Deep : def.Underground;
                            if (Seed.At(wx + y, wz - y, 0x71) < 0.06) block = (byte)BlockType.Gravel;
                        }

                        voxels[i] = block;
                    }
                }
            }

            // Ores
            Ores.PlaceVeins(cx, cz, voxels);

            // Vegetation
            Vegetation.Decorate(
                cx,
                cz,
                voxels,
                columns,
                (x, z) => GetHeight(x, z),
                (x, z) => GetBiome(x, z));

            _cache.Clear();
            return columns;
        }
    }
}

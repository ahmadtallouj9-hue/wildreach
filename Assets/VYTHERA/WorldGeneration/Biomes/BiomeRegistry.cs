using System;
using UnityEngine;
using VYTHERA.Voxel.Data;

namespace VYTHERA.WorldGeneration.Biomes
{
    public enum BiomeId : byte
    {
        Plains = 0,
        Forest = 1,
        Mountains = 2,
        Desert = 3,
        Wetlands = 4,
        Taiga = 5,
        Ocean = 6,
        DeepOcean = 7,
        Beach = 8,
        DenseForest = 9,
        BirchForest = 10,
        Savanna = 11,
        Jungle = 12,
        SnowyTaiga = 13,
        SnowyMountains = 14,
        Tundra = 15,
        River = 16
    }

    public enum TreeKind : byte
    {
        None = 0,
        Oak = 1,
        Birch = 2,
        Canopy = 3,
        Pine = 4,
        Jungle = 5,
        Willow = 6,
        Cactus = 7
    }

    public struct BiomeGenDef
    {
        public BiomeId Id;
        public string Name;
        public float Temp;
        public float Humid;
        public float ContMin;
        public float ContMax;
        public byte Surface;
        public byte Subsoil;
        public byte Underground;
        public byte Deep;
        public float TreeChance;
        public TreeKind TreeKind;
        public float GrassChance;
        public bool Snow;
        public bool WaterIce;
    }

    public static class BiomeRegistry
    {
        public static readonly BiomeGenDef[] Biomes = new BiomeGenDef[17];

        static BiomeRegistry()
        {
            Biomes[(int)BiomeId.Ocean] = new BiomeGenDef
            {
                Id = BiomeId.Ocean, Name = "Ocean", Temp = 0.5f, Humid = 0.6f, ContMin = 0f, ContMax = 0.38f,
                Surface = (byte)BlockType.Sand, Subsoil = (byte)BlockType.Sand, Underground = (byte)BlockType.Stone, Deep = (byte)BlockType.DarkStone,
                TreeChance = 0f, TreeKind = TreeKind.None, GrassChance = 0f, Snow = false, WaterIce = false
            };

            Biomes[(int)BiomeId.DeepOcean] = new BiomeGenDef
            {
                Id = BiomeId.DeepOcean, Name = "Deep Ocean", Temp = 0.45f, Humid = 0.65f, ContMin = 0f, ContMax = 0.28f,
                Surface = (byte)BlockType.DarkStone, Subsoil = (byte)BlockType.Clay, Underground = (byte)BlockType.Stone, Deep = (byte)BlockType.DarkStone,
                TreeChance = 0f, TreeKind = TreeKind.None, GrassChance = 0f, Snow = false, WaterIce = false
            };

            Biomes[(int)BiomeId.Beach] = new BiomeGenDef
            {
                Id = BiomeId.Beach, Name = "Beach", Temp = 0.55f, Humid = 0.5f, ContMin = 0.35f, ContMax = 0.48f,
                Surface = (byte)BlockType.Sand, Subsoil = (byte)BlockType.Sand, Underground = (byte)BlockType.Stone, Deep = (byte)BlockType.DarkStone,
                TreeChance = 0f, TreeKind = TreeKind.None, GrassChance = 0f, Snow = false, WaterIce = false
            };

            Biomes[(int)BiomeId.River] = new BiomeGenDef
            {
                Id = BiomeId.River, Name = "River", Temp = 0.5f, Humid = 0.7f, ContMin = 0.4f, ContMax = 1f,
                Surface = (byte)BlockType.Sand, Subsoil = (byte)BlockType.Clay, Underground = (byte)BlockType.Stone, Deep = (byte)BlockType.DarkStone,
                TreeChance = 0.01f, TreeKind = TreeKind.Willow, GrassChance = 0.04f, Snow = false, WaterIce = false
            };

            Biomes[(int)BiomeId.Plains] = new BiomeGenDef
            {
                Id = BiomeId.Plains, Name = "Windplain", Temp = 0.55f, Humid = 0.4f, ContMin = 0.45f, ContMax = 1f,
                Surface = (byte)BlockType.Grass, Subsoil = (byte)BlockType.Dirt, Underground = (byte)BlockType.Stone, Deep = (byte)BlockType.DarkStone,
                TreeChance = 0.01f, TreeKind = TreeKind.Oak, GrassChance = 0.04f, Snow = false, WaterIce = false
            };

            Biomes[(int)BiomeId.Forest] = new BiomeGenDef
            {
                Id = BiomeId.Forest, Name = "Deepwood", Temp = 0.5f, Humid = 0.62f, ContMin = 0.45f, ContMax = 1f,
                Surface = (byte)BlockType.Grass, Subsoil = (byte)BlockType.Dirt, Underground = (byte)BlockType.Stone, Deep = (byte)BlockType.DarkStone,
                TreeChance = 0.035f, TreeKind = TreeKind.Canopy, GrassChance = 0.03f, Snow = false, WaterIce = false
            };

            Biomes[(int)BiomeId.DenseForest] = new BiomeGenDef
            {
                Id = BiomeId.DenseForest, Name = "Oldgrowth", Temp = 0.48f, Humid = 0.78f, ContMin = 0.48f, ContMax = 1f,
                Surface = (byte)BlockType.Grass, Subsoil = (byte)BlockType.Dirt, Underground = (byte)BlockType.Stone, Deep = (byte)BlockType.DarkStone,
                TreeChance = 0.055f, TreeKind = TreeKind.Canopy, GrassChance = 0.05f, Snow = false, WaterIce = false
            };

            Biomes[(int)BiomeId.BirchForest] = new BiomeGenDef
            {
                Id = BiomeId.BirchForest, Name = "Palewood", Temp = 0.42f, Humid = 0.55f, ContMin = 0.48f, ContMax = 1f,
                Surface = (byte)BlockType.Grass, Subsoil = (byte)BlockType.Dirt, Underground = (byte)BlockType.Stone, Deep = (byte)BlockType.DarkStone,
                TreeChance = 0.035f, TreeKind = TreeKind.Birch, GrassChance = 0.03f, Snow = false, WaterIce = false
            };

            Biomes[(int)BiomeId.Desert] = new BiomeGenDef
            {
                Id = BiomeId.Desert, Name = "Sunscorch", Temp = 0.85f, Humid = 0.15f, ContMin = 0.45f, ContMax = 1f,
                Surface = (byte)BlockType.Sand, Subsoil = (byte)BlockType.Sand, Underground = (byte)BlockType.Sand, Deep = (byte)BlockType.Stone,
                TreeChance = 0.012f, TreeKind = TreeKind.Cactus, GrassChance = 0f, Snow = false, WaterIce = false
            };

            Biomes[(int)BiomeId.Savanna] = new BiomeGenDef
            {
                Id = BiomeId.Savanna, Name = "Dryreach", Temp = 0.78f, Humid = 0.32f, ContMin = 0.48f, ContMax = 1f,
                Surface = (byte)BlockType.Grass, Subsoil = (byte)BlockType.Dirt, Underground = (byte)BlockType.Stone, Deep = (byte)BlockType.DarkStone,
                TreeChance = 0.015f, TreeKind = TreeKind.Oak, GrassChance = 0.02f, Snow = false, WaterIce = false
            };

            Biomes[(int)BiomeId.Jungle] = new BiomeGenDef
            {
                Id = BiomeId.Jungle, Name = "Verdant", Temp = 0.82f, Humid = 0.88f, ContMin = 0.5f, ContMax = 1f,
                Surface = (byte)BlockType.Grass, Subsoil = (byte)BlockType.Dirt, Underground = (byte)BlockType.Stone, Deep = (byte)BlockType.DarkStone,
                TreeChance = 0.05f, TreeKind = TreeKind.Jungle, GrassChance = 0.06f, Snow = false, WaterIce = false
            };

            Biomes[(int)BiomeId.Wetlands] = new BiomeGenDef
            {
                Id = BiomeId.Wetlands, Name = "Mirefen", Temp = 0.55f, Humid = 0.9f, ContMin = 0.4f, ContMax = 0.7f,
                Surface = (byte)BlockType.Moss, Subsoil = (byte)BlockType.Clay, Underground = (byte)BlockType.Stone, Deep = (byte)BlockType.DarkStone,
                TreeChance = 0.02f, TreeKind = TreeKind.Willow, GrassChance = 0.05f, Snow = false, WaterIce = false
            };

            Biomes[(int)BiomeId.Taiga] = new BiomeGenDef
            {
                Id = BiomeId.Taiga, Name = "Frostwood", Temp = 0.22f, Humid = 0.55f, ContMin = 0.48f, ContMax = 1f,
                Surface = (byte)BlockType.Grass, Subsoil = (byte)BlockType.Dirt, Underground = (byte)BlockType.Stone, Deep = (byte)BlockType.DarkStone,
                TreeChance = 0.035f, TreeKind = TreeKind.Pine, GrassChance = 0.02f, Snow = true, WaterIce = true
            };

            Biomes[(int)BiomeId.SnowyTaiga] = new BiomeGenDef
            {
                Id = BiomeId.SnowyTaiga, Name = "Snowpine", Temp = 0.12f, Humid = 0.5f, ContMin = 0.48f, ContMax = 1f,
                Surface = (byte)BlockType.Snow, Subsoil = (byte)BlockType.Dirt, Underground = (byte)BlockType.Stone, Deep = (byte)BlockType.DarkStone,
                TreeChance = 0.03f, TreeKind = TreeKind.Pine, GrassChance = 0f, Snow = true, WaterIce = true
            };

            Biomes[(int)BiomeId.Mountains] = new BiomeGenDef
            {
                Id = BiomeId.Mountains, Name = "Highreach", Temp = 0.3f, Humid = 0.35f, ContMin = 0.55f, ContMax = 1f,
                Surface = (byte)BlockType.Gravel, Subsoil = (byte)BlockType.Stone, Underground = (byte)BlockType.Stone, Deep = (byte)BlockType.DarkStone,
                TreeChance = 0.012f, TreeKind = TreeKind.Pine, GrassChance = 0f, Snow = false, WaterIce = false
            };

            Biomes[(int)BiomeId.SnowyMountains] = new BiomeGenDef
            {
                Id = BiomeId.SnowyMountains, Name = "Whitecap", Temp = 0.1f, Humid = 0.4f, ContMin = 0.55f, ContMax = 1f,
                Surface = (byte)BlockType.Snow, Subsoil = (byte)BlockType.Stone, Underground = (byte)BlockType.Stone, Deep = (byte)BlockType.DarkStone,
                TreeChance = 0.008f, TreeKind = TreeKind.Pine, GrassChance = 0f, Snow = true, WaterIce = true
            };

            Biomes[(int)BiomeId.Tundra] = new BiomeGenDef
            {
                Id = BiomeId.Tundra, Name = "Frostflat", Temp = 0.15f, Humid = 0.3f, ContMin = 0.45f, ContMax = 1f,
                Surface = (byte)BlockType.Snow, Subsoil = (byte)BlockType.Dirt, Underground = (byte)BlockType.Stone, Deep = (byte)BlockType.DarkStone,
                TreeChance = 0.005f, TreeKind = TreeKind.Oak, GrassChance = 0f, Snow = true, WaterIce = true
            };
        }

        private static readonly BiomeId[] LandBiomes = new BiomeId[]
        {
            BiomeId.Plains,
            BiomeId.Forest,
            BiomeId.DenseForest,
            BiomeId.BirchForest,
            BiomeId.Desert,
            BiomeId.Savanna,
            BiomeId.Jungle,
            BiomeId.Wetlands,
            BiomeId.Taiga,
            BiomeId.SnowyTaiga,
            BiomeId.Tundra
        };

        public static BiomeId SelectBiome(float cont, float temp, float humid, float river, float mountainFactor, int surfaceY)
        {
            if (river > 0.55f && cont > 0.42f && surfaceY < VoxelConstants.SeaLevel + 6) return BiomeId.River;
            if (cont < 0.28f) return BiomeId.DeepOcean;
            if (cont < 0.38f) return BiomeId.Ocean;
            if (cont < 0.46f && surfaceY <= VoxelConstants.SeaLevel + 3) return BiomeId.Beach;

            if (mountainFactor > 0.45f || (surfaceY > VoxelConstants.SeaLevel + 38 && cont > 0.5f))
            {
                if (temp < 0.28f || surfaceY > VoxelConstants.SeaLevel + 50) return BiomeId.SnowyMountains;
                return BiomeId.Mountains;
            }

            BiomeId best = BiomeId.Plains;
            float bestScore = float.MaxValue;

            for (int i = 0; i < LandBiomes.Length; i++)
            {
                var id = LandBiomes[i];
                var d = Biomes[(int)id];
                if (cont < d.ContMin || cont > d.ContMax) continue;

                float dt = temp - d.Temp;
                float dh = humid - d.Humid;
                float score = dt * dt * 1.4f + dh * dh;
                if (score < bestScore)
                {
                    bestScore = score;
                    best = id;
                }
            }

            // Extreme overrides
            if (temp < 0.18f && humid < 0.4f) return BiomeId.Tundra;
            if (temp < 0.22f && humid > 0.45f) return BiomeId.SnowyTaiga;
            if (temp > 0.72f && humid < 0.28f) return BiomeId.Desert;
            if (temp > 0.7f && humid > 0.75f) return BiomeId.Jungle;
            if (humid > 0.82f && cont < 0.72f) return BiomeId.Wetlands;
            if (temp > 0.68f && humid > 0.25f && humid < 0.45f) return BiomeId.Savanna;

            return best;
        }

        public static byte SurfaceBlockFor(BiomeId biome, int height, bool beach)
        {
            if (beach) return (byte)BlockType.Sand;
            if (height < VoxelConstants.SeaLevel)
            {
                if (height < VoxelConstants.SeaLevel - 14) return (byte)BlockType.DarkStone;
                if (height < VoxelConstants.SeaLevel - 7) return (byte)BlockType.Clay;
                return (byte)BlockType.Sand;
            }

            var def = Biomes[(int)biome];
            if (def.Snow && height > VoxelConstants.SeaLevel + 22) return (byte)BlockType.Snow;
            if (biome == BiomeId.Mountains)
            {
                if (height > VoxelConstants.SeaLevel + 42) return (byte)BlockType.Snow;
                if (height > VoxelConstants.SeaLevel + 28) return (byte)BlockType.Stone;
                return (byte)BlockType.Gravel;
            }
            if (biome == BiomeId.SnowyMountains && height > VoxelConstants.SeaLevel + 20) return (byte)BlockType.Snow;

            return def.Surface;
        }

        public static byte SubsoilFor(BiomeId biome, int height, bool beach)
        {
            if (beach || height < VoxelConstants.SeaLevel)
            {
                return height < VoxelConstants.SeaLevel - 8 ? (byte)BlockType.Stone : (byte)BlockType.Sand;
            }
            return Biomes[(int)biome].Subsoil;
        }

        public static int DirtDepth(BiomeId biome, double hash)
        {
            int baseDepth = biome == BiomeId.Desert ? 4 : (biome == BiomeId.Mountains ? 2 : 3);
            return baseDepth + (int)(hash * 3.0);
        }
    }
}

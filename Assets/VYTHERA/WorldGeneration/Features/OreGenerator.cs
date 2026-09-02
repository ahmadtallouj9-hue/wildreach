using System;
using VYTHERA.Core.Maths;
using VYTHERA.Voxel.Data;
using VYTHERA.Voxel.Storage;

namespace VYTHERA.WorldGeneration.Features
{
    public struct OreVeinDef
    {
        public string Id;
        public byte Block;
        public int MinY;
        public int MaxY;
        public int Attempts;
        public int VeinSize;
        public double Rarity;
    }

    public sealed class OreGenerator
    {
        private readonly uint _salt;

        public static readonly OreVeinDef[] OreDefs = new OreVeinDef[]
        {
            new OreVeinDef { Id = "coal", Block = (byte)BlockType.CoalOre, MinY = 10, MaxY = 120, Attempts = 8, VeinSize = 8, Rarity = 0.65 },
            new OreVeinDef { Id = "iron", Block = (byte)BlockType.IronOre, MinY = 6, MaxY = 70, Attempts = 5, VeinSize = 6, Rarity = 0.50 },
            new OreVeinDef { Id = "gravel", Block = (byte)BlockType.Gravel, MinY = 8, MaxY = 90, Attempts = 6, VeinSize = 6, Rarity = 0.55 },
            new OreVeinDef { Id = "clay", Block = (byte)BlockType.Clay, MinY = 20, MaxY = 70, Attempts = 4, VeinSize = 5, Rarity = 0.45 },
            new OreVeinDef { Id = "dark", Block = (byte)BlockType.DarkStone, MinY = 4, MaxY = 40, Attempts = 5, VeinSize = 5, Rarity = 0.50 },
            new OreVeinDef { Id = "crystal", Block = (byte)BlockType.Crystal, MinY = 4, MaxY = 28, Attempts = 2, VeinSize = 3, Rarity = 0.28 }
        };

        public OreGenerator(WorldSeed seed)
        {
            _salt = seed.Derive(SeedSalt.Ores);
        }

        public void PlaceVeins(int cx, int cz, byte[] voxels)
        {
            int ox = cx * VoxelConstants.ChunkSize;
            int oz = cz * VoxelConstants.ChunkSize;

            for (int o = 0; o < OreDefs.Length; o++)
            {
                var ore = OreDefs[o];
                for (int a = 0; a < ore.Attempts; a++)
                {
                    double r = WorldSeed.Hash3(cx, a, cz, WorldSeed.Mix32(_salt, (uint)(ore.Id.Length * 17 + a)));
                    if (r > ore.Rarity) continue;

                    int lx = (int)(WorldSeed.Hash3(cx, a * 3, cz, _salt + 1) * VoxelConstants.ChunkSize);
                    int lz = (int)(WorldSeed.Hash3(cx, a * 5, cz, _salt + 2) * VoxelConstants.ChunkSize);
                    int y = ore.MinY + (int)(WorldSeed.Hash3(cx, a * 7, cz, _salt + 3) * Math.Max(1, ore.MaxY - ore.MinY));

                    int x = ox + lx;
                    int yy = y;
                    int z = oz + lz;

                    for (int n = 0; n < ore.VeinSize; n++)
                    {
                        int llx = x - ox;
                        int llz = z - oz;
                        if ((uint)llx < VoxelConstants.ChunkSize && (uint)llz < VoxelConstants.ChunkSize && yy > 0 && yy < VoxelConstants.ChunkHeight)
                        {
                            int idx = ChunkData.GetIndex(llx, yy, llz);
                            byte b = voxels[idx];
                            if (b == (byte)BlockType.Stone || b == (byte)BlockType.DarkStone)
                            {
                                voxels[idx] = ore.Block;
                            }
                        }

                        double step = WorldSeed.Hash3(x, yy + n, z, _salt + (uint)n);
                        x += step < 0.33 ? -1 : (step < 0.66 ? 1 : 0);
                        z += step < 0.33 ? 0 : (step < 0.66 ? -1 : 1);
                        yy += step > 0.7 ? 1 : (step < 0.25 ? -1 : 0);
                        yy = Math.Clamp(yy, 1, VoxelConstants.ChunkHeight - 2);
                    }
                }
            }
        }
    }
}

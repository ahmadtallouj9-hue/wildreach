using System;
using UnityEngine;
using VYTHERA.Core.Maths;
using VYTHERA.Voxel.Data;
using VYTHERA.Voxel.Storage;
using VYTHERA.WorldGeneration.Biomes;

namespace VYTHERA.WorldGeneration.Decoration
{
    public sealed class VegetationGenerator
    {
        private readonly uint _salt;
        public const int SiteStep = 5;
        public const int TreeMargin = SiteStep + 6;

        public VegetationGenerator(WorldSeed seed)
        {
            _salt = seed.Derive(SeedSalt.Trees);
        }

        public static double VegHash(int x, int z, uint salt)
        {
            return WorldSeed.Hash3(x, 0, z, salt);
        }

        public void Decorate(
            int cx,
            int cz,
            byte[] voxels,
            ColumnInfo[] columns,
            Func<int, int, int> getHeight,
            Func<int, int, BiomeId> getBiome)
        {
            int ox = cx * VoxelConstants.ChunkSize;
            int oz = cz * VoxelConstants.ChunkSize;

            int minSiteX = (int)MathF.Floor((float)(ox - TreeMargin) / SiteStep);
            int maxSiteX = (int)MathF.Floor((float)(ox + VoxelConstants.ChunkSize + TreeMargin) / SiteStep);
            int minSiteZ = (int)MathF.Floor((float)(oz - TreeMargin) / SiteStep);
            int maxSiteZ = (int)MathF.Floor((float)(oz + VoxelConstants.ChunkSize + TreeMargin) / SiteStep);

            for (int sz = minSiteZ; sz <= maxSiteZ; sz++)
            {
                for (int sx = minSiteX; sx <= maxSiteX; sx++)
                {
                    double jx = VegHash(sx, sz, _salt + 1);
                    double jz = VegHash(sx, sz, _salt + 2);
                    int wx = sx * SiteStep + (int)(jx * (SiteStep - 1));
                    int wz = sz * SiteStep + (int)(jz * (SiteStep - 1));

                    var biome = getBiome(wx, wz);
                    var bDef = BiomeRegistry.Biomes[(int)biome];
                    if (bDef.TreeChance <= 0f) continue;

                    double roll = VegHash(wx, wz, _salt + 10);
                    if (roll > bDef.TreeChance * 8.0) continue;

                    int height = getHeight(wx, wz);
                    if (height < VoxelConstants.SeaLevel + 1 || height > VoxelConstants.ChunkHeight - 20) continue;

                    int y = height + 1;
                    int trunkHeight = 4 + (int)(VegHash(wx, wz, _salt + 20) * 3);

                    if (bDef.TreeKind == TreeKind.Cactus)
                    {
                        PlaceCactus(voxels, cx, cz, wx, y, wz, trunkHeight);
                    }
                    else if (bDef.TreeKind == TreeKind.Pine)
                    {
                        PlacePine(voxels, cx, cz, wx, y, wz, trunkHeight + 2);
                    }
                    else if (bDef.TreeKind == TreeKind.Birch)
                    {
                        PlaceBirch(voxels, cx, cz, wx, y, wz, trunkHeight);
                    }
                    else if (bDef.TreeKind == TreeKind.Willow)
                    {
                        PlaceWillow(voxels, cx, cz, wx, y, wz, trunkHeight);
                    }
                    else if (bDef.TreeKind == TreeKind.Jungle)
                    {
                        PlaceJungle(voxels, cx, cz, wx, y, wz, trunkHeight + 4);
                    }
                    else
                    {
                        PlaceOak(voxels, cx, cz, wx, y, wz, trunkHeight);
                    }
                }
            }
        }

        private void PlaceCactus(byte[] voxels, int cx, int cz, int wx, int y, int wz, int height)
        {
            for (int i = 0; i < height; i++)
            {
                SetWorld(voxels, cx, cz, wx, y + i, wz, (byte)BlockType.Wood);
            }
        }

        private void PlaceOak(byte[] voxels, int cx, int cz, int wx, int y, int wz, int height)
        {
            for (int i = 0; i < height; i++)
            {
                SetWorld(voxels, cx, cz, wx, y + i, wz, (byte)BlockType.Wood);
            }
            Crown(voxels, cx, cz, wx, y + height - 1, wz, 2, 3);
        }

        private void PlaceBirch(byte[] voxels, int cx, int cz, int wx, int y, int wz, int height)
        {
            for (int i = 0; i < height; i++)
            {
                SetWorld(voxels, cx, cz, wx, y + i, wz, (byte)BlockType.Wood);
            }
            Crown(voxels, cx, cz, wx, y + height - 1, wz, 2, 3);
        }

        private void PlacePine(byte[] voxels, int cx, int cz, int wx, int y, int wz, int height)
        {
            for (int i = 0; i < height; i++)
            {
                SetWorld(voxels, cx, cz, wx, y + i, wz, (byte)BlockType.Wood);
            }
            for (int i = 2; i <= height + 1; i++)
            {
                float t = 1f - (float)(i - 2) / Math.Max(1, height);
                int rad = Math.Max(1, (int)MathF.Round(t * 2.6f));
                LeafLayer(voxels, cx, cz, wx, y + i, wz, rad, i < height);
            }
            PutLeaf(voxels, cx, cz, wx, y + height + 2, wz);
            PutLeaf(voxels, cx, cz, wx, y + height + 3, wz);
        }

        private void PlaceWillow(byte[] voxels, int cx, int cz, int wx, int y, int wz, int height)
        {
            for (int i = 0; i < height; i++)
            {
                SetWorld(voxels, cx, cz, wx, y + i, wz, (byte)BlockType.Wood);
            }
            Crown(voxels, cx, cz, wx, y + height - 1, wz, 2, 2);
            for (int dx = -2; dx <= 2; dx++)
            {
                for (int dz = -2; dz <= 2; dz++)
                {
                    if (Math.Abs(dx) + Math.Abs(dz) < 2) continue;
                    int hang = 2 + (int)(VegHash(wx + dx, wz + dz, 3) * 2);
                    for (int i = 0; i < hang; i++)
                    {
                        PutLeaf(voxels, cx, cz, wx + dx, y + height - 1 - i, wz + dz);
                    }
                }
            }
        }

        private void PlaceJungle(byte[] voxels, int cx, int cz, int wx, int y, int wz, int height)
        {
            for (int i = 0; i < height; i++)
            {
                SetWorld(voxels, cx, cz, wx, y + i, wz, (byte)BlockType.Wood);
            }
            Crown(voxels, cx, cz, wx, y + height - 1, wz, 4, 4);
        }

        private void Crown(byte[] voxels, int cx, int cz, int x, int y, int z, int rad, int tall)
        {
            for (int dy = 0; dy < tall; dy++)
            {
                int r = dy == 0 || dy == tall - 1 ? Math.Max(1, rad - 1) : rad;
                LeafLayer(voxels, cx, cz, x, y + dy, z, r, dy == 0);
            }
            PutLeaf(voxels, cx, cz, x, y + tall, z);
        }

        private void LeafLayer(byte[] voxels, int cx, int cz, int x, int y, int z, int rad, bool keepTrunk)
        {
            for (int dx = -rad; dx <= rad; dx++)
            {
                for (int dz = -rad; dz <= rad; dz++)
                {
                    if (dx * dx + dz * dz > rad * rad + 1) continue;
                    if (keepTrunk && dx == 0 && dz == 0) continue;
                    if (Math.Abs(dx) == rad && Math.Abs(dz) == rad) continue;
                    PutLeaf(voxels, cx, cz, x + dx, y, z + dz);
                }
            }
        }

        private void PutLeaf(byte[] voxels, int cx, int cz, int wx, int y, int wz)
        {
            byte cur = GetWorld(voxels, cx, cz, wx, y, wz);
            if (cur == (byte)BlockType.Air || cur == (byte)BlockType.Leaves)
            {
                SetWorld(voxels, cx, cz, wx, y, wz, (byte)BlockType.Leaves);
            }
        }

        private void SetWorld(byte[] voxels, int cx, int cz, int wx, int y, int wz, byte b)
        {
            if ((uint)y >= VoxelConstants.ChunkHeight) return;
            int ox = cx * VoxelConstants.ChunkSize;
            int oz = cz * VoxelConstants.ChunkSize;
            int lx = wx - ox;
            int lz = wz - oz;
            if ((uint)lx >= VoxelConstants.ChunkSize || (uint)lz >= VoxelConstants.ChunkSize) return;
            voxels[ChunkData.GetIndex(lx, y, lz)] = b;
        }

        private byte GetWorld(byte[] voxels, int cx, int cz, int wx, int y, int wz)
        {
            if ((uint)y >= VoxelConstants.ChunkHeight) return (byte)BlockType.Air;
            int ox = cx * VoxelConstants.ChunkSize;
            int oz = cz * VoxelConstants.ChunkSize;
            int lx = wx - ox;
            int lz = wz - oz;
            if ((uint)lx >= VoxelConstants.ChunkSize || (uint)lz >= VoxelConstants.ChunkSize) return (byte)BlockType.Air;
            return voxels[ChunkData.GetIndex(lx, y, lz)];
        }
    }
}

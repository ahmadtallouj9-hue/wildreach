using System;
using System.Collections.Generic;
using VYTHERA.Voxel.Data;
using VYTHERA.Voxel.Storage;

namespace VYTHERA.Voxel.Lighting
{
    public static class LightEngine
    {
        public const byte SkyMax = 15;

        private struct LightNode
        {
            public int X;
            public int Y;
            public int Z;
            public byte Level;
        }

        public static void RebuildChunkLights(ChunkData chunk)
        {
            Array.Clear(chunk.SkyLight, 0, chunk.SkyLight.Length);
            Array.Clear(chunk.BlockLight, 0, chunk.BlockLight.Length);

            var emitters = new List<LightNode>(64);

            for (int z = 0; z < VoxelConstants.ChunkSize; z++)
            {
                for (int x = 0; x < VoxelConstants.ChunkSize; x++)
                {
                    byte sky = SkyMax;
                    for (int y = VoxelConstants.ChunkHeight - 1; y >= 0; y--)
                    {
                        int i = ChunkData.GetIndex(x, y, z);
                        byte b = chunk.Voxels[i];
                        if (!BlockUtility.LightPasses(b))
                        {
                            sky = 0;
                            chunk.SkyLight[i] = 0;
                        }
                        else
                        {
                            chunk.SkyLight[i] = sky > 0 ? sky : (byte)5;
                        }

                        byte em = BlockUtility.LightEmission(b);
                        if (em > 0)
                        {
                            chunk.BlockLight[i] = em;
                            emitters.Add(new LightNode { X = x, Y = y, Z = z, Level = em });
                        }
                    }
                }
            }

            // Local torch/crystal/lava glow (radius <= 8)
            int emitterCount = emitters.Count;
            for (int e = 0; e < emitterCount; e++)
            {
                var node = emitters[e];
                int r = Math.Min(8, (int)node.Level);

                for (int dy = -r; dy <= r; dy++)
                {
                    int y = node.Y + dy;
                    if ((uint)y >= VoxelConstants.ChunkHeight) continue;

                    for (int dz = -r; dz <= r; dz++)
                    {
                        int z = node.Z + dz;
                        if ((uint)z >= VoxelConstants.ChunkSize) continue;

                        for (int dx = -r; dx <= r; dx++)
                        {
                            int x = node.X + dx;
                            if ((uint)x >= VoxelConstants.ChunkSize) continue;

                            int dist = Math.Abs(dx) + Math.Abs(dy) + Math.Abs(dz);
                            if (dist == 0 || dist > r) continue;

                            int i = ChunkData.GetIndex(x, y, z);
                            if (!BlockUtility.LightPasses(chunk.Voxels[i])) continue;

                            byte lvl = (byte)(node.Level - dist);
                            if (lvl > chunk.BlockLight[i])
                            {
                                chunk.BlockLight[i] = lvl;
                            }
                        }
                    }
                }
            }

            chunk.IsLightsDirty = false;
        }
    }
}

using System;
using System.Collections.Generic;
using VYTHERA.Voxel.Data;
using VYTHERA.Voxel.Storage;

namespace VYTHERA.Voxel.Fluids
{
    public sealed class FluidSimulator
    {
        public const byte FluidSource = 8;
        public const byte FluidMin = 1;
        public const int DropSearch = 4;
        public const float TickInterval = 0.12f;
        public const int MaxUpdates = 192;

        private static readonly (int dx, int dz)[] DirsH = new (int, int)[]
        {
            (1, 0), (-1, 0), (0, 1), (0, -1)
        };

        private float _accumulator;

        public struct FluidUpdate
        {
            public int X;
            public int Y;
            public int Z;
            public byte Block;
            public byte Level;
        }

        public void Tick(
            float dt,
            Func<int, int, int, byte> getBlock,
            Action<int, int, int, byte, byte> setFluid,
            Func<int, int, int, byte> getFluidLevel,
            IReadOnlyList<ChunkData> activeChunks)
        {
            _accumulator += dt;
            if (_accumulator < TickInterval) return;
            _accumulator = 0f;

            var updates = new List<FluidUpdate>(MaxUpdates);

            for (int c = 0; c < activeChunks.Count; c++)
            {
                var chunk = activeChunks[c];
                if (!chunk.HasFluid || !chunk.IsReady) continue;

                int ox = chunk.Cx * VoxelConstants.ChunkSize;
                int oz = chunk.Cz * VoxelConstants.ChunkSize;

                for (int y = 1; y < VoxelConstants.ChunkHeight - 1; y++)
                {
                    for (int z = 0; z < VoxelConstants.ChunkSize; z++)
                    {
                        for (int x = 0; x < VoxelConstants.ChunkSize; x++)
                        {
                            int idx = ChunkData.GetIndex(x, y, z);
                            byte block = chunk.Voxels[idx];
                            if (!BlockUtility.IsFluid(block)) continue;

                            byte level = chunk.FluidLevel[idx];
                            if (level == 0) level = FluidSource;

                            int wx = ox + x;
                            int wz = oz + z;

                            byte below = getBlock(wx, y - 1, wz);

                            // Vertical flow down
                            if (below == (byte)BlockType.Air || (below == block && getFluidLevel(wx, y - 1, wz) < FluidSource))
                            {
                                updates.Add(new FluidUpdate { X = wx, Y = y - 1, Z = wz, Block = block, Level = FluidSource });
                                if (level < FluidSource)
                                {
                                    updates.Add(new FluidUpdate { X = wx, Y = y, Z = wz, Block = (byte)BlockType.Air, Level = 0 });
                                }
                                continue;
                            }

                            // Horizontal spread
                            if (BlockUtility.IsSolid(below) || (BlockUtility.IsFluid(below) && below != block) || below == block)
                            {
                                byte spreadCost = block == (byte)BlockType.Lava ? (byte)2 : (byte)1;
                                if (level <= spreadCost) continue;
                                byte nextLevel = (byte)(level - spreadCost);
                                if (nextLevel < FluidMin) continue;

                                for (int d = 0; d < 4; d++)
                                {
                                    int nx = wx + DirsH[d].dx;
                                    int nz = wz + DirsH[d].dz;
                                    byte nb = getBlock(nx, y, nz);
                                    if (nb == (byte)BlockType.Air)
                                    {
                                        updates.Add(new FluidUpdate { X = nx, Y = y, Z = nz, Block = block, Level = nextLevel });
                                    }
                                    else if (nb == block)
                                    {
                                        byte nl = getFluidLevel(nx, y, nz);
                                        if (nl < nextLevel)
                                        {
                                            updates.Add(new FluidUpdate { X = nx, Y = y, Z = nz, Block = block, Level = nextLevel });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            int count = Math.Min(updates.Count, MaxUpdates);
            for (int i = 0; i < count; i++)
            {
                var u = updates[i];
                setFluid(u.X, u.Y, u.Z, u.Block, u.Level);
            }
        }
    }
}

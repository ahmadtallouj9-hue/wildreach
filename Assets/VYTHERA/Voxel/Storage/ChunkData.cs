using System;
using System.Runtime.CompilerServices;
using VYTHERA.Voxel.Data;

namespace VYTHERA.Voxel.Storage
{
    /// <summary>
    /// Voxel data storage for a single 16x144x16 world column chunk.
    /// Flat array indexing: x + z * 16 + y * 256.
    /// </summary>
    public sealed class ChunkData
    {
        public int Cx { get; }
        public int Cz { get; }

        public byte[] Voxels { get; }
        public byte[] SkyLight { get; }
        public byte[] BlockLight { get; }
        public byte[] FluidLevel { get; }

        public ColumnInfo[] Columns { get; set; }

        public bool IsReady { get; set; }
        public bool IsMeshed { get; set; }
        public bool IsCollisionReady { get; set; }
        public bool IsLightsDirty { get; set; } = true;
        public bool HasFluid { get; set; }

        public ChunkData(int cx, int cz)
        {
            Cx = cx;
            Cz = cz;
            Voxels = new byte[VoxelConstants.ChunkVolume];
            SkyLight = new byte[VoxelConstants.ChunkVolume];
            BlockLight = new byte[VoxelConstants.ChunkVolume];
            FluidLevel = new byte[VoxelConstants.ChunkVolume];
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static int GetIndex(int x, int y, int z)
        {
            return x + z * VoxelConstants.ChunkSize + y * (VoxelConstants.ChunkSize * VoxelConstants.ChunkSize);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public byte GetLocal(int x, int y, int z)
        {
            if ((uint)x >= VoxelConstants.ChunkSize || (uint)z >= VoxelConstants.ChunkSize || (uint)y >= VoxelConstants.ChunkHeight)
            {
                return (byte)BlockType.Air;
            }
            return Voxels[GetIndex(x, y, z)];
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public bool SetLocal(int x, int y, int z, byte block)
        {
            if ((uint)x >= VoxelConstants.ChunkSize || (uint)z >= VoxelConstants.ChunkSize || (uint)y >= VoxelConstants.ChunkHeight)
            {
                return false;
            }
            int idx = GetIndex(x, y, z);
            Voxels[idx] = block;
            IsLightsDirty = true;
            return true;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public byte GetSkyLight(int x, int y, int z)
        {
            if ((uint)x >= VoxelConstants.ChunkSize || (uint)z >= VoxelConstants.ChunkSize || (uint)y >= VoxelConstants.ChunkHeight)
            {
                return 0;
            }
            return SkyLight[GetIndex(x, y, z)];
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public byte GetBlockLight(int x, int y, int z)
        {
            if ((uint)x >= VoxelConstants.ChunkSize || (uint)z >= VoxelConstants.ChunkSize || (uint)y >= VoxelConstants.ChunkHeight)
            {
                return 0;
            }
            return BlockLight[GetIndex(x, y, z)];
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public byte GetCombinedLight(int x, int y, int z)
        {
            return Math.Max(GetSkyLight(x, y, z), GetBlockLight(x, y, z));
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public byte GetFluidLevel(int x, int y, int z)
        {
            if ((uint)x >= VoxelConstants.ChunkSize || (uint)z >= VoxelConstants.ChunkSize || (uint)y >= VoxelConstants.ChunkHeight)
            {
                return 0;
            }
            return FluidLevel[GetIndex(x, y, z)];
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public void SetFluidLevel(int x, int y, int z, byte level)
        {
            if ((uint)x >= VoxelConstants.ChunkSize || (uint)z >= VoxelConstants.ChunkSize || (uint)y >= VoxelConstants.ChunkHeight)
            {
                return;
            }
            FluidLevel[GetIndex(x, y, z)] = level;
            HasFluid = true;
        }

        public void Clear()
        {
            Array.Clear(Voxels, 0, Voxels.Length);
            Array.Clear(SkyLight, 0, SkyLight.Length);
            Array.Clear(BlockLight, 0, BlockLight.Length);
            Array.Clear(FluidLevel, 0, FluidLevel.Length);
            IsReady = false;
            IsMeshed = false;
            IsCollisionReady = false;
            IsLightsDirty = true;
            HasFluid = false;
        }
    }
}

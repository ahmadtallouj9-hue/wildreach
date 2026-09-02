using System;

namespace VYTHERA.Voxel.Storage
{
    [Serializable]
    public struct ColumnInfo
    {
        public int Height;
        public byte Biome;
        public int Surface;
        public int Step; // 0..3 (terrain sub-voxel resolution)
    }
}

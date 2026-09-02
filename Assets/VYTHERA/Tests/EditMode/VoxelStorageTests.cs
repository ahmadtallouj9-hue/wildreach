using NUnit.Framework;
using VYTHERA.Voxel.Data;
using VYTHERA.Voxel.Storage;

namespace VYTHERA.Tests.EditMode
{
    public class VoxelStorageTests
    {
        [Test]
        public void ChunkData_SetAndGetLocal_StoresCorrectBlocks()
        {
            var chunk = new ChunkData(0, 0);

            chunk.SetLocal(0, 0, 0, (byte)BlockType.DarkStone);
            chunk.SetLocal(15, 143, 15, (byte)BlockType.Torch);
            chunk.SetLocal(8, 48, 8, (byte)BlockType.Water);

            Assert.AreEqual((byte)BlockType.DarkStone, chunk.GetLocal(0, 0, 0));
            Assert.AreEqual((byte)BlockType.Torch, chunk.GetLocal(15, 143, 15));
            Assert.AreEqual((byte)BlockType.Water, chunk.GetLocal(8, 48, 8));
        }

        [Test]
        public void ChunkData_OutOfBounds_ReturnsAirAndRejectsWrite()
        {
            var chunk = new ChunkData(0, 0);

            Assert.AreEqual((byte)BlockType.Air, chunk.GetLocal(-1, 50, 0));
            Assert.AreEqual((byte)BlockType.Air, chunk.GetLocal(16, 50, 0));
            Assert.AreEqual((byte)BlockType.Air, chunk.GetLocal(0, 150, 0));

            bool wrote = chunk.SetLocal(16, 50, 0, (byte)BlockType.Stone);
            Assert.IsFalse(wrote);
        }

        [Test]
        public void BlockUtility_IsSolidAndIsOpaque_MatchesGameRules()
        {
            Assert.IsTrue(BlockUtility.IsSolid(BlockType.Stone));
            Assert.IsTrue(BlockUtility.IsSolid(BlockType.Grass));
            Assert.IsFalse(BlockUtility.IsSolid(BlockType.Air));
            Assert.IsFalse(BlockUtility.IsSolid(BlockType.Water));
            Assert.IsFalse(BlockUtility.IsSolid(BlockType.Lava));
            Assert.IsFalse(BlockUtility.IsSolid(BlockType.Torch));

            Assert.IsTrue(BlockUtility.IsOpaque(BlockType.Stone));
            Assert.IsFalse(BlockUtility.IsOpaque(BlockType.Leaves));
            Assert.IsFalse(BlockUtility.IsOpaque(BlockType.Water));
            Assert.IsFalse(BlockUtility.IsOpaque(BlockType.Ice));
            Assert.IsFalse(BlockUtility.IsOpaque(BlockType.Crystal));
        }
    }
}

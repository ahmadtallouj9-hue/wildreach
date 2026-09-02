using NUnit.Framework;
using VYTHERA.Core.Maths;

namespace VYTHERA.Tests.EditMode
{
    public class NoiseDeterminismTests
    {
        [Test]
        public void WorldSeed_HashString32_MatchesDeterministicFNV1a()
        {
            uint hash1 = WorldSeed.HashString32("vythera-test-seed");
            uint hash2 = WorldSeed.HashString32("vythera-test-seed");
            Assert.AreEqual(hash1, hash2);
            Assert.AreNotEqual(0u, hash1);
        }

        [Test]
        public void Mulberry32_GeneratesDeterministicSequences()
        {
            var rng1 = new Mulberry32(12345u);
            var rng2 = new Mulberry32(12345u);

            for (int i = 0; i < 50; i++)
            {
                double v1 = rng1.NextDouble();
                double v2 = rng2.NextDouble();
                Assert.AreEqual(v1, v2, 1e-9);
                Assert.GreaterOrEqual(v1, 0.0);
                Assert.Less(v1, 1.0);
            }
        }

        [Test]
        public void SimplexNoise_Sample2D_IsDeterministicAndBounded()
        {
            var rng1 = new Mulberry32(999u);
            var noise = new SimplexNoise(ref rng1);

            float val1 = noise.Sample2D(12.5f, 45.2f);
            float val2 = noise.Sample2D(12.5f, 45.2f);

            Assert.AreEqual(val1, val2);
            Assert.GreaterOrEqual(val1, -2.0f);
            Assert.LessOrEqual(val1, 2.0f);
        }

        [Test]
        public void SimplexNoise_Sample3D_IsDeterministicAndBounded()
        {
            var rng1 = new Mulberry32(888u);
            var noise = new SimplexNoise(ref rng1);

            float val1 = noise.Sample3D(10.1f, 20.2f, 30.3f);
            float val2 = noise.Sample3D(10.1f, 20.2f, 30.3f);

            Assert.AreEqual(val1, val2);
            Assert.GreaterOrEqual(val1, -2.0f);
            Assert.LessOrEqual(val1, 2.0f);
        }
    }
}

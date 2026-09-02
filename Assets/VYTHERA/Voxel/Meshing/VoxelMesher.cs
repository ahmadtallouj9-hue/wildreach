using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using VYTHERA.Voxel.Data;
using VYTHERA.Voxel.Storage;

namespace VYTHERA.Voxel.Meshing
{
    public sealed class MeshDataBuffer
    {
        public readonly List<Vector3> Positions = new List<Vector3>(4096);
        public readonly List<Vector3> Normals = new List<Vector3>(4096);
        public readonly List<Vector2> UVs = new List<Vector2>(4096);
        public readonly List<Color32> Colors = new List<Color32>(4096);
        public readonly List<int> Indices = new List<int>(6144);

        public void Clear()
        {
            Positions.Clear();
            Normals.Clear();
            UVs.Clear();
            Colors.Clear();
            Indices.Clear();
        }

        public void AddQuad(
            Vector3 p0, Vector3 p1, Vector3 p2, Vector3 p3,
            Vector3 normal,
            Vector2 uv0, Vector2 uv1, Vector2 uv2, Vector2 uv3,
            Color32 c0, Color32 c1, Color32 c2, Color32 c3)
        {
            int start = Positions.Count;

            Positions.Add(p0);
            Positions.Add(p1);
            Positions.Add(p2);
            Positions.Add(p3);

            Normals.Add(normal);
            Normals.Add(normal);
            Normals.Add(normal);
            Normals.Add(normal);

            UVs.Add(uv0);
            UVs.Add(uv1);
            UVs.Add(uv2);
            UVs.Add(uv3);

            Colors.Add(c0);
            Colors.Add(c1);
            Colors.Add(c2);
            Colors.Add(c3);

            Indices.Add(start);
            Indices.Add(start + 1);
            Indices.Add(start + 2);
            Indices.Add(start);
            Indices.Add(start + 2);
            Indices.Add(start + 3);
        }

        public void ApplyToMesh(Mesh mesh)
        {
            mesh.Clear();
            if (Positions.Count == 0) return;

            mesh.indexFormat = Positions.Count > 65535 ? IndexFormat.UInt32 : IndexFormat.UInt16;
            mesh.SetVertices(Positions);
            mesh.SetNormals(Normals);
            mesh.SetUVs(0, UVs);
            mesh.SetColors(Colors);
            mesh.SetTriangles(Indices, 0);
            mesh.RecalculateBounds();
        }
    }

    public struct ChunkMeshOutput
    {
        public Mesh SolidMesh;
        public Mesh CutoutMesh;
        public Mesh WaterMesh;
        public Mesh LavaMesh;
    }

    public static class VoxelMesher
    {
        private static readonly Vector3[][] FaceCorners = new Vector3[][]
        {
            // Up (+Y)
            new Vector3[] { new Vector3(0, 1, 1), new Vector3(1, 1, 1), new Vector3(1, 1, 0), new Vector3(0, 1, 0) },
            // Down (-Y)
            new Vector3[] { new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(1, 0, 1), new Vector3(0, 0, 1) },
            // North (+Z)
            new Vector3[] { new Vector3(0, 0, 1), new Vector3(1, 0, 1), new Vector3(1, 1, 1), new Vector3(0, 1, 1) },
            // South (-Z)
            new Vector3[] { new Vector3(1, 0, 0), new Vector3(0, 0, 0), new Vector3(0, 1, 0), new Vector3(1, 1, 0) },
            // East (+X)
            new Vector3[] { new Vector3(1, 0, 1), new Vector3(1, 0, 0), new Vector3(1, 1, 0), new Vector3(1, 1, 1) },
            // West (-X)
            new Vector3[] { new Vector3(0, 0, 0), new Vector3(0, 0, 1), new Vector3(0, 1, 1), new Vector3(0, 1, 0) },
        };

        private static readonly Vector3[] FaceNormals = new Vector3[]
        {
            new Vector3(0, 1, 0),
            new Vector3(0, -1, 0),
            new Vector3(0, 0, 1),
            new Vector3(0, 0, -1),
            new Vector3(1, 0, 0),
            new Vector3(-1, 0, 0)
        };

        private static readonly (int dx, int dy, int dz)[] FaceDirs = new (int, int, int)[]
        {
            (0, 1, 0),
            (0, -1, 0),
            (0, 0, 1),
            (0, 0, -1),
            (1, 0, 0),
            (-1, 0, 0)
        };

        private static readonly float[] FaceShades = new float[]
        {
            1.0f, 0.72f, 0.92f, 0.90f, 0.94f, 0.90f
        };

        [ThreadStatic]
        private static MeshDataBuffer s_solid;
        [ThreadStatic]
        private static MeshDataBuffer s_cutout;
        [ThreadStatic]
        private static MeshDataBuffer s_water;
        [ThreadStatic]
        private static MeshDataBuffer s_lava;

        private static void EnsureBuffers()
        {
            s_solid ??= new MeshDataBuffer();
            s_cutout ??= new MeshDataBuffer();
            s_water ??= new MeshDataBuffer();
            s_lava ??= new MeshDataBuffer();
        }

        public static ChunkMeshOutput BuildChunkMesh(
            ChunkData chunk,
            Func<int, int, int, byte> getBlockNeighbor,
            Func<int, int, int, byte> getLightNeighbor,
            Func<int, int, int, int> getSurfaceStep)
        {
            EnsureBuffers();
            s_solid.Clear();
            s_cutout.Clear();
            s_water.Clear();
            s_lava.Clear();

            int ox = chunk.Cx * VoxelConstants.ChunkSize;
            int oz = chunk.Cz * VoxelConstants.ChunkSize;

            for (int y = 0; y < VoxelConstants.ChunkHeight; y++)
            {
                for (int z = 0; z < VoxelConstants.ChunkSize; z++)
                {
                    for (int x = 0; x < VoxelConstants.ChunkSize; x++)
                    {
                        int idx = ChunkData.GetIndex(x, y, z);
                        byte block = chunk.Voxels[idx];
                        if (block == (byte)BlockType.Air) continue;

                        int wx = ox + x;
                        int wz = oz + z;

                        // Torch rendering
                        if (block == (byte)BlockType.Torch)
                        {
                            AddTorch(s_cutout, wx, y, wz, getLightNeighbor);
                            continue;
                        }

                        bool isOpaque = BlockUtility.IsOpaque(block);
                        bool isFluid = BlockUtility.IsFluid(block);
                        var targetBuf = isFluid ? (block == (byte)BlockType.Water ? s_water : s_lava) : (isOpaque ? s_solid : s_cutout);

                        for (int f = 0; f < 6; f++)
                        {
                            var (dx, dy, dz) = FaceDirs[f];
                            byte nb = GetNeighbor(chunk, x + dx, y + dy, z + dz, ox, oz, getBlockNeighbor);

                            // Water / fluid face visibility: skip if neighbor is same fluid or opaque block
                            if (isFluid && (nb == block || BlockUtility.IsOpaque(nb))) continue;

                            if (!isFluid && !ShouldShowFace(block, nb, !isOpaque)) continue;

                            var corners = FaceCorners[f];
                            var normal = FaceNormals[f];
                            float shade = FaceShades[f];
                            byte light = getLightNeighbor != null ? getLightNeighbor(wx + dx, y + dy, wz + dz) : (byte)15;
                            float lit = isFluid ? 1f : MathF.Max(0.38f, (light / 15f) * 0.62f + shade * 0.38f);

                            Color32 baseCol = BlockUtility.GetBlockColor((BlockType)block, f);
                            byte r = (byte)Mathf.Clamp((int)(baseCol.r * lit), 0, 255);
                            byte g = (byte)Mathf.Clamp((int)(baseCol.g * lit), 0, 255);
                            byte bVal = (byte)Mathf.Clamp((int)(baseCol.b * lit), 0, 255);
                            Color32 color = new Color32(r, g, bVal, baseCol.a);

                            Vector3 p0 = new Vector3(wx + corners[0].x, y + corners[0].y, wz + corners[0].z);
                            Vector3 p1 = new Vector3(wx + corners[1].x, y + corners[1].y, wz + corners[1].z);
                            Vector3 p2 = new Vector3(wx + corners[2].x, y + corners[2].y, wz + corners[2].z);
                            Vector3 p3 = new Vector3(wx + corners[3].x, y + corners[3].y, wz + corners[3].z);

                            Vector2 uv0 = new Vector2(0, 0);
                            Vector2 uv1 = new Vector2(1, 0);
                            Vector2 uv2 = new Vector2(1, 1);
                            Vector2 uv3 = new Vector2(0, 1);

                            targetBuf.AddQuad(p0, p1, p2, p3, normal, uv0, uv1, uv2, uv3, color, color, color, color);
                        }
                    }
                }
            }

            var output = new ChunkMeshOutput
            {
                SolidMesh = new Mesh { name = $"Chunk_{chunk.Cx}_{chunk.Cz}_Solid" },
                CutoutMesh = new Mesh { name = $"Chunk_{chunk.Cx}_{chunk.Cz}_Cutout" },
                WaterMesh = new Mesh { name = $"Chunk_{chunk.Cx}_{chunk.Cz}_Water" },
                LavaMesh = new Mesh { name = $"Chunk_{chunk.Cx}_{chunk.Cz}_Lava" }
            };

            s_solid.ApplyToMesh(output.SolidMesh);
            s_cutout.ApplyToMesh(output.CutoutMesh);
            s_water.ApplyToMesh(output.WaterMesh);
            s_lava.ApplyToMesh(output.LavaMesh);

            return output;
        }

        private static byte GetNeighbor(ChunkData chunk, int lx, int ly, int lz, int ox, int oz, Func<int, int, int, byte> getBlockNeighbor)
        {
            if ((uint)lx < VoxelConstants.ChunkSize && (uint)lz < VoxelConstants.ChunkSize && (uint)ly < VoxelConstants.ChunkHeight)
            {
                return chunk.Voxels[ChunkData.GetIndex(lx, ly, lz)];
            }
            return getBlockNeighbor != null ? getBlockNeighbor(ox + lx, ly, oz + lz) : (byte)BlockType.Air;
        }

        private static bool ShouldShowFace(byte block, byte neighbor, bool transparent)
        {
            if (neighbor == (byte)BlockType.Air) return true;
            if (transparent)
            {
                return neighbor != block && !BlockUtility.IsOpaque(neighbor);
            }
            return !BlockUtility.IsOpaque(neighbor);
        }

        private static void AddTorch(MeshDataBuffer buf, int wx, int y, int wz, Func<int, int, int, byte> getLight)
        {
            byte light = getLight != null ? getLight(wx, y, wz) : (byte)15;
            byte cVal = (byte)Math.Max(230, (int)(light / 15f * 255f));
            Color32 color = new Color32(cVal, cVal, cVal, 255);

            const float pad = 0.2f;
            const float mid = 0.5f;
            const float y0 = 0f;
            const float y1 = 0.7f;

            // Quad 1
            Vector3 p0 = new Vector3(wx + pad, y + y0, wz + mid);
            Vector3 p1 = new Vector3(wx + 1f - pad, y + y0, wz + mid);
            Vector3 p2 = new Vector3(wx + 1f - pad, y + y1, wz + mid);
            Vector3 p3 = new Vector3(wx + pad, y + y1, wz + mid);
            buf.AddQuad(p0, p1, p2, p3, Vector3.forward, Vector2.zero, Vector2.right, Vector2.one, Vector2.up, color, color, color, color);

            // Quad 2
            Vector3 q0 = new Vector3(wx + mid, y + y0, wz + pad);
            Vector3 q1 = new Vector3(wx + mid, y + y0, wz + 1f - pad);
            Vector3 q2 = new Vector3(wx + mid, y + y1, wz + 1f - pad);
            Vector3 q3 = new Vector3(wx + mid, y + y1, wz + pad);
            buf.AddQuad(q0, q1, q2, q3, Vector3.right, Vector2.zero, Vector2.right, Vector2.one, Vector2.up, color, color, color, color);
        }
    }
}

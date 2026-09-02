using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;
using VYTHERA.Core.Quality;
using VYTHERA.Voxel.Data;
using VYTHERA.Voxel.Lighting;
using VYTHERA.Voxel.Meshing;
using VYTHERA.Voxel.Storage;
using VYTHERA.WorldGeneration.Pipeline;

namespace VYTHERA.World.Streaming
{
    public sealed class ChunkManager : MonoBehaviour
    {
        public static ChunkManager Instance { get; private set; }

        [Header("World Settings")]
        [SerializeField] private string _worldSeed = "vythera-default";
        [SerializeField] private Material _solidMaterial;
        [SerializeField] private Material _cutoutMaterial;
        [SerializeField] private Material _waterMaterial;
        [SerializeField] private Material _lavaMaterial;

        private readonly Dictionary<long, ChunkData> _chunks = new Dictionary<long, ChunkData>(512);
        private readonly Dictionary<long, GameObject> _chunkObjects = new Dictionary<long, GameObject>(512);
        private readonly HashSet<long> _loadingChunks = new HashSet<long>();
        private readonly List<ChunkData> _activeList = new List<ChunkData>(512);
        public readonly Dictionary<Vector3Int, byte> ModifiedBlocks = new Dictionary<Vector3Int, byte>();

        private ChunkPipeline _pipeline;
        private Transform _playerTransform;
        private int _lastPlayerCx = int.MinValue;
        private int _lastPlayerCz = int.MinValue;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;

            _pipeline = new ChunkPipeline(_worldSeed);
        }

        public void SetPlayer(Transform player)
        {
            _playerTransform = player;
        }

        public void SetSeed(string seed)
        {
            _worldSeed = seed;
            _pipeline = new ChunkPipeline(_worldSeed);
        }

        public void InitializeMaterials(Material solid, Material cutout, Material water, Material lava)
        {
            _solidMaterial = solid;
            _cutoutMaterial = cutout;
            _waterMaterial = water;
            _lavaMaterial = lava;
        }

        private void Update()
        {
            if (_playerTransform == null) return;

            Vector3 pos = _playerTransform.position;
            int pcx = (int)MathF.Floor(pos.x / VoxelConstants.ChunkSize);
            int pcz = (int)MathF.Floor(pos.z / VoxelConstants.ChunkSize);

            if (pcx != _lastPlayerCx || pcz != _lastPlayerCz)
            {
                _lastPlayerCx = pcx;
                _lastPlayerCz = pcz;
                UpdateChunkStreaming(pcx, pcz);
            }
        }

        public static long GetChunkKey(int cx, int cz)
        {
            return unchecked(((long)cx << 32) | (uint)cz);
        }

        public ChunkData GetChunk(int cx, int cz)
        {
            _chunks.TryGetValue(GetChunkKey(cx, cz), out var chunk);
            return chunk;
        }

        public byte GetBlock(int wx, int y, int wz)
        {
            if ((uint)y >= VoxelConstants.ChunkHeight) return (byte)BlockType.Air;
            int cx = (int)MathF.Floor((float)wx / VoxelConstants.ChunkSize);
            int cz = (int)MathF.Floor((float)wz / VoxelConstants.ChunkSize);
            var chunk = GetChunk(cx, cz);
            if (chunk == null) return (byte)BlockType.Air;

            int lx = wx - cx * VoxelConstants.ChunkSize;
            int lz = wz - cz * VoxelConstants.ChunkSize;
            return chunk.GetLocal(lx, y, lz);
        }

        public bool SetBlock(int wx, int y, int wz, byte block)
        {
            if ((uint)y >= VoxelConstants.ChunkHeight) return false;
            int cx = (int)MathF.Floor((float)wx / VoxelConstants.ChunkSize);
            int cz = (int)MathF.Floor((float)wz / VoxelConstants.ChunkSize);
            var chunk = GetChunk(cx, cz);
            if (chunk == null) return false;

            int lx = wx - cx * VoxelConstants.ChunkSize;
            int lz = wz - cz * VoxelConstants.ChunkSize;
            bool success = chunk.SetLocal(lx, y, lz, block);
            if (success)
            {
                ModifiedBlocks[new Vector3Int(wx, y, wz)] = block;
                LightEngine.RebuildChunkLights(chunk);
                RemeshChunk(chunk);

                // Remesh border neighbors if near edge
                if (lx == 0) RemeshChunk(GetChunk(cx - 1, cz));
                if (lx == VoxelConstants.ChunkSize - 1) RemeshChunk(GetChunk(cx + 1, cz));
                if (lz == 0) RemeshChunk(GetChunk(cx, cz - 1));
                if (lz == VoxelConstants.ChunkSize - 1) RemeshChunk(GetChunk(cx, cz + 1));

                // Remesh corner diagonal neighbors
                if (lx == 0 && lz == 0) RemeshChunk(GetChunk(cx - 1, cz - 1));
                if (lx == 0 && lz == VoxelConstants.ChunkSize - 1) RemeshChunk(GetChunk(cx - 1, cz + 1));
                if (lx == VoxelConstants.ChunkSize - 1 && lz == 0) RemeshChunk(GetChunk(cx + 1, cz - 1));
                if (lx == VoxelConstants.ChunkSize - 1 && lz == VoxelConstants.ChunkSize - 1) RemeshChunk(GetChunk(cx + 1, cz + 1));
            }
            return success;
        }

        private void UpdateChunkStreaming(int pcx, int pcz)
        {
            int dist = QualityManager.Current.RenderDistanceChunks;
            int distSq = dist * dist;

            // Load new chunks
            for (int dz = -dist; dz <= dist; dz++)
            {
                for (int dx = -dist; dx <= dist; dx++)
                {
                    if (dx * dx + dz * dz > distSq) continue;
                    int cx = pcx + dx;
                    int cz = pcz + dz;
                    long k = GetChunkKey(cx, cz);
                    if (!_chunks.ContainsKey(k) && !_loadingChunks.Contains(k))
                    {
                        LoadChunkAsync(cx, cz);
                    }
                }
            }

            // Unload far chunks
            var toRemove = new List<long>();
            foreach (var kvp in _chunks)
            {
                var chunk = kvp.Value;
                int dx = chunk.Cx - pcx;
                int dz = chunk.Cz - pcz;
                if (dx * dx + dz * dz > distSq + 4)
                {
                    toRemove.Add(kvp.Key);
                }
            }

            for (int i = 0; i < toRemove.Count; i++)
            {
                long k = toRemove[i];
                if (_chunkObjects.TryGetValue(k, out var go))
                {
                    Destroy(go);
                    _chunkObjects.Remove(k);
                }
                if (_chunks.TryGetValue(k, out var c))
                {
                    _activeList.Remove(c);
                    _chunks.Remove(k);
                }
            }
        }

        public ChunkData EnsureChunk(int cx, int cz)
        {
            long k = GetChunkKey(cx, cz);
            if (_chunks.TryGetValue(k, out var existing) && existing.IsReady)
            {
                return existing;
            }

            var chunk = new ChunkData(cx, cz);
            chunk.Columns = _pipeline.FillChunk(cx, cz, chunk.Voxels);
            ApplyUserModifications(chunk);
            LightEngine.RebuildChunkLights(chunk);
            chunk.IsReady = true;
            chunk.IsCollisionReady = true;

            _chunks[k] = chunk;
            if (!_activeList.Contains(chunk)) _activeList.Add(chunk);

            RemeshChunk(chunk);
            RemeshChunk(GetChunk(cx - 1, cz));
            RemeshChunk(GetChunk(cx + 1, cz));
            RemeshChunk(GetChunk(cx, cz - 1));
            RemeshChunk(GetChunk(cx, cz + 1));
            return chunk;
        }

        public Vector3 FindSafeSpawnPosition(int targetWx, int targetWz)
        {
            int centerCx = (int)MathF.Floor((float)targetWx / VoxelConstants.ChunkSize);
            int centerCz = (int)MathF.Floor((float)targetWz / VoxelConstants.ChunkSize);

            // 1. Ensure a 3x3 of chunks around spawn is synchronously generated and meshed
            for (int dz = -1; dz <= 1; dz++)
            {
                for (int dx = -1; dx <= 1; dx++)
                {
                    EnsureChunk(centerCx + dx, centerCz + dz);
                }
            }

            // 2. Search around targetWx, targetWz for valid solid surface with 2 air blocks above
            for (int r = 0; r <= 16; r++)
            {
                for (int dx = -r; dx <= r; dx++)
                {
                    for (int dz = -r; dz <= r; dz++)
                    {
                        if (r > 0 && Math.Abs(dx) != r && Math.Abs(dz) != r) continue;

                        int checkX = targetWx + dx;
                        int checkZ = targetWz + dz;

                        int cx = (int)MathF.Floor((float)checkX / VoxelConstants.ChunkSize);
                        int cz = (int)MathF.Floor((float)checkZ / VoxelConstants.ChunkSize);
                        var chunk = GetChunk(cx, cz);
                        if (chunk == null) continue;

                        int lx = checkX - cx * VoxelConstants.ChunkSize;
                        int lz = checkZ - cz * VoxelConstants.ChunkSize;

                        for (int y = VoxelConstants.ChunkHeight - 3; y >= 2; y--)
                        {
                            byte b = chunk.GetLocal(lx, y, lz);
                            if (b != (byte)BlockType.Air && b != (byte)BlockType.Water && b != (byte)BlockType.Lava && BlockUtility.IsSolid((BlockType)b))
                            {
                                byte above1 = chunk.GetLocal(lx, y + 1, lz);
                                byte above2 = chunk.GetLocal(lx, y + 2, lz);
                                if (above1 == (byte)BlockType.Air && above2 == (byte)BlockType.Air)
                                {
                                    return new Vector3(checkX + 0.5f, y + 1.0f, checkZ + 0.5f);
                                }
                            }
                        }
                    }
                }
            }

            // Fallback: terrain height
            int terrainHeight = _pipeline.GetHeight(targetWx, targetWz);
            return new Vector3(targetWx + 0.5f, MathF.Max(terrainHeight + 1.0f, 64f), targetWz + 0.5f);
        }

        private void ApplyUserModifications(ChunkData chunk)
        {
            if (ModifiedBlocks.Count == 0 || chunk == null) return;
            int minX = chunk.Cx * VoxelConstants.ChunkSize;
            int maxX = minX + VoxelConstants.ChunkSize - 1;
            int minZ = chunk.Cz * VoxelConstants.ChunkSize;
            int maxZ = minZ + VoxelConstants.ChunkSize - 1;

            foreach (var kvp in ModifiedBlocks)
            {
                var p = kvp.Key;
                if (p.x >= minX && p.x <= maxX && p.z >= minZ && p.z <= maxZ)
                {
                    chunk.SetLocal(p.x - minX, p.y, p.z - minZ, kvp.Value);
                }
            }
        }

        private async void LoadChunkAsync(int cx, int cz)
        {
            long k = GetChunkKey(cx, cz);
            if (_chunks.ContainsKey(k)) return;
            _loadingChunks.Add(k);

            var chunk = new ChunkData(cx, cz);

            await Task.Run(() =>
            {
                chunk.Columns = _pipeline.FillChunk(cx, cz, chunk.Voxels);
                ApplyUserModifications(chunk);
                LightEngine.RebuildChunkLights(chunk);
                chunk.IsReady = true;
                chunk.IsCollisionReady = true;
            });

            _loadingChunks.Remove(k);
            _chunks[k] = chunk;
            _activeList.Add(chunk);

            RemeshChunk(chunk);
            RemeshChunk(GetChunk(cx - 1, cz));
            RemeshChunk(GetChunk(cx + 1, cz));
            RemeshChunk(GetChunk(cx, cz - 1));
            RemeshChunk(GetChunk(cx, cz + 1));
        }

        private void RemeshChunk(ChunkData chunk)
        {
            if (chunk == null || !chunk.IsReady) return;

            var meshes = VoxelMesher.BuildChunkMesh(
                chunk,
                (wx, y, wz) => GetBlock(wx, y, wz),
                (wx, y, wz) =>
                {
                    int ccx = (int)MathF.Floor((float)wx / VoxelConstants.ChunkSize);
                    int ccz = (int)MathF.Floor((float)wz / VoxelConstants.ChunkSize);
                    var c = GetChunk(ccx, ccz);
                    if (c == null) return (byte)15;
                    int lx = wx - ccx * VoxelConstants.ChunkSize;
                    int lz = wz - ccz * VoxelConstants.ChunkSize;
                    return c.GetCombinedLight(lx, y, lz);
                },
                (wx, y, wz) =>
                {
                    int ccx = (int)MathF.Floor((float)wx / VoxelConstants.ChunkSize);
                    int ccz = (int)MathF.Floor((float)wz / VoxelConstants.ChunkSize);
                    var c = GetChunk(ccx, ccz);
                    if (c?.Columns == null) return 0;
                    int lx = wx - ccx * VoxelConstants.ChunkSize;
                    int lz = wz - ccz * VoxelConstants.ChunkSize;
                    if ((uint)lx < VoxelConstants.ChunkSize && (uint)lz < VoxelConstants.ChunkSize)
                    {
                        return c.Columns[lz * VoxelConstants.ChunkSize + lx].Step;
                    }
                    return 0;
                });

            long k = GetChunkKey(chunk.Cx, chunk.Cz);
            if (!_chunkObjects.TryGetValue(k, out var go))
            {
                go = new GameObject($"Chunk_{chunk.Cx}_{chunk.Cz}");
                go.transform.SetParent(transform);
                _chunkObjects[k] = go;

                CreateSubmeshObject(go, "Solid", meshes.SolidMesh, _solidMaterial, true);
                CreateSubmeshObject(go, "Cutout", meshes.CutoutMesh, _cutoutMaterial, true);
                CreateSubmeshObject(go, "Water", meshes.WaterMesh, _waterMaterial, false);
                CreateSubmeshObject(go, "Lava", meshes.LavaMesh, _lavaMaterial, false);
            }
            else
            {
                UpdateSubmeshObject(go, "Solid", meshes.SolidMesh, true);
                UpdateSubmeshObject(go, "Cutout", meshes.CutoutMesh, true);
                UpdateSubmeshObject(go, "Water", meshes.WaterMesh, false);
                UpdateSubmeshObject(go, "Lava", meshes.LavaMesh, false);
            }

            chunk.IsMeshed = true;
        }

        private void CreateSubmeshObject(GameObject parent, string name, Mesh mesh, Material mat, bool addCollider)
        {
            var child = new GameObject(name);
            child.transform.SetParent(parent.transform, false);

            var mf = child.AddComponent<MeshFilter>();
            mf.sharedMesh = mesh;

            var mr = child.AddComponent<MeshRenderer>();
            mr.sharedMaterial = mat;

            if (addCollider && mesh != null && mesh.vertexCount > 0)
            {
                var mc = child.AddComponent<MeshCollider>();
                mc.sharedMesh = mesh;
            }
        }

        private void UpdateSubmeshObject(GameObject parent, string name, Mesh mesh, bool updateCollider)
        {
            var child = parent.transform.Find(name);
            if (child == null) return;

            var mf = child.GetComponent<MeshFilter>();
            if (mf != null) mf.sharedMesh = mesh;

            if (updateCollider)
            {
                var mc = child.GetComponent<MeshCollider>();
                if (mc != null) mc.sharedMesh = (mesh != null && mesh.vertexCount > 0) ? mesh : null;
            }
        }
    }
}

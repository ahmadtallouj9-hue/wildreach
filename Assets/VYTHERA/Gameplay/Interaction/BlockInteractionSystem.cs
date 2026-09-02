using System;
using UnityEngine;
using UnityEngine.InputSystem;
using VYTHERA.Gameplay.Inventory;
using VYTHERA.Player.Physics;
using VYTHERA.Voxel.Data;
using VYTHERA.World.Streaming;

namespace VYTHERA.Gameplay.Interaction
{
    public struct VoxelRaycastHit
    {
        public bool Hit;
        public Vector3Int VoxelPos;
        public Vector3Int Normal;
        public byte BlockId;
        public float Distance;
    }

    public sealed class BlockInteractionSystem : MonoBehaviour
    {
        [SerializeField] private UnityEngine.Camera _camera;
        [SerializeField] private ChunkManager _chunks;
        [SerializeField] private InventorySystem _inventory;
        [SerializeField] private PlayerPhysics _physics;

        public const float MaxReach = PlayerConfig.Interaction.BlockReachDistance;
        public VoxelRaycastHit CurrentRaycastHit { get; private set; }
        private float _lastPlaceTime;

        private void Start()
        {
            if (_camera == null) _camera = UnityEngine.Camera.main;
            if (_chunks == null) _chunks = ChunkManager.Instance;
            if (_inventory == null) _inventory = GetComponent<InventorySystem>();
            if (_physics == null) _physics = GetComponent<PlayerPhysics>();
        }

        private void Update()
        {
            if (_camera == null || _chunks == null) return;

            var hit = RaycastVoxel(_camera.transform.position, _camera.transform.forward, MaxReach);
            CurrentRaycastHit = hit;

            var mouse = Mouse.current;
            var gamepad = Gamepad.current;

            bool breakTriggered = false;
            bool placeTriggered = false;

            if (mouse != null && (Cursor.lockState == CursorLockMode.Locked || Application.isMobilePlatform))
            {
                breakTriggered |= mouse.leftButton.wasPressedThisFrame;
                placeTriggered |= mouse.rightButton.isPressed;
            }

            if (gamepad != null)
            {
                breakTriggered |= gamepad.rightTrigger.wasPressedThisFrame || gamepad.buttonWest.wasPressedThisFrame;
                placeTriggered |= gamepad.leftTrigger.isPressed || gamepad.buttonNorth.isPressed;
            }

            // Left click / RT: Break Block
            if (breakTriggered && hit.Hit)
            {
                BreakBlock(hit.VoxelPos);
            }

            // Right click / LT: Place Block
            if (placeTriggered && Time.time - _lastPlaceTime >= PlayerConfig.Interaction.PlaceCooldown && hit.Hit)
            {
                PlaceBlock(hit.VoxelPos + hit.Normal);
            }
        }

        public VoxelRaycastHit RaycastVoxel(Vector3 origin, Vector3 direction, float maxDistance)
        {
            if (direction.sqrMagnitude < 0.0001f)
                return new VoxelRaycastHit { Hit = false };

            direction.Normalize();
            float dx = direction.x;
            float dy = direction.y;
            float dz = direction.z;

            int x = Mathf.FloorToInt(origin.x);
            int y = Mathf.FloorToInt(origin.y);
            int z = Mathf.FloorToInt(origin.z);

            int stepX = dx > 0f ? 1 : (dx < 0f ? -1 : 0);
            int stepY = dy > 0f ? 1 : (dy < 0f ? -1 : 0);
            int stepZ = dz > 0f ? 1 : (dz < 0f ? -1 : 0);

            float tMaxX = IntBound(origin.x, dx);
            float tMaxY = IntBound(origin.y, dy);
            float tMaxZ = IntBound(origin.z, dz);

            float tDeltaX = dx != 0f ? MathF.Abs(1f / dx) : float.PositiveInfinity;
            float tDeltaY = dy != 0f ? MathF.Abs(1f / dy) : float.PositiveInfinity;
            float tDeltaZ = dz != 0f ? MathF.Abs(1f / dz) : float.PositiveInfinity;

            Vector3Int normal = Vector3Int.zero;
            float dist = 0f;

            byte startBlock = _chunks.GetBlock(x, y, z);
            if (startBlock != (byte)BlockType.Air && startBlock != (byte)BlockType.Water && startBlock != (byte)BlockType.Lava)
            {
                return new VoxelRaycastHit
                {
                    Hit = true,
                    VoxelPos = new Vector3Int(x, y, z),
                    Normal = Vector3Int.up,
                    BlockId = startBlock,
                    Distance = 0f
                };
            }

            while (dist <= maxDistance)
            {
                if (tMaxX < tMaxY)
                {
                    if (tMaxX < tMaxZ)
                    {
                        x += stepX;
                        dist = tMaxX;
                        tMaxX += tDeltaX;
                        normal = new Vector3Int(-stepX, 0, 0);
                    }
                    else
                    {
                        z += stepZ;
                        dist = tMaxZ;
                        tMaxZ += tDeltaZ;
                        normal = new Vector3Int(0, 0, -stepZ);
                    }
                }
                else
                {
                    if (tMaxY < tMaxZ)
                    {
                        y += stepY;
                        dist = tMaxY;
                        tMaxY += tDeltaY;
                        normal = new Vector3Int(0, -stepY, 0);
                    }
                    else
                    {
                        z += stepZ;
                        dist = tMaxZ;
                        tMaxZ += tDeltaZ;
                        normal = new Vector3Int(0, 0, -stepZ);
                    }
                }

                if (dist > maxDistance) break;

                byte block = _chunks.GetBlock(x, y, z);
                if (block != (byte)BlockType.Air && block != (byte)BlockType.Water && block != (byte)BlockType.Lava)
                {
                    return new VoxelRaycastHit
                    {
                        Hit = true,
                        VoxelPos = new Vector3Int(x, y, z),
                        Normal = normal,
                        BlockId = block,
                        Distance = dist
                    };
                }
            }

            return new VoxelRaycastHit { Hit = false };
        }

        private static float IntBound(float s, float ds)
        {
            if (ds > 0f)
            {
                float floor = MathF.Floor(s);
                return (floor + 1f - s) / ds;
            }
            if (ds < 0f)
            {
                float floor = MathF.Floor(s);
                float diff = s - floor;
                return (diff <= 0.00001f ? 1f : diff) / -ds;
            }
            return float.PositiveInfinity;
        }

        private void BreakBlock(Vector3Int pos)
        {
            byte block = _chunks.GetBlock(pos.x, pos.y, pos.z);
            if (block == (byte)BlockType.Air) return;

            _chunks.SetBlock(pos.x, pos.y, pos.z, (byte)BlockType.Air);

            // Add item drop to inventory
            if (_inventory != null)
            {
                _inventory.AddItem(block, 1);
            }
        }

        private void PlaceBlock(Vector3Int pos)
        {
            if (_inventory == null) return;
            var held = _inventory.GetSelectedHotbarItem();
            if (held.IsEmpty) return;

            var def = ItemRegistry.Get(held.ItemId);
            if (def.PlaceableBlockId == 0) return;

            // Do not replace solid blocks
            byte existing = _chunks.GetBlock(pos.x, pos.y, pos.z);
            if (existing != (byte)BlockType.Air && existing != (byte)BlockType.Water && existing != (byte)BlockType.Lava)
                return;

            // Check player collision bounds
            if (_physics != null)
            {
                Vector3 p = _physics.Position;
                float half = PlayerConfig.Dimensions.Width * 0.5f;
                bool overlapsPlayer =
                    pos.x < p.x + half && pos.x + 1f > p.x - half &&
                    pos.z < p.z + half && pos.z + 1f > p.z - half &&
                    pos.y < p.y + _physics.CurrentHeight && pos.y + 1f > p.y;

                if (overlapsPlayer) return;
            }

            if (_chunks.SetBlock(pos.x, pos.y, pos.z, def.PlaceableBlockId))
            {
                _inventory.RemoveItem(held.ItemId, 1);
                _lastPlaceTime = Time.time;
            }
        }
    }
}

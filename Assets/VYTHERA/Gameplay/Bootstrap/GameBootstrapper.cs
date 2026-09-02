using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Rendering;
using VYTHERA.Core.Timing;
using VYTHERA.Core.Quality;
using VYTHERA.Gameplay.Combat;
using VYTHERA.Gameplay.Equipment;
using VYTHERA.Gameplay.Interaction;
using VYTHERA.Gameplay.Inventory;
using VYTHERA.Gameplay.Survival;
using VYTHERA.Player.Camera;
using VYTHERA.Player.Input;
using VYTHERA.Player.Physics;
using VYTHERA.Save;
using VYTHERA.UI;
using VYTHERA.World.Streaming;

namespace VYTHERA.Gameplay.Bootstrap
{
    /// <summary>
    /// Central runtime orchestrator. Placed on the "Bootstrap" GameObject in GameScene.
    /// Finds or creates every system, wires references, then triggers world load.
    /// </summary>
    [DefaultExecutionOrder(-100)]
    public sealed class GameBootstrapper : MonoBehaviour
    {
        public static GameBootstrapper Instance { get; private set; }

        [Header("World")]
        public string WorldSeed = "vythera-default";
        public Vector3 SpawnPosition = new Vector3(8f, 90f, 8f);

        [Header("Materials (auto-found if null)")]
        [SerializeField] private Material _solidMaterial;
        [SerializeField] private Material _cutoutMaterial;
        [SerializeField] private Material _waterMaterial;
        [SerializeField] private Material _lavaMaterial;

        // Cached system references
        private FixedTickManager _tickManager;
        private ChunkManager _chunkManager;
        private PlayerPhysics _player;
        private PlayerCameraRig _cameraRig;
        private PlayerInputHandler _inputHandler;
        private InventorySystem _inventory;
        private EquipmentSystem _equipment;
        private CombatSystem _combat;
        private SurvivalSystem _survival;
        private BlockInteractionSystem _interaction;
        private HUDManager _hud;

        public static string ConfiguredSeed;

        private const string SaveSeedKey = "VYTHERA_LastSeed";

        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;

            if (!string.IsNullOrEmpty(ConfiguredSeed))
            {
                WorldSeed = ConfiguredSeed;
            }
            else if (PlayerPrefs.HasKey(SaveSeedKey))
            {
                WorldSeed = PlayerPrefs.GetString(SaveSeedKey, WorldSeed);
            }

            QualityManager.ApplyTier(QualityManager.DetectDefaultTier());
        }

        private IEnumerator Start()
        {
            EnsureCoreSystems();
            EnsureMaterials();
            EnsureChunkManager();

            // 1. Determine safe spawn above confirmed terrain
            Vector3 safeSpawn = _chunkManager.FindSafeSpawnPosition((int)SpawnPosition.x, (int)SpawnPosition.z);
            SpawnPosition = safeSpawn;

            // 2. Initialize player and place safely above terrain
            EnsurePlayer();
            _player.Teleport(safeSpawn);

            // 3. Initialize camera, input, gameplay, and UI
            EnsureCamera();
            EnsureInput();
            EnsureGameplay();
            EnsureHUD();

            // Tell ChunkManager about player transform
            _chunkManager.SetPlayer(_player.transform);

            // Let one frame pass so chunk streaming starts
            yield return null;

            // Load save if exists (or keep safe spawn)
            TryLoadSave();

            Debug.Log($"[GameBootstrapper] All systems online. World: {WorldSeed} at safe spawn: {SpawnPosition}");
        }

        // ─── Core ───────────────────────────────────────────────────────────────

        private void EnsureCoreSystems()
        {
            _tickManager = FindAnyObjectByType<FixedTickManager>();
            if (_tickManager == null)
            {
                var go = new GameObject("FixedTickManager");
                DontDestroyOnLoad(go);
                _tickManager = go.AddComponent<FixedTickManager>();
            }

            if (FindAnyObjectByType<UnityEngine.EventSystems.EventSystem>() == null)
            {
                var esGo = new GameObject("EventSystem", typeof(UnityEngine.EventSystems.EventSystem), typeof(UnityEngine.InputSystem.UI.InputSystemUIInputModule));
            }

            if (VYTHERA.UI.Core.UIManager.Instance == null)
            {
                var uiMgrGo = new GameObject("UIManager", typeof(VYTHERA.UI.Core.UIManager));
            }

            // Bind scene Sun to RenderSettings
            var lights = FindObjectsByType<Light>(FindObjectsSortMode.None);
            for (int i = 0; i < lights.Length; i++)
            {
                if (lights[i].type == LightType.Directional)
                {
                    RenderSettings.sun = lights[i];
                    break;
                }
            }
        }

        // ─── Materials ──────────────────────────────────────────────────────────

        private void EnsureMaterials()
        {
            if (_solidMaterial == null)  _solidMaterial  = FindOrCreateMaterial("VYTHERA/VoxelSolid",  "VoxelSolid",  new Color(1f,   1f,   1f,   1f));
            if (_cutoutMaterial == null) _cutoutMaterial = FindOrCreateMaterial("VYTHERA/VoxelCutout", "VoxelCutout", new Color(1f,   1f,   1f,   1f));
            if (_waterMaterial == null)  _waterMaterial  = FindOrCreateMaterial("VYTHERA/VoxelWater",  "VoxelWater",  new Color(0.2f, 0.5f, 0.9f, 0.6f));
            if (_lavaMaterial == null)   _lavaMaterial   = FindOrCreateMaterial("VYTHERA/VoxelLava",   "VoxelLava",   new Color(1f,   0.4f, 0.1f, 1f));
        }

        private static Material FindOrCreateMaterial(string shaderName, string matName, Color color)
        {
            // Try loading from Resources first (runtime materials saved there by Editor setup)
            var loaded = Resources.Load<Material>("VythMaterials/" + matName);
            if (loaded != null) return loaded;

            // Fallback: create at runtime using the shader if available, else URP/Lit
            var shader = Shader.Find(shaderName) ?? Shader.Find("Universal Render Pipeline/Lit");
            var mat = new Material(shader) { name = matName };
            mat.color = color;
            if (shaderName.Contains("Water") || shaderName.Contains("Lava"))
            {
                // Set URP transparency mode
                mat.SetFloat("_Surface", 1);
                mat.SetFloat("_Blend", 0);
                mat.renderQueue = (int)RenderQueue.Transparent;
            }
            return mat;
        }

        // ─── Chunk Manager ──────────────────────────────────────────────────────

        private void EnsureChunkManager()
        {
            _chunkManager = FindAnyObjectByType<ChunkManager>();
            if (_chunkManager == null)
            {
                var go = new GameObject("ChunkManager");
                _chunkManager = go.AddComponent<ChunkManager>();
            }
            _chunkManager.SetSeed(WorldSeed);
            _chunkManager.InitializeMaterials(_solidMaterial, _cutoutMaterial, _waterMaterial, _lavaMaterial);
        }

        // ─── Player ─────────────────────────────────────────────────────────────

        private void EnsurePlayer()
        {
            _player = FindAnyObjectByType<PlayerPhysics>();
            if (_player == null)
            {
                var go = new GameObject("Player");
                go.tag = "Player";
                _player = go.AddComponent<PlayerPhysics>();
            }

            _player.transform.position = SpawnPosition;
            _player.Initialize(_chunkManager);
        }

        // ─── Camera ─────────────────────────────────────────────────────────────

        private void EnsureCamera()
        {
            _cameraRig = FindAnyObjectByType<PlayerCameraRig>();
            if (_cameraRig == null)
            {
                // Attach to player or create separate GO
                _cameraRig = _player.gameObject.AddComponent<PlayerCameraRig>();
            }

            // Ensure a camera exists
            var cam = UnityEngine.Camera.main;
            if (cam == null)
            {
                var camGO = new GameObject("MainCamera");
                camGO.tag = "MainCamera";
                cam = camGO.AddComponent<UnityEngine.Camera>();
                camGO.AddComponent<AudioListener>();
            }

            // Link via reflection-safe public field
            typeof(PlayerCameraRig)
                .GetField("_camera", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)
                ?.SetValue(_cameraRig, cam);

            typeof(PlayerCameraRig)
                .GetField("_physics", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)
                ?.SetValue(_cameraRig, _player);
        }

        // ─── Input ──────────────────────────────────────────────────────────────

        private void EnsureInput()
        {
            _inputHandler = FindAnyObjectByType<PlayerInputHandler>();
            if (_inputHandler == null)
                _inputHandler = _player.gameObject.AddComponent<PlayerInputHandler>();

            SetPrivateField(_inputHandler, "_physics", _player);
            SetPrivateField(_inputHandler, "_cameraRig", _cameraRig);
        }

        // ─── Gameplay Systems ───────────────────────────────────────────────────

        private void EnsureGameplay()
        {
            var playerGO = _player.gameObject;

            _inventory = GetOrAdd<InventorySystem>(playerGO);
            _equipment = GetOrAdd<EquipmentSystem>(playerGO);
            _combat    = GetOrAdd<CombatSystem>(playerGO);
            _survival  = GetOrAdd<SurvivalSystem>(playerGO);

            SetPrivateField(_combat, "_physics", _player);
            SetPrivateField(_combat, "_inventory", _inventory);

            _interaction = GetOrAdd<BlockInteractionSystem>(playerGO);
            SetPrivateField(_interaction, "_chunks", _chunkManager);
            SetPrivateField(_interaction, "_inventory", _inventory);
            SetPrivateField(_interaction, "_physics", _player);

            // Wire survival → damage on fall
            _player.OnLanded += (dist, block) =>
            {
                float safeDist = PlayerConfig.Damage.SafeFallDistance;
                if (dist > safeDist)
                {
                    float dmg = (dist - safeDist) * 2f;
                    _survival.TakeDamage(dmg);
                    _survival.AddExhaustion(PlayerConfig.Survival.ExhaustionJump);
                }
            };
        }

        // ─── HUD ────────────────────────────────────────────────────────────────

        private void EnsureHUD()
        {
            _hud = FindAnyObjectByType<HUDManager>();
            if (_hud == null)
            {
                var hudGO = HUDBuilder.BuildHUD();
                _hud = hudGO.GetComponent<HUDManager>();
            }
            SetPrivateField(_hud, "_survival", _survival);
            SetPrivateField(_hud, "_inventory", _inventory);
        }

        // ─── Save / Load ────────────────────────────────────────────────────────

        public bool SaveGame()
        {
            PlayerPrefs.SetString(SaveSeedKey, WorldSeed);
            bool success = SaveManager.SaveWorld(WorldSeed, _player, _survival, _inventory, _equipment, _chunkManager != null ? _chunkManager.ModifiedBlocks : null);
            Debug.Log("[GameBootstrapper] Game saved: " + success);
            return success;
        }

        private void TryLoadSave()
        {
            var data = SaveManager.LoadWorld(WorldSeed);
            if (data == null) return;

            if (data.ModifiedBlocks != null && _chunkManager != null)
            {
                foreach (var str in data.ModifiedBlocks)
                {
                    var parts = str.Split(':');
                    if (parts.Length == 2 && byte.TryParse(parts[1], out byte blockId))
                    {
                        var coords = parts[0].Split(',');
                        if (coords.Length == 3 &&
                            int.TryParse(coords[0], out int x) &&
                            int.TryParse(coords[1], out int y) &&
                            int.TryParse(coords[2], out int z))
                        {
                            _chunkManager.SetBlock(x, y, z, blockId);
                        }
                    }
                }
            }

            if (data.Health <= 0f || data.PlayerY < 1f || data.PlayerY > 250f)
            {
                Debug.Log("[GameBootstrapper] Saved player state was dead or invalid, placing at safe spawn position.");
                _player.Teleport(SpawnPosition);
                if (_survival != null)
                {
                    _survival.Health = 20f;
                    _survival.Hunger = 20f;
                }
                return;
            }

            int cx = Mathf.FloorToInt(data.PlayerX / 16f);
            int cz = Mathf.FloorToInt(data.PlayerZ / 16f);
            _chunkManager.EnsureChunk(cx, cz);

            _player.Teleport(new Vector3(data.PlayerX, data.PlayerY, data.PlayerZ));
            if (_cameraRig != null) { _cameraRig.Yaw = data.PlayerYaw; _cameraRig.Pitch = data.PlayerPitch; }
            if (_survival != null) { _survival.Health = data.Health; _survival.Hunger = data.Hunger; }
            Debug.Log("[GameBootstrapper] Save loaded successfully.");
        }

        // Auto-save on quit
        private void OnApplicationQuit() => SaveGame();

        // ─── Helpers ────────────────────────────────────────────────────────────

        private static T GetOrAdd<T>(GameObject go) where T : Component
        {
            var c = go.GetComponent<T>();
            return c != null ? c : go.AddComponent<T>();
        }

        private static void SetPrivateField(object obj, string fieldName, object value)
        {
            if (obj == null || value == null) return;
            var fi = obj.GetType().GetField(fieldName, System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
            fi?.SetValue(obj, value);
        }
    }
}

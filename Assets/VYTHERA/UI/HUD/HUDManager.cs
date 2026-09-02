using System;
using UnityEngine;
using UnityEngine.UI;
using VYTHERA.Gameplay.Bootstrap;
using VYTHERA.Gameplay.Interaction;
using VYTHERA.Gameplay.Inventory;
using VYTHERA.Gameplay.Survival;
using VYTHERA.Player.Camera;
using VYTHERA.Player.Physics;
using VYTHERA.UI.Core;
using VYTHERA.UI.Inventory;
using VYTHERA.UI.Pause;
using VYTHERA.UI.Settings;
using VYTHERA.Voxel.Data;

namespace VYTHERA.UI
{
    public sealed class HUDManager : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private SurvivalSystem _survival;
        [SerializeField] private InventorySystem _inventory;
        [SerializeField] private PlayerPhysics _player;
        [SerializeField] private PlayerCameraRig _cameraRig;
        [SerializeField] private BlockInteractionSystem _interaction;

        [Header("UI Elements")]
        [SerializeField] private Slider _healthBar;
        [SerializeField] private Text _healthText;
        [SerializeField] private Slider _hungerBar;
        [SerializeField] private Text _hungerText;
        [SerializeField] private RectTransform _hotbarHighlight;
        [SerializeField] private Image[] _hotbarSlots = new Image[9];
        [SerializeField] private Text[] _hotbarCounts = new Text[9];

        [Header("Telemetry & Look")]
        [SerializeField] private Text _coordsText;
        [SerializeField] private Text _compassText;
        [SerializeField] private Text _targetBlockText;
        [SerializeField] private Image _hurtFlash;
        [SerializeField] private GameObject _deathScreen;

        private float _hurtTimer = 0f;
        private float _previousHealth = 20f;

        private void Start()
        {
            if (_survival == null) _survival = FindAnyObjectByType<SurvivalSystem>();
            if (_inventory == null) _inventory = FindAnyObjectByType<InventorySystem>();
            if (_player == null) _player = FindAnyObjectByType<PlayerPhysics>();
            if (_cameraRig == null) _cameraRig = FindAnyObjectByType<PlayerCameraRig>();
            if (_interaction == null) _interaction = FindAnyObjectByType<BlockInteractionSystem>();

            // Ensure Inventory and Pause screens exist in scene
            if (FindAnyObjectByType<InventoryScreen>() == null)
            {
                var invGo = new GameObject("InventoryScreenRoot");
                invGo.transform.SetParent(transform, false);
                invGo.AddComponent<InventoryScreen>();
            }

            if (FindAnyObjectByType<PauseMenuScreen>() == null)
            {
                var pauseGo = new GameObject("PauseMenuScreenRoot");
                pauseGo.transform.SetParent(transform, false);
                pauseGo.AddComponent<PauseMenuScreen>();
            }

            if (FindAnyObjectByType<SettingsScreen>() == null)
            {
                var settingsGo = new GameObject("SettingsScreenRoot");
                settingsGo.transform.SetParent(transform, false);
                settingsGo.AddComponent<SettingsScreen>();
            }

            if (_survival != null)
            {
                _survival.OnHealthChanged += UpdateHealth;
                _survival.OnHungerChanged += UpdateHunger;
                _survival.OnDied += HandleDied;
                _previousHealth = _survival.Health;
                UpdateHealth(_survival.Health, 20f);
                UpdateHunger(_survival.Hunger, 5f);
            }

            if (_inventory != null)
            {
                _inventory.OnInventoryChanged += UpdateHotbar;
                _inventory.OnHotbarSelected += OnHotbarSelected;
                UpdateHotbar();
            }

            if (_deathScreen != null) _deathScreen.SetActive(false);
        }

        private void OnDestroy()
        {
            if (_survival != null)
            {
                _survival.OnHealthChanged -= UpdateHealth;
                _survival.OnHungerChanged -= UpdateHunger;
                _survival.OnDied -= HandleDied;
            }

            if (_inventory != null)
            {
                _inventory.OnInventoryChanged -= UpdateHotbar;
                _inventory.OnHotbarSelected -= OnHotbarSelected;
            }
        }

        private void Update()
        {
            // Coords & FPS
            if (_coordsText != null && _player != null)
            {
                var p = _player.Position;
                int fps = (int)(1f / Mathf.Max(0.0001f, Time.unscaledDeltaTime));
                _coordsText.text = $"XYZ: {p.x:F1} / {p.y:F1} / {p.z:F1}   FPS: {fps}";
            }

            // Direction Compass
            if (_compassText != null && _cameraRig != null)
            {
                float yaw = (_cameraRig.Yaw % 360f + 360f) % 360f;
                string dir = "N";
                if (yaw >= 337.5f || yaw < 22.5f) dir = "N";
                else if (yaw < 67.5f) dir = "NE";
                else if (yaw < 112.5f) dir = "E";
                else if (yaw < 157.5f) dir = "SE";
                else if (yaw < 202.5f) dir = "S";
                else if (yaw < 247.5f) dir = "SW";
                else if (yaw < 292.5f) dir = "W";
                else if (yaw < 337.5f) dir = "NW";

                _compassText.text = $"{dir} ({yaw:F0}°)";
            }

            // Target Block Raycast
            if (_targetBlockText != null && _interaction != null)
            {
                var hit = _interaction.CurrentRaycastHit;
                if (hit.Hit)
                {
                    var blockType = (BlockType)hit.BlockId;
                    _targetBlockText.text = $"Look: {blockType} at ({hit.VoxelPos.x}, {hit.VoxelPos.y}, {hit.VoxelPos.z})";
                }
                else
                {
                    _targetBlockText.text = "";
                }
            }

            // Hurt Vignette Flash
            if (_hurtTimer > 0f)
            {
                _hurtTimer -= Time.deltaTime;
                if (_hurtFlash != null)
                {
                    float a = Mathf.Clamp01(_hurtTimer / 0.35f) * 0.45f;
                    _hurtFlash.color = new Color(0.85f, 0.1f, 0.1f, a);
                }
            }
            else if (_hurtFlash != null && _hurtFlash.color.a > 0f)
            {
                _hurtFlash.color = Color.clear;
            }
        }

        private void UpdateHealth(float current, float max)
        {
            if (_healthBar != null) _healthBar.value = current / max;
            if (_healthText != null) _healthText.text = $"{(int)current} / {(int)max}";

            if (current < _previousHealth)
            {
                _hurtTimer = 0.35f;
            }
            _previousHealth = current;

            if (current <= 0f)
            {
                HandleDied();
            }
        }

        private void UpdateHunger(float current, float saturation)
        {
            if (_hungerBar != null) _hungerBar.value = current / 20f;
            if (_hungerText != null) _hungerText.text = $"{(int)current} / 20";
        }

        private void OnHotbarSelected(int index)
        {
            UpdateHotbar();
        }

        private void UpdateHotbar()
        {
            if (_inventory == null) return;

            int selected = _inventory.SelectedHotbarIndex;
            if (_hotbarHighlight != null && selected >= 0 && selected < _hotbarSlots.Length && _hotbarSlots[selected] != null)
            {
                _hotbarHighlight.position = _hotbarSlots[selected].rectTransform.position;
            }

            for (int i = 0; i < 9; i++)
            {
                var item = _inventory.GetHotbarSlot(i);
                if (_hotbarSlots[i] != null)
                {
                    if (item.IsEmpty)
                    {
                        _hotbarSlots[i].color = new Color(0.1f, 0.1f, 0.1f, 0.6f);
                    }
                    else
                    {
                        _hotbarSlots[i].color = BlockUtility.GetBlockColor((BlockType)item.ItemId, 0);
                    }
                }
                if (_hotbarCounts != null && i < _hotbarCounts.Length && _hotbarCounts[i] != null)
                {
                    _hotbarCounts[i].text = item.Count > 1 ? item.Count.ToString() : "";
                }
            }
        }

        private void HandleDied()
        {
            if (_deathScreen != null)
            {
                _deathScreen.SetActive(true);
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
            }
        }

        public void RespawnPlayer()
        {
            if (_deathScreen != null) _deathScreen.SetActive(false);

            var bootstrapper = FindAnyObjectByType<GameBootstrapper>();
            if (_player != null && bootstrapper != null)
            {
                _player.Teleport(bootstrapper.SpawnPosition);
            }
            if (_survival != null)
            {
                _survival.Health = 20f;
                _survival.Hunger = 20f;
                UpdateHealth(20f, 20f);
                UpdateHunger(20f, 5f);
            }

            if (!Application.isMobilePlatform)
            {
                Cursor.lockState = CursorLockMode.Locked;
                Cursor.visible = false;
            }
        }
    }
}
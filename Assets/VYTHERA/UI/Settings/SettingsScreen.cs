using System;
using UnityEngine;
using UnityEngine.UI;
using VYTHERA.Core.Quality;
using VYTHERA.Player.Input;
using VYTHERA.UI.Core;

namespace VYTHERA.UI.Settings
{
    public sealed class SettingsScreen : MonoBehaviour, IUIScreen
    {
        public string ScreenId => "Settings";

        private GameObject _rootPanel;
        private GameObject _generalPane;
        private GameObject _videoPane;
        private GameObject _controlsPane;
        private GameObject _aiPane;

        private void Awake()
        {
            BuildUI();
        }

        private void Start()
        {
            UIManager.Instance?.RegisterScreen(this);
            Hide();
        }

        private void OnDestroy()
        {
            UIManager.Instance?.UnregisterScreen(this);
        }

        public bool IsOpen => _rootPanel != null && _rootPanel.activeSelf;

        private void Update()
        {
            var keyboard = UnityEngine.InputSystem.Keyboard.current;
            if (IsOpen && keyboard != null && keyboard.escapeKey.wasPressedThisFrame)
            {
                Close();
            }
        }

        public void Show()
        {
            if (_rootPanel != null) _rootPanel.SetActive(true);
            ShowPane("video");
        }

        public void Hide()
        {
            if (_rootPanel != null) _rootPanel.SetActive(false);
        }

        public void Close()
        {
            Hide();
            UIManager.Instance?.CloseCurrentScreen();
        }

        private void ShowPane(string tab)
        {
            if (_generalPane != null) _generalPane.SetActive(tab == "general");
            if (_videoPane != null) _videoPane.SetActive(tab == "video");
            if (_controlsPane != null) _controlsPane.SetActive(tab == "controls");
            if (_aiPane != null) _aiPane.SetActive(tab == "ai");
        }

        private void BuildUI()
        {
            _rootPanel = UIWidgetFactory.CreatePanel(transform, "SettingsRoot", UIColors.ModalDim, Vector2.zero, Vector2.zero, Vector2.one);

            var sheet = UIWidgetFactory.CreatePanel(_rootPanel.transform, "Sheet", UIColors.SurfaceCard, new Vector2(720f, 620f), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f));

            // Header
            var backBtn = UIWidgetFactory.CreateButton(sheet.transform, "BtnBack", "Back", UIColors.SurfaceSolid, UIColors.Ink, () =>
            {
                Close();
            }, 80f, 36f);
            var bRt = backBtn.GetComponent<RectTransform>();
            bRt.anchorMin = new Vector2(0f, 1f);
            bRt.anchorMax = new Vector2(0f, 1f);
            bRt.anchoredPosition = new Vector2(60f, -32f);

            var title = UIWidgetFactory.CreateText(sheet.transform, "Title", "SETTINGS", 20, UIColors.Gold, TextAnchor.MiddleCenter);
            var tRt = title.GetComponent<RectTransform>();
            tRt.anchorMin = new Vector2(0.2f, 1f);
            tRt.anchorMax = new Vector2(0.8f, 1f);
            tRt.anchoredPosition = new Vector2(0f, -32f);

            // Tab bar
            var tabBar = new GameObject("TabBar", typeof(RectTransform), typeof(HorizontalLayoutGroup));
            tabBar.transform.SetParent(sheet.transform, false);
            var tbRt = tabBar.GetComponent<RectTransform>();
            tbRt.anchorMin = new Vector2(0.08f, 0.82f);
            tbRt.anchorMax = new Vector2(0.92f, 0.89f);
            tbRt.offsetMin = Vector2.zero;
            tbRt.offsetMax = Vector2.zero;

            var tbHlg = tabBar.GetComponent<HorizontalLayoutGroup>();
            tbHlg.spacing = 8f;
            tbHlg.childControlWidth = true;
            tbHlg.childForceExpandWidth = true;

            UIWidgetFactory.CreateButton(tabBar.transform, "TabVideo", "Video", UIColors.SurfaceSolid, UIColors.Gold, () => ShowPane("video"), 120f, 36f);
            UIWidgetFactory.CreateButton(tabBar.transform, "TabGeneral", "General", UIColors.SurfaceSolid, UIColors.Ink, () => ShowPane("general"), 120f, 36f);
            UIWidgetFactory.CreateButton(tabBar.transform, "TabControls", "Controls", UIColors.SurfaceSolid, UIColors.Ink, () => ShowPane("controls"), 120f, 36f);
            UIWidgetFactory.CreateButton(tabBar.transform, "TabAI", "Privacy & AI", UIColors.SurfaceSolid, UIColors.Ink, () => ShowPane("ai"), 120f, 36f);

            // Content Panes
            var contentRoot = UIWidgetFactory.CreatePanel(sheet.transform, "PanesArea", UIColors.SurfaceSolid, new Vector2(640f, 440f), new Vector2(0.5f, 0.44f), new Vector2(0.5f, 0.44f));

            // ── VIDEO PANE ──────────────────────────────────────────────────────────
            _videoPane = new GameObject("VideoPane", typeof(RectTransform), typeof(VerticalLayoutGroup));
            _videoPane.transform.SetParent(contentRoot.transform, false);
            var vpRt = _videoPane.GetComponent<RectTransform>();
            vpRt.anchorMin = Vector2.zero;
            vpRt.anchorMax = Vector2.one;
            vpRt.offsetMin = new Vector2(16f, 16f);
            vpRt.offsetMax = new Vector2(-16f, -16f);
            var vpVlg = _videoPane.GetComponent<VerticalLayoutGroup>();
            vpVlg.spacing = 10f;
            vpVlg.childControlWidth = true;
            vpVlg.childForceExpandWidth = true;

            // Quality Presets
            var presetRow = new GameObject("QualityPresetRow", typeof(RectTransform), typeof(HorizontalLayoutGroup));
            presetRow.transform.SetParent(_videoPane.transform, false);
            presetRow.GetComponent<RectTransform>().sizeDelta = new Vector2(0f, 40f);
            var prHlg = presetRow.GetComponent<HorizontalLayoutGroup>();
            prHlg.spacing = 6f;
            prHlg.childControlWidth = true;
            prHlg.childForceExpandWidth = true;

            string[] presets = { "Very Low", "Low", "Medium", "High", "Max" };
            for (int i = 0; i < presets.Length; i++)
            {
                var tier = (QualityTier)i;
                string label = presets[i];
                UIWidgetFactory.CreateButton(presetRow.transform, "Tier_" + label, label, UIColors.SurfaceCard, UIColors.Ink, () =>
                {
                    QualityManager.ApplyTier(tier);
                    Debug.Log($"[Settings] Applied Quality Tier: {tier}");
                }, 100f, 36f);
            }

            UIWidgetFactory.CreateSlider(_videoPane.transform, "SliderRenderDist", "Render Distance (chunks)", 3f, 8f, 7f, v =>
            {
                var p = QualityManager.Current;
                p.RenderDistanceChunks = Mathf.RoundToInt(v);
                QualityManager.ApplyProfile(p);
            });

            UIWidgetFactory.CreateSlider(_videoPane.transform, "SliderFOV", "Field of View", 60f, 100f, 75f, v =>
            {
                var rig = FindFirstObjectByType<Player.Camera.PlayerCameraRig>();
                if (rig != null) rig.SetBaseFov(v);
                if (Camera.main != null) Camera.main.fieldOfView = v;
            });

            UIWidgetFactory.CreateSlider(_videoPane.transform, "SliderBrightness", "Brightness", 0.6f, 1.4f, 1.0f, v =>
            {
                RenderSettings.ambientLight = new Color(v * 0.45f, v * 0.45f, v * 0.5f, 1f);
                var sun = RenderSettings.sun ?? FindFirstObjectByType<Light>();
                if (sun != null) sun.intensity = v * 1.1f;
            });

            // ── GENERAL PANE ────────────────────────────────────────────────────────
            _generalPane = new GameObject("GeneralPane", typeof(RectTransform), typeof(VerticalLayoutGroup));
            _generalPane.transform.SetParent(contentRoot.transform, false);
            var gpRt = _generalPane.GetComponent<RectTransform>();
            gpRt.anchorMin = Vector2.zero;
            gpRt.anchorMax = Vector2.one;
            gpRt.offsetMin = new Vector2(16f, 16f);
            gpRt.offsetMax = new Vector2(-16f, -16f);
            var gpVlg = _generalPane.GetComponent<VerticalLayoutGroup>();
            gpVlg.spacing = 10f;
            gpVlg.childControlWidth = true;

            UIWidgetFactory.CreateSlider(_generalPane.transform, "SliderMasterVol", "Master Volume", 0f, 1f, 1f, v =>
            {
                AudioListener.volume = v;
            });

            UIWidgetFactory.CreateText(_generalPane.transform, "TexturePackInfo", "Texture Pack: GoodVibes 32x (Acaitart CC-BY)", 14, UIColors.Muted);

            // ── CONTROLS PANE ───────────────────────────────────────────────────────
            _controlsPane = new GameObject("ControlsPane", typeof(RectTransform), typeof(VerticalLayoutGroup));
            _controlsPane.transform.SetParent(contentRoot.transform, false);
            var cpRt = _controlsPane.GetComponent<RectTransform>();
            cpRt.anchorMin = Vector2.zero;
            cpRt.anchorMax = Vector2.one;
            cpRt.offsetMin = new Vector2(16f, 16f);
            cpRt.offsetMax = new Vector2(-16f, -16f);
            var cpVlg = _controlsPane.GetComponent<VerticalLayoutGroup>();
            cpVlg.spacing = 10f;
            cpVlg.childControlWidth = true;

            UIWidgetFactory.CreateSlider(_controlsPane.transform, "SliderSens", "Mouse Look Sensitivity", 0.05f, 0.5f, 0.15f, v =>
            {
                var input = FindFirstObjectByType<PlayerInputHandler>();
                if (input != null) input.ControllerLookSensitivity = v * 800f;
            });

            UIWidgetFactory.CreateText(_controlsPane.transform, "KeybindsHelp", "Keybindings:\nWASD: Move\nSpace: Jump\nLeft Shift: Sprint\nLeft Ctrl / C: Sneak\nE: Inventory\nEsc: Pause / Menu\n1-9 / Scroll: Hotbar", 13, UIColors.InkDim);

            // ── AI & PRIVACY PANE ───────────────────────────────────────────────────
            _aiPane = new GameObject("AIPane", typeof(RectTransform), typeof(VerticalLayoutGroup));
            _aiPane.transform.SetParent(contentRoot.transform, false);
            var apRt = _aiPane.GetComponent<RectTransform>();
            apRt.anchorMin = Vector2.zero;
            apRt.anchorMax = Vector2.one;
            apRt.offsetMin = new Vector2(16f, 16f);
            apRt.offsetMax = new Vector2(-16f, -16f);
            var apVlg = _aiPane.GetComponent<VerticalLayoutGroup>();
            apVlg.spacing = 10f;
            apVlg.childControlWidth = true;

            UIWidgetFactory.CreateText(_aiPane.transform, "AITitle", "VYTHERA LOCAL ONLY NEURAL SUITE", 14, UIColors.Gold);
            UIWidgetFactory.CreateText(_aiPane.transform, "AIDesc", "All agent vision, world intelligence, and mod assistance run strictly on your local hardware.\nNo telemetry or private gameplay data is uploaded to remote servers.", 12, UIColors.Muted);
            UIWidgetFactory.CreateButton(_aiPane.transform, "BtnAIToggle", "Local AI: Active & Offline", UIColors.MossDim, UIColors.Moss, () =>
            {
                Debug.Log("[Settings] AI local state confirmed.");
            }, 240f, 40f);

            ShowPane("video");
        }
    }
}
using System;
using UnityEngine;
using UnityEngine.UI;
using VYTHERA.UI.Core;

namespace VYTHERA.UI.WorldCreation
{
    public sealed class WorldCreationScreen : MonoBehaviour, IUIScreen
    {
        public string ScreenId => "WorldCreation";

        private GameObject _rootPanel;
        private InputField _seedInput;
        private string _worldSeed = "vythera-default";
        private string _biomeType = "Plains";
        private bool _caves = true;
        private bool _structures = true;
        private string _timeOfDay = "Day";
        private int _renderDistance = 7;

        private void Awake()
        {
            _worldSeed = "vythera-" + UnityEngine.Random.Range(1000, 9999);
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

        public void Show()
        {
            if (_rootPanel != null) _rootPanel.SetActive(true);
            RandomizeSeed();
        }

        public void Hide()
        {
            if (_rootPanel != null) _rootPanel.SetActive(false);
        }

        private void RandomizeSeed()
        {
            _worldSeed = "vythera-" + UnityEngine.Random.Range(1000, 9999);
            if (_seedInput != null) _seedInput.text = _worldSeed;
        }

        private void BuildUI()
        {
            _rootPanel = UIWidgetFactory.CreatePanel(transform, "WorldCreationRoot", UIColors.ModalDim, Vector2.zero, Vector2.zero, Vector2.one);

            var sheet = UIWidgetFactory.CreatePanel(_rootPanel.transform, "Sheet", UIColors.SurfaceCard, new Vector2(680f, 580f), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f));

            // Header
            var backBtn = UIWidgetFactory.CreateButton(sheet.transform, "BtnBack", "Back", UIColors.SurfaceSolid, UIColors.Ink, () =>
            {
                Hide();
                UIManager.Instance?.CloseCurrentScreen();
            }, 80f, 36f);
            var bRt = backBtn.GetComponent<RectTransform>();
            bRt.anchorMin = new Vector2(0f, 1f);
            bRt.anchorMax = new Vector2(0f, 1f);
            bRt.anchoredPosition = new Vector2(60f, -32f);

            var title = UIWidgetFactory.CreateText(sheet.transform, "Title", "CREATE WORLD", 20, UIColors.Gold, TextAnchor.MiddleCenter);
            var tRt = title.GetComponent<RectTransform>();
            tRt.anchorMin = new Vector2(0.2f, 1f);
            tRt.anchorMax = new Vector2(0.8f, 1f);
            tRt.anchoredPosition = new Vector2(0f, -32f);

            // Options Form Container
            var form = new GameObject("Form", typeof(RectTransform), typeof(VerticalLayoutGroup));
            form.transform.SetParent(sheet.transform, false);
            var fRt = form.GetComponent<RectTransform>();
            fRt.anchorMin = new Vector2(0.08f, 0.16f);
            fRt.anchorMax = new Vector2(0.92f, 0.88f);
            fRt.offsetMin = Vector2.zero;
            fRt.offsetMax = Vector2.zero;

            var vlg = form.GetComponent<VerticalLayoutGroup>();
            vlg.spacing = 10f;
            vlg.childControlWidth = true;
            vlg.childControlHeight = false;
            vlg.childForceExpandWidth = true;

            // 1. Seed row
            var seedRow = new GameObject("SeedRow", typeof(RectTransform), typeof(HorizontalLayoutGroup));
            seedRow.transform.SetParent(form.transform, false);
            var srRt = seedRow.GetComponent<RectTransform>();
            srRt.sizeDelta = new Vector2(0f, 44f);
            var hlg = seedRow.GetComponent<HorizontalLayoutGroup>();
            hlg.spacing = 8f;
            hlg.childControlWidth = false;
            hlg.childControlHeight = true;

            UIWidgetFactory.CreateText(seedRow.transform, "LblSeed", "World Seed", 14, UIColors.InkDim);
            _seedInput = UIWidgetFactory.CreateInputField(seedRow.transform, "SeedInput", "Enter seed...", s => _worldSeed = s, 320f, 40f);
            _seedInput.text = _worldSeed;

            UIWidgetFactory.CreateButton(seedRow.transform, "BtnRandomSeed", "↻", UIColors.SurfaceSolid, UIColors.Gold, () =>
            {
                RandomizeSeed();
            }, 44f, 40f);

            // 2. World Type / Biome selector
            var biomeRow = new GameObject("BiomeRow", typeof(RectTransform), typeof(HorizontalLayoutGroup));
            biomeRow.transform.SetParent(form.transform, false);
            var brRt = biomeRow.GetComponent<RectTransform>();
            brRt.sizeDelta = new Vector2(0f, 40f);
            var bHlg = biomeRow.GetComponent<HorizontalLayoutGroup>();
            bHlg.spacing = 6f;
            bHlg.childControlWidth = false;

            UIWidgetFactory.CreateText(biomeRow.transform, "LblBiome", "World Type", 14, UIColors.InkDim);
            string[] biomes = { "Plains", "Forest", "Mountains", "Desert", "Ocean" };
            foreach (var b in biomes)
            {
                string curBiome = b;
                UIWidgetFactory.CreateButton(biomeRow.transform, "Biome_" + b, b, UIColors.SurfaceSolid, UIColors.Ink, () =>
                {
                    _biomeType = curBiome;
                    Debug.Log($"[WorldCreation] Selected biome: {_biomeType}");
                }, 90f, 36f);
            }

            // 3. Toggles: Caves & Structures
            var toggleRow = new GameObject("ToggleRow", typeof(RectTransform), typeof(HorizontalLayoutGroup));
            toggleRow.transform.SetParent(form.transform, false);
            var trRt = toggleRow.GetComponent<RectTransform>();
            trRt.sizeDelta = new Vector2(0f, 40f);
            var tHlg = toggleRow.GetComponent<HorizontalLayoutGroup>();
            tHlg.spacing = 14f;
            tHlg.childControlWidth = false;

            UIWidgetFactory.CreateText(toggleRow.transform, "LblToggles", "Generation", 14, UIColors.InkDim);
            var caveBtn = UIWidgetFactory.CreateButton(toggleRow.transform, "BtnCaves", "Caves: ON", UIColors.MossDim, UIColors.Moss, null, 140f, 36f);
            caveBtn.onClick.AddListener(() =>
            {
                _caves = !_caves;
                caveBtn.GetComponentInChildren<Text>().text = "Caves: " + (_caves ? "ON" : "OFF");
            });

            var structBtn = UIWidgetFactory.CreateButton(toggleRow.transform, "BtnStructs", "Structures: ON", UIColors.MossDim, UIColors.Moss, null, 150f, 36f);
            structBtn.onClick.AddListener(() =>
            {
                _structures = !_structures;
                structBtn.GetComponentInChildren<Text>().text = "Structures: " + (_structures ? "ON" : "OFF");
            });

            // 4. Starting Time
            var timeRow = new GameObject("TimeRow", typeof(RectTransform), typeof(HorizontalLayoutGroup));
            timeRow.transform.SetParent(form.transform, false);
            var tmRt = timeRow.GetComponent<RectTransform>();
            tmRt.sizeDelta = new Vector2(0f, 40f);
            var tmHlg = timeRow.GetComponent<HorizontalLayoutGroup>();
            tmHlg.spacing = 6f;
            tmHlg.childControlWidth = false;

            UIWidgetFactory.CreateText(timeRow.transform, "LblTime", "Time of Day", 14, UIColors.InkDim);
            string[] times = { "Day", "Noon", "Sunset", "Night" };
            foreach (var t in times)
            {
                string curTime = t;
                UIWidgetFactory.CreateButton(timeRow.transform, "Time_" + t, t, UIColors.SurfaceSolid, UIColors.Ink, () =>
                {
                    _timeOfDay = curTime;
                    Debug.Log($"[WorldCreation] Selected starting time: {_timeOfDay}");
                }, 85f, 36f);
            }

            // 5. Render Distance Slider
            UIWidgetFactory.CreateSlider(form.transform, "SliderRenderDist", "Render Distance (chunks)", 3f, 8f, _renderDistance, v =>
            {
                _renderDistance = (int)v;
            });

            // Create & Cancel Buttons
            var createBtn = UIWidgetFactory.CreateButton(sheet.transform, "BtnCreateWorld", "Create & Explore", UIColors.Gold, UIColors.Void, () =>
            {
                string seedToLoad = string.IsNullOrEmpty(_worldSeed) ? "vythera-default" : _worldSeed;
                UIManager.Instance?.LoadGameWorld(seedToLoad);
            }, 240f, 46f);
            var cbRt = createBtn.GetComponent<RectTransform>();
            cbRt.anchorMin = new Vector2(0.5f, 0f);
            cbRt.anchorMax = new Vector2(0.5f, 0f);
            cbRt.anchoredPosition = new Vector2(0f, 44f);
        }
    }
}
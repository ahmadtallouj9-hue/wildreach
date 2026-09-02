using UnityEngine;
using UnityEngine.UI;
using VYTHERA.UI.Core;

namespace VYTHERA.UI.WorldEditor
{
    public sealed class CustomWorldScreen : MonoBehaviour, IUIScreen
    {
        public string ScreenId => "CustomWorld";

        private GameObject _rootPanel;
        private float _continentalness = 0.5f;
        private float _erosion = 0.4f;
        private float _peaksAndValleys = 0.6f;
        private float _caveFrequency = 0.7f;
        private float _seaLevel = 48f;

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

        public void Show()
        {
            if (_rootPanel != null) _rootPanel.SetActive(true);
        }

        public void Hide()
        {
            if (_rootPanel != null) _rootPanel.SetActive(false);
        }

        private void BuildUI()
        {
            _rootPanel = UIWidgetFactory.CreatePanel(transform, "CustomWorldRoot", UIColors.ModalDim, Vector2.zero, Vector2.zero, Vector2.one);

            var sheet = UIWidgetFactory.CreatePanel(_rootPanel.transform, "Sheet", UIColors.SurfaceCard, new Vector2(700f, 580f), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f));

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

            var title = UIWidgetFactory.CreateText(sheet.transform, "Title", "CUSTOM WORLD GENERATOR", 20, UIColors.Gold, TextAnchor.MiddleCenter);
            var tRt = title.GetComponent<RectTransform>();
            tRt.anchorMin = new Vector2(0.2f, 1f);
            tRt.anchorMax = new Vector2(0.8f, 1f);
            tRt.anchoredPosition = new Vector2(0f, -32f);

            // Controls Column
            var form = new GameObject("Form", typeof(RectTransform), typeof(VerticalLayoutGroup));
            form.transform.SetParent(sheet.transform, false);
            var fRt = form.GetComponent<RectTransform>();
            fRt.anchorMin = new Vector2(0.08f, 0.16f);
            fRt.anchorMax = new Vector2(0.92f, 0.88f);
            fRt.offsetMin = Vector2.zero;
            fRt.offsetMax = Vector2.zero;

            var vlg = form.GetComponent<VerticalLayoutGroup>();
            vlg.spacing = 14f;
            vlg.childControlWidth = true;
            vlg.childForceExpandWidth = true;

            UIWidgetFactory.CreateText(form.transform, "Info", "Adjust procedural multi-octave noise parameters for custom terrain generation.", 13, UIColors.Muted);

            UIWidgetFactory.CreateSlider(form.transform, "SliderCont", "Continentalness (Land vs Ocean)", 0f, 1f, _continentalness, v => _continentalness = v);
            UIWidgetFactory.CreateSlider(form.transform, "SliderErosion", "Erosion (Flatness vs Ruggedness)", 0f, 1f, _erosion, v => _erosion = v);
            UIWidgetFactory.CreateSlider(form.transform, "SliderPeaks", "Peaks & Valleys (Mountain heights)", 0f, 1f, _peaksAndValleys, v => _peaksAndValleys = v);
            UIWidgetFactory.CreateSlider(form.transform, "SliderCaves", "Cave Frequency (Cheese & Spaghetti)", 0f, 1f, _caveFrequency, v => _caveFrequency = v);
            UIWidgetFactory.CreateSlider(form.transform, "SliderSea", "Sea Level (Y-coordinate)", 32f, 64f, _seaLevel, v => _seaLevel = v);

            // Generate Button
            var genBtn = UIWidgetFactory.CreateButton(sheet.transform, "BtnGenerate", "Generate Custom World", UIColors.Gold, UIColors.Void, () =>
            {
                string customSeed = "custom-" + UnityEngine.Random.Range(1000, 9999);
                UIManager.Instance?.LoadGameWorld(customSeed);
            }, 260f, 46f);
            var gRt = genBtn.GetComponent<RectTransform>();
            gRt.anchorMin = new Vector2(0.5f, 0f);
            gRt.anchorMax = new Vector2(0.5f, 0f);
            gRt.anchoredPosition = new Vector2(0f, 44f);
        }
    }
}
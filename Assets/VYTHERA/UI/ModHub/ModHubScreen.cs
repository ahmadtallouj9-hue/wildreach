using UnityEngine;
using UnityEngine.UI;
using VYTHERA.UI.Core;

namespace VYTHERA.UI.ModHub
{
    public sealed class ModHubScreen : MonoBehaviour, IUIScreen
    {
        public string ScreenId => "ModHub";

        private GameObject _rootPanel;
        private Transform _modsListContent;

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
            RefreshMods();
        }

        public void Hide()
        {
            if (_rootPanel != null) _rootPanel.SetActive(false);
        }

        private void BuildUI()
        {
            _rootPanel = UIWidgetFactory.CreatePanel(transform, "ModHubRoot", UIColors.ModalDim, Vector2.zero, Vector2.zero, Vector2.one);

            var sheet = UIWidgetFactory.CreatePanel(_rootPanel.transform, "Sheet", UIColors.SurfaceCard, new Vector2(720f, 600f), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f));

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

            var title = UIWidgetFactory.CreateText(sheet.transform, "Title", "MOD HUB — DISCOVER & MANAGE", 20, UIColors.Gold, TextAnchor.MiddleCenter);
            var tRt = title.GetComponent<RectTransform>();
            tRt.anchorMin = new Vector2(0.2f, 1f);
            tRt.anchorMax = new Vector2(0.8f, 1f);
            tRt.anchoredPosition = new Vector2(0f, -32f);

            // Scroll List
            var scrollArea = UIWidgetFactory.CreatePanel(sheet.transform, "ScrollArea", UIColors.SurfaceSolid, new Vector2(660f, 420f), new Vector2(0.5f, 0.48f), new Vector2(0.5f, 0.48f));
            var scrollRect = scrollArea.AddComponent<ScrollRect>();
            scrollRect.horizontal = false;
            scrollRect.vertical = true;

            var viewport = new GameObject("Viewport", typeof(RectTransform), typeof(Mask), typeof(Image));
            viewport.transform.SetParent(scrollArea.transform, false);
            var vpRt = viewport.GetComponent<RectTransform>();
            vpRt.anchorMin = Vector2.zero;
            vpRt.anchorMax = Vector2.one;
            vpRt.offsetMin = new Vector2(8f, 8f);
            vpRt.offsetMax = new Vector2(-8f, -8f);
            viewport.GetComponent<Image>().sprite = UIWidgetFactory.WhitePixel;

            var content = new GameObject("Content", typeof(RectTransform), typeof(VerticalLayoutGroup), typeof(ContentSizeFitter));
            content.transform.SetParent(viewport.transform, false);
            var cRt = content.GetComponent<RectTransform>();
            cRt.anchorMin = new Vector2(0f, 1f);
            cRt.anchorMax = new Vector2(1f, 1f);
            cRt.pivot = new Vector2(0.5f, 1f);

            var vlg = content.GetComponent<VerticalLayoutGroup>();
            vlg.spacing = 8f;
            vlg.childControlWidth = true;
            vlg.childForceExpandWidth = true;

            var csf = content.GetComponent<ContentSizeFitter>();
            csf.verticalFit = ContentSizeFitter.FitMode.PreferredSize;

            scrollRect.content = cRt;
            scrollRect.viewport = vpRt;
            _modsListContent = content.transform;

            // Import Button
            var importBtn = UIWidgetFactory.CreateButton(sheet.transform, "BtnImport", "Install Mod Package (.vymod)", UIColors.Gold, UIColors.Void, () =>
            {
                Debug.Log("[ModHub] Open file dialog for .vymod packages.");
            }, 260f, 44f);
            var iRt = importBtn.GetComponent<RectTransform>();
            iRt.anchorMin = new Vector2(0.5f, 0f);
            iRt.anchorMax = new Vector2(0.5f, 0f);
            iRt.anchoredPosition = new Vector2(0f, 40f);
        }

        private void RefreshMods()
        {
            // Create default native engine modules
            CreateModRow("Core Game Assets", "VYTHERA Native Core Engine", "Active", true);
            CreateModRow("GoodVibes Texture Pack", "32x Hand-painted terrain textures by Acaitart", "Active", true);
            CreateModRow("Survival Mechanics Expansion", "Hunger, health regeneration, and tools", "Active", true);
        }

        private void CreateModRow(string name, string desc, string status, bool enabled)
        {
            var row = UIWidgetFactory.CreateRowButton(_modsListContent, "Row_" + name, name, status, () =>
            {
                Debug.Log($"[ModHub] Toggled mod: {name}");
            });
        }
    }
}
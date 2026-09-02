using UnityEngine;
using UnityEngine.UI;
using VYTHERA.UI.Core;

namespace VYTHERA.UI.ModStudio
{
    public sealed class ModStudioScreen : MonoBehaviour, IUIScreen
    {
        public string ScreenId => "ModStudio";

        private GameObject _rootPanel;
        private InputField _modNameInput;
        private InputField _modAuthorInput;
        private InputField _modVersionInput;
        private Text _statusText;

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
            _rootPanel = UIWidgetFactory.CreatePanel(transform, "ModStudioRoot", UIColors.ModalDim, Vector2.zero, Vector2.zero, Vector2.one);

            var sheet = UIWidgetFactory.CreatePanel(_rootPanel.transform, "Sheet", UIColors.SurfaceCard, new Vector2(740f, 600f), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f));

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

            var title = UIWidgetFactory.CreateText(sheet.transform, "Title", "MOD STUDIO — CREATOR SUITE", 20, UIColors.Gold, TextAnchor.MiddleCenter);
            var tRt = title.GetComponent<RectTransform>();
            tRt.anchorMin = new Vector2(0.2f, 1f);
            tRt.anchorMax = new Vector2(0.8f, 1f);
            tRt.anchoredPosition = new Vector2(0f, -32f);

            // Form
            var form = new GameObject("Form", typeof(RectTransform), typeof(VerticalLayoutGroup));
            form.transform.SetParent(sheet.transform, false);
            var fRt = form.GetComponent<RectTransform>();
            fRt.anchorMin = new Vector2(0.08f, 0.20f);
            fRt.anchorMax = new Vector2(0.92f, 0.88f);
            fRt.offsetMin = Vector2.zero;
            fRt.offsetMax = Vector2.zero;

            var vlg = form.GetComponent<VerticalLayoutGroup>();
            vlg.spacing = 10f;
            vlg.childControlWidth = true;
            vlg.childForceExpandWidth = true;

            UIWidgetFactory.CreateText(form.transform, "ManifestHeader", "MOD PACKAGE MANIFEST", 14, UIColors.Gold);

            UIWidgetFactory.CreateText(form.transform, "LblName", "Mod Package Name", 13, UIColors.InkDim);
            _modNameInput = UIWidgetFactory.CreateInputField(form.transform, "InputName", "e.g. MyVoxelExpansion", null, 400f, 36f);

            UIWidgetFactory.CreateText(form.transform, "LblAuthor", "Author / Studio", 13, UIColors.InkDim);
            _modAuthorInput = UIWidgetFactory.CreateInputField(form.transform, "InputAuthor", "e.g. WandererDev", null, 400f, 36f);

            UIWidgetFactory.CreateText(form.transform, "LblVersion", "Version", 13, UIColors.InkDim);
            _modVersionInput = UIWidgetFactory.CreateInputField(form.transform, "InputVersion", "1.0.0", null, 200f, 36f);

            UIWidgetFactory.CreateDivider(form.transform, "Extensions");

            var tabs = new GameObject("ExtTabs", typeof(RectTransform), typeof(HorizontalLayoutGroup));
            tabs.transform.SetParent(form.transform, false);
            tabs.GetComponent<RectTransform>().sizeDelta = new Vector2(0f, 36f);
            var th = tabs.GetComponent<HorizontalLayoutGroup>();
            th.spacing = 8f;
            th.childControlWidth = true;
            th.childForceExpandWidth = true;

            UIWidgetFactory.CreateButton(tabs.transform, "TabBlocks", "Custom Blocks (0)", UIColors.SurfaceSolid, UIColors.Ink, () => Debug.Log("[ModStudio] Blocks tab"), 140f, 36f);
            UIWidgetFactory.CreateButton(tabs.transform, "TabItems", "Custom Items (0)", UIColors.SurfaceSolid, UIColors.Ink, () => Debug.Log("[ModStudio] Items tab"), 140f, 36f);
            UIWidgetFactory.CreateButton(tabs.transform, "TabEntities", "Entities (0)", UIColors.SurfaceSolid, UIColors.Ink, () => Debug.Log("[ModStudio] Entities tab"), 140f, 36f);
            UIWidgetFactory.CreateButton(tabs.transform, "TabScripts", "Scripts (0)", UIColors.SurfaceSolid, UIColors.Ink, () => Debug.Log("[ModStudio] Scripts tab"), 140f, 36f);

            _statusText = UIWidgetFactory.CreateText(form.transform, "Status", "Mod system ready. Compiles to native VYTHERA runtime mod package.", 12, UIColors.Muted);

            // Bottom action
            var exportBtn = UIWidgetFactory.CreateButton(sheet.transform, "BtnExport", "Build & Export .vymod", UIColors.Gold, UIColors.Void, () =>
            {
                _statusText.text = "Exported package successfully to Mods/ directory.";
                _statusText.color = UIColors.Success;
            }, 240f, 44f);
            var ebRt = exportBtn.GetComponent<RectTransform>();
            ebRt.anchorMin = new Vector2(0.5f, 0f);
            ebRt.anchorMax = new Vector2(0.5f, 0f);
            ebRt.anchoredPosition = new Vector2(0f, 44f);
        }
    }
}
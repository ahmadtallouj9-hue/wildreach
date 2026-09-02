using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using VYTHERA.Save;
using VYTHERA.UI.Core;

namespace VYTHERA.UI.WorldSelect
{
    public sealed class WorldSelectScreen : MonoBehaviour, IUIScreen
    {
        public string ScreenId => "WorldSelect";

        private GameObject _rootPanel;
        private Transform _worldListContent;
        private string _selectedSeed;
        private Button _playBtn;
        private Button _deleteBtn;
        private readonly List<GameObject> _rowObjects = new List<GameObject>();

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
            RefreshWorldList();
        }

        public void Hide()
        {
            if (_rootPanel != null) _rootPanel.SetActive(false);
        }

        private void BuildUI()
        {
            _rootPanel = UIWidgetFactory.CreatePanel(transform, "WorldSelectRoot", UIColors.ModalDim, Vector2.zero, Vector2.zero, Vector2.one);

            var sheet = UIWidgetFactory.CreatePanel(_rootPanel.transform, "Sheet", UIColors.SurfaceCard, new Vector2(720f, 620f), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f));

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

            var title = UIWidgetFactory.CreateText(sheet.transform, "Title", "SAVED WORLDS", 20, UIColors.Gold, TextAnchor.MiddleCenter);
            var tRt = title.GetComponent<RectTransform>();
            tRt.anchorMin = new Vector2(0.2f, 1f);
            tRt.anchorMax = new Vector2(0.8f, 1f);
            tRt.anchoredPosition = new Vector2(0f, -32f);

            // Scrollable List Area
            var scrollArea = UIWidgetFactory.CreatePanel(sheet.transform, "ScrollArea", UIColors.SurfaceSolid, new Vector2(660f, 440f), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f));
            var saRt = scrollArea.GetComponent<RectTransform>();
            saRt.anchoredPosition = new Vector2(0f, 10f);

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
            cRt.sizeDelta = new Vector2(0f, 400f);

            var vlg = content.GetComponent<VerticalLayoutGroup>();
            vlg.spacing = 6f;
            vlg.childControlWidth = true;
            vlg.childControlHeight = false;
            vlg.childForceExpandWidth = true;

            var csf = content.GetComponent<ContentSizeFitter>();
            csf.verticalFit = ContentSizeFitter.FitMode.PreferredSize;

            scrollRect.content = cRt;
            scrollRect.viewport = vpRt;
            _worldListContent = content.transform;

            // Bottom Actions
            _playBtn = UIWidgetFactory.CreateButton(sheet.transform, "BtnPlay", "Play World", UIColors.Gold, UIColors.Void, () =>
            {
                if (!string.IsNullOrEmpty(_selectedSeed))
                {
                    UIManager.Instance?.LoadGameWorld(_selectedSeed);
                }
            }, 180f, 44f);
            var pRt = _playBtn.GetComponent<RectTransform>();
            pRt.anchorMin = new Vector2(0f, 0f);
            pRt.anchorMax = new Vector2(0f, 0f);
            pRt.anchoredPosition = new Vector2(130f, 40f);

            var createBtn = UIWidgetFactory.CreateButton(sheet.transform, "BtnCreate", "Create New", UIColors.SurfaceSolid, UIColors.Ink, () =>
            {
                UIManager.Instance?.OpenScreen("WorldCreation");
            }, 180f, 44f);
            var crRt = createBtn.GetComponent<RectTransform>();
            crRt.anchorMin = new Vector2(0.5f, 0f);
            crRt.anchorMax = new Vector2(0.5f, 0f);
            crRt.anchoredPosition = new Vector2(0f, 40f);

            _deleteBtn = UIWidgetFactory.CreateButton(sheet.transform, "BtnDelete", "Delete", UIColors.Danger, UIColors.Ink, () =>
            {
                if (!string.IsNullOrEmpty(_selectedSeed))
                {
                    SaveManager.DeleteWorld(_selectedSeed);
                    _selectedSeed = null;
                    RefreshWorldList();
                }
            }, 140f, 44f);
            var dRt = _deleteBtn.GetComponent<RectTransform>();
            dRt.anchorMin = new Vector2(1f, 0f);
            dRt.anchorMax = new Vector2(1f, 0f);
            dRt.anchoredPosition = new Vector2(-110f, 40f);
        }

        private void RefreshWorldList()
        {
            foreach (var go in _rowObjects) Destroy(go);
            _rowObjects.Clear();

            var worlds = SaveManager.ListSavedWorlds();
            if (worlds.Count == 0)
            {
                // Provide default seed option if no saves exist
                CreateWorldRow("vythera-default", "Default Starting World");
            }
            else
            {
                foreach (var w in worlds)
                {
                    string info = $"Pos: ({(int)w.PlayerX}, {(int)w.PlayerY}, {(int)w.PlayerZ})  HP: {(int)w.Health}/20";
                    CreateWorldRow(w.Seed, info);
                }
            }

            UpdateButtonStates();
        }

        private void CreateWorldRow(string seed, string details)
        {
            var btn = UIWidgetFactory.CreateRowButton(_worldListContent, "Row_" + seed, seed, details, () =>
            {
                _selectedSeed = seed;
                UpdateButtonStates();
            });
            _rowObjects.Add(btn.gameObject);
        }

        private void UpdateButtonStates()
        {
            bool hasSelection = !string.IsNullOrEmpty(_selectedSeed);
            if (_playBtn != null) _playBtn.interactable = hasSelection;
            if (_deleteBtn != null) _deleteBtn.interactable = hasSelection;
        }
    }
}
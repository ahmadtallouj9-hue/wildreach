using UnityEngine;
using UnityEngine.UI;
using VYTHERA.UI.Core;

namespace VYTHERA.UI.AI
{
    public sealed class AIStudioScreen : MonoBehaviour, IUIScreen
    {
        public string ScreenId => "AIStudio";

        private GameObject _rootPanel;
        private Text _statusText;
        private InputField _commandInput;
        private Text _responseOutput;

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
            _rootPanel = UIWidgetFactory.CreatePanel(transform, "AIStudioRoot", UIColors.ModalDim, Vector2.zero, Vector2.zero, Vector2.one);

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

            var title = UIWidgetFactory.CreateText(sheet.transform, "Title", "AI STUDIO — LOCAL NEURAL SUITE", 20, UIColors.Gold, TextAnchor.MiddleCenter);
            var tRt = title.GetComponent<RectTransform>();
            tRt.anchorMin = new Vector2(0.2f, 1f);
            tRt.anchorMax = new Vector2(0.8f, 1f);
            tRt.anchoredPosition = new Vector2(0f, -32f);

            // Diagnostics Pane
            var diag = UIWidgetFactory.CreatePanel(sheet.transform, "DiagBox", UIColors.SurfaceSolid, new Vector2(660f, 100f), new Vector2(0.5f, 0.76f), new Vector2(0.5f, 0.76f));
            _statusText = UIWidgetFactory.CreateText(diag.transform, "StatusTxt", "• Local Engine: ONLINE\n• Local Vision Model: Loaded\n• Privacy Guard: Active (Local hardware only, no data shared)", 13, UIColors.Teal, TextAnchor.MiddleLeft);
            var stRt = _statusText.GetComponent<RectTransform>();
            stRt.anchorMin = Vector2.zero;
            stRt.anchorMax = Vector2.one;
            stRt.offsetMin = new Vector2(16f, 8f);
            stRt.offsetMax = new Vector2(-16f, -8f);

            // Chat / Agent Response Area
            var chatBox = UIWidgetFactory.CreatePanel(sheet.transform, "ChatBox", UIColors.SurfaceSolid, new Vector2(660f, 300f), new Vector2(0.5f, 0.38f), new Vector2(0.5f, 0.38f));
            _responseOutput = UIWidgetFactory.CreateText(chatBox.transform, "Output", "VYTHERA Agent: Greetings, Wanderer. I am your local AI companion. I can analyze the voxel landscape, suggest recipes, and assist with building structures. Enter a prompt below.", 13, UIColors.Ink, TextAnchor.UpperLeft);
            var roRt = _responseOutput.GetComponent<RectTransform>();
            roRt.anchorMin = Vector2.zero;
            roRt.anchorMax = Vector2.one;
            roRt.offsetMin = new Vector2(16f, 16f);
            roRt.offsetMax = new Vector2(-16f, -16f);

            // Input prompt bar
            var inputBar = new GameObject("InputBar", typeof(RectTransform), typeof(HorizontalLayoutGroup));
            inputBar.transform.SetParent(sheet.transform, false);
            var ibRt = inputBar.GetComponent<RectTransform>();
            ibRt.anchorMin = new Vector2(0.06f, 0.05f);
            ibRt.anchorMax = new Vector2(0.94f, 0.12f);
            ibRt.offsetMin = Vector2.zero;
            ibRt.offsetMax = Vector2.zero;

            var ibHlg = inputBar.GetComponent<HorizontalLayoutGroup>();
            ibHlg.spacing = 8f;
            ibHlg.childControlWidth = false;

            _commandInput = UIWidgetFactory.CreateInputField(inputBar.transform, "CmdInput", "Ask agent a question or give a task...", null, 520f, 42f);

            UIWidgetFactory.CreateButton(inputBar.transform, "BtnSend", "Send", UIColors.Gold, UIColors.Void, () =>
            {
                if (!string.IsNullOrEmpty(_commandInput.text))
                {
                    string prompt = _commandInput.text;
                    _commandInput.text = "";
                    _responseOutput.text = $"You: {prompt}\n\nVYTHERA Agent: [Local Model Thinking] I have processed your request for '{prompt}' within the local world state. Ready to assist.";
                }
            }, 100f, 42f);
        }
    }
}
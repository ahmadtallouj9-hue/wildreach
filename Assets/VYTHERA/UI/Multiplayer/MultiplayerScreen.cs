using UnityEngine;
using UnityEngine.UI;
using VYTHERA.UI.Core;

namespace VYTHERA.UI.Multiplayer
{
    public sealed class MultiplayerScreen : MonoBehaviour, IUIScreen
    {
        public string ScreenId => "Multiplayer";

        private GameObject _rootPanel;
        private InputField _addFriendInput;
        private Text _friendStatusText;
        private string _myFriendCode = "VY-000000";

        private void Awake()
        {
            _myFriendCode = "VY-" + UnityEngine.Random.Range(100000, 999999);
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
            _rootPanel = UIWidgetFactory.CreatePanel(transform, "MultiplayerRoot", UIColors.ModalDim, Vector2.zero, Vector2.zero, Vector2.one);

            var sheet = UIWidgetFactory.CreatePanel(_rootPanel.transform, "Sheet", UIColors.SurfaceCard, new Vector2(720f, 580f), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f));

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

            var title = UIWidgetFactory.CreateText(sheet.transform, "Title", "MULTIPLAYER & FRIENDS", 20, UIColors.Gold, TextAnchor.MiddleCenter);
            var tRt = title.GetComponent<RectTransform>();
            tRt.anchorMin = new Vector2(0.2f, 1f);
            tRt.anchorMax = new Vector2(0.8f, 1f);
            tRt.anchoredPosition = new Vector2(0f, -32f);

            // Column Stack
            var stack = new GameObject("Stack", typeof(RectTransform), typeof(VerticalLayoutGroup));
            stack.transform.SetParent(sheet.transform, false);
            var sRt = stack.GetComponent<RectTransform>();
            sRt.anchorMin = new Vector2(0.08f, 0.12f);
            sRt.anchorMax = new Vector2(0.92f, 0.88f);
            sRt.offsetMin = Vector2.zero;
            sRt.offsetMax = Vector2.zero;

            var vlg = stack.GetComponent<VerticalLayoutGroup>();
            vlg.spacing = 14f;
            vlg.childControlWidth = true;
            vlg.childForceExpandWidth = true;

            // 1. My Friend Code Box
            var codeBox = UIWidgetFactory.CreatePanel(stack.transform, "CodeBox", UIColors.SurfaceSolid, new Vector2(0f, 70f), Vector2.zero, Vector2.one);
            var cbVlg = codeBox.AddComponent<VerticalLayoutGroup>();
            cbVlg.padding = new RectOffset(16, 16, 10, 10);

            UIWidgetFactory.CreateText(codeBox.transform, "LblCode", "YOUR FRIEND CODE", 12, UIColors.Gold);
            UIWidgetFactory.CreateText(codeBox.transform, "CodeVal", _myFriendCode + "  (Click to copy)", 16, UIColors.Ink);

            // 2. Add a Friend
            var addBox = UIWidgetFactory.CreatePanel(stack.transform, "AddBox", UIColors.SurfaceSolid, new Vector2(0f, 90f), Vector2.zero, Vector2.one);
            var abVlg = addBox.AddComponent<VerticalLayoutGroup>();
            abVlg.padding = new RectOffset(16, 16, 10, 10);
            abVlg.spacing = 6f;

            UIWidgetFactory.CreateText(addBox.transform, "LblAdd", "ADD A FRIEND BY CODE", 12, UIColors.InkDim);

            var addRow = new GameObject("AddRow", typeof(RectTransform), typeof(HorizontalLayoutGroup));
            addRow.transform.SetParent(addBox.transform, false);
            var arHlg = addRow.GetComponent<HorizontalLayoutGroup>();
            arHlg.spacing = 8f;
            arHlg.childControlWidth = false;

            _addFriendInput = UIWidgetFactory.CreateInputField(addRow.transform, "InputFriendCode", "Enter 6-digit code...", null, 360f, 38f);
            UIWidgetFactory.CreateButton(addRow.transform, "BtnAddFriend", "Add Friend", UIColors.Gold, UIColors.Void, () =>
            {
                if (!string.IsNullOrEmpty(_addFriendInput.text))
                {
                    _friendStatusText.text = $"Friend request sent to code {_addFriendInput.text}.";
                    _friendStatusText.color = UIColors.Success;
                    _addFriendInput.text = "";
                }
            }, 140f, 38f);

            _friendStatusText = UIWidgetFactory.CreateText(stack.transform, "StatusTxt", "", 12, UIColors.Muted);

            UIWidgetFactory.CreateDivider(stack.transform, "LAN & Local Session");

            // 3. LAN Play Buttons
            var lanRow = new GameObject("LanRow", typeof(RectTransform), typeof(HorizontalLayoutGroup));
            lanRow.transform.SetParent(stack.transform, false);
            var lrHlg = lanRow.GetComponent<HorizontalLayoutGroup>();
            lrHlg.spacing = 12f;
            lrHlg.childControlWidth = true;
            lrHlg.childForceExpandWidth = true;

            UIWidgetFactory.CreateButton(lanRow.transform, "BtnHostLan", "Host LAN World", UIColors.GoldDim, UIColors.GoldBright, () =>
            {
                Debug.Log("[Multiplayer] Hosting LAN session...");
                UIManager.Instance?.LoadGameWorld("vythera-lan-host");
            }, 260f, 44f);

            UIWidgetFactory.CreateButton(lanRow.transform, "BtnJoinLan", "Find LAN Servers", UIColors.SurfaceSolid, UIColors.Ink, () =>
            {
                _friendStatusText.text = "Searching local network for active VYTHERA hosts...";
            }, 260f, 44f);
        }
    }
}
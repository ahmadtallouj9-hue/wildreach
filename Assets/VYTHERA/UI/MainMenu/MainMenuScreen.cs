using UnityEngine;
using UnityEngine.UI;
using VYTHERA.Save;
using VYTHERA.UI.Core;

namespace VYTHERA.UI.MainMenu
{
    public sealed class MainMenuScreen : MonoBehaviour, IUIScreen
    {
        public string ScreenId => "MainMenu";

        [SerializeField] private Canvas _canvas;
        private GameObject _rootPanel;

        private void Awake()
        {
            if (_canvas == null)
            {
                _canvas = GetComponentInParent<Canvas>() ?? FindAnyObjectByType<Canvas>();
                if (_canvas == null)
                {
                    var canvasGo = new GameObject("MainMenuCanvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
                    _canvas = canvasGo.GetComponent<Canvas>();
                    _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
                    var scaler = canvasGo.GetComponent<CanvasScaler>();
                    scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
                    scaler.referenceResolution = new Vector2(1920, 1080);
                    scaler.matchWidthOrHeight = 0.5f;
                }
            }

            BuildUI();
        }

        private void Start()
        {
            UIManager.Instance?.RegisterScreen(this);
            Show();
        }

        private void OnDestroy()
        {
            UIManager.Instance?.UnregisterScreen(this);
        }

        public void Show()
        {
            if (_rootPanel != null) _rootPanel.SetActive(true);
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
        }

        public void Hide()
        {
            if (_rootPanel != null) _rootPanel.SetActive(false);
        }

        private void BuildUI()
        {
            _rootPanel = UIWidgetFactory.CreatePanel(_canvas != null ? _canvas.transform : transform, "MainMenuRoot", UIColors.Void, Vector2.zero, Vector2.zero, Vector2.one);

            // ── Background Ambient Tint Plate ───────────────────────────────────────
            var bgPlate = UIWidgetFactory.CreatePanel(_rootPanel.transform, "BgPlate", UIColors.Background, Vector2.zero, Vector2.zero, Vector2.one);

            // ── Header: Title & Ornament ────────────────────────────────────────────
            var header = new GameObject("Header", typeof(RectTransform));
            header.transform.SetParent(_rootPanel.transform, false);
            var headerRt = header.GetComponent<RectTransform>();
            headerRt.anchorMin = new Vector2(0.08f, 0.78f);
            headerRt.anchorMax = new Vector2(0.92f, 0.96f);
            headerRt.offsetMin = Vector2.zero;
            headerRt.offsetMax = Vector2.zero;

            var title = UIWidgetFactory.CreateText(header.transform, "Title", "VYTHERA", 46, UIColors.Ink, TextAnchor.MiddleCenter);
            var titleRt = title.GetComponent<RectTransform>();
            titleRt.anchorMin = new Vector2(0f, 0.4f);
            titleRt.anchorMax = new Vector2(1f, 1f);
            titleRt.offsetMin = Vector2.zero;
            titleRt.offsetMax = Vector2.zero;

            var tagline = UIWidgetFactory.CreateText(header.transform, "Tagline", "— A WORLD TO WANDER —", 14, UIColors.Gold, TextAnchor.MiddleCenter);
            var tagRt = tagline.GetComponent<RectTransform>();
            tagRt.anchorMin = new Vector2(0f, 0f);
            tagRt.anchorMax = new Vector2(1f, 0.4f);
            tagRt.offsetMin = Vector2.zero;
            tagRt.offsetMax = Vector2.zero;

            // ── Left Navigation Stack ───────────────────────────────────────────────
            var nav = new GameObject("NavStack", typeof(RectTransform), typeof(VerticalLayoutGroup));
            nav.transform.SetParent(_rootPanel.transform, false);
            var navRt = nav.GetComponent<RectTransform>();
            navRt.anchorMin = new Vector2(0.12f, 0.14f);
            navRt.anchorMax = new Vector2(0.42f, 0.76f);
            navRt.offsetMin = Vector2.zero;
            navRt.offsetMax = Vector2.zero;

            var layout = nav.GetComponent<VerticalLayoutGroup>();
            layout.spacing = 8f;
            layout.childControlWidth = true;
            layout.childControlHeight = false;
            layout.childForceExpandWidth = true;
            layout.childForceExpandHeight = false;

            // Nav Rows
            UIWidgetFactory.CreateRowButton(nav.transform, "BtnNewWorld", "New World", "Create Fresh", () =>
            {
                UIManager.Instance?.OpenScreen("WorldCreation");
            });

            string lastSeed = SaveManager.HasSavedWorld("vythera-default") ? "vythera-default" : "";
            string continueSubtitle = string.IsNullOrEmpty(lastSeed) ? "No world yet" : lastSeed;
            UIWidgetFactory.CreateRowButton(nav.transform, "BtnContinue", "Continue", continueSubtitle, () =>
            {
                UIManager.Instance?.LoadGameWorld(string.IsNullOrEmpty(lastSeed) ? "vythera-default" : lastSeed);
            });

            UIWidgetFactory.CreateRowButton(nav.transform, "BtnWorlds", "Worlds", "Saved worlds", () =>
            {
                UIManager.Instance?.OpenScreen("WorldSelect");
            });

            UIWidgetFactory.CreateRowButton(nav.transform, "BtnMultiplayer", "Multiplayer", "LAN / Social", () =>
            {
                UIManager.Instance?.OpenScreen("Multiplayer");
            });

            UIWidgetFactory.CreateDivider(nav.transform, "Create");

            UIWidgetFactory.CreateRowButton(nav.transform, "BtnCustomWorld", "Custom World", "Terrain editor", () =>
            {
                UIManager.Instance?.OpenScreen("CustomWorld");
            });

            UIWidgetFactory.CreateRowButton(nav.transform, "BtnModStudio", "Mod Studio", "Creator suite", () =>
            {
                UIManager.Instance?.OpenScreen("ModStudio");
            });

            UIWidgetFactory.CreateRowButton(nav.transform, "BtnModHub", "Mod Hub", "Discover mods", () =>
            {
                UIManager.Instance?.OpenScreen("ModHub");
            });

            UIWidgetFactory.CreateRowButton(nav.transform, "BtnAI", "AI Studio", "Local neural tools", () =>
            {
                UIManager.Instance?.OpenScreen("AIStudio");
            });

            UIWidgetFactory.CreateRowButton(nav.transform, "BtnSettings", "Settings", "Graphics & audio", () =>
            {
                UIManager.Instance?.OpenScreen("Settings");
            });

            // ── Right Aside: Character Card ─────────────────────────────────────────
            var aside = UIWidgetFactory.CreatePanel(_rootPanel.transform, "PlayerCard", UIColors.SurfaceCard, Vector2.zero, new Vector2(0.58f, 0.22f), new Vector2(0.88f, 0.74f));
            
            var cardKicker = UIWidgetFactory.CreateText(aside.transform, "Kicker", "WANDERER", 14, UIColors.Gold, TextAnchor.UpperCenter);
            var ckRt = cardKicker.GetComponent<RectTransform>();
            ckRt.anchorMin = new Vector2(0f, 0.88f);
            ckRt.anchorMax = new Vector2(1f, 0.98f);
            ckRt.offsetMin = Vector2.zero;
            ckRt.offsetMax = Vector2.zero;

            var avatarBox = UIWidgetFactory.CreatePanel(aside.transform, "AvatarBox", UIColors.SurfaceSolid, Vector2.zero, new Vector2(0.1f, 0.25f), new Vector2(0.9f, 0.85f));
            var avatarHint = UIWidgetFactory.CreateText(avatarBox.transform, "AvatarHint", "[ 3D Wanderer Avatar ]", 14, UIColors.Muted, TextAnchor.MiddleCenter);
            var ahRt = avatarHint.GetComponent<RectTransform>();
            ahRt.anchorMin = Vector2.zero;
            ahRt.anchorMax = Vector2.one;
            ahRt.offsetMin = Vector2.zero;
            ahRt.offsetMax = Vector2.zero;

            var customizeBtn = UIWidgetFactory.CreateButton(aside.transform, "BtnCustomize", "Customize Look", UIColors.GoldDim, UIColors.GoldBright, () =>
            {
                Debug.Log("[MainMenu] Customize look pressed.");
            }, 240f, 40f);
            var cbRt = customizeBtn.GetComponent<RectTransform>();
            cbRt.anchorMin = new Vector2(0.1f, 0.08f);
            cbRt.anchorMax = new Vector2(0.9f, 0.18f);
            cbRt.offsetMin = Vector2.zero;
            cbRt.offsetMax = Vector2.zero;

            // ── Footer Status Chips ────────────────────────────────────────────────
            var footer = new GameObject("Footer", typeof(RectTransform));
            footer.transform.SetParent(_rootPanel.transform, false);
            var fRt = footer.GetComponent<RectTransform>();
            fRt.anchorMin = new Vector2(0.05f, 0.02f);
            fRt.anchorMax = new Vector2(0.95f, 0.08f);
            fRt.offsetMin = Vector2.zero;
            fRt.offsetMax = Vector2.zero;

            var statusLeft = UIWidgetFactory.CreateText(footer.transform, "StatusLeft", "• Local session   • Local AI   • 60 FPS", 12, UIColors.Muted, TextAnchor.MiddleLeft);
            var slRt = statusLeft.GetComponent<RectTransform>();
            slRt.anchorMin = new Vector2(0f, 0f);
            slRt.anchorMax = new Vector2(0.5f, 1f);
            slRt.offsetMin = Vector2.zero;
            slRt.offsetMax = Vector2.zero;

            var statusRight = UIWidgetFactory.CreateText(footer.transform, "StatusRight", "GoodVibes textures by Acaitart (CC-BY)", 12, UIColors.Faint, TextAnchor.MiddleRight);
            var srRt = statusRight.GetComponent<RectTransform>();
            srRt.anchorMin = new Vector2(0.5f, 0f);
            srRt.anchorMax = new Vector2(1f, 1f);
            srRt.offsetMin = Vector2.zero;
            srRt.offsetMax = Vector2.zero;
        }
    }
}
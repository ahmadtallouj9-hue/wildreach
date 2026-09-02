using System;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using VYTHERA.Gameplay.Bootstrap;
using VYTHERA.UI.Core;
using VYTHERA.UI.Settings;

namespace VYTHERA.UI.Pause
{
    public sealed class PauseMenuScreen : MonoBehaviour, IUIScreen
    {
        public string ScreenId => "PauseMenu";

        private GameObject _rootPanel;
        private Text _saveFeedbackText;
        public bool IsPaused => _rootPanel != null && _rootPanel.activeSelf;

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

        private void Update()
        {
            var keyboard = UnityEngine.InputSystem.Keyboard.current;
            if (keyboard != null && keyboard.escapeKey.wasPressedThisFrame)
            {
                if (IsPaused) Resume();
                else Pause();
            }
        }

        public void Pause()
        {
            Show();
            Time.timeScale = 0f;
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
            if (_saveFeedbackText != null) _saveFeedbackText.text = "";
        }

        public void Resume()
        {
            Time.timeScale = 1f;
            Hide();
            if (!Application.isMobilePlatform)
            {
                Cursor.lockState = CursorLockMode.Locked;
                Cursor.visible = false;
            }
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
            _rootPanel = UIWidgetFactory.CreatePanel(transform, "PauseMenuRoot", UIColors.ModalDim, Vector2.zero, Vector2.zero, Vector2.one);

            var panel = UIWidgetFactory.CreatePanel(_rootPanel.transform, "Panel", UIColors.SurfaceCard, new Vector2(400f, 520f), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f));

            var title = UIWidgetFactory.CreateText(panel.transform, "Title", "VYTHERA", 28, UIColors.Gold, TextAnchor.MiddleCenter);
            var tRt = title.GetComponent<RectTransform>();
            tRt.anchorMin = new Vector2(0f, 0.85f);
            tRt.anchorMax = new Vector2(1f, 0.98f);
            tRt.offsetMin = Vector2.zero;
            tRt.offsetMax = Vector2.zero;

            var stack = new GameObject("Buttons", typeof(RectTransform), typeof(VerticalLayoutGroup));
            stack.transform.SetParent(panel.transform, false);
            var sRt = stack.GetComponent<RectTransform>();
            sRt.anchorMin = new Vector2(0.08f, 0.12f);
            sRt.anchorMax = new Vector2(0.92f, 0.84f);
            sRt.offsetMin = Vector2.zero;
            sRt.offsetMax = Vector2.zero;

            var vlg = stack.GetComponent<VerticalLayoutGroup>();
            vlg.spacing = 10f;
            vlg.childControlWidth = true;
            vlg.childForceExpandWidth = true;

            UIWidgetFactory.CreateButton(stack.transform, "BtnResume", "Resume Game", UIColors.Gold, UIColors.Void, Resume, 280f, 42f);

            UIWidgetFactory.CreateButton(stack.transform, "BtnSave", "Save World", UIColors.SurfaceSolid, UIColors.Ink, () =>
            {
                var bootstrapper = FindAnyObjectByType<GameBootstrapper>();
                bool success = bootstrapper != null && bootstrapper.SaveGame();
                if (_saveFeedbackText != null)
                {
                    _saveFeedbackText.text = success ? $"World saved successfully ({DateTime.Now:HH:mm:ss})" : "Failed to save world.";
                    _saveFeedbackText.color = success ? UIColors.Success : UIColors.Danger;
                }
                Debug.Log("[PauseMenu] World saved: " + success);
            }, 280f, 42f);

            UIWidgetFactory.CreateButton(stack.transform, "BtnSettings", "Settings", UIColors.SurfaceSolid, UIColors.Ink, () =>
            {
                var settings = FindAnyObjectByType<SettingsScreen>();
                if (settings != null)
                {
                    settings.Show();
                }
                else
                {
                    UIManager.Instance?.OpenScreen("Settings");
                }
            }, 280f, 42f);

            UIWidgetFactory.CreateButton(stack.transform, "BtnSaveAndQuit", "Save & Quit to Title", UIColors.Warning, UIColors.Void, () =>
            {
                var bootstrapper = FindAnyObjectByType<GameBootstrapper>();
                if (bootstrapper != null)
                {
                    bootstrapper.SaveGame();
                }
                Time.timeScale = 1f;
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
                SceneManager.LoadScene("Assets/VYTHERA/Scenes/MainMenuScene.unity", LoadSceneMode.Single);
            }, 280f, 42f);

            UIWidgetFactory.CreateButton(stack.transform, "BtnQuitNoSave", "Quit to Title", UIColors.Danger, UIColors.Ink, () =>
            {
                Time.timeScale = 1f;
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
                SceneManager.LoadScene("Assets/VYTHERA/Scenes/MainMenuScene.unity", LoadSceneMode.Single);
            }, 280f, 42f);

            _saveFeedbackText = UIWidgetFactory.CreateText(panel.transform, "SaveFeedback", "", 12, UIColors.Success, TextAnchor.MiddleCenter);
            var sfRt = _saveFeedbackText.GetComponent<RectTransform>();
            sfRt.anchorMin = new Vector2(0.05f, 0.02f);
            sfRt.anchorMax = new Vector2(0.95f, 0.10f);
            sfRt.offsetMin = Vector2.zero;
            sfRt.offsetMax = Vector2.zero;
        }
    }
}
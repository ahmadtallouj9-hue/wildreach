using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace VYTHERA.UI.Core
{
    public interface IUIScreen
    {
        string ScreenId { get; }
        void Show();
        void Hide();
    }

    public sealed class UIManager : MonoBehaviour
    {
        public static UIManager Instance { get; private set; }

        private readonly Dictionary<string, IUIScreen> _screens = new Dictionary<string, IUIScreen>();
        private readonly Stack<IUIScreen> _navigationStack = new Stack<IUIScreen>();

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        public void RegisterScreen(IUIScreen screen)
        {
            if (screen != null)
            {
                _screens[screen.ScreenId] = screen;
            }
        }

        public void UnregisterScreen(IUIScreen screen)
        {
            if (screen != null && _screens.ContainsKey(screen.ScreenId))
            {
                _screens.Remove(screen.ScreenId);
            }
        }

        public void OpenScreen(string screenId)
        {
            if (_screens.TryGetValue(screenId, out var screen))
            {
                if (_navigationStack.Count == 0 && _screens.TryGetValue("MainMenu", out var mainMenu) && screenId != "MainMenu")
                {
                    _navigationStack.Push(mainMenu);
                }

                if (_navigationStack.Count > 0)
                {
                    var current = _navigationStack.Peek();
                    current.Hide();
                }

                _navigationStack.Push(screen);
                screen.Show();
            }
            else
            {
                Debug.LogWarning($"[UIManager] Screen '{screenId}' not found.");
            }
        }

        public void CloseCurrentScreen()
        {
            if (_navigationStack.Count > 0)
            {
                var current = _navigationStack.Pop();
                current.Hide();

                if (_navigationStack.Count > 0)
                {
                    var previous = _navigationStack.Peek();
                    previous.Show();
                }
                else if (_screens.TryGetValue("MainMenu", out var mainMenu))
                {
                    mainMenu.Show();
                }
            }
            else if (_screens.TryGetValue("MainMenu", out var mainMenu))
            {
                mainMenu.Show();
            }
        }

        public void LoadGameWorld(string seed)
        {
            Gameplay.Bootstrap.GameBootstrapper.ConfiguredSeed = seed;
            SceneManager.LoadScene("Assets/VYTHERA/Scenes/GameScene.unity", LoadSceneMode.Single);
        }

        public void ReturnToMainMenu()
        {
            Time.timeScale = 1f;
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
            SceneManager.LoadScene("Assets/VYTHERA/Scenes/MainMenuScene.unity", LoadSceneMode.Single);
        }
    }
}
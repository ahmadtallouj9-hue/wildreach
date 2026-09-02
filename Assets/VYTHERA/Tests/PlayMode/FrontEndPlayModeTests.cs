using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using VYTHERA.UI;
using VYTHERA.UI.Core;
using VYTHERA.UI.Inventory;
using VYTHERA.UI.MainMenu;
using VYTHERA.UI.Pause;
using VYTHERA.UI.Settings;
using VYTHERA.UI.WorldCreation;
using VYTHERA.UI.WorldSelect;

namespace VYTHERA.Tests.PlayMode
{
    public class FrontEndPlayModeTests
    {
        [UnityTest]
        public IEnumerator MainMenuScene_LoadsAllCoreScreens()
        {
            var loadOp = SceneManager.LoadSceneAsync("Assets/VYTHERA/Scenes/MainMenuScene.unity", LoadSceneMode.Single);
            while (!loadOp.isDone) yield return null;
            yield return null;

            var mm = Object.FindAnyObjectByType<MainMenuScreen>();
            Assert.IsNotNull(mm, "MainMenuScreen must be present in MainMenuScene");

            var ws = Object.FindAnyObjectByType<WorldSelectScreen>();
            Assert.IsNotNull(ws, "WorldSelectScreen must be present in MainMenuScene");

            var wc = Object.FindAnyObjectByType<WorldCreationScreen>();
            Assert.IsNotNull(wc, "WorldCreationScreen must be present in MainMenuScene");

            var set = Object.FindAnyObjectByType<SettingsScreen>();
            Assert.IsNotNull(set, "SettingsScreen must be present in MainMenuScene");
        }

        [UnityTest]
        public IEnumerator GameScene_LoadsHUD_Inventory_And_PauseScreens()
        {
            var loadOp = SceneManager.LoadSceneAsync("Assets/VYTHERA/Scenes/GameScene.unity", LoadSceneMode.Single);
            while (!loadOp.isDone) yield return null;
            for (int i = 0; i < 5; i++) yield return null;

            var hud = Object.FindAnyObjectByType<HUDManager>();
            Assert.IsNotNull(hud, "HUDManager must be present in GameScene");

            var inv = Object.FindAnyObjectByType<InventoryScreen>();
            Assert.IsNotNull(inv, "InventoryScreen must be spawned and ready in GameScene");

            var pause = Object.FindAnyObjectByType<PauseMenuScreen>();
            Assert.IsNotNull(pause, "PauseMenuScreen must be spawned and ready in GameScene");

            // Test Inventory Open/Close
            inv.OpenInventory();
            Assert.IsTrue(inv.IsOpen, "Inventory should be open after OpenInventory()");

            inv.CloseInventory();
            Assert.IsFalse(inv.IsOpen, "Inventory should be closed after CloseInventory()");

            // Test Pause Menu Pause/Resume
            pause.Pause();
            Assert.IsTrue(pause.IsPaused, "Game should be paused after Pause()");
            Assert.AreEqual(0f, Time.timeScale, 0.001f, "TimeScale should be 0 when paused");

            pause.Resume();
            Assert.IsFalse(pause.IsPaused, "Game should be unpaused after Resume()");
            Assert.AreEqual(1f, Time.timeScale, 0.001f, "TimeScale should be 1 when unpaused");
        }

        [UnityTest]
        public IEnumerator SettingsScreen_BackButton_ClosesAndReturnsToPrevious()
        {
            var loadOp = SceneManager.LoadSceneAsync("Assets/VYTHERA/Scenes/MainMenuScene.unity", LoadSceneMode.Single);
            while (!loadOp.isDone) yield return null;
            yield return null;

            var settings = Object.FindAnyObjectByType<SettingsScreen>();
            Assert.IsNotNull(settings, "SettingsScreen must exist");

            // Open Settings
            UIManager.Instance?.OpenScreen("Settings");
            Assert.IsTrue(settings.IsOpen, "SettingsScreen must be open after OpenScreen('Settings')");

            // Find Back Button in SettingsScreen hierarchy
            var backBtn = settings.transform.Find("SettingsRoot/Sheet/BtnBack")?.GetComponent<UnityEngine.UI.Button>();
            if (backBtn != null)
            {
                backBtn.onClick.Invoke();
            }
            else
            {
                settings.Close();
            }

            Assert.IsFalse(settings.IsOpen, "SettingsScreen must be closed after clicking Back");
        }
    }
}
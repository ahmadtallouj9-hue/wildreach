using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using VYTHERA.Gameplay.Bootstrap;
using VYTHERA.Gameplay.Inventory;
using VYTHERA.Gameplay.Survival;
using VYTHERA.Player.Physics;
using VYTHERA.World.Streaming;

namespace VYTHERA.Tests.PlayMode
{
    public class GameScenePlayModeTests
    {
        [UnityTest]
        public IEnumerator GameScene_LoadsAndInitializesAllCoreSystems()
        {
            SaveManager.DeleteSave("vythera-default");
            // Load GameScene
            var loadOp = SceneManager.LoadSceneAsync("Assets/VYTHERA/Scenes/GameScene.unity", LoadSceneMode.Single);
            while (!loadOp.isDone)
            {
                yield return null;
            }

            // Wait 5 frames for Start() coroutines to complete initialization
            for (int i = 0; i < 5; i++)
            {
                yield return null;
            }

            // Verify Bootstrapper
            Assert.IsNotNull(GameBootstrapper.Instance, "GameBootstrapper should be instantiated");

            // Verify ChunkManager
            Assert.IsNotNull(ChunkManager.Instance, "ChunkManager should be instantiated");

            // Verify Player and Physics
            var player = Object.FindAnyObjectByType<PlayerPhysics>();
            Assert.IsNotNull(player, "PlayerPhysics should be instantiated and present");
            Assert.Greater(player.Position.y, 0f, "Player should be spawned above ground");

            // Verify Survival
            var survival = Object.FindAnyObjectByType<SurvivalSystem>();
            Assert.IsNotNull(survival, "SurvivalSystem should be attached");
            Assert.AreEqual(20f, survival.Health, "Health should initialize at 20");
            Assert.AreEqual(20f, survival.Hunger, "Hunger should initialize at 20");

            // Verify Inventory
            var inventory = Object.FindAnyObjectByType<InventorySystem>();
            Assert.IsNotNull(inventory, "InventorySystem should be attached");

            // Simulate small input step
            var snapshot = new PlayerInputSnapshot
            {
                Forward = true
            };
            player.SimulateTick(snapshot, 0f);

            Assert.IsFalse(float.IsNaN(player.Position.x), "Player X position should not be NaN");
            Assert.IsFalse(float.IsNaN(player.Position.y), "Player Y position should not be NaN");
            Assert.IsFalse(float.IsNaN(player.Position.z), "Player Z position should not be NaN");
        }
    }
}
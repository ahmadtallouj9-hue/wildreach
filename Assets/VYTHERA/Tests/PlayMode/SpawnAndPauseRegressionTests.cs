using System.Collections;
using System.IO;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using VYTHERA.Gameplay.Bootstrap;
using VYTHERA.Player.Physics;
using VYTHERA.Save.Serialization;
using VYTHERA.UI.Pause;
using VYTHERA.UI.Settings;
using VYTHERA.Gameplay.Interaction;
using VYTHERA.Voxel.Data;
using VYTHERA.World.Streaming;

namespace VYTHERA.Tests.PlayMode
{
    public class SpawnAndPauseRegressionTests
    {
        [UnityTest]
        public IEnumerator SafeSpawn_PlayerSpawnsAboveTerrain_ChunkExists_NoFallDeath()
        {
            SaveManager.DeleteSave("vythera-default");
            // Load GameScene cleanly
            var loadOp = SceneManager.LoadSceneAsync("Assets/VYTHERA/Scenes/GameScene.unity", LoadSceneMode.Single);
            while (!loadOp.isDone) yield return null;

            // Wait a few frames for GameBootstrapper Start() coroutine to complete
            for (int i = 0; i < 10; i++) yield return null;

            var bootstrapper = Object.FindAnyObjectByType<GameBootstrapper>();
            Assert.IsNotNull(bootstrapper, "GameBootstrapper must exist");

            var player = Object.FindAnyObjectByType<PlayerPhysics>();
            Assert.IsNotNull(player, "PlayerPhysics must exist");

            var chunks = Object.FindAnyObjectByType<ChunkManager>();
            Assert.IsNotNull(chunks, "ChunkManager must exist");

            // 1. Required chunk exists before player interacts
            int pcx = (int)Mathf.Floor(player.Position.x / 16f);
            int pcz = (int)Mathf.Floor(player.Position.z / 16f);
            var chunk = chunks.GetChunk(pcx, pcz);
            Assert.IsNotNull(chunk, $"Chunk ({pcx}, {pcz}) must exist and be loaded at player spawn");
            Assert.IsTrue(chunk.IsReady, "Spawn chunk must be ready");

            // 2. Spawn point is above valid terrain and not in the void or sky
            Assert.Greater(player.Position.y, 10f, "Player must not spawn near the void");
            Assert.Less(player.Position.y, 250f, "Player must not spawn in the extreme sky");

            // 3. Player is not inside solid terrain (check feet and eye blocks)
            int bx = (int)Mathf.Floor(player.Position.x);
            int byFeet = (int)Mathf.Floor(player.Position.y);
            int byHead = (int)Mathf.Floor(player.Position.y + 1.5f);
            int bz = (int)Mathf.Floor(player.Position.z);

            byte feetBlock = chunks.GetBlock(bx, byFeet, bz);
            byte headBlock = chunks.GetBlock(bx, byHead, bz);
            Assert.AreEqual((byte)BlockType.Air, feetBlock, "Feet must be in non-solid air block");
            Assert.AreEqual((byte)BlockType.Air, headBlock, "Head must be in non-solid air block");

            // 4. Ground block below feet is solid
            byte groundBlock = chunks.GetBlock(bx, byFeet - 1, bz);
            Assert.IsTrue(BlockUtility.IsSolid((BlockType)groundBlock), $"Block beneath player ({groundBlock}) must be solid terrain");

            // 5. Simulate several frames and ensure player does not fall to death
            float initialHealth = 20f;
            var survival = Object.FindAnyObjectByType<VYTHERA.Gameplay.Survival.SurvivalSystem>();
            if (survival != null) initialHealth = survival.Health;

            for (int f = 0; f < 30; f++)
            {
                yield return new WaitForFixedUpdate();
            }

            Assert.IsFalse(player.FallDistance > 3f, $"Player fall distance must not accumulate excessively (was {player.FallDistance})");
            if (survival != null)
            {
                Assert.IsFalse(survival.IsDead, "Player must remain alive after spawn");
                Assert.AreEqual(20f, survival.Health, 0.5f, "Player must not take fall damage on spawn");
            }
        }

        [UnityTest]
        public IEnumerator PauseMenu_SaveWorld_Settings_And_QuitOperations()
        {
            var loadOp = SceneManager.LoadSceneAsync("Assets/VYTHERA/Scenes/GameScene.unity", LoadSceneMode.Single);
            while (!loadOp.isDone) yield return null;
            for (int i = 0; i < 5; i++) yield return null;

            var pause = Object.FindAnyObjectByType<PauseMenuScreen>();
            Assert.IsNotNull(pause, "PauseMenuScreen must be present");

            var bootstrapper = Object.FindAnyObjectByType<GameBootstrapper>();
            Assert.IsNotNull(bootstrapper, "GameBootstrapper must be present");

            // 1. Pause game
            pause.Pause();
            Assert.IsTrue(pause.IsPaused, "Game must be paused");
            Assert.AreEqual(0f, Time.timeScale, 0.001f);

            // 2. Save World invokes real save and creates file
            bool saved = bootstrapper.SaveGame();
            Assert.IsTrue(saved, "SaveGame() must return true on successful save");
            string savePath = SaveManager.GetSaveFilePath(bootstrapper.WorldSeed);
            Assert.IsTrue(File.Exists(savePath), $"Save file must exist at {savePath}");

            // 3. Settings opens
            var settings = Object.FindAnyObjectByType<SettingsScreen>();
            Assert.IsNotNull(settings, "SettingsScreen must exist in scene");
            settings.Show();
            var settingsRoot = settings.transform.Find("SettingsRoot");
            if (settingsRoot != null) Assert.IsTrue(settingsRoot.gameObject.activeSelf, "Settings screen root should be active");
            settings.Hide();

            // 4. Resume game
            pause.Resume();
            Assert.IsFalse(pause.IsPaused, "Game must be unpaused");
            Assert.AreEqual(1f, Time.timeScale, 0.001f);
        }

        [UnityTest]
        public IEnumerator Movement_FlatGround_NoVerticalBobbing()
        {
            var loadOp = SceneManager.LoadSceneAsync("Assets/VYTHERA/Scenes/GameScene.unity", LoadSceneMode.Single);
            while (!loadOp.isDone) yield return null;
            for (int i = 0; i < 10; i++) yield return null;

            var player = Object.FindAnyObjectByType<PlayerPhysics>();
            Assert.IsNotNull(player, "PlayerPhysics must exist");

            // Build a flat 5x5 platform of stone at player feet level to guarantee perfectly flat test surface
            var chunks = Object.FindAnyObjectByType<ChunkManager>();
            int flatY = Mathf.FloorToInt(player.Position.y) - 1;
            int px = Mathf.FloorToInt(player.Position.x);
            int pz = Mathf.FloorToInt(player.Position.z);

            for (int dx = -2; dx <= 5; dx++)
            {
                for (int dz = -2; dz <= 2; dz++)
                {
                    chunks.SetBlock(px + dx, flatY, pz + dz, (byte)BlockType.Stone);
                    chunks.SetBlock(px + dx, flatY + 1, pz + dz, (byte)BlockType.Air);
                    chunks.SetBlock(px + dx, flatY + 2, pz + dz, (byte)BlockType.Air);
                }
            }

            // Teleport player cleanly onto flat stone
            player.Teleport(new Vector3(px + 0.5f, flatY + 1f, pz + 0.5f));
            yield return new WaitForFixedUpdate();

            float initialY = player.Position.y;

            // Simulate walking forward in +X for 20 physics frames
            for (int f = 0; f < 20; f++)
            {
                var input = new PlayerInputSnapshot
                {
                    Forward = true
                };
                player.SimulateTick(input, 90f);
                yield return new WaitForFixedUpdate();

                // Player must NOT bob up and down on flat ground
                float deltaY = Mathf.Abs(player.Position.y - initialY);
                Assert.Less(deltaY, 0.01f, $"Player Y ({player.Position.y}) bobbed from flat surface ({initialY}) on tick {f}");
            }
        }

        [UnityTest]
        public IEnumerator BlockPlacement_ExactFace_And_SavePersistence()
        {
            var loadOp = SceneManager.LoadSceneAsync("Assets/VYTHERA/Scenes/GameScene.unity", LoadSceneMode.Single);
            while (!loadOp.isDone) yield return null;
            for (int i = 0; i < 10; i++) yield return null;

            var chunks = Object.FindAnyObjectByType<ChunkManager>();
            var bootstrapper = Object.FindAnyObjectByType<GameBootstrapper>();
            var interaction = Object.FindAnyObjectByType<BlockInteractionSystem>();
            Assert.IsNotNull(interaction, "BlockInteractionSystem must exist");

            // 1. Raycast down onto block beneath target
            int tx = 20, ty = 64, tz = 20;
            chunks.SetBlock(tx, ty, tz, (byte)BlockType.Cobblestone);
            chunks.SetBlock(tx, ty + 1, tz, (byte)BlockType.Air);

            // Ray from (tx + 0.5, ty + 3, tz + 0.5) looking straight down (0, -1, 0)
            var hit = interaction.RaycastVoxel(new Vector3(tx + 0.5f, ty + 3.0f, tz + 0.5f), Vector3.down, 5f);
            Assert.IsTrue(hit.Hit, "Downward raycast must hit block");
            Assert.AreEqual(new Vector3Int(tx, ty, tz), hit.VoxelPos, "Hit voxel pos must match cobblestone block");
            Assert.AreEqual(Vector3Int.up, hit.Normal, "Top face normal must be (0, 1, 0)");

            // 2. Place block on top face (ty + 1)
            Vector3Int placePos = hit.VoxelPos + hit.Normal;
            Assert.AreEqual(new Vector3Int(tx, ty + 1, tz), placePos, "Target placement must be directly above hit face");

            chunks.SetBlock(placePos.x, placePos.y, placePos.z, (byte)BlockType.Planks);
            Assert.AreEqual((byte)BlockType.Planks, chunks.GetBlock(placePos.x, placePos.y, placePos.z));

            // 3. Save world and verify placed block persists
            bool saved = bootstrapper.SaveGame();
            Assert.IsTrue(saved, "SaveGame must succeed");

            // Clear chunk block from memory to simulate fresh load
            chunks.SetBlock(placePos.x, placePos.y, placePos.z, (byte)BlockType.Air);
            Assert.AreEqual((byte)BlockType.Air, chunks.GetBlock(placePos.x, placePos.y, placePos.z));

            // Load save
            var saveFile = SaveManager.LoadWorld(bootstrapper.WorldSeed);
            Assert.IsNotNull(saveFile, "Save file must load");
            Assert.IsNotNull(saveFile.ModifiedBlocks, "Save file must contain modified blocks");

            // Re-apply from loaded save
            foreach (var mod in saveFile.ModifiedBlocks)
            {
                var parts = mod.Split(':');
                if (parts.Length == 2 && byte.TryParse(parts[1], out byte bid))
                {
                    var c = parts[0].Split(',');
                    if (int.Parse(c[0]) == placePos.x && int.Parse(c[1]) == placePos.y && int.Parse(c[2]) == placePos.z)
                    {
                        Assert.AreEqual((byte)BlockType.Planks, bid, "Persisted block in save must be Planks");
                    }
                }
            }
        }
    }
}
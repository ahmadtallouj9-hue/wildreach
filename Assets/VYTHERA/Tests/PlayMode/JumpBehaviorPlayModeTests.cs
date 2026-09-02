using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using VYTHERA.Player.Physics;
using VYTHERA.World.Streaming;

namespace VYTHERA.Tests.PlayMode
{
    public class JumpBehaviorPlayModeTests
    {
        private IEnumerator SetupGroundedPlayer(System.Action<PlayerPhysics> onReady)
        {
            var loadOp = SceneManager.LoadSceneAsync("Assets/VYTHERA/Scenes/GameScene.unity", LoadSceneMode.Single);
            while (!loadOp.isDone) yield return null;
            for (int i = 0; i < 5; i++) yield return null;

            var chunks = Object.FindFirstObjectByType<ChunkManager>();
            for (int i = 0; i < 60; i++)
            {
                if (chunks != null && chunks.GetChunk(0, 0) != null) break;
                yield return null;
            }

            var player = Object.FindFirstObjectByType<PlayerPhysics>();
            Assert.IsNotNull(player, "PlayerPhysics must be present in scene");

            for (int i = 0; i < 60; i++)
            {
                player.SimulateTick(default, 0f);
                if (player.Grounded && Mathf.Abs(player.Velocity.y) < 0.001f) break;
            }

            Assert.IsTrue(player.Grounded, "Player should be grounded before test begins");
            onReady(player);
        }

        [UnityTest]
        public IEnumerator Jump_StandsStillWhenNoInputPressed()
        {
            PlayerPhysics player = null;
            yield return SetupGroundedPlayer(p => player = p);

            Vector3 groundPos = player.Position;

            // Simulate 20 idle ticks
            for (int i = 0; i < 20; i++)
            {
                player.SimulateTick(default, 0f);
            }

            Assert.IsTrue(player.Grounded, "Player should remain grounded when no input is pressed");
            Assert.AreEqual(0f, player.Velocity.y, 0.001f, "Vertical velocity should be 0 when idle on ground");
            Assert.AreEqual(groundPos.y, player.Position.y, 0.01f, "Player Y position should not change when idle");
        }

        [UnityTest]
        public IEnumerator Jump_SinglePressProducesOneJump()
        {
            PlayerPhysics player = null;
            yield return SetupGroundedPlayer(p => player = p);

            // Send single JumpPressed
            var jumpInput = new PlayerInputSnapshot
            {
                JumpPressed = true,
                JumpHeld = false
            };
            player.SimulateTick(jumpInput, 0f);

            Assert.IsFalse(player.Grounded, "Player should become airborne immediately after jump press");
            Assert.Greater(player.Velocity.y, 0f, "Vertical velocity should be positive on jump");
        }

        [UnityTest]
        public IEnumerator Jump_HoldingSpaceDoesNotCreateContinuousAutoJumps()
        {
            PlayerPhysics player = null;
            yield return SetupGroundedPlayer(p => player = p);

            // Tick 1: Jump triggered with Space pressed & held
            var firstJumpInput = new PlayerInputSnapshot
            {
                JumpPressed = true,
                JumpHeld = true
            };
            player.SimulateTick(firstJumpInput, 0f);
            Assert.IsFalse(player.Grounded, "Should be airborne on initial jump");

            // Ticks 2..N: Continue holding space continuously while airborne and landing
            var holdingSpaceInput = new PlayerInputSnapshot
            {
                JumpPressed = false,
                JumpHeld = true
            };

            bool landed = false;
            for (int i = 0; i < 40; i++)
            {
                player.SimulateTick(holdingSpaceInput, 0f);
                if (player.Grounded && player.Velocity.y <= 0f)
                {
                    landed = true;
                    break;
                }
            }
            Assert.IsTrue(landed, "Player should have landed after jump arc");

            // Now player is on ground while STILL holding space!
            // Verify that for the next 15 ticks, holding space does NOT re-trigger a jump!
            for (int i = 0; i < 15; i++)
            {
                player.SimulateTick(holdingSpaceInput, 0f);
                Assert.IsTrue(player.Grounded, $"Player must remain grounded on tick {i} despite holding Space");
                Assert.AreEqual(0f, player.Velocity.y, 0.001f, $"Vertical velocity should be 0 on tick {i}");
            }
        }

        [UnityTest]
        public IEnumerator Jump_RetriggersAfterLandingAndNewPress()
        {
            PlayerPhysics player = null;
            yield return SetupGroundedPlayer(p => player = p);

            // Jump 1
            player.SimulateTick(new PlayerInputSnapshot { JumpPressed = true, JumpHeld = true }, 0f);
            Assert.IsFalse(player.Grounded);

            // Airborne until landing while holding jump
            for (int i = 0; i < 40; i++)
            {
                player.SimulateTick(new PlayerInputSnapshot { JumpPressed = false, JumpHeld = true }, 0f);
                if (player.Grounded && player.Velocity.y <= 0f) break;
            }
            Assert.IsTrue(player.Grounded);

            // Release jump key on ground
            player.SimulateTick(default, 0f);
            Assert.IsTrue(player.Grounded);

            // New jump press
            player.SimulateTick(new PlayerInputSnapshot { JumpPressed = true, JumpHeld = true }, 0f);
            Assert.IsFalse(player.Grounded, "Second jump should successfully trigger on a new press");
            Assert.Greater(player.Velocity.y, 0f, "Vertical velocity should be positive on second jump");
        }
    }
}
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;
using UnityEngine.UI;
using VYTHERA.UI.AI;
using VYTHERA.UI.Core;
using VYTHERA.UI.MainMenu;
using VYTHERA.UI.ModHub;
using VYTHERA.UI.ModStudio;
using VYTHERA.UI.Multiplayer;
using VYTHERA.UI.Settings;
using VYTHERA.UI.WorldCreation;
using VYTHERA.UI.WorldEditor;
using VYTHERA.UI.WorldSelect;

namespace VYTHERA.Editor
{
    public static class MainMenuSceneBuilder
    {
        [MenuItem("VYTHERA/Build Main Menu Scene")]
        public static void BuildMainMenuScene()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            // 1. Camera
            var camGo = new GameObject("Main Camera", typeof(Camera), typeof(AudioListener));
            var cam = camGo.GetComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = UIColors.Void;
            camGo.transform.position = new Vector3(0, 0, -10);

            // 2. Light
            var lightGo = new GameObject("Directional Light", typeof(Light));
            var light = lightGo.GetComponent<Light>();
            light.type = LightType.Directional;
            light.color = new Color(1f, 0.95f, 0.85f);
            light.intensity = 1.0f;
            lightGo.transform.rotation = Quaternion.Euler(50f, -30f, 0f);

            // 3. EventSystem with InputSystemUIInputModule
            var esGo = new GameObject("EventSystem", typeof(EventSystem), typeof(InputSystemUIInputModule));

            // 4. UIManager
            var uiMgrGo = new GameObject("UIManager", typeof(UIManager));

            // 5. Canvas Root
            var canvasGo = new GameObject("UICanvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            var canvas = canvasGo.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 0;

            var scaler = canvasGo.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            scaler.matchWidthOrHeight = 0.5f;

            // Attach all menu screens as children
            var mmGo = new GameObject("MainMenuScreen", typeof(MainMenuScreen));
            mmGo.transform.SetParent(canvasGo.transform, false);

            var wsGo = new GameObject("WorldSelectScreen", typeof(WorldSelectScreen));
            wsGo.transform.SetParent(canvasGo.transform, false);

            var wcGo = new GameObject("WorldCreationScreen", typeof(WorldCreationScreen));
            wcGo.transform.SetParent(canvasGo.transform, false);

            var setGo = new GameObject("SettingsScreen", typeof(SettingsScreen));
            setGo.transform.SetParent(canvasGo.transform, false);

            var cwGo = new GameObject("CustomWorldScreen", typeof(CustomWorldScreen));
            cwGo.transform.SetParent(canvasGo.transform, false);

            var msGo = new GameObject("ModStudioScreen", typeof(ModStudioScreen));
            msGo.transform.SetParent(canvasGo.transform, false);

            var mhGo = new GameObject("ModHubScreen", typeof(ModHubScreen));
            mhGo.transform.SetParent(canvasGo.transform, false);

            var aiGo = new GameObject("AIStudioScreen", typeof(AIStudioScreen));
            aiGo.transform.SetParent(canvasGo.transform, false);

            var mpGo = new GameObject("MultiplayerScreen", typeof(MultiplayerScreen));
            mpGo.transform.SetParent(canvasGo.transform, false);

            // Save scene
            string scenePath = "Assets/VYTHERA/Scenes/MainMenuScene.unity";
            EditorSceneManager.SaveScene(scene, scenePath);
            Debug.Log($"[MainMenuSceneBuilder] Saved MainMenuScene to {scenePath}");

            // Configure Build Settings: Scene 0 = MainMenuScene, Scene 1 = GameScene
            EditorBuildSettings.scenes = new EditorBuildSettingsScene[]
            {
                new EditorBuildSettingsScene("Assets/VYTHERA/Scenes/MainMenuScene.unity", true),
                new EditorBuildSettingsScene("Assets/VYTHERA/Scenes/GameScene.unity", true)
            };
            Debug.Log("[MainMenuSceneBuilder] Build Settings updated with MainMenuScene (0) and GameScene (1).");
        }
    }
}
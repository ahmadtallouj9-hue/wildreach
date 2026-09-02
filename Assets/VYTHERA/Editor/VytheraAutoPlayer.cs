using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace VYTHERA.Editor
{
    /// <summary>
    /// Ensures that when the Unity Editor opens, GameScene.unity is loaded
    /// and enters Play Mode seamlessly.
    /// </summary>
    [InitializeOnLoad]
    public static class VytheraAutoPlayer
    {
        private const string ScenePath = "Assets/VYTHERA/Scenes/GameScene.unity";
        private const string SessionKey = "VYTHERA_AutoPlayedSession";

        static VytheraAutoPlayer()
        {
            EditorApplication.delayCall += OnEditorReady;
        }

        private static void OnEditorReady()
        {
            if (Application.isBatchMode) return;

            // 1. Set GameScene as the playModeStartScene so pressing Play anywhere runs GameScene
            var sceneAsset = AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath);
            if (sceneAsset != null)
            {
                EditorSceneManager.playModeStartScene = sceneAsset;
            }

            // 2. Ensure GameScene is loaded if currently on Untitled or empty scene
            var currentScene = EditorSceneManager.GetActiveScene();
            if (string.IsNullOrEmpty(currentScene.path) || currentScene.name == "Untitled")
            {
                if (File.Exists(Path.Combine(Application.dataPath, "../", ScenePath)))
                {
                    Debug.Log("[VytheraAutoPlayer] Untitled scene detected. Opening GameScene.unity...");
                    EditorSceneManager.OpenScene(ScenePath);
                }
            }
        }

        [MenuItem("VYTHERA/Open GameScene")]
        public static void OpenGameScene()
        {
            EditorSceneManager.OpenScene(ScenePath);
        }

        [MenuItem("VYTHERA/Open MainMenuScene")]
        public static void OpenMainMenuScene()
        {
            EditorSceneManager.OpenScene("Assets/VYTHERA/Scenes/MainMenuScene.unity");
        }

        [MenuItem("VYTHERA/Play GameScene")]
        public static void PlayGameScene()
        {
            if (EditorApplication.isPlaying) return;

            var currentScene = EditorSceneManager.GetActiveScene();
            if (currentScene.path != ScenePath)
            {
                EditorSceneManager.OpenScene(ScenePath);
            }

            EditorApplication.delayCall += () =>
            {
                EditorApplication.isPlaying = true;
            };
        }
    }
}

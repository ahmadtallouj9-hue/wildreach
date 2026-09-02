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

            // 1. Ensure GameScene is loaded in Editor
            var currentScene = EditorSceneManager.GetActiveScene();
            if (currentScene.path != ScenePath)
            {
                if (File.Exists(Path.Combine(Application.dataPath, "../", ScenePath)))
                {
                    Debug.Log("[VytheraAutoPlayer] Loading GameScene.unity...");
                    EditorSceneManager.OpenScene(ScenePath);
                }
            }

            // 2. Enter Play Mode once per Editor session launch
            if (!SessionState.GetBool(SessionKey, false))
            {
                SessionState.SetBool(SessionKey, true);
                EditorApplication.delayCall += () =>
                {
                    if (!EditorApplication.isPlaying)
                    {
                        Debug.Log("[VytheraAutoPlayer] Entering Play Mode in GameScene!");
                        EditorApplication.isPlaying = true;
                    }
                };
            }
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

using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace VYTHERA.Editor
{
    /// <summary>
    /// Quick editor shortcuts to load or play VYTHERA scenes.
    /// </summary>
    public static class VytheraAutoPlayer
    {
        private const string ScenePath = "Assets/VYTHERA/Scenes/GameScene.unity";

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

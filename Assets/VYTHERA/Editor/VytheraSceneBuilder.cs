using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine.SceneManagement;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using System.IO;
using VYTHERA.Gameplay.Bootstrap;

namespace VYTHERA.Editor
{
    /// <summary>
    /// Builds GameScene.unity programmatically. Run via menu VYTHERA/Build Game Scene.
    /// Also called automatically on first project open if the scene doesn't exist yet.
    /// </summary>
    public static class VytheraSceneBuilder
    {
        private const string ScenePath = "Assets/VYTHERA/Scenes/GameScene.unity";
        private const string SceneDir  = "Assets/VYTHERA/Scenes";

        [MenuItem("VYTHERA/Build Game Scene")]
        public static void BuildGameScene()
        {
            // Ensure folder exists
            if (!Directory.Exists(Application.dataPath + "/../" + SceneDir))
                Directory.CreateDirectory(Application.dataPath + "/../" + SceneDir);

            // Create or open scene
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            scene.name = "GameScene";

            // ── Bootstrap ────────────────────────────────────────────────────────
            var bootstrap = new GameObject("Bootstrap");
            var gb = bootstrap.AddComponent<GameBootstrapper>();

            var solidMat = AssetDatabase.LoadAssetAtPath<Material>("Assets/VYTHERA/Rendering/Materials/VoxelSolid.mat");
            var cutoutMat = AssetDatabase.LoadAssetAtPath<Material>("Assets/VYTHERA/Rendering/Materials/VoxelCutout.mat");
            var waterMat = AssetDatabase.LoadAssetAtPath<Material>("Assets/VYTHERA/Rendering/Materials/VoxelWater.mat");
            var lavaMat = AssetDatabase.LoadAssetAtPath<Material>("Assets/VYTHERA/Rendering/Materials/VoxelLava.mat");

            var so = new SerializedObject(gb);
            var propSolid = so.FindProperty("_solidMaterial");
            if (propSolid != null) propSolid.objectReferenceValue = solidMat;
            var propCutout = so.FindProperty("_cutoutMaterial");
            if (propCutout != null) propCutout.objectReferenceValue = cutoutMat;
            var propWater = so.FindProperty("_waterMaterial");
            if (propWater != null) propWater.objectReferenceValue = waterMat;
            var propLava = so.FindProperty("_lavaMaterial");
            if (propLava != null) propLava.objectReferenceValue = lavaMat;
            so.ApplyModifiedPropertiesWithoutUndo();

            // ── Directional Light ────────────────────────────────────────────────
            var sunGO = new GameObject("Sun");
            var light = sunGO.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.4f;
            light.color = new Color(1f, 0.96f, 0.84f);
            light.shadows = LightShadows.Soft;
            light.shadowStrength = 0.6f;
            sunGO.transform.rotation = Quaternion.Euler(52f, -30f, 0f);

            // ── Ambient / Fog ────────────────────────────────────────────────────
            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.45f, 0.55f, 0.65f);
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = new Color(0.65f, 0.75f, 0.85f);
            RenderSettings.fogStartDistance = 80f;
            RenderSettings.fogEndDistance = 180f;

            // ── EventSystem ──────────────────────────────────────────────────────
            var esGO = new GameObject("EventSystem");
            esGO.AddComponent<UnityEngine.EventSystems.EventSystem>();
            esGO.AddComponent<UnityEngine.InputSystem.UI.InputSystemUIInputModule>();

            // ── Save & add to build settings ─────────────────────────────────────
            EditorSceneManager.SaveScene(scene, ScenePath);
            AddSceneToBuildSettings(ScenePath);

            Debug.Log("[VytheraSceneBuilder] GameScene created at: " + ScenePath);
        }

        private static void AddSceneToBuildSettings(string path)
        {
            var buildScenes = EditorBuildSettings.scenes;

            // Check if already in build settings
            foreach (var s in buildScenes)
                if (s.path == path) return;

            var newScene = new EditorBuildSettingsScene(path, true);
            var newList = new EditorBuildSettingsScene[buildScenes.Length + 1];
            newList[0] = newScene;
            System.Array.Copy(buildScenes, 0, newList, 1, buildScenes.Length);
            EditorBuildSettings.scenes = newList;

            Debug.Log("[VytheraSceneBuilder] GameScene added to Build Settings (index 0).");
        }
    }
}

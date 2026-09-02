using System.IO;
using UnityEngine;
using UnityEditor;
using UnityEngine.Rendering.Universal;

namespace VYTHERA.Editor
{
    /// <summary>
    /// Runs once when Unity first opens the VYTHERA project (or whenever triggered).
    /// Ensures URP pipeline asset, renderer, and materials are correctly configured.
    /// Menu: VYTHERA/Setup Project
    /// </summary>
    [InitializeOnLoad]
    public static class VytheraProjectSetup
    {
        private const string UrpAssetPath     = "Assets/VYTHERA/Rendering/VytheraURPAsset.asset";
        private const string RendererPath     = "Assets/VYTHERA/Rendering/VytheraURPRenderer.asset";
        private const string MaterialsDir     = "Assets/VYTHERA/Rendering/Materials";
        private const string SetupDoneKey     = "VYTHERA_ProjectSetupDone_v2";

        static VytheraProjectSetup()
        {
            // Only run once per Unity session (not on every recompile)
            EditorApplication.delayCall += RunSetupIfNeeded;
        }

        [MenuItem("VYTHERA/Setup Project")]
        public static void SetupProject()
        {
            SetupURPPipeline();
            SetupMaterials();
            ConfigureAndroidSettings();
            ConfigureInputSettings();

            // Ensure scene exists
            if (!File.Exists(Path.Combine(Application.dataPath, "../Assets/VYTHERA/Scenes/GameScene.unity").Replace('/', Path.DirectorySeparatorChar)))
                VytheraSceneBuilder.BuildGameScene();

            EditorPrefs.SetBool(SetupDoneKey, true);
            Debug.Log("[VytheraProjectSetup] Project setup complete.");
        }

        private static void RunSetupIfNeeded()
        {
            if (!EditorPrefs.GetBool(SetupDoneKey, false))
                SetupProject();
        }

        // ─── URP ─────────────────────────────────────────────────────────────────

        private static void SetupURPPipeline()
        {
            EnsureDirectory(Path.GetDirectoryName(UrpAssetPath));

            // Create renderer if missing
            if (AssetDatabase.LoadAssetAtPath<UniversalRendererData>(RendererPath) == null)
            {
                var rendererData = ScriptableObject.CreateInstance<UniversalRendererData>();
                rendererData.name = "VytheraURPRenderer";
                AssetDatabase.CreateAsset(rendererData, RendererPath);
            }

            // Create pipeline asset if missing
            var existingPipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(UrpAssetPath);
            if (existingPipeline == null)
            {
                var rendererData = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(RendererPath);
                var pipelineAsset = UniversalRenderPipelineAsset.Create(rendererData);
                pipelineAsset.name = "VytheraURPAsset";

                // Sensible defaults for voxel game across PC + Android
                pipelineAsset.renderScale = 1.0f;
                pipelineAsset.shadowDistance = 80f;
                pipelineAsset.shadowCascadeCount = 2;
                pipelineAsset.msaaSampleCount = 2; // 2x MSAA – good balance
                pipelineAsset.supportsHDR = false; // Wider mobile compat

                AssetDatabase.CreateAsset(pipelineAsset, UrpAssetPath);
                AssetDatabase.SaveAssets();

                // Assign as the active pipeline
                UnityEngine.Rendering.GraphicsSettings.defaultRenderPipeline = pipelineAsset;
                UnityEngine.QualitySettings.renderPipeline = pipelineAsset;

                Debug.Log("[VytheraProjectSetup] URP pipeline asset created.");
            }
        }

        // ─── Materials ────────────────────────────────────────────────────────────

        private static void SetupMaterials()
        {
            EnsureDirectory(MaterialsDir);

            CreateMaterialIfMissing("VoxelSolid",  "VYTHERA/VoxelSolid",  new Color(1f,   1f,   1f,   1f),   false);
            CreateMaterialIfMissing("VoxelCutout", "VYTHERA/VoxelCutout", new Color(1f,   1f,   1f,   1f),   false);
            CreateMaterialIfMissing("VoxelWater",  "VYTHERA/VoxelWater",  new Color(0.2f, 0.5f, 0.9f, 0.6f), true);
            CreateMaterialIfMissing("VoxelLava",   "VYTHERA/VoxelLava",   new Color(1f,   0.4f, 0.1f, 1f),   false);
        }

        private static void CreateMaterialIfMissing(string matName, string shaderName, Color color, bool transparent)
        {
            string path = $"{MaterialsDir}/{matName}.mat";
            if (AssetDatabase.LoadAssetAtPath<Material>(path) != null) return;

            var shader = Shader.Find(shaderName);
            if (shader == null)
            {
                Debug.LogWarning($"[VytheraProjectSetup] Shader '{shaderName}' not found, using URP/Lit fallback for {matName}.");
                shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            }

            var mat = new Material(shader) { name = matName };
            mat.color = color;

            AssetDatabase.CreateAsset(mat, path);
            Debug.Log($"[VytheraProjectSetup] Material created: {path}");
        }

        // ─── Android ─────────────────────────────────────────────────────────────

        private static void ConfigureAndroidSettings()
        {
            // Company + product name
            PlayerSettings.companyName = "VYTHERA";
            PlayerSettings.productName = "VYTHERA";

            // Android minimum: API 24 (Android 7.0) for Vulkan support
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel26;
            PlayerSettings.Android.targetSdkVersion = AndroidSdkVersions.AndroidApiLevelAuto;

            // Landscape by default (can be changed)
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.LandscapeLeft;
            PlayerSettings.allowedAutorotateToLandscapeLeft = true;
            PlayerSettings.allowedAutorotateToLandscapeRight = true;
            PlayerSettings.allowedAutorotateToPortrait = false;
            PlayerSettings.allowedAutorotateToPortraitUpsideDown = false;

            // Graphics APIs: Vulkan first, OpenGLES3 fallback
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[]
            {
                UnityEngine.Rendering.GraphicsDeviceType.Vulkan,
                UnityEngine.Rendering.GraphicsDeviceType.OpenGLES3
            });

            // PC: DX11 + DX12
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.StandaloneWindows64, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.StandaloneWindows64, new[]
            {
                UnityEngine.Rendering.GraphicsDeviceType.Direct3D11,
                UnityEngine.Rendering.GraphicsDeviceType.Direct3D12
            });

            // Input System (new only)
            PlayerSettings.SetScriptingBackend(UnityEditor.Build.NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.SetScriptingBackend(UnityEditor.Build.NamedBuildTarget.Standalone, ScriptingImplementation.Mono2x);

            // Enable multithreaded rendering on Android
            PlayerSettings.MTRendering = true;

            // Strip engine code
            PlayerSettings.stripEngineCode = true;

            Debug.Log("[VytheraProjectSetup] Android + PC settings configured.");
        }

        private static void ConfigureInputSettings()
        {
            var assets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset");
            if (assets != null && assets.Length > 0)
            {
                var serializedSettings = new SerializedObject(assets[0]);
                var prop = serializedSettings.FindProperty("activeInputHandler");
                if (prop != null && prop.intValue != 1)
                {
                    prop.intValue = 1; // 1 = Input System Package (New)
                    serializedSettings.ApplyModifiedPropertiesWithoutUndo();
                    Debug.Log("[VytheraProjectSetup] Active input handling set to: Input System Package (New)");
                }
            }
        }

        // ─── Helpers ─────────────────────────────────────────────────────────────

        private static void EnsureDirectory(string path)
        {
            if (!AssetDatabase.IsValidFolder(path))
            {
                var parts = path.Split('/');
                string current = parts[0];
                for (int i = 1; i < parts.Length; i++)
                {
                    string next = current + "/" + parts[i];
                    if (!AssetDatabase.IsValidFolder(next))
                        AssetDatabase.CreateFolder(current, parts[i]);
                    current = next;
                }
            }
        }
    }
}

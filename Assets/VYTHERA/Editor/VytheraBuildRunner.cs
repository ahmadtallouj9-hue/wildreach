using System;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace VYTHERA.Editor
{
    /// <summary>
    /// MenuItem VYTHERA/Create Development Build — builds PC Standalone + Android APK.
    /// </summary>
    public static class VytheraBuildRunner
    {
        private const string BuildDir = "Builds";

        [MenuItem("VYTHERA/Create Development Build (PC)")]
        public static bool BuildPC()
        {
            return RunBuild(BuildTarget.StandaloneWindows64,
                Path.Combine(BuildDir, "PC", "VYTHERA.exe"),
                BuildOptions.Development | BuildOptions.AllowDebugging);
        }

        [MenuItem("VYTHERA/Create Development Build (Android APK)")]
        public static bool BuildAndroid()
        {
            return RunBuild(BuildTarget.Android,
                Path.Combine(BuildDir, "Android", "VYTHERA.apk"),
                BuildOptions.Development);
        }

        private static bool RunBuild(BuildTarget target, string outputPath, BuildOptions opts)
        {
            // Ensure output directory
            string dir = Path.GetDirectoryName(outputPath);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                Directory.CreateDirectory(dir);

            // Collect scenes (index 0 first)
            var scenes = EditorBuildSettings.scenes;
            var scenePaths = new string[scenes.Length];
            for (int i = 0; i < scenes.Length; i++)
                scenePaths[i] = scenes[i].path;

            if (scenePaths.Length == 0)
            {
                Debug.LogError("[VytheraBuildRunner] No scenes in Build Settings. Run VYTHERA/Setup Project first.");
                return false;
            }

            var buildPlayerOptions = new BuildPlayerOptions
            {
                scenes = scenePaths,
                locationPathName = outputPath,
                target = target,
                options = opts
            };

            var report = BuildPipeline.BuildPlayer(buildPlayerOptions);
            bool success = report.summary.result == UnityEditor.Build.Reporting.BuildResult.Succeeded;
            Debug.Log(success
                ? $"[VytheraBuildRunner] Build succeeded: {outputPath}"
                : $"[VytheraBuildRunner] Build FAILED. Check console for errors.");
            return success;
        }
    }
}

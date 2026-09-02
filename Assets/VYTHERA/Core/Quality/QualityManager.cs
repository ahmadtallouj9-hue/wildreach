using System;
using UnityEngine;
using UnityEngine.Rendering.Universal;

namespace VYTHERA.Core.Quality
{
    public enum QualityTier
    {
        VeryLow = 0,
        Low = 1,
        Medium = 2,
        High = 3,
        Ultra = 4
    }

    public enum ShadowMode
    {
        None = 0,
        Basic = 1,
        Soft = 2
    }

    public enum WaterMode
    {
        Flat = 0,
        Simple = 1,
        BSL = 2
    }

    [Serializable]
    public struct QualityProfile
    {
        public QualityTier Tier;
        public float RenderScale;
        public int MaxRenderDimension;
        public int RenderDistanceChunks;
        public ShadowMode Shadows;
        public bool PostProcessing;
        public bool Bloom;
        public bool ColorGrading;
        public WaterMode WaterShading;
        public bool Particles;
        public int AtlasResolution;
        public int FpsCap; // 0 = uncapped, 30 = cap
        public int ChunkMeshBudgetPerFrame;
        public bool WarmSun;
        public bool PauseHidden;

        public static QualityProfile GetDefault(QualityTier tier)
        {
            return tier switch
            {
                QualityTier.VeryLow => new QualityProfile
                {
                    Tier = QualityTier.VeryLow,
                    RenderScale = 0.65f,
                    MaxRenderDimension = 1280,
                    RenderDistanceChunks = 3,
                    Shadows = ShadowMode.None,
                    PostProcessing = false,
                    Bloom = false,
                    ColorGrading = false,
                    WaterShading = WaterMode.Flat,
                    Particles = false,
                    AtlasResolution = 512,
                    FpsCap = 30,
                    ChunkMeshBudgetPerFrame = 1,
                    WarmSun = false,
                    PauseHidden = true
                },
                QualityTier.Low => new QualityProfile
                {
                    Tier = QualityTier.Low,
                    RenderScale = 0.75f,
                    MaxRenderDimension = 1280,
                    RenderDistanceChunks = 4,
                    Shadows = ShadowMode.None,
                    PostProcessing = false,
                    Bloom = false,
                    ColorGrading = false,
                    WaterShading = WaterMode.Flat,
                    Particles = false,
                    AtlasResolution = 512,
                    FpsCap = 0,
                    ChunkMeshBudgetPerFrame = 1,
                    WarmSun = false,
                    PauseHidden = true
                },
                QualityTier.Medium => new QualityProfile
                {
                    Tier = QualityTier.Medium,
                    RenderScale = 0.85f,
                    MaxRenderDimension = 1920,
                    RenderDistanceChunks = 6,
                    Shadows = ShadowMode.None,
                    PostProcessing = false,
                    Bloom = false,
                    ColorGrading = false,
                    WaterShading = WaterMode.Simple,
                    Particles = true,
                    AtlasResolution = 1024,
                    FpsCap = 0,
                    ChunkMeshBudgetPerFrame = 2,
                    WarmSun = false,
                    PauseHidden = true
                },
                QualityTier.High => new QualityProfile
                {
                    Tier = QualityTier.High,
                    RenderScale = 1.0f,
                    MaxRenderDimension = 2560,
                    RenderDistanceChunks = 7,
                    Shadows = ShadowMode.Basic,
                    PostProcessing = true,
                    Bloom = true,
                    ColorGrading = true,
                    WaterShading = WaterMode.BSL,
                    Particles = true,
                    AtlasResolution = 1024,
                    FpsCap = 0,
                    ChunkMeshBudgetPerFrame = 3,
                    WarmSun = true,
                    PauseHidden = true
                },
                QualityTier.Ultra => new QualityProfile
                {
                    Tier = QualityTier.Ultra,
                    RenderScale = 1.0f,
                    MaxRenderDimension = 3840,
                    RenderDistanceChunks = 8,
                    Shadows = ShadowMode.Soft,
                    PostProcessing = true,
                    Bloom = true,
                    ColorGrading = true,
                    WaterShading = WaterMode.BSL,
                    Particles = true,
                    AtlasResolution = 1024,
                    FpsCap = 0,
                    ChunkMeshBudgetPerFrame = 4,
                    WarmSun = true,
                    PauseHidden = true
                },
                _ => GetDefault(QualityTier.Medium)
            };
        }
    }

    /// <summary>
    /// Central manager for performance budgets, quality tier enforcement, and platform adaptability.
    /// </summary>
    public sealed class QualityManager : MonoBehaviour
    {
        public static QualityManager Instance { get; private set; }

        public static QualityProfile Current { get; private set; } = QualityProfile.GetDefault(QualityTier.High);
        public static event Action<QualityProfile> OnQualityChanged;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);

            ApplyTier(DetectDefaultTier());
        }

        public static QualityTier DetectDefaultTier()
        {
            if (Application.isMobilePlatform)
            {
                int sysMem = SystemInfo.systemMemorySize;
                int cores = SystemInfo.processorCount;
                if (sysMem <= 2048 || cores <= 4)
                {
                    return QualityTier.VeryLow;
                }
                return QualityTier.Medium;
            }
            return QualityTier.High;
        }

        public static void ApplyTier(QualityTier tier)
        {
            ApplyProfile(QualityProfile.GetDefault(tier));
        }

        public static void ApplyProfile(QualityProfile profile)
        {
            Current = profile;

            // Target frame rate
            Application.targetFrameRate = profile.FpsCap > 0 ? profile.FpsCap : -1;

            // URP render scale and shadows
            var urpAsset = UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;
            if (urpAsset != null)
            {
                urpAsset.renderScale = profile.RenderScale;
                urpAsset.shadowDistance = profile.RenderDistanceChunks * 16f;
            }

            // Directional light & shadows
            var sun = RenderSettings.sun ?? FindFirstObjectByType<Light>();
            if (sun != null)
            {
                if (profile.Shadows == ShadowMode.None)
                {
                    sun.shadows = LightShadows.None;
                }
                else if (profile.Shadows == ShadowMode.Basic)
                {
                    sun.shadows = LightShadows.Hard;
                }
                else
                {
                    sun.shadows = LightShadows.Soft;
                }
            }

            // Linear fog matching render distance
            RenderSettings.fog = profile.Tier >= QualityTier.Medium;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogStart = Math.Max(16f, (profile.RenderDistanceChunks - 2) * 16f);
            RenderSettings.fogEnd = profile.RenderDistanceChunks * 16f;

            OnQualityChanged?.Invoke(Current);
        }
    }
}

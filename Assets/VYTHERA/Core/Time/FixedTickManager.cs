using System;
using UnityEngine;

namespace VYTHERA.Core.Timing
{
    /// <summary>
    /// Manages the 20 Hz fixed timestep simulation loop matching Minecraft Java Edition (0.05s / tick).
    /// Computes render interpolation alpha: (accumulator / fixedDeltaTime).
    /// </summary>
    public sealed class FixedTickManager : MonoBehaviour
    {
        public const int TickRate = 20;
        public const float FixedDeltaTime = 1f / TickRate; // 0.05s
        public const float MaxAccumulator = 0.25f; // Prevent spiral of death on lag spikes

        public static FixedTickManager Instance { get; private set; }

        public static ulong CurrentTick { get; private set; }
        public static float Alpha { get; private set; }
        public static event Action<ulong, float> OnFixedTick;

        private float _accumulator;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        private void Update()
        {
            float dt = Mathf.Min(Time.unscaledDeltaTime, MaxAccumulator);
            _accumulator += dt;

            while (_accumulator >= FixedDeltaTime)
            {
                CurrentTick++;
                OnFixedTick?.Invoke(CurrentTick, FixedDeltaTime);
                _accumulator -= FixedDeltaTime;
            }

            Alpha = Mathf.Clamp01(_accumulator / FixedDeltaTime);
        }

        public static void ResetTicks()
        {
            CurrentTick = 0;
            if (Instance != null) Instance._accumulator = 0f;
        }
    }
}

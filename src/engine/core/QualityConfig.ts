import { isTouchDevice } from '../platform/device';

/**
 * VYTHERA ENGINE — QualityConfig
 *
 * The engine's single source of truth for performance/scalability budgets.
 * A quality tier is not a UI label: every field here is consumed by an engine
 * subsystem (renderer size caps, shadow mode, chunk streaming budget, mesh
 * budget, post-processing chain, atlas resolution, FPS cap, …). Changing the
 * tier must change engine behavior, and `Game.applyGfx` is the enforcement
 * point that pushes a config into those subsystems.
 *
 * Persistence (localStorage) stays in `render/gfxPrefs.ts` — the engine core
 * is storage-agnostic.
 */

export type QualityTier = 'very-low' | 'low' | 'medium' | 'high' | 'max';

export type ShadowQuality = 'none' | 'basic' | 'soft';
export type WaterShading = 'flat' | 'simple' | 'bsl';

export interface QualityConfig {
  preset: QualityTier;
  /** Renderer pixel ratio cap (devicePixelRatio clamp). */
  pixelRatioCap: number;
  /** Long-side render resolution cap (internal render size). */
  maxRenderDimension: number;
  /** Voxel view distance in chunks. */
  renderDistance: number;
  shadows: ShadowQuality;
  postProcessing: boolean;
  bloom: boolean;
  colorGrade: boolean;
  waterShading: WaterShading;
  particles: boolean;
  /** Procedural texture atlas resolution per tile sheet. */
  atlasResolution: 512 | 1024;
  /** 0 = uncapped; 30 = 30 FPS cap for low-end devices. */
  fpsCap: number;
  /** Max chunk gen/mesh operations per frame (streaming budget). */
  chunkBudget: number;
  /** Warm sun tint for high tiers. */
  warmSun: boolean;
  /** Pause meshing when the tab is hidden. */
  pauseHidden: boolean;
}

/**
 * Tier table. Values are the shipping Wildreach presets — tuned against real
 * devices, do not change without measurements.
 */
export const QUALITY_TIER_CONFIGS: Record<QualityTier, QualityConfig> = {
  'very-low': {
    preset: 'very-low',
    pixelRatioCap: 1.0,
    maxRenderDimension: 1280,
    renderDistance: 3,
    shadows: 'none',
    postProcessing: false,
    bloom: false,
    colorGrade: false,
    waterShading: 'flat',
    particles: false,
    atlasResolution: 512,
    fpsCap: 30,
    chunkBudget: 1,
    warmSun: false,
    pauseHidden: true,
  },
  low: {
    preset: 'low',
    pixelRatioCap: 1.0,
    maxRenderDimension: 1280,
    renderDistance: 4,
    shadows: 'none',
    postProcessing: false,
    bloom: false,
    colorGrade: false,
    waterShading: 'flat',
    particles: false,
    atlasResolution: 512,
    fpsCap: 0,
    chunkBudget: 1,
    warmSun: false,
    pauseHidden: true,
  },
  medium: {
    preset: 'medium',
    pixelRatioCap: 1.25,
    maxRenderDimension: 1920,
    renderDistance: 6,
    shadows: 'none',
    postProcessing: false,
    bloom: false,
    colorGrade: false,
    waterShading: 'simple',
    particles: true,
    atlasResolution: 1024,
    fpsCap: 0,
    chunkBudget: 2,
    warmSun: false,
    pauseHidden: true,
  },
  high: {
    preset: 'high',
    pixelRatioCap: 1.5,
    maxRenderDimension: 2560,
    renderDistance: 7,
    shadows: 'basic',
    postProcessing: true,
    bloom: true,
    colorGrade: true,
    waterShading: 'bsl',
    particles: true,
    atlasResolution: 1024,
    fpsCap: 0,
    chunkBudget: 3,
    warmSun: true,
    pauseHidden: true,
  },
  max: {
    preset: 'max',
    pixelRatioCap: 2.0,
    maxRenderDimension: 3840,
    renderDistance: 8,
    shadows: 'soft',
    postProcessing: true,
    bloom: true,
    colorGrade: true,
    waterShading: 'bsl',
    particles: true,
    atlasResolution: 1024,
    fpsCap: 0,
    chunkBudget: 4,
    warmSun: true,
    pauseHidden: true,
  },
};

export const QUALITY_TIERS: readonly QualityTier[] = ['very-low', 'low', 'medium', 'high', 'max'];

/** Tier ordering: nextTierDown('high') === 'medium'. Null at the bottom. */
export function nextTierDown(tier: QualityTier): QualityTier | null {
  const i = QUALITY_TIERS.indexOf(tier);
  return i > 0 ? QUALITY_TIERS[i - 1]! : null;
}

/**
 * Default tier from device capabilities. Matches the shipped heuristic:
 * 2GB-or-less devices and low-core touch devices start at very-low, other
 * touch devices at medium, everything else at high.
 */
export function detectDefaultQualityTier(): QualityTier {
  if (typeof navigator !== 'undefined') {
    const nav = navigator as unknown as { deviceMemory?: number; hardwareConcurrency?: number };
    const isTouch = isTouchDevice();
    const lowRam = nav.deviceMemory != null && nav.deviceMemory <= 2;
    const lowCores = nav.hardwareConcurrency != null && nav.hardwareConcurrency <= 4;

    if (lowRam || (isTouch && lowCores)) {
      return 'very-low';
    }
    if (isTouch) {
      return 'medium';
    }
  }
  return 'high';
}

export function getTierConfig(tier: QualityTier): QualityConfig {
  return { ...(QUALITY_TIER_CONFIGS[tier] ?? QUALITY_TIER_CONFIGS.medium) };
}

/** Validates an untrusted persisted tier string. */
export function isQualityTier(value: unknown): value is QualityTier {
  return typeof value === 'string' && (QUALITY_TIERS as readonly string[]).includes(value);
}

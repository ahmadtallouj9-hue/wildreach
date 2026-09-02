/**
 * Graphics preferences — persistence adapter over the engine QualityConfig.
 *
 * Types, the preset table, and device-based default detection live in
 * `src/engine/core/QualityConfig.ts` (the engine's single source of truth).
 * This module only owns localStorage read/write for the browser shell.
 * Existing import sites keep working unchanged.
 */
import {
  QUALITY_TIER_CONFIGS,
  detectDefaultQualityTier,
  getTierConfig,
  isQualityTier,
  type QualityConfig,
  type QualityTier,
} from '../engine/core/QualityConfig';

export type GfxPreset = QualityTier;
export type GfxPrefs = QualityConfig;
export type { QualityConfig, QualityTier };

/** Preset table re-exported for existing consumers. Canonical copy is in the engine. */
export const GFX_PRESET_CONFIGS = QUALITY_TIER_CONFIGS;

const STORAGE_KEY = 'gfxPrefs';
const STORAGE_KEY_ALT = 'wildreach.gfxPrefs';

/** Default quality tier from device capabilities (engine detection). */
export function detectDefaultGfxPreset(): GfxPreset {
  return detectDefaultQualityTier();
}

export function getPresetConfig(preset: GfxPreset): GfxPrefs {
  return getTierConfig(preset);
}

export function loadGfxPrefs(): GfxPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY_ALT);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && isQualityTier((parsed as GfxPrefs).preset)) {
        const tier = (parsed as { preset: QualityTier }).preset;
        const base = QUALITY_TIER_CONFIGS[tier];
        return { ...base, ...(parsed as object) } as GfxPrefs;
      }
    }
  } catch {
    /* fallback */
  }

  const defaultPreset = detectDefaultGfxPreset();
  const config = getPresetConfig(defaultPreset);
  saveGfxPrefs(config);
  return config;
}

export function saveGfxPrefs(prefs: GfxPrefs): void {
  try {
    const json = JSON.stringify(prefs);
    localStorage.setItem(STORAGE_KEY, json);
    localStorage.setItem(STORAGE_KEY_ALT, json);
  } catch {
    /* ignore localStorage errors */
  }
}

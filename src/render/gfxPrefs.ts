import { isTouchDevice } from '../util/isTouchDevice';

export type GfxPreset = 'very-low' | 'low' | 'medium' | 'high' | 'max';

export interface GfxPrefs {
  preset: GfxPreset;
  pixelRatioCap: number;
  maxRenderDimension: number;
  renderDistance: number;
  shadows: 'none' | 'basic' | 'soft';
  postProcessing: boolean;
  bloom: boolean;
  colorGrade: boolean;
  waterShading: 'flat' | 'simple' | 'bsl';
  particles: boolean;
  atlasResolution: 512 | 1024;
  fpsCap: number;
  chunkBudget: number;
  warmSun: boolean;
  pauseHidden: boolean;
}

export const GFX_PRESET_CONFIGS: Record<GfxPreset, GfxPrefs> = {
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

const STORAGE_KEY = 'gfxPrefs';
const STORAGE_KEY_ALT = 'wildreach.gfxPrefs';

/**
 * Detects low-spec mobile devices on first run.
 * (e.g. 2GB RAM Android phones, low core count, touch devices)
 */
export function detectDefaultGfxPreset(): GfxPreset {
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

export function getPresetConfig(preset: GfxPreset): GfxPrefs {
  return { ...GFX_PRESET_CONFIGS[preset] ?? GFX_PRESET_CONFIGS.medium };
}

export function loadGfxPrefs(): GfxPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY_ALT);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.preset === 'string' && parsed.preset in GFX_PRESET_CONFIGS) {
        const base = GFX_PRESET_CONFIGS[parsed.preset as GfxPreset];
        return { ...base, ...parsed };
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

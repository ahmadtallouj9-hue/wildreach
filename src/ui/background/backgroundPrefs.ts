export type VytheraBgMode = 'dynamic' | 'static' | 'performance';

export type BgAnimationLevel = 'off' | 'low' | 'normal' | 'high';
export type BgQuality = 'low' | 'medium' | 'high' | 'ultra';
export type BgWeather = 'clear' | 'cloudy' | 'rain' | 'snow' | 'fog';

export interface VytheraBgPrefs {
  mode: VytheraBgMode;
  /** Master animation intensity (default normal). */
  animation: BgAnimationLevel;
  quality: BgQuality;
  /** Optional ambient camera drift — default off. */
  motion: boolean;
  particles: boolean;
  cloudMotion: boolean;
  vegetationMotion: boolean;
  waterMotion: boolean;
  /** Atmosphere overlay strength 0–1. */
  atmosphere: number;
  /** When false, atmosphere overlay is disabled regardless of strength. */
  atmosphereEnabled: boolean;
  /** Weather architecture — only clear is rendered today. */
  weather: BgWeather;
}

export const DEFAULT_BG_PREFS: VytheraBgPrefs = {
  mode: 'dynamic',
  animation: 'normal',
  quality: 'medium',
  motion: false,
  particles: true,
  cloudMotion: true,
  vegetationMotion: true,
  waterMotion: true,
  atmosphere: 0.72,
  atmosphereEnabled: true,
  weather: 'clear',
};

const KEY = 'vythera.bg.prefs';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function clampAtmo(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function parseAnimation(v: unknown): BgAnimationLevel {
  if (v === 'off' || v === 'low' || v === 'normal' || v === 'high') return v;
  return DEFAULT_BG_PREFS.animation;
}

function parseQuality(v: unknown): BgQuality {
  if (v === 'low' || v === 'medium' || v === 'high' || v === 'ultra') return v;
  return DEFAULT_BG_PREFS.quality;
}

function parseWeather(v: unknown): BgWeather {
  if (v === 'clear' || v === 'cloudy' || v === 'rain' || v === 'snow' || v === 'fog') return v;
  return 'clear';
}

/** Map legacy + mode into effective prefs. */
export function normalizeBgPrefs(raw: Partial<VytheraBgPrefs>): VytheraBgPrefs {
  let animation = parseAnimation(raw.animation);
  let quality = parseQuality(raw.quality);

  if (raw.mode === 'static') animation = 'off';
  if (raw.mode === 'performance') {
    if (quality === 'high' || quality === 'ultra') quality = 'medium';
    if (animation === 'high') animation = 'low';
  }

  return {
    mode:
      raw.mode === 'static' || raw.mode === 'performance' || raw.mode === 'dynamic'
        ? raw.mode
        : DEFAULT_BG_PREFS.mode,
    animation,
    quality,
    motion: raw.motion ?? DEFAULT_BG_PREFS.motion,
    particles: raw.particles ?? DEFAULT_BG_PREFS.particles,
    cloudMotion: raw.cloudMotion ?? DEFAULT_BG_PREFS.cloudMotion,
    vegetationMotion: raw.vegetationMotion ?? DEFAULT_BG_PREFS.vegetationMotion,
    waterMotion: raw.waterMotion ?? DEFAULT_BG_PREFS.waterMotion,
    atmosphere: clampAtmo(raw.atmosphere ?? DEFAULT_BG_PREFS.atmosphere),
    atmosphereEnabled: raw.atmosphereEnabled ?? DEFAULT_BG_PREFS.atmosphereEnabled,
    weather: parseWeather(raw.weather),
  };
}

export function loadBgPrefs(): VytheraBgPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_BG_PREFS };
    return normalizeBgPrefs(JSON.parse(raw) as Partial<VytheraBgPrefs>);
  } catch {
    return { ...DEFAULT_BG_PREFS };
  }
}

export function saveBgPrefs(prefs: VytheraBgPrefs): void {
  localStorage.setItem(KEY, JSON.stringify(normalizeBgPrefs(prefs)));
}

export type BgLayerFlags = {
  sky: boolean;
  clouds: boolean;
  sun: boolean;
  farEnv: boolean;
  vegetation: boolean;
  water: boolean;
  atmosphere: boolean;
  ambientLife: boolean;
  animate: boolean;
};

export type BgMotionConfig = {
  cloudSpeed: number;
  vegSway: number;
  waterRipple: number;
  sunShift: number;
  birdRate: number;
  qualityScale: number;
  internalWidth: number;
  internalHeight: number;
};

const ANIM_SPEED: Record<BgAnimationLevel, number> = {
  off: 0,
  low: 0.35,
  normal: 1,
  high: 1.45,
};

const QUALITY: Record<
  BgQuality,
  Pick<BgMotionConfig, 'cloudSpeed' | 'vegSway' | 'waterRipple' | 'birdRate' | 'qualityScale' | 'internalWidth' | 'internalHeight'>
> = {
  low: { cloudSpeed: 0.6, vegSway: 0.4, waterRipple: 0.3, birdRate: 0, qualityScale: 0.85, internalWidth: 320, internalHeight: 180 },
  medium: { cloudSpeed: 1, vegSway: 0.75, waterRipple: 0.65, birdRate: 0.35, qualityScale: 1, internalWidth: 384, internalHeight: 216 },
  high: { cloudSpeed: 1.15, vegSway: 1, waterRipple: 1, birdRate: 0.65, qualityScale: 1, internalWidth: 448, internalHeight: 252 },
  ultra: { cloudSpeed: 1.25, vegSway: 1.15, waterRipple: 1.1, birdRate: 1, qualityScale: 1.1, internalWidth: 512, internalHeight: 288 },
};

export function resolveBgLayers(prefs: VytheraBgPrefs, reducedMotion: boolean): BgLayerFlags {
  const animate = prefs.animation !== 'off' && prefs.mode !== 'static';
  const q = prefs.quality;

  return {
    sky: true,
    sun: animate,
    clouds: animate && prefs.cloudMotion,
    farEnv: true,
    vegetation: animate && prefs.vegetationMotion && q !== 'low',
    water: animate && prefs.waterMotion && q !== 'low',
    atmosphere: prefs.atmosphereEnabled && prefs.atmosphere > 0.01,
    ambientLife: animate && prefs.particles && q !== 'low' && !reducedMotion,
    animate,
  };
}

export function resolveBgMotion(prefs: VytheraBgPrefs, reducedMotion: boolean): BgMotionConfig {
  const base = QUALITY[prefs.quality];
  let speed = ANIM_SPEED[prefs.animation];
  if (reducedMotion) speed *= 0.18;
  if (prefs.mode === 'performance') speed *= 0.55;

  return {
    ...base,
    cloudSpeed: base.cloudSpeed * speed * (prefs.cloudMotion ? 1 : 0),
    vegSway: base.vegSway * speed * (prefs.vegetationMotion ? 1 : 0),
    waterRipple: base.waterRipple * speed * (prefs.waterMotion ? 1 : 0),
    sunShift: 0.08 * speed,
    birdRate: base.birdRate * speed * (prefs.particles ? 1 : 0),
  };
}

export function isReducedMotionPreferred(): boolean {
  return prefersReducedMotion();
}

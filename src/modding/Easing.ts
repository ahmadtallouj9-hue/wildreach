import type { ModEaseCurve } from './ModAsset';

/** Named easing mode for transitions out of a keyframe. */
export type EaseType =
  | 'linear'
  | 'step'
  | 'easeInQuad'
  | 'easeOutQuad'
  | 'easeInOutQuad'
  | 'easeInCubic'
  | 'easeOutCubic'
  | 'easeInOutCubic'
  | 'easeInSine'
  | 'easeOutSine'
  | 'easeInOutSine'
  | 'easeInExpo'
  | 'easeOutExpo'
  | 'easeInOutExpo'
  | 'easeInBack'
  | 'easeOutBack'
  | 'easeInOutBack'
  | 'bounce'
  | 'elastic'
  | 'smooth'
  | 'custom';

export const DEFAULT_EASE_TYPE: EaseType = 'easeInOutCubic';

export const EASE_TYPE_OPTIONS: { id: EaseType; label: string }[] = [
  { id: 'linear', label: 'Linear' },
  { id: 'step', label: 'Step (Hold)' },
  { id: 'easeInSine', label: 'Ease In · Sine' },
  { id: 'easeOutSine', label: 'Ease Out · Sine' },
  { id: 'easeInOutSine', label: 'Ease In-Out · Sine' },
  { id: 'easeInQuad', label: 'Ease In · Quad' },
  { id: 'easeOutQuad', label: 'Ease Out · Quad' },
  { id: 'easeInOutQuad', label: 'Ease In-Out · Quad' },
  { id: 'easeInCubic', label: 'Ease In · Cubic' },
  { id: 'easeOutCubic', label: 'Ease Out · Cubic' },
  { id: 'easeInOutCubic', label: 'Ease In-Out · Cubic' },
  { id: 'easeInExpo', label: 'Ease In · Expo' },
  { id: 'easeOutExpo', label: 'Ease Out · Expo' },
  { id: 'easeInOutExpo', label: 'Ease In-Out · Expo' },
  { id: 'easeInBack', label: 'Ease In · Back' },
  { id: 'easeOutBack', label: 'Ease Out · Back' },
  { id: 'easeInOutBack', label: 'Ease In-Out · Back' },
  { id: 'bounce', label: 'Bounce' },
  { id: 'elastic', label: 'Elastic' },
  { id: 'smooth', label: 'Smooth (Bezier)' },
  { id: 'custom', label: 'Custom Curve' },
];

/** Default CapCut-style smooth bezier (P1 0.6,0.2 · P2 0.3,0.9). */
export const KEYFRAME_EASE: ModEaseCurve = { x1: 0.6, y1: 0.2, x2: 0.3, y2: 0.9 };

export const EASE_BEZIER_PRESETS: Record<string, ModEaseCurve> = {
  linear: { x1: 0, y1: 0, x2: 1, y2: 1 },
  smooth: KEYFRAME_EASE,
  easeIn: { x1: 0.55, y1: 0.05, x2: 0.9, y2: 0.45 },
  easeOut: { x1: 0.1, y1: 0.55, x2: 0.45, y2: 0.95 },
  snap: { x1: 0.85, y1: 0, x2: 0.15, y2: 1 },
  bounce: { x1: 0.34, y1: 1.56, x2: 0.64, y2: 0.24 },
  elastic: { x1: 0.68, y1: -0.55, x2: 0.27, y2: 1.55 },
};

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export function normalizeEaseCurve(ease?: ModEaseCurve): ModEaseCurve {
  if (!ease) return { ...KEYFRAME_EASE };
  return {
    x1: clamp01(ease.x1),
    y1: Number.isFinite(ease.y1) ? ease.y1 : 0,
    x2: clamp01(ease.x2),
    y2: Number.isFinite(ease.y2) ? ease.y2 : 1,
  };
}

export function easeInQuad(t: number): number {
  return t * t;
}
export function easeOutQuad(t: number): number {
  return t * (2 - t);
}
export function easeInOutQuad(t: number): number {
  if (t < 0.5) return 2 * t * t;
  return -1 + (4 - 2 * t) * t;
}
export function easeInCubic(t: number): number {
  return t * t * t;
}
export function easeOutCubic(t: number): number {
  const u = t - 1;
  return u * u * u + 1;
}
export function easeInOutCubic(t: number): number {
  if (t < 0.5) return 4 * t * t * t;
  const u = 2 * t - 2;
  return 0.5 * u * u * u + 1;
}
export function easeInSine(t: number): number {
  return 1 - Math.cos((t * Math.PI) / 2);
}
export function easeOutSine(t: number): number {
  return Math.sin((t * Math.PI) / 2);
}
export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}
export function easeInExpo(t: number): number {
  return t <= 0 ? 0 : Math.pow(2, 10 * t - 10);
}
export function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}
export function easeInOutExpo(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < 0.5) return Math.pow(2, 20 * t - 10) / 2;
  return (2 - Math.pow(2, -20 * t + 10)) / 2;
}
export function easeInBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return c3 * t * t * t - c1 * t * t;
}
export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
export function easeInOutBack(t: number): number {
  const c1 = 1.70158;
  const c2 = c1 * 1.525;
  if (t < 0.5) return (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2;
  return (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
}

export function easeBounce(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) {
    const u = t - 1.5 / d1;
    return n1 * u * u + 0.75;
  }
  if (t < 2.5 / d1) {
    const u = t - 2.25 / d1;
    return n1 * u * u + 0.9375;
  }
  const u = t - 2.625 / d1;
  return n1 * u * u + 0.984375;
}

export function easeElastic(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

/** Map linear time 0–1 through a cubic-bezier curve (P0→P3 with control handles). */
export function cubicBezierEase(
  t: number,
  x1 = KEYFRAME_EASE.x1,
  y1 = KEYFRAME_EASE.y1,
  x2 = KEYFRAME_EASE.x2,
  y2 = KEYFRAME_EASE.y2,
): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let lo = 0;
  let hi = 1;
  let u = t;
  for (let i = 0; i < 12; i++) {
    const inv = 1 - u;
    const x = 3 * inv * inv * u * x1 + 3 * inv * u * u * x2 + u * u * u;
    if (Math.abs(x - t) < 1e-5) break;
    if (x < t) lo = u;
    else hi = u;
    u = (lo + hi) * 0.5;
  }
  const inv = 1 - u;
  return 3 * inv * inv * u * y1 + 3 * inv * u * u * y2 + u * u * u;
}

export function resolveEaseType(easeType?: EaseType, ease?: ModEaseCurve): EaseType {
  if (easeType) return easeType;
  if (ease) return 'custom';
  return DEFAULT_EASE_TYPE;
}

/** Apply selected easing to normalized segment time (0–1). */
export function applyEaseType(
  easeType: EaseType | undefined,
  linearT: number,
  custom?: ModEaseCurve,
): number {
  const t = clamp01(linearT);
  const type = resolveEaseType(easeType, custom);
  switch (type) {
    case 'linear':
      return t;
    case 'step':
      return t < 1 ? 0 : 1;
    case 'easeInQuad':
      return easeInQuad(t);
    case 'easeOutQuad':
      return easeOutQuad(t);
    case 'easeInOutQuad':
      return easeInOutQuad(t);
    case 'easeInCubic':
      return easeInCubic(t);
    case 'easeOutCubic':
      return easeOutCubic(t);
    case 'easeInOutCubic':
      return easeInOutCubic(t);
    case 'easeInSine':
      return easeInSine(t);
    case 'easeOutSine':
      return easeOutSine(t);
    case 'easeInOutSine':
      return easeInOutSine(t);
    case 'easeInExpo':
      return easeInExpo(t);
    case 'easeOutExpo':
      return easeOutExpo(t);
    case 'easeInOutExpo':
      return easeInOutExpo(t);
    case 'easeInBack':
      return easeInBack(t);
    case 'easeOutBack':
      return easeOutBack(t);
    case 'easeInOutBack':
      return easeInOutBack(t);
    case 'bounce':
      return easeBounce(t);
    case 'elastic':
      return easeElastic(t);
    case 'smooth': {
      const curve = normalizeEaseCurve(custom ?? KEYFRAME_EASE);
      return cubicBezierEase(t, curve.x1, curve.y1, curve.x2, curve.y2);
    }
    case 'custom': {
      const curve = normalizeEaseCurve(custom);
      return cubicBezierEase(t, curve.x1, curve.y1, curve.x2, curve.y2);
    }
    default:
      return easeInOutCubic(t);
  }
}

/**
 * Pure atmosphere maths shared by the preview sky.
 *
 * Kept free of three.js and the DOM so the relationship between a style's
 * atmosphere settings and what appears on screen can be tested directly,
 * rather than only by looking at it.
 */
import type { VytheraWorldStyle, WeatherStyle } from '../style/WorldStyle';

/** Time of day implied by each sky preset. */
export const SKY_STYLE_TIME: Record<string, number> = {
  clear: 0.32,
  cloudy: 0.36,
  stormy: 0.4,
  dawn: 0.23,
  dusk: 0.78,
};

/** Cloud cover multiplier for each cloud preset. */
export const CLOUD_STYLE_COVER: Record<string, number> = {
  sparse: 0.45,
  natural: 1,
  heavy: 1.7,
};

export interface WeatherLook {
  /** Multiplies the style's fog distance; below 1 closes the view in. */
  fogScale: number;
  /** Cloud cover added on top of the style's own setting. */
  cloudBoost: number;
  /** How far the sky dome is pulled towards the fog colour. */
  haze: number;
  /** Falling particle count, 0 for none. */
  particles: number;
  particleColor: number;
  /** Fraction of sunlight that survives the weather. */
  lightScale: number;
}

/**
 * Lightweight preview representations of weather. The core game has no weather
 * simulation, so these describe how a style should LOOK, nothing more.
 */
export const WEATHER_LOOKS: Record<WeatherStyle, WeatherLook> = {
  clear: { fogScale: 1, cloudBoost: 0, haze: 0, particles: 0, particleColor: 0xffffff, lightScale: 1 },
  cloudy: { fogScale: 0.85, cloudBoost: 0.7, haze: 0.05, particles: 0, particleColor: 0xffffff, lightScale: 0.82 },
  fog: { fogScale: 0.28, cloudBoost: 0.35, haze: 0.42, particles: 0, particleColor: 0xffffff, lightScale: 0.7 },
  rain: { fogScale: 0.5, cloudBoost: 1.1, haze: 0.24, particles: 5200, particleColor: 0x9fb6c8, lightScale: 0.55 },
  snow: { fogScale: 0.45, cloudBoost: 0.9, haze: 0.3, particles: 3200, particleColor: 0xffffff, lightScale: 0.7 },
};

export interface SunState {
  x: number;
  y: number;
  z: number;
  /** 0 fully night, 1 full day. */
  day: number;
}

/**
 * Sun direction for a time of day.
 *
 * 0 is midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset, so elevation is a sine
 * that peaks at noon and is negative at night.
 */
export function sunDirection(timeOfDay: number, bearing: number): SunState {
  const angle = (timeOfDay - 0.25) * Math.PI * 2;
  const y = Math.sin(angle);
  // The horizontal component is signed, so the sun rises on the bearing and
  // sets on the opposite horizon instead of sliding back the way it came.
  const horizontal = Math.cos(angle);
  const b = bearing * Math.PI * 2;
  const x = Math.cos(b) * horizontal;
  const z = Math.sin(b) * horizontal;
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len, day: dayFactor(y / len) };
}

/** Smooth day/night blend from sun elevation. */
export function dayFactor(sunY: number): number {
  const t = Math.min(1, Math.max(0, (sunY + 0.12) / 0.54));
  return t * t * (3 - 2 * t);
}

/** Total cloud cover a style asks for, including its weather. */
export function cloudCover(style: VytheraWorldStyle): number {
  const a = style.atmosphere;
  const look = WEATHER_LOOKS[a.weather] ?? WEATHER_LOOKS.clear;
  const preset = CLOUD_STYLE_COVER[a.cloudStyle] ?? 1;
  return Math.max(0, (a.cloudDensity ?? 1) * preset + look.cloudBoost);
}

/** Fog far-plane in blocks after the weather is taken into account. */
export function fogDistance(style: VytheraWorldStyle): number {
  const look = WEATHER_LOOKS[style.atmosphere.weather] ?? WEATHER_LOOKS.clear;
  return Math.max(80, (style.atmosphere.fogDistance ?? 640) * look.fogScale);
}

/** Sun state a style resolves to. */
export function sunFor(style: VytheraWorldStyle): SunState {
  const a = style.atmosphere;
  const time = a.timeOfDay ?? SKY_STYLE_TIME[a.skyStyle] ?? 0.32;
  return sunDirection(time, a.sunBearing ?? 0.15);
}

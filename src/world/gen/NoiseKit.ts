import { createNoise2D, createNoise3D } from 'simplex-noise';
import type { Rng } from './SeedSystem';

export type Noise2 = ReturnType<typeof createNoise2D>;
export type Noise3 = ReturnType<typeof createNoise3D>;

export function makeNoise2(rng: Rng): Noise2 {
  return createNoise2D(rng);
}

export function makeNoise3(rng: Rng): Noise3 {
  return createNoise3D(rng);
}

export function fbm2(noise: Noise2, x: number, z: number, octaves: number, lac = 2.05, gain = 0.5): number {
  let v = 0;
  let a = 1;
  let f = 1;
  let n = 0;
  for (let i = 0; i < octaves; i++) {
    v += a * noise(x * f, z * f);
    n += a;
    a *= gain;
    f *= lac;
  }
  return v / n;
}

/** Ridged multi-fractal — good for mountain ranges. */
export function ridged2(noise: Noise2, x: number, z: number, octaves: number): number {
  let v = 0;
  let a = 1;
  let f = 1;
  let n = 0;
  for (let i = 0; i < octaves; i++) {
    const r = 1 - Math.abs(noise(x * f, z * f));
    v += a * r * r;
    n += a;
    a *= 0.5;
    f *= 2.1;
  }
  return v / n;
}

export function fbm3(noise: Noise3, x: number, y: number, z: number, octaves: number): number {
  let v = 0;
  let a = 1;
  let f = 1;
  let n = 0;
  for (let i = 0; i < octaves; i++) {
    v += a * noise(x * f, y * f, z * f);
    n += a;
    a *= 0.5;
    f *= 2.02;
  }
  return v / n;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

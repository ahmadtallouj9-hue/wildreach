/**
 * Deterministic seed derivation for world generation.
 * No global RNG — each subsystem gets an independent mulberry32 stream.
 */

export type Rng = () => number;

/** FNV-1a 32-bit hash of a string. */
export function hashString32(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable mix of two uint32 values. */
export function mix32(a: number, b: number): number {
  let h = (a >>> 0) ^ Math.imul(b >>> 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Coordinate hash in [0, 1). Thread-safe / order-independent. */
export function hash3(x: number, y: number, z: number, salt = 0): number {
  let h = mix32(x | 0, salt | 0);
  h = mix32(h, y | 0);
  h = mix32(h, z | 0);
  return h / 4294967296;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SeedSalt = {
  terrain: 0x01,
  climate: 0x02,
  biomes: 0x03,
  caves: 0x04,
  ores: 0x05,
  trees: 0x06,
  structures: 0x07,
  decorations: 0x08,
  rivers: 0x09,
  warp: 0x0a,
  density: 0x0b,
  detail: 0x0c,
  macro: 0x0d,
  meso: 0x0e,
  landmarks: 0x0f,
} as const;

export type SeedSaltName = keyof typeof SeedSalt;

export class WorldSeed {
  readonly source: string;
  readonly base: number;

  constructor(source: string) {
    this.source = source;
    this.base = hashString32(source);
  }

  /** uint32 seed for a named subsystem. */
  derive(salt: SeedSaltName | number): number {
    const s = typeof salt === 'number' ? salt : SeedSalt[salt];
    return mix32(this.base, s);
  }

  rng(salt: SeedSaltName | number): Rng {
    return mulberry32(this.derive(salt));
  }

  /** Deterministic [0,1) at world XZ (optional Y). */
  at(x: number, z: number, salt: number, y = 0): number {
    return hash3(x, y, z, mix32(this.base, salt));
  }
}

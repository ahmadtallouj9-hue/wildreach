import { makeNoise3, type Noise3 } from './NoiseKit';
import type { WorldSeed } from './SeedSystem';

/** Moderate caves — wider than v1, but no surface blowouts or mega chambers. */
export class CaveGenerator {
  private worm: Noise3;
  private room: Noise3;
  private enabled: boolean;

  constructor(seed: WorldSeed, enabled: boolean) {
    this.enabled = enabled;
    this.worm = makeNoise3(seed.rng('caves'));
    this.room = makeNoise3(seed.rng(0x41));
  }

  isCave(wx: number, y: number, wz: number, surface: number): boolean {
    if (!this.enabled) return false;
    if (y >= surface - 7 || y < 4) return false;

    const depth = surface - y;

    // Occasional medium pockets (underground only).
    const pocket = this.room(wx * 0.012, y * 0.016, wz * 0.012);
    if (pocket > 0.68 && depth > 14 && y < surface - 16) return true;

    // Worm tunnels — a bit wider than the original carve.
    const tunnel = this.worm(wx * 0.022, y * 0.028, wz * 0.022);
    if (Math.abs(tunnel) < 0.12 && depth > 8) {
      const branch = this.worm(wx * 0.034 + 9, y * 0.04, wz * 0.034);
      if (Math.abs(branch) < 0.14 || this.worm(wx * 0.05 + 9, y * 0.055, wz * 0.05) > 0.1) {
        return true;
      }
    }

    return false;
  }
}

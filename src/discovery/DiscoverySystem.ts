import { BIOMES, type BiomeId } from '../world/Biomes';
import type { Landmark } from '../world/LandmarkGen';

export interface DiscoveryEvent {
  kind: 'biome' | 'landmark';
  title: string;
  detail: string;
}

export class DiscoverySystem {
  visitedBiomes = new Set<BiomeId>();
  foundLandmarks = new Map<string, Landmark>();
  private listeners: ((e: DiscoveryEvent) => void)[] = [];

  onDiscover(cb: (e: DiscoveryEvent) => void): void {
    this.listeners.push(cb);
  }

  private emit(e: DiscoveryEvent): void {
    for (const cb of this.listeners) cb(e);
  }

  checkBiome(biome: BiomeId): void {
    if (this.visitedBiomes.has(biome)) return;
    this.visitedBiomes.add(biome);
    const def = BIOMES[biome];
    this.emit({
      kind: 'biome',
      title: `Entered ${def.name}`,
      detail: 'A new reach opens under your feet.',
    });
  }

  checkLandmarks(playerX: number, playerZ: number, landmarks: Landmark[]): void {
    for (const lm of landmarks) {
      if (this.foundLandmarks.has(lm.id)) continue;
      const dx = lm.wx - playerX;
      const dz = lm.wz - playerZ;
      if (dx * dx + dz * dz < 12 * 12) {
        this.foundLandmarks.set(lm.id, lm);
        this.emit({
          kind: 'landmark',
          title: lm.name,
          detail: `Discovered a ${lm.type.replace(/^\w/, (c) => c.toUpperCase())}.`,
        });
      }
    }
  }

  nearestLandmark(
    px: number,
    pz: number,
    landmarks: Landmark[],
  ): { landmark: Landmark; dist: number } | null {
    let best: Landmark | null = null;
    let bestD = Infinity;
    for (const lm of landmarks) {
      const d = Math.hypot(lm.wx - px, lm.wz - pz);
      if (d < bestD) {
        bestD = d;
        best = lm;
      }
    }
    return best ? { landmark: best, dist: bestD } : null;
  }
}

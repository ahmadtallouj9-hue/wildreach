import { CHUNK_HEIGHT, SEA_LEVEL } from '../blocks';
import type { ClimateSample } from './Climate';
import { fbm2, makeNoise2, makeNoise3, lerp, smoothstep, type Noise2, type Noise3 } from './NoiseKit';
import type { WorldSeed } from './SeedSystem';

export type TerrainType = 'balanced' | 'flat' | 'mountains' | 'islands' | 'wild';

/**
 * Multi-scale height + 3D density. Density enables overhangs without random floaters.
 */
export class TerrainShape {
  private hills: Noise2;
  private detail: Noise2;
  private density3: Noise3;

  constructor(
    seed: WorldSeed,
    private readonly terrain: TerrainType,
  ) {
    this.hills = makeNoise2(seed.rng(0x31));
    this.detail = makeNoise2(seed.rng('detail'));
    this.density3 = makeNoise3(seed.rng('density'));
  }

  /** Approximate solid surface Y for column (before cave carve). */
  surfaceHeight(wx: number, wz: number, c: ClimateSample): number {
    const { continentalness: cont, erosion, peaksValleys: peaks, river, mountainFactor, wx: wxw, wz: wzw } =
      c;
    const hills = fbm2(this.hills, wxw * 0.003, wzw * 0.003, 5);
    const detail = this.detail(wx * 0.026, wz * 0.026);
    const micro = this.detail(wx * 0.068 + 12, wz * 0.068) * 0.35;

    const shore = smoothstep(0.28, 0.5, cont);
    const deepOcean = SEA_LEVEL - 18 - Math.max(0, 0.28 - cont) * 40;
    const shallow = SEA_LEVEL - 6 - Math.max(0, 0.4 - cont) * 20;
    const oceanFloor = lerp(deepOcean, shallow, smoothstep(0.18, 0.38, cont));

    const inlandBase =
      SEA_LEVEL +
      5 +
      (cont - 0.5) * 18 +
      hills * (10 - erosion * 5) +
      detail * 3.5 +
      micro * 2;

    let h = lerp(oceanFloor, inlandBase, shore);

    if (river > 0.05 && cont > 0.42) {
      h -= river * river * (9 + (1 - erosion) * 4);
    }

    const range = peaks * peaks;
    h += (peaks * 22 + range * 28 + Math.max(0, hills) * 6) * mountainFactor;
    h += (1 - erosion) * hills * 4;

    if (cont > 0.48) h += Math.max(0, hills) * 3;

    switch (this.terrain) {
      case 'flat':
        h = SEA_LEVEL + 5 + hills * 1.1 + detail;
        break;
      case 'mountains':
        h += peaks * 18 + range * 16;
        break;
      case 'islands': {
        const island = smoothstep(0.1, 0.32, cont);
        h = SEA_LEVEL - 10 + island * 40 + hills * 8;
        break;
      }
      case 'wild':
        h += hills * 8 + peaks * 14 + detail * 5;
        break;
      default:
        break;
    }

    return Math.max(2, Math.min(CHUNK_HEIGHT - 8, Math.floor(h)));
  }

  density(wx: number, y: number, wz: number, surface: number): number {
    const n = this.density3(wx * 0.02, y * 0.026, wz * 0.02);
    const n2 = this.density3(wx * 0.012 + 2.7, y * 0.018, wz * 0.012);
    const vertical = (surface - y) * 0.08;
    return n * 0.55 + n2 * 0.35 + vertical - 0.15;
  }

  shouldCarveOverhang(wx: number, y: number, wz: number, surface: number): boolean {
    if (y >= surface - 3 || y < surface - 24 || y < 6) return false;
    return this.density(wx, y, wz, surface) < -0.18;
  }

  softenHeight(height: number, neighborMin: number): number {
    const drop = height - neighborMin;
    if (drop <= 4) return height;
    return height - Math.min(Math.floor((drop - 4) * 0.4), 7);
  }
}

import { CHUNK_HEIGHT, SEA_LEVEL } from '../blocks';
import type { ClimateSample } from './Climate';
import { fbm2, makeNoise2, makeNoise3, lerp, smoothstep, type Noise2, type Noise3 } from './NoiseKit';
import type { WorldSeed } from './SeedSystem';

export type TerrainType = 'balanced' | 'flat' | 'mountains' | 'islands' | 'wild';

/**
 * Multi-scale height + 3D density.
 * Macro → meso → micro layering for readable "lay of the land" forms.
 */
export class TerrainShape {
  private macro: Noise2;
  private meso: Noise2;
  private hills: Noise2;
  private detail: Noise2;
  private density3: Noise3;

  constructor(
    seed: WorldSeed,
    private readonly terrain: TerrainType,
  ) {
    this.macro = makeNoise2(seed.rng('macro'));
    this.meso = makeNoise2(seed.rng('meso'));
    this.hills = makeNoise2(seed.rng(0x31));
    this.detail = makeNoise2(seed.rng('detail'));
    this.density3 = makeNoise3(seed.rng('density'));
  }

  /** Approximate solid surface Y for column (before cave carve). */
  surfaceHeight(wx: number, wz: number, c: ClimateSample): number {
    const {
      continentalness: cont,
      erosion,
      peaksValleys: peaks,
      river,
      mountainFactor,
      valleyFactor,
      ridgeStrength,
      wx: wxw,
      wz: wzw,
    } = c;

    // --- Macro: continents, broad plains, major valleys ---
    const macroH = fbm2(this.macro, wxw * 0.00042, wzw * 0.00042, 4);
    const mesoH = fbm2(this.meso, wxw * 0.0011, wzw * 0.0011, 4);
    const rolling = macroH * 14 + mesoH * 7;

    const hills = fbm2(this.hills, wxw * 0.003, wzw * 0.003, 4);
    const detail = this.detail(wx * 0.022, wz * 0.022);
    const micro = this.detail(wx * 0.055 + 12, wz * 0.055) * 0.28;

    const shore = smoothstep(0.28, 0.5, cont);
    const deepOcean = SEA_LEVEL - 18 - Math.max(0, 0.28 - cont) * 40;
    const shallow = SEA_LEVEL - 6 - Math.max(0, 0.4 - cont) * 20;
    const oceanFloor = lerp(deepOcean, shallow, smoothstep(0.18, 0.38, cont));

    const inlandBase =
      SEA_LEVEL + 6 + (cont - 0.5) * 16 + rolling + hills * (6 - erosion * 3) + detail * 2.2 + micro;

    let h = lerp(oceanFloor, inlandBase, shore);

    // Valleys between ridges — broad geological basins
    if (cont > 0.44) {
      h -= valleyFactor * valleyFactor * (11 + erosion * 9);
    }

    // Rivers carve toward sea level
    if (river > 0.05 && cont > 0.42) {
      h -= river * river * (12 + (1 - erosion) * 5);
    }

    // Mountain chains from ridged noise
    const range = ridgeStrength * ridgeStrength;
    h += (ridgeStrength * 26 + range * 34 + Math.max(0, peaks) * 8) * mountainFactor;
    h += (1 - erosion) * hills * 3.5;

    // Plateaus on eroded highlands
    if (cont > 0.52 && erosion > 0.62 && mountainFactor < 0.35) {
      const plateau = Math.round((h - SEA_LEVEL) / 5) * 5;
      h = lerp(h, SEA_LEVEL + plateau, 0.55);
    }

    if (cont > 0.48) h += Math.max(0, hills) * 2.5;

    switch (this.terrain) {
      case 'flat':
        h = SEA_LEVEL + 6 + macroH * 3 + mesoH * 1.5 + detail * 0.8;
        break;
      case 'mountains':
        h += ridgeStrength * 22 + range * 20;
        break;
      case 'islands': {
        const island = smoothstep(0.1, 0.32, cont);
        h = SEA_LEVEL - 10 + island * 42 + rolling * 0.6 + hills * 6;
        break;
      }
      case 'wild':
        h += hills * 7 + ridgeStrength * 12 + detail * 4;
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
    if (drop <= 5) return height;
    return height - Math.min(Math.floor((drop - 5) * 0.35), 8);
  }
}

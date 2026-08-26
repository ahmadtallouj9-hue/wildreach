import { makeNoise2, fbm2, ridged2, smoothstep, type Noise2 } from './NoiseKit';
import type { WorldSeed } from './SeedSystem';

/** Climate / multi-scale terrain parameters at a world column. */
export interface ClimateSample {
  continentalness: number;
  erosion: number;
  peaksValleys: number;
  temperature: number;
  humidity: number;
  /** Domain-warped sample coords (for downstream noise). */
  wx: number;
  wz: number;
  /** River proximity 0..1 (1 = river center). */
  river: number;
  /** Mountain blend 0..1 from ridges + cold. */
  mountainFactor: number;
}

export class ClimateSampler {
  private continent: Noise2;
  private erosionN: Noise2;
  private peaks: Noise2;
  private temp: Noise2;
  private moist: Noise2;
  private warp: Noise2;
  private river: Noise2;

  constructor(seed: WorldSeed) {
    this.continent = makeNoise2(seed.rng('terrain'));
    this.erosionN = makeNoise2(seed.rng(0x21));
    this.peaks = makeNoise2(seed.rng(0x22));
    this.temp = makeNoise2(seed.rng('climate'));
    this.moist = makeNoise2(seed.rng(0x23));
    this.warp = makeNoise2(seed.rng('warp'));
    this.river = makeNoise2(seed.rng('rivers'));
  }

  sample(wx: number, wz: number): ClimateSample {
    const warpAmt = 95;
    const wxw = wx + fbm2(this.warp, wx * 0.0015, wz * 0.0015, 3) * warpAmt;
    const wzw = wz + fbm2(this.warp, wx * 0.0015 + 40, wz * 0.0015, 3) * warpAmt;

    // Large wavelength continents / oceans
    const continentalness = fbm2(this.continent, wxw * 0.00038, wzw * 0.00038, 6) * 0.5 + 0.5;
    // Erosion: high = flatter valleys, low = sharper
    const erosion = fbm2(this.erosionN, wxw * 0.0009, wzw * 0.0009, 4) * 0.5 + 0.5;
    // Ridged peaks & valleys for mountain ranges
    const peaksValleys = ridged2(this.peaks, wxw * 0.00072, wzw * 0.00072, 5);

    const temperature = fbm2(this.temp, wxw * 0.0011, wzw * 0.0011, 4) * 0.5 + 0.5;
    const humidity = fbm2(this.moist, wxw * 0.0013, wzw * 0.0013, 4) * 0.5 + 0.5;

    const riverNoise = Math.abs(fbm2(this.river, wxw * 0.00078, wzw * 0.00078, 3));
    const river = continentalness > 0.42 ? smoothstep(0.14, 0.02, riverNoise) : 0;

    const mountainFactor =
      smoothstep(0.48, 0.72, peaksValleys) *
      smoothstep(0.55, 0.28, temperature) *
      smoothstep(0.35, 0.55, continentalness) *
      (1 - erosion * 0.35);

    return {
      continentalness,
      erosion,
      peaksValleys,
      temperature,
      humidity,
      wx: wxw,
      wz: wzw,
      river,
      mountainFactor,
    };
  }
}

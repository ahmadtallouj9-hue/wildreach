import { makeNoise2, fbm2, ridged2, smoothstep, type Noise2 } from './NoiseKit';
import type { WorldSeed } from './SeedSystem';
import { NEUTRAL_TUNING, type TerrainTuning } from '../style/styleTuning';

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
  /** Valley depth factor 0..1 from inverted ridges. */
  valleyFactor: number;
  /** Ridgeline strength 0..1 for mountain chains. */
  ridgeStrength: number;
  /** Mountain blend 0..1 from ridges + cold. */
  mountainFactor: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class ClimateSampler {
  private continent: Noise2;
  private erosionN: Noise2;
  private peaks: Noise2;
  private temp: Noise2;
  private moist: Noise2;
  private warp: Noise2;
  private river: Noise2;

  constructor(
    seed: WorldSeed,
    /** World-style tuning; the neutral default reproduces stock climate. */
    private readonly tuning: TerrainTuning = NEUTRAL_TUNING,
  ) {
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

    const t = this.tuning;
    const mf = t.mountainFreq;
    const bf = t.biomeFreq;

    // Large wavelength continents / oceans
    const cf = 0.00038 * t.macroFreq;
    const continentalness = fbm2(this.continent, wxw * cf, wzw * cf, 6) * 0.5 + 0.5;
    // Erosion: high = flatter valleys, low = sharper
    const erosion = fbm2(this.erosionN, wxw * 0.0009, wzw * 0.0009, 4) * 0.5 + 0.5;
    // Ridged peaks & valleys for mountain ranges
    const peaksValleys = ridged2(this.peaks, wxw * 0.00072 * mf, wzw * 0.00072 * mf, 5);

    // Biome scale stretches the climate fields; variation exaggerates contrast
    // around the midpoint, and the offsets shift the whole world warmer/wetter.
    const rawTemp = fbm2(this.temp, wxw * 0.0011 * bf, wzw * 0.0011 * bf, 4) * 0.5 + 0.5;
    const rawMoist = fbm2(this.moist, wxw * 0.0013 * bf, wzw * 0.0013 * bf, 4) * 0.5 + 0.5;
    const temperature = clamp01((rawTemp - 0.5) * t.biomeVariation + 0.5 + t.temperatureOffset * 0.5);
    const humidity = clamp01((rawMoist - 0.5) * t.biomeVariation + 0.5 + t.moistureOffset * 0.5);

    const rf = 0.00078 * t.riverFreq;
    const riverNoise = Math.abs(fbm2(this.river, wxw * rf, wzw * rf, 3));
    // A wider river widens the band of noise values counted as "river".
    const riverBand = 0.14 * t.riverWidth;
    const river = continentalness > 0.42 ? smoothstep(riverBand, 0.02, riverNoise) : 0;

    // Inverted ridged noise → broad valleys between high ridges
    const vf = 0.00055 * t.valleyFreq;
    const valleyRaw = 1 - ridged2(this.peaks, wxw * vf + 90, wzw * vf, 4);
    const valleyFactor =
      continentalness > 0.44 ? valleyRaw * smoothstep(0.38, 0.62, erosion) : valleyRaw * 0.35;

    const ridgeStrength = ridged2(this.peaks, wxw * 0.00068 * mf, wzw * 0.00068 * mf, 5);

    const mountainFactor =
      smoothstep(0.42, 0.78, ridgeStrength) *
      smoothstep(0.55, 0.28, temperature) *
      smoothstep(0.35, 0.55, continentalness) *
      (1 - erosion * 0.28);

    return {
      continentalness,
      erosion,
      peaksValleys,
      temperature,
      humidity,
      wx: wxw,
      wz: wzw,
      river,
      valleyFactor,
      ridgeStrength,
      mountainFactor,
    };
  }
}

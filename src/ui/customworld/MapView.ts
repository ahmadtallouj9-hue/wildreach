/**
 * Top-down map preview of a world style.
 *
 * Renders elevation, water, snow and vegetation density for the bounded
 * preview region so a creator can read the whole landscape at once — the shape
 * of the coastline and where mountains sit is far clearer from above than from
 * any ground camera.
 */
import { BiomeId } from '../../world/Biomes';
import { selectBiome } from '../../world/gen/BiomeTable';
import type { TerrainField } from '../../world/preview/TerrainField';
import type { VytheraWorldStyle } from '../../world/style/WorldStyle';

/** Map samples are coarse on purpose: this runs on every parameter change. */
const MAP_SAMPLES = 192;

/** Legible top-down colour per biome. Distinct hues matter more than realism. */
const BIOME_MAP_COLORS: Partial<Record<BiomeId, [number, number, number]>> = {
  [BiomeId.Ocean]: [52, 104, 146],
  [BiomeId.DeepOcean]: [32, 74, 116],
  [BiomeId.Beach]: [214, 198, 142],
  [BiomeId.River]: [78, 132, 168],
  [BiomeId.Plains]: [138, 172, 92],
  [BiomeId.Forest]: [74, 126, 66],
  [BiomeId.DenseForest]: [52, 100, 52],
  [BiomeId.BirchForest]: [122, 158, 88],
  [BiomeId.Desert]: [222, 200, 138],
  [BiomeId.Savanna]: [186, 178, 96],
  [BiomeId.Jungle]: [56, 122, 58],
  [BiomeId.Wetlands]: [86, 118, 84],
  [BiomeId.Taiga]: [86, 122, 100],
  [BiomeId.SnowyTaiga]: [166, 190, 186],
  [BiomeId.Mountains]: [132, 128, 120],
  [BiomeId.SnowyMountains]: [216, 224, 230],
  [BiomeId.Tundra]: [196, 204, 200],
};

export class MapView {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D | null;

  constructor() {
    this.canvas.className = 'vy-cw__map';
    this.canvas.width = MAP_SAMPLES;
    this.canvas.height = MAP_SAMPLES;
    this.ctx = this.canvas.getContext('2d');
  }

  render(
    field: TerrainField,
    origin: { x: number; z: number },
    regionBlocks: number,
    style: VytheraWorldStyle,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const image = ctx.createImageData(MAP_SAMPLES, MAP_SAMPLES);
    const step = regionBlocks / MAP_SAMPLES;
    const sea = field.seaLevel;
    const snow = field.snowLine;

    // Two passes: the first finds the actual height range so the shading uses
    // the full contrast available whatever the style's elevation settings.
    const heights = new Float32Array(MAP_SAMPLES * MAP_SAMPLES);
    let min = Infinity;
    let max = -Infinity;
    for (let j = 0; j < MAP_SAMPLES; j++) {
      for (let i = 0; i < MAP_SAMPLES; i++) {
        const h = field.heightAt(origin.x + i * step, origin.z + j * step);
        heights[j * MAP_SAMPLES + i] = h;
        if (h < min) min = h;
        if (h > max) max = h;
      }
    }
    const land = Math.max(1, max - sea);

    for (let j = 0; j < MAP_SAMPLES; j++) {
      for (let i = 0; i < MAP_SAMPLES; i++) {
        const idx = j * MAP_SAMPLES + i;
        const h = heights[idx]!;
        // Slope from the sampled grid gives cheap relief shading.
        const hx = heights[j * MAP_SAMPLES + Math.min(MAP_SAMPLES - 1, i + 1)]!;
        const hz = heights[Math.min(MAP_SAMPLES - 1, j + 1) * MAP_SAMPLES + i]!;
        const shade = 1 + Math.max(-0.45, Math.min(0.45, (h - (hx + hz) / 2) * 0.12));

        let r: number;
        let g: number;
        let b: number;

        if (h <= sea) {
          const depth = Math.min(1, (sea - h) / 26);
          r = 34 + (1 - depth) * 40;
          g = 92 + (1 - depth) * 52;
          b = 128 + (1 - depth) * 46;
        } else if (h > snow) {
          r = 236;
          g = 240;
          b = 246;
        } else {
          // Land is coloured by its actual biome, chosen with the same
          // selector world generation uses, so the map reads as a biome map
          // rather than a height ramp. Elevation then shades within the biome.
          const wx = origin.x + i * step;
          const wz = origin.z + j * step;
          const biome = selectBiome(field.sampleClimate(wx, wz), h);
          const [br, bg, bb] = BIOME_MAP_COLORS[biome] ?? [110, 140, 80];
          const t = Math.min(1, (h - sea) / land);
          // Denser planting reads as deeper green on forested ground.
          const veg = Math.min(1.5, style.vegetation.treeDensity) - 1;
          const lift = 0.86 + t * 0.3;
          r = br * lift - veg * 10;
          g = bg * lift + veg * 8;
          b = bb * lift - veg * 6;
        }

        const o = idx * 4;
        image.data[o] = clampByte(r * shade);
        image.data[o + 1] = clampByte(g * shade);
        image.data[o + 2] = clampByte(b * shade);
        image.data[o + 3] = 255;
      }
    }

    ctx.putImageData(image, 0, 0);
  }

  /** Small data URL used as the saved style's library thumbnail. */
  toThumbnail(size = 96): string {
    const out = document.createElement('canvas');
    out.width = size;
    out.height = size;
    const ctx = out.getContext('2d');
    if (!ctx) return '';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.canvas, 0, 0, size, size);
    return out.toDataURL('image/png');
  }
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

/**
 * Mini heightmap preview for world creation — shows landform silhouette.
 */
import type { TerrainType } from '../../world/gen/TerrainShape';
import { WorldGen } from '../../world/WorldGen';
import { SEA_LEVEL } from '../../world/blocks';
import { phaseFromTime, skyColors } from './pixelPalette';

const W = 160;
const H = 72;

const TERRAIN_TAGS: Record<TerrainType, string> = {
  balanced: 'Rolling hills, valleys, and distant ridges.',
  flat: 'Wide open plains with gentle horizons.',
  mountains: 'High ridges, peaks, and deep valleys.',
  islands: 'Ocean archipelago with coastal cliffs.',
  wild: 'Dense forests, varied elevation, rich biomes.',
};

export function terrainPreviewTag(terrain: TerrainType): string {
  return TERRAIN_TAGS[terrain] ?? TERRAIN_TAGS.balanced;
}

export class WorldPreviewCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'vy-world-preview-canvas';
    this.canvas.width = W;
    this.canvas.height = H;
    this.canvas.setAttribute('aria-hidden', 'true');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('WorldPreviewCanvas: no 2d context');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
  }

  get element(): HTMLCanvasElement {
    return this.canvas;
  }

  render(seed: string, terrain: TerrainType): void {
    const ctx = this.ctx;
    const world = new WorldGen(seed, { terrain, caves: false });
    const colors = skyColors(phaseFromTime(120));

    // Sky bands
    for (let y = 0; y < H * 0.45; y++) {
      ctx.fillStyle = y < H * 0.2 ? colors.top : colors.mid;
      ctx.fillRect(0, y, W, 1);
    }

    const ox = Math.floor(hashSeed(seed) * 48);
    const oz = Math.floor(hashSeed(seed + 'z') * 48);
    let minH = Infinity;
    let maxH = -Infinity;
    const heights: number[] = [];
    for (let x = 0; x < W; x++) {
      const wx = ox + Math.floor(x * 0.85);
      const h = world.getHeight(wx, oz + 24);
      heights.push(h);
      minH = Math.min(minH, h);
      maxH = Math.max(maxH, h);
    }
    const span = Math.max(8, maxH - minH);

    const groundY = Math.floor(H * 0.82);
    for (let x = 0; x < W; x++) {
      const h = heights[x]!;
      const elev = (h - minH) / span;
      const y = groundY - Math.floor(elev * (H * 0.38));
      const bio = world.getBiome(ox + Math.floor(x * 0.85), oz + 24);
      ctx.fillStyle = biomeColor(bio, h);
      for (let yy = y; yy <= groundY; yy++) {
        ctx.fillRect(x, yy, 1, 1);
      }
      if (h < SEA_LEVEL + 1) {
        ctx.fillStyle = '#3888b0';
        ctx.fillRect(x, groundY - 2, 1, 3);
      }
    }

    // Distant ridge line
    ctx.fillStyle = 'rgba(60, 80, 100, 0.55)';
    for (let x = 0; x < W; x++) {
      const ridge =
        groundY -
        Math.floor(H * 0.22) -
        Math.floor(Math.sin((x + ox) * 0.04) * 6 + Math.sin((x + ox) * 0.015) * 10);
      ctx.fillRect(x, ridge, 1, 1);
    }
  }
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)!;
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function biomeColor(biome: number, height: number): string {
  if (height > SEA_LEVEL + 36) return '#8a9498';
  if (height > SEA_LEVEL + 24) return '#6a7870';
  switch (biome) {
    case 3:
      return '#c4a86a';
    case 1:
    case 9:
      return '#3d6a48';
    case 2:
    case 14:
      return '#7a8894';
    case 6:
    case 7:
      return '#3a6a8a';
    default:
      return '#4a9848';
  }
}

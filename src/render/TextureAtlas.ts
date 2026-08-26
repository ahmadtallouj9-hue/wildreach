import * as THREE from 'three';
import { Block } from '../world/blocks';

/** 32px tiles — readable detail without noisy shimmer. */
export const TILE = 32;
export const ATLAS_GRID = 8;
export const ATLAS_PX = TILE * ATLAS_GRID;

export const Tex = {
  GrassTop: 0,
  GrassSide: 1,
  Dirt: 2,
  Stone: 3,
  Sand: 4,
  Water: 5,
  WoodSide: 6,
  WoodTop: 7,
  Leaves: 8,
  Snow: 9,
  Clay: 10,
  Crystal: 11,
  Ruin: 12,
  Moss: 13,
  Gravel: 14,
  Ice: 15,
  DarkStone: 16,
  Torch: 17,
  Lava: 18,
} as const;

/** face: 0=+Y 1=-Y 2=+Z 3=-Z 4=+X 5=-X */
export function faceTexture(block: number, face: number): number {
  switch (block) {
    case Block.Grass:
      if (face === 0) return Tex.GrassTop;
      if (face === 1) return Tex.Dirt;
      return Tex.GrassSide;
    case Block.Dirt:
      return Tex.Dirt;
    case Block.Stone:
      return Tex.Stone;
    case Block.Sand:
      return Tex.Sand;
    case Block.Water:
      return Tex.Water;
    case Block.Wood:
      return face === 0 || face === 1 ? Tex.WoodTop : Tex.WoodSide;
    case Block.Leaves:
      return Tex.Leaves;
    case Block.Snow:
      return Tex.Snow;
    case Block.Clay:
      return Tex.Clay;
    case Block.Crystal:
      return Tex.Crystal;
    case Block.Ruin:
      return Tex.Ruin;
    case Block.Moss:
      return face === 1 ? Tex.Dirt : Tex.Moss;
    case Block.Gravel:
      return Tex.Gravel;
    case Block.Ice:
      return Tex.Ice;
    case Block.DarkStone:
      return Tex.DarkStone;
    case Block.Torch:
      return Tex.Torch;
    case Block.Lava:
      return Tex.Lava;
    default:
      return Tex.Stone;
  }
}

export function tileUv(tile: number): { u0: number; v0: number; u1: number; v1: number } {
  const col = tile % ATLAS_GRID;
  const row = Math.floor(tile / ATLAS_GRID);
  const s = 1 / ATLAS_GRID;
  const pad = 0.5 / ATLAS_PX;
  return {
    u0: col * s + pad,
    v0: 1 - (row + 1) * s + pad,
    u1: (col + 1) * s - pad,
    v1: 1 - row * s - pad,
  };
}

function h21(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function rgb(r: number, g: number, b: number, a = 255): [number, number, number, number] {
  return [
    Math.max(0, Math.min(255, Math.round(r))),
    Math.max(0, Math.min(255, Math.round(g))),
    Math.max(0, Math.min(255, Math.round(b))),
    Math.max(0, Math.min(255, Math.round(a))),
  ];
}

function paint(
  data: Uint8ClampedArray,
  tile: number,
  fn: (x: number, y: number) => [number, number, number, number],
): void {
  const ox = (tile % ATLAS_GRID) * TILE;
  const oy = Math.floor(tile / ATLAS_GRID) * TILE;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const [r, g, b, a] = fn(x, y);
      const i = ((oy + y) * ATLAS_PX + (ox + x)) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
}

export function createTextureAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_PX;
  canvas.height = ATLAS_PX;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(ATLAS_PX, ATLAS_PX);
  const d = img.data;
  const mid = (TILE - 1) * 0.5;

  // Soft turf — subtle blades, no flowers / sparkle.
  paint(d, Tex.GrassTop, (x, y) => {
    const n = h21(x, y);
    const soft = h21(x >> 1, y >> 1);
    let r = 58 + soft * 12;
    let g = 132 + soft * 18 + n * 8;
    let b = 52 + soft * 8;
    // Occasional darker tuft (not high-contrast noise)
    if (n > 0.82 && soft > 0.5) {
      r -= 8;
      g -= 10;
    }
    return rgb(r, g, b);
  });

  paint(d, Tex.GrassSide, (x, y) => {
    const n = h21(x, y + 1);
    if (y < 7) {
      return rgb(50 + n * 8, 120 + n * 14, 48 + n * 4);
    }
    if (y === 7) return rgb(86, 98, 48);
    return rgb(118 + n * 10, 78 + n * 6, 48);
  });

  paint(d, Tex.Dirt, (x, y) => {
    const n = h21(x, y);
    const crumb = h21(x >> 1, y >> 1);
    let r = 120 + n * 14;
    let g = 80 + n * 10;
    let b = 50 + n * 6;
    if (crumb > 0.85) {
      r -= 16;
      g -= 10;
    }
    return rgb(r, g, b);
  });

  paint(d, Tex.Stone, (x, y) => {
    const n = h21(x, y);
    let v = 128 + n * 18;
    if ((x + y * 2) % 9 === 0) v -= 16;
    if (h21(x >> 2, y >> 2) > 0.75) v += 8;
    return rgb(v, v + 2, v + 6);
  });

  paint(d, Tex.Sand, (x, y) => {
    const n = h21(x, y);
    const grain = ((x + y * 3) & 3) === 0 ? -8 : 0;
    return rgb(212 + n * 10 + grain, 194 + n * 8 + grain, 132 + n * 6);
  });

  paint(d, Tex.Water, (x, y) => {
    const w = Math.sin(x * 0.4 + y * 0.25) * 10 + Math.cos(x * 0.2 - y * 0.35) * 6;
    return rgb(26 + w * 0.3, 88 + w * 0.7, 148 + w, 200);
  });

  paint(d, Tex.WoodSide, (x, y) => {
    const groove = x % 4 === 0 ? -14 : 0;
    const n = h21(x, y) * 10;
    return rgb(108 + groove + n, 70 + groove * 0.4, 38);
  });

  paint(d, Tex.WoodTop, (x, y) => {
    const dx = x - mid;
    const dy = y - mid;
    const rings = Math.sin(Math.sqrt(dx * dx + dy * dy) * 0.7) * 12;
    return rgb(146 + rings, 106 + rings * 0.5, 60);
  });

  // Leaves: true holes (alpha 0), not black pixels.
  paint(d, Tex.Leaves, (x, y) => {
    const n = h21(x, y);
    const cluster = h21(x >> 2, y >> 2);
    // Irregular foliage gaps
    if (n < 0.18 || (cluster < 0.25 && n < 0.45)) return rgb(0, 0, 0, 0);
    const sun = n > 0.75 ? 14 : 0;
    return rgb(42 + n * 22 + sun, 118 + n * 32 + sun, 48 + n * 12);
  });

  paint(d, Tex.Snow, (x, y) => {
    const n = h21(x, y);
    const v = 234 + n * 14;
    return rgb(v, v + 1, v + 3);
  });

  paint(d, Tex.Clay, (x, y) => {
    const n = h21(x, y);
    const band = y % 5 === 0 ? -10 : 0;
    return rgb(166 + n * 10 + band, 116 + n * 8, 90);
  });

  paint(d, Tex.Crystal, (x, y) => {
    const dx = Math.abs(x - mid);
    const dy = Math.abs(y - mid);
    const glow = Math.max(0, 14 - (dx + dy) * 0.7);
    return rgb(55 + glow * 2, 185 + glow, 220, 235);
  });

  paint(d, Tex.Ruin, (x, y) => {
    const mortar = x % 8 === 0 || y % 5 === 0;
    if (mortar) return rgb(86, 80, 72);
    const n = h21(x, y);
    return rgb(148 + n * 12, 134 + n * 8, 116);
  });

  paint(d, Tex.Moss, (x, y) => {
    const n = h21(x, y);
    if (n < 0.14) return rgb(0, 0, 0, 0);
    return rgb(34 + n * 16, 108 + n * 22, 50);
  });

  paint(d, Tex.Gravel, (x, y) => {
    const cell = h21(x >> 2, y >> 2);
    const n = h21(x, y);
    const v = 90 + cell * 42 + n * 14;
    return rgb(v, v - 2, v - 8);
  });

  paint(d, Tex.Ice, (x, y) => {
    const crack = (x * 2 + y) % 11 === 0;
    if (crack) return rgb(138, 186, 210, 220);
    return rgb(158, 208, 228, 210);
  });

  paint(d, Tex.DarkStone, (x, y) => {
    const n = h21(x, y);
    let v = 46 + n * 16;
    if ((x + y * 3) % 10 === 0) v += 18;
    return rgb(v, v + 3, v + 8);
  });

  paint(d, Tex.Torch, (x, y) => {
    const cx = x - mid + 0.5;
    // Stick sits at the bottom of the tile (canvas y grows downward).
    if (y >= 14 && Math.abs(cx) <= 1.6) {
      const wood = 78 + ((31 - y) % 3) * 6 + (x % 2) * 4;
      return rgb(wood, 48 + (y % 2) * 4, 22);
    }
    // Flame toward the top
    if (y <= 16) {
      const fy = 1 - y / 16;
      const halfW = 3.4 * (1 - fy * 0.82);
      if (Math.abs(cx) <= halfW) {
        const edge = Math.abs(cx) / Math.max(0.2, halfW);
        if (edge > 0.9 && h21(x, y) < 0.4) return rgb(0, 0, 0, 0);
        const core = 1 - edge;
        if (y < 3 && core > 0.35) return rgb(255, 240, 170);
        if (core > 0.45) return rgb(255, 200, 90);
        if (core > 0.2) return rgb(255, 120, 32);
        return rgb(230, 55, 12);
      }
    }
    return rgb(0, 0, 0, 0);
  });

  paint(d, Tex.Lava, (x, y) => {
    const n = h21(x, y);
    const hot = h21(x >> 1, y >> 1);
    const crack = (x + y * 2) % 7 === 0;
    if (crack) return rgb(255, 200 + n * 20, 60 + hot * 30);
    return rgb(220 + n * 25, 58 + hot * 45, 10 + n * 8);
  });

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapNearestFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 2;
  tex.flipY = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

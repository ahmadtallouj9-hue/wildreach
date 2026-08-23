import * as THREE from 'three';
import { Block } from '../world/blocks';

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

function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Soft ±amp variation — keep textures flat, not noisy. */
function soft(x: number, y: number, amp = 4): number {
  return (hash(x, y) - 0.5) * amp;
}

function paint(
  data: Uint8ClampedArray,
  tile: number,
  fn: (x: number, y: number) => [number, number, number, number],
): void {
  const col = tile % ATLAS_GRID;
  const row = Math.floor(tile / ATLAS_GRID);
  const ox = col * TILE;
  const oy = row * TILE;
  // 4×4 cells → flatter, less detailed look
  const step = 4;
  for (let y = 0; y < TILE; y += step) {
    for (let x = 0; x < TILE; x += step) {
      const [r, g, b, a] = fn(x / step, y / step);
      for (let dy = 0; dy < step; dy++) {
        for (let dx = 0; dx < step; dx++) {
          const i = ((oy + y + dy) * ATLAS_PX + (ox + x + dx)) * 4;
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
          data[i + 3] = a;
        }
      }
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

  paint(d, Tex.GrassTop, (x, y) => {
    const n = soft(x, y, 5);
    return [48 + n, 128 + n, 58 + n * 0.3, 255];
  });
  paint(d, Tex.GrassSide, (x, y) => {
    const n = soft(x, y, 4);
    if (y < 2) return [52 + n, 122 + n, 56, 255];
    return [112 + n, 78 + n * 0.4, 48, 255];
  });
  paint(d, Tex.Dirt, (x, y) => {
    const n = soft(x, y, 4);
    return [118 + n, 80 + n * 0.5, 48, 255];
  });
  paint(d, Tex.Stone, (x, y) => {
    const n = soft(x, y, 5);
    const v = 128 + n;
    return [v, v + 2, v + 4, 255];
  });
  paint(d, Tex.Sand, (x, y) => {
    const n = soft(x, y, 8);
    return [218 + n * 0.3, 198 + n * 0.3, 132, 255];
  });
  paint(d, Tex.Water, (x, y) => {
    const ripple = Math.sin(x * 0.85 + y * 0.35) * 0.5 + Math.cos(x * 0.4 - y * 0.7) * 0.5;
    const n = soft(x, y, 6);
    const base = 28 + n * 0.15 + ripple * 10;
    const g = 95 + n * 0.25 + ripple * 18;
    const b = 145 + n * 0.35 + ripple * 22;
    return [base, g, b, 180];
  });
  paint(d, Tex.WoodSide, (x, y) => {
    const stripe = Math.floor(x) % 2 === 0 ? -6 : 6;
    const n = soft(x, y, 6);
    return [118 + stripe + n, 78 + n * 0.4, 42, 255];
  });
  paint(d, Tex.WoodTop, (x, y) => {
    const n = soft(x, y, 8);
    return [142 + n, 104 + n * 0.5, 62, 255];
  });
  paint(d, Tex.Leaves, (x, y) => {
    const n = soft(x, y, 14);
    return [46 + n * 0.4, 118 + n, 58 + n * 0.3, 255];
  });
  paint(d, Tex.Snow, (x, y) => {
    const n = soft(x, y, 6);
    const v = 236 + n;
    return [v, v + 1, v + 2, 255];
  });
  paint(d, Tex.Clay, (x, y) => {
    const n = soft(x, y, 8);
    return [158 + n, 132 + n * 0.6, 112, 255];
  });
  paint(d, Tex.Crystal, (x, y) => {
    const n = soft(x, y, 10);
    return [70 + n, 205 + n * 0.2, 228, 255];
  });
  paint(d, Tex.Ruin, (x, y) => {
    const n = soft(x, y, 10);
    return [148 + n, 142 + n, 134 + n * 0.7, 255];
  });
  paint(d, Tex.Moss, (x, y) => {
    const n = soft(x, y, 12);
    return [48 + n * 0.2, 122 + n, 64 + n * 0.3, 255];
  });

  for (let t = 14; t < ATLAS_GRID * ATLAS_GRID; t++) {
    paint(d, t, () => [80, 80, 80, 255]);
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

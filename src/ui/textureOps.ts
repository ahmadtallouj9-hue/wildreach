import { CUSTOM_TEX_SIZE } from '../modding/CustomMaterials';

export const TEX_N = CUSTOM_TEX_SIZE;

export function texIdx(x: number, y: number): number {
  return (y * TEX_N + x) * 4;
}

export function setTexPx(
  pixels: number[],
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
): void {
  if (x < 0 || y < 0 || x >= TEX_N || y >= TEX_N) return;
  const i = texIdx(x, y);
  pixels[i] = r;
  pixels[i + 1] = g;
  pixels[i + 2] = b;
  pixels[i + 3] = 255;
}

export function flipTex(pixels: number[], horizontal: boolean): number[] {
  const next = pixels.slice();
  for (let y = 0; y < TEX_N; y++) {
    for (let x = 0; x < TEX_N; x++) {
      const sx = horizontal ? TEX_N - 1 - x : x;
      const sy = horizontal ? y : TEX_N - 1 - y;
      const si = texIdx(sx, sy);
      const di = texIdx(x, y);
      next[di] = pixels[si]!;
      next[di + 1] = pixels[si + 1]!;
      next[di + 2] = pixels[si + 2]!;
      next[di + 3] = pixels[si + 3]!;
    }
  }
  return next;
}

export function rotateTex90(pixels: number[]): number[] {
  const next = pixels.slice();
  for (let y = 0; y < TEX_N; y++) {
    for (let x = 0; x < TEX_N; x++) {
      const si = texIdx(x, y);
      const di = texIdx(TEX_N - 1 - y, x);
      next[di] = pixels[si]!;
      next[di + 1] = pixels[si + 1]!;
      next[di + 2] = pixels[si + 2]!;
      next[di + 3] = pixels[si + 3]!;
    }
  }
  return next;
}

export function mapTexRgb(
  pixels: number[],
  fn: (r: number, g: number, b: number) => [number, number, number],
): void {
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b] = fn(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!);
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
  }
}

export function addTexNoise(pixels: number[]): void {
  for (let i = 0; i < pixels.length; i += 4) {
    const n = (Math.random() - 0.5) * 28;
    pixels[i] = Math.max(0, Math.min(255, pixels[i]! + n));
    pixels[i + 1] = Math.max(0, Math.min(255, pixels[i + 1]! + n));
    pixels[i + 2] = Math.max(0, Math.min(255, pixels[i + 2]! + n));
  }
}

export function floodFillTex(
  pixels: number[],
  x: number,
  y: number,
  nr: number,
  ng: number,
  nb: number,
): void {
  const ti = texIdx(x, y);
  const tr = pixels[ti]!;
  const tg = pixels[ti + 1]!;
  const tb = pixels[ti + 2]!;
  if (tr === nr && tg === ng && tb === nb) return;
  const stack: [number, number][] = [[x, y]];
  const seen = new Uint8Array(TEX_N * TEX_N);
  while (stack.length) {
    const [cx, cy] = stack.pop()!;
    const k = cy * TEX_N + cx;
    if (seen[k]) continue;
    seen[k] = 1;
    const i = texIdx(cx, cy);
    if (pixels[i] !== tr || pixels[i + 1] !== tg || pixels[i + 2] !== tb) continue;
    setTexPx(pixels, cx, cy, nr, ng, nb);
    if (cx > 0) stack.push([cx - 1, cy]);
    if (cx < TEX_N - 1) stack.push([cx + 1, cy]);
    if (cy > 0) stack.push([cx, cy - 1]);
    if (cy < TEX_N - 1) stack.push([cx, cy + 1]);
  }
}

export function drawTexLine(
  stamp: (x: number, y: number) => void,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  for (;;) {
    stamp(x, y);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

export function pixelsToDataUrl(pixels: number[]): string {
  const c = document.createElement('canvas');
  c.width = TEX_N;
  c.height = TEX_N;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(TEX_N, TEX_N);
  for (let i = 0; i < pixels.length; i++) img.data[i] = pixels[i]!;
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

export function averageTexColor(pixels: number[], fallback: [number, number, number]): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    r += pixels[i]!;
    g += pixels[i + 1]!;
    b += pixels[i + 2]!;
    n++;
  }
  if (!n) return fallback;
  return [r / n / 255, g / n / 255, b / n / 255];
}

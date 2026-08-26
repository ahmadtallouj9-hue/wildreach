import { CHUNK_SIZE } from '../blocks';

/** Floor division that is correct for negative dividends (unlike truncating `/`). */
export function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

/** Non-negative remainder congruent to `a` mod `b` (handles negative `a`). */
export function floorMod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

export function worldToChunkX(wx: number, size = CHUNK_SIZE): number {
  return floorDiv(wx, size);
}

export function worldToChunkZ(wz: number, size = CHUNK_SIZE): number {
  return floorDiv(wz, size);
}

export function worldToLocalX(wx: number, size = CHUNK_SIZE): number {
  return floorMod(wx, size);
}

export function worldToLocalZ(wz: number, size = CHUNK_SIZE): number {
  return floorMod(wz, size);
}

export function chunkToWorldX(cx: number, lx: number, size = CHUNK_SIZE): number {
  return cx * size + lx;
}

export function chunkToWorldZ(cz: number, lz: number, size = CHUNK_SIZE): number {
  return cz * size + lz;
}

export function blockToChunk(wx: number, wz: number, size = CHUNK_SIZE): { cx: number; cz: number } {
  return { cx: worldToChunkX(wx, size), cz: worldToChunkZ(wz, size) };
}

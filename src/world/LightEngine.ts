import { CHUNK_HEIGHT, CHUNK_SIZE, lightEmission, lightPasses } from './blocks';
import type { Chunk } from './Chunk';

const SKY_MAX = 15;

export type LightWorld = {
  getBlock(wx: number, y: number, wz: number): number;
  getChunk(cx: number, cz: number): Chunk | undefined;
};

/**
 * Fast column lighting (no BFS). Sky = full daylight in open columns;
 * block emitters get a tiny local falloff. Orders of magnitude cheaper than flood-fill.
 */
export function rebuildChunkLights(chunk: Chunk, _world: LightWorld): void {
  chunk.skyLight.fill(0);
  chunk.blockLight.fill(0);

  const emitters: number[] = [];

  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      let sky = SKY_MAX;
      for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
        const i = chunk.index(x, y, z);
        const b = chunk.voxels[i]!;
        if (!lightPasses(b)) {
          sky = 0;
          chunk.skyLight[i] = 0;
        } else {
          // Soft cave fill so sealed air isn't pitch black (still well below daylight).
          chunk.skyLight[i] = sky > 0 ? sky : 5;
        }
        const em = lightEmission(b);
        if (em > 0) {
          chunk.blockLight[i] = em;
          emitters.push(x, y, z, em);
        }
      }
    }
  }

    // Local torch/crystal glow (radius ≤ 8) — no cross-chunk BFS.
  for (let e = 0; e < emitters.length; e += 4) {
    const ex = emitters[e]!;
    const ey = emitters[e + 1]!;
    const ez = emitters[e + 2]!;
    const em = emitters[e + 3]!;
    const r = Math.min(8, em);
    for (let dy = -r; dy <= r; dy++) {
      const y = ey + dy;
      if (y < 0 || y >= CHUNK_HEIGHT) continue;
      for (let dz = -r; dz <= r; dz++) {
        const z = ez + dz;
        if (z < 0 || z >= CHUNK_SIZE) continue;
        for (let dx = -r; dx <= r; dx++) {
          const x = ex + dx;
          if (x < 0 || x >= CHUNK_SIZE) continue;
          const dist = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
          if (dist === 0 || dist > r) continue;
          const i = chunk.index(x, y, z);
          if (!lightPasses(chunk.voxels[i]!)) continue;
          const lvl = em - dist;
          if (lvl > chunk.blockLight[i]!) chunk.blockLight[i] = lvl;
        }
      }
    }
  }

  chunk.lightsDirty = false;
}

export function sampleLight(world: LightWorld, wx: number, y: number, wz: number): number {
  if (y < 0) return 0;
  if (y >= CHUNK_HEIGHT) return SKY_MAX;
  const cx = Math.floor(wx / CHUNK_SIZE);
  const cz = Math.floor(wz / CHUNK_SIZE);
  const chunk = world.getChunk(cx, cz);
  if (!chunk) return 8;
  const lx = wx - cx * CHUNK_SIZE;
  const lz = wz - cz * CHUNK_SIZE;
  const i = chunk.index(lx, y, lz);
  return Math.max(chunk.skyLight[i]!, chunk.blockLight[i]!);
}

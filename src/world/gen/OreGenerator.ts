import { Block, CHUNK_HEIGHT, CHUNK_SIZE } from '../blocks';
import { hash3 } from './SeedSystem';
import type { WorldSeed } from './SeedSystem';

export interface OreVeinDef {
  id: string;
  block: number;
  minY: number;
  maxY: number;
  /** Attempts per chunk. */
  attempts: number;
  veinSize: number;
  /** Skip if column hash above this. */
  rarity: number;
}

/** Ores mapped to existing renderable blocks (no new block IDs). */
export const ORE_DEFS: OreVeinDef[] = [
  { id: 'gravel', block: Block.Gravel, minY: 8, maxY: 90, attempts: 6, veinSize: 6, rarity: 0.55 },
  { id: 'clay', block: Block.Clay, minY: 20, maxY: 70, attempts: 4, veinSize: 5, rarity: 0.45 },
  { id: 'dark', block: Block.DarkStone, minY: 4, maxY: 40, attempts: 5, veinSize: 5, rarity: 0.5 },
  { id: 'crystal', block: Block.Crystal, minY: 4, maxY: 28, attempts: 2, veinSize: 3, rarity: 0.28 },
];

export class OreGenerator {
  private salt: number;

  constructor(seed: WorldSeed) {
    this.salt = seed.derive('ores');
  }

  /** Place veins into chunk voxels. Only replaces Stone / DarkStone. */
  placeVeins(cx: number, cz: number, voxels: Uint8Array): void {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;

    for (const ore of ORE_DEFS) {
      for (let a = 0; a < ore.attempts; a++) {
        const r = hash3(cx, a, cz, mix(this.salt, ore.id.length * 17 + a));
        if (r > ore.rarity) continue;

        const lx = Math.floor(hash3(cx, a * 3, cz, this.salt + 1) * CHUNK_SIZE);
        const lz = Math.floor(hash3(cx, a * 5, cz, this.salt + 2) * CHUNK_SIZE);
        const y =
          ore.minY +
          Math.floor(hash3(cx, a * 7, cz, this.salt + 3) * Math.max(1, ore.maxY - ore.minY));

        let x = ox + lx;
        let yy = y;
        let z = oz + lz;

        for (let n = 0; n < ore.veinSize; n++) {
          const llx = x - ox;
          const llz = z - oz;
          if (llx >= 0 && llx < CHUNK_SIZE && llz >= 0 && llz < CHUNK_SIZE && yy > 0 && yy < CHUNK_HEIGHT) {
            const i = llx + llz * CHUNK_SIZE + yy * CHUNK_SIZE * CHUNK_SIZE;
            const b = voxels[i]!;
            if (b === Block.Stone || b === Block.DarkStone) {
              voxels[i] = ore.block;
            }
          }
          const step = hash3(x, yy + n, z, this.salt + n);
          x += step < 0.33 ? -1 : step < 0.66 ? 1 : 0;
          z += step < 0.33 ? 0 : step < 0.66 ? -1 : 1;
          yy += step > 0.7 ? 1 : step < 0.25 ? -1 : 0;
          yy = Math.max(1, Math.min(CHUNK_HEIGHT - 2, yy));
        }
      }
    }
  }
}

function mix(a: number, b: number): number {
  return (Math.imul(a ^ b, 0x9e3779b1) >>> 0);
}

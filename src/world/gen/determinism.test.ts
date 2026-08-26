/**
 * Determinism / golden checks for world generation.
 * Run: npx tsx src/world/gen/determinism.test.ts
 */
import { CHUNK_SIZE } from '../blocks';
import { WorldGen } from '../WorldGen';
import { floorDiv, floorMod, worldToChunkX, worldToLocalX } from './WorldCoords';
import { WORLD_GENERATION_VERSION } from './version';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function chunkFingerprint(seed: string, cx: number, cz: number): string {
  const g = new WorldGen(seed, { terrain: 'balanced', caves: true });
  const voxels = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * 144);
  g.fillChunk(cx, cz, voxels);
  let h = 2166136261;
  for (let i = 0; i < voxels.length; i++) {
    h ^= voxels[i]!;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function main(): void {
  console.log(`WORLD_GENERATION_VERSION=${WORLD_GENERATION_VERSION}`);

  // Coordinate math (negative)
  assert(floorDiv(-1, 16) === -1, 'floorDiv(-1,16)');
  assert(floorMod(-1, 16) === 15, 'floorMod(-1,16)');
  assert(worldToChunkX(-1) === -1, 'worldToChunkX(-1)');
  assert(worldToLocalX(-1) === 15, 'worldToLocalX(-1)');
  assert(worldToChunkX(-17) === -2, 'worldToChunkX(-17)');

  // Same seed = same chunk
  const a = chunkFingerprint('vythera-test', 2, -3);
  const b = chunkFingerprint('vythera-test', 2, -3);
  assert(a === b, `same seed mismatch ${a} vs ${b}`);

  // Different seed = different chunk (almost always)
  const c = chunkFingerprint('other-seed', 2, -3);
  assert(a !== c, 'different seeds produced identical chunk');

  // Order independence: generate neighbors in different orders, compare center
  const order1 = ['0,0', '1,0', '0,1'] as const;
  const order2 = ['0,1', '0,0', '1,0'] as const;
  const genSet = (order: readonly string[]) => {
    const map = new Map<string, string>();
    for (const key of order) {
      const [cx, cz] = key.split(',').map(Number) as [number, number];
      map.set(key, chunkFingerprint('order-seed', cx, cz));
    }
    return map;
  };
  const m1 = genSet(order1);
  const m2 = genSet(order2);
  for (const key of order1) {
    assert(m1.get(key) === m2.get(key), `order independence failed at ${key}`);
  }

  // Negative chunk coords
  const n1 = chunkFingerprint('neg', -1, -1);
  const n2 = chunkFingerprint('neg', -1, -1);
  assert(n1 === n2, 'negative chunk unstable');

  // Golden-ish samples (version-gated)
  const g = new WorldGen('golden-v2', { caves: true });
  const h0 = g.getHeight(0, 0);
  const bio = g.getBiome(0, 0);
  assert(h0 >= 2 && h0 < 144, `height out of range: ${h0}`);
  assert(typeof bio === 'number', 'biome missing');

  console.log('determinism tests OK', { a, h0, bio, n1 });
}

main();

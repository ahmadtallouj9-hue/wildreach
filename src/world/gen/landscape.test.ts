/**
 * Landscape / macro-terrain generation tests.
 * Run: npm run test:landscape
 */
import { CHUNK_SIZE, SEA_LEVEL } from '../blocks';
import { WorldGen } from '../WorldGen';
import { WORLD_GENERATION_VERSION } from './version';
import { vegetationDensity } from './BiomeBlend';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(WORLD_GENERATION_VERSION === 5, 'expected generation version 5');

const world = new WorldGen('landscape-v5', { terrain: 'balanced', caves: false });

// Height range sanity
let minH = 999;
let maxH = -999;
for (let z = 0; z < 64; z += 4) {
  for (let x = 0; x < 64; x += 4) {
    const h = world.getHeight(x, z);
    minH = Math.min(minH, h);
    maxH = Math.max(maxH, h);
  }
}
assert(maxH - minH > 12, 'terrain should have readable elevation range');
assert(minH >= 2, 'min height bound');

// Valley / ridge climate fields exist
const sample = world.sampleClimate(40, 40);
assert(sample.climate.valleyFactor >= 0 && sample.climate.valleyFactor <= 1, 'valleyFactor');
assert(sample.climate.ridgeStrength >= 0 && sample.climate.ridgeStrength <= 1, 'ridgeStrength');

// Rivers follow low areas — river centers should be lower than neighbors on average
let riverDrops = 0;
let riverSamples = 0;
for (let z = 16; z < 96; z += 8) {
  for (let x = 16; x < 96; x += 8) {
    const c = world.sampleClimate(x, z);
    if (c.climate.river < 0.5) continue;
    const h0 = world.getHeight(x, z);
    const h1 = world.getHeight(x + 2, z);
    const h2 = world.getHeight(x, z + 2);
    if (h0 < h1 || h0 < h2) riverDrops++;
    riverSamples++;
  }
}
if (riverSamples > 4) {
  assert(riverDrops / riverSamples > 0.35, 'rivers tend to sit in valleys');
}

// Chunk border consistency
const vA = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * 144);
const vB = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * 144);
world.fillChunk(1, 0, vA);
world.fillChunk(2, 0, vB);
const edgeA = vA[CHUNK_SIZE - 1 + 8 * CHUNK_SIZE + 50 * CHUNK_SIZE * CHUNK_SIZE]!;
const edgeB = vB[0 + 8 * CHUNK_SIZE + 50 * CHUNK_SIZE * CHUNK_SIZE]!;
assert(edgeA === edgeB || edgeA === 0 || edgeB === 0, 'chunk edge should align or be air');

// Vegetation density responds to elevation
const low = vegetationDensity(sample.climate, SEA_LEVEL + 8, SEA_LEVEL);
const high = vegetationDensity(sample.climate, SEA_LEVEL + 42, SEA_LEVEL);
assert(high < low, 'high elevation reduces vegetation density');

// Landmark determinism via repeated chunk gen
const fp1 = chunkFp('landmark-seed', 0, 0);
const fp2 = chunkFp('landmark-seed', 0, 0);
assert(fp1 === fp2, 'landmark terrain deterministic');

function chunkFp(seed: string, cx: number, cz: number): string {
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

console.log('landscape tests OK', { minH, maxH, riverSamples, version: WORLD_GENERATION_VERSION });

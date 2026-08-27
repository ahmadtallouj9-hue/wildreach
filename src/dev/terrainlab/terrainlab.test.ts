import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TERRAIN_RESOLUTIONS,
  TerrainField,
  cellsPerBlock,
  cellsPerBlockArea,
  cellsPerBlockVolume,
  quantizeToCell,
} from '../../world/preview/TerrainField';
import { BENCH_SEED, REGION_BLOCKS } from './TerrainLab';

test('resolution conversions match the required exact values', () => {
  assert.deepEqual([...TERRAIN_RESOLUTIONS], [1, 0.5, 0.25, 0.125]);
  assert.deepEqual(TERRAIN_RESOLUTIONS.map(cellsPerBlock), [1, 2, 4, 8]);
  assert.deepEqual(TERRAIN_RESOLUTIONS.map(cellsPerBlockArea), [1, 4, 16, 64]);
  assert.deepEqual(TERRAIN_RESOLUTIONS.map(cellsPerBlockVolume), [1, 8, 64, 512]);
});

test('height quantization lands exactly on the cell grid', () => {
  for (const r of TERRAIN_RESOLUTIONS) {
    for (let i = 0; i < 200; i++) {
      const h = 30 + i * 0.173;
      const q = quantizeToCell(h, r);
      assert.ok(Math.abs(q / r - Math.round(q / r)) < 1e-9, `r=${r} h=${h} q=${q}`);
      assert.ok(Math.abs(q - h) <= r / 2 + 1e-9);
    }
  }
});

test('the benchmark field is deterministic for a fixed seed', () => {
  const a = new TerrainField(BENCH_SEED, 'balanced');
  const b = new TerrainField(BENCH_SEED, 'balanced');
  for (let i = 0; i < 60; i++) {
    const x = i * 7.25;
    const z = 512 - i * 3.5;
    assert.equal(a.heightAt(x, z), b.heightAt(x, z));
  }
});

test('all resolutions describe the same landform, not different terrain', () => {
  const field = new TerrainField(BENCH_SEED, 'balanced');
  // Sampling the same world position must agree regardless of the grid used,
  // since resolution only controls sampling density.
  for (let i = 0; i < 40; i++) {
    const x = 64 + i * 4;
    const z = 96 + i * 4;
    const base = field.heightAt(x, z);
    for (const r of TERRAIN_RESOLUTIONS) {
      const q = quantizeToCell(base, r);
      assert.ok(Math.abs(q - base) <= r / 2 + 1e-9, `r=${r} drifted from the shared landform`);
    }
  }
});

test('tiles are deterministic and correctly sized at every resolution', () => {
  const field = new TerrainField(BENCH_SEED, 'balanced');
  for (const r of TERRAIN_RESOLUTIONS) {
    const t1 = field.buildTile(128, 128, 8, r);
    const t2 = field.buildTile(128, 128, 8, r);
    assert.equal(t1.n, Math.round(8 / r));
    assert.equal(t1.cell, r);
    assert.deepEqual(Array.from(t1.heights), Array.from(t2.heights));
    assert.deepEqual(Array.from(t1.materials), Array.from(t2.materials));
    for (const h of t1.heights) {
      assert.ok(Math.abs(h / r - Math.round(h / r)) < 1e-9);
    }
  }
});

test('tile borders agree with neighbouring tiles', () => {
  const field = new TerrainField(BENCH_SEED, 'balanced');
  const r = 0.25;
  const left = field.buildTile(64, 64, 8, r);
  const right = field.buildTile(72, 64, 8, r);
  // Last column of `left` sits one cell before `right`'s first column; both
  // must come from the same continuous field.
  for (let j = 0; j < left.n; j++) {
    const edge = field.heightAt(72, 64 + j * r);
    assert.equal(right.heights[j * right.n]!, quantizeToCell(edge, r));
  }
});

test('LOD steps coarsen the grid without changing tile extent', () => {
  const field = new TerrainField(BENCH_SEED, 'balanced');
  const fine = field.buildTile(0, 0, 32, 0.25, 1);
  const coarse = field.buildTile(0, 0, 32, 0.25, 4);
  assert.equal(fine.n, 128);
  assert.equal(coarse.n, 32);
  assert.equal(fine.cell, 0.25);
  assert.equal(coarse.cell, 1);
});

test('region cell counts scale as the square of the subdivision', () => {
  assert.equal(TerrainField.surfaceCells(REGION_BLOCKS, 1), 512 * 512);
  assert.equal(TerrainField.surfaceCells(REGION_BLOCKS, 0.5), 1024 * 1024);
  assert.equal(TerrainField.surfaceCells(REGION_BLOCKS, 0.25), 2048 * 2048);
  assert.equal(TerrainField.surfaceCells(REGION_BLOCKS, 0.125), 4096 * 4096);
});


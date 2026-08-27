import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SURFACE_STEPS,
  TERRAIN_SUBDIVISIONS,
  TERRAIN_VOXELS_PER_BLOCK,
  TERRAIN_VOXEL_SIZE,
  blockToTerrainVoxel,
  quantizeHeight,
  splitSurfaceHeight,
  surfaceHeightFromStep,
  terrainVoxelToWorld,
  worldToBlock,
  worldToTerrainVoxel,
} from './terrainResolution';

test('terrain voxel constants are internally consistent', () => {
  assert.equal(TERRAIN_VOXEL_SIZE, 0.25);
  assert.equal(TERRAIN_SUBDIVISIONS, 4);
  assert.equal(TERRAIN_VOXELS_PER_BLOCK, 64);
  assert.equal(SURFACE_STEPS, 4);
});

test('block and terrain voxel conversions round-trip', () => {
  for (let b = -8; b <= 8; b++) {
    assert.equal(terrainVoxelToWorld(blockToTerrainVoxel(b)), b);
    assert.equal(worldToBlock(b + 0.5), b);
  }
  assert.equal(worldToTerrainVoxel(1.75), 7);
  assert.equal(worldToTerrainVoxel(-0.25), -1);
});

test('quantizeHeight snaps to the terrain grid and LEGACY snaps to blocks', () => {
  assert.equal(quantizeHeight(64.13, 'HIGH_RESOLUTION'), 64.25);
  assert.equal(quantizeHeight(64.13, 'LEGACY'), 64);
  assert.equal(quantizeHeight(64.9, 'LEGACY'), 64);

  // Every quantized value must land exactly on a terrain voxel boundary.
  for (let i = 0; i < 500; i++) {
    const h = 40 + i * 0.137;
    const q = quantizeHeight(h, 'HIGH_RESOLUTION');
    assert.ok(Math.abs(q / TERRAIN_VOXEL_SIZE - Math.round(q / TERRAIN_VOXEL_SIZE)) < 1e-9);
    assert.ok(Math.abs(q - h) <= TERRAIN_VOXEL_SIZE / 2 + 1e-9);
  }
});

test('splitSurfaceHeight produces a valid step and recombines exactly', () => {
  for (let i = 0; i < 500; i++) {
    const h = 20 + i * 0.211;
    const { blockHeight, step } = splitSurfaceHeight(h, 'HIGH_RESOLUTION');
    assert.ok(Number.isInteger(blockHeight), `blockHeight ${blockHeight} not integer`);
    assert.ok(step >= 0 && step < SURFACE_STEPS, `step ${step} out of range`);
    const recombined = surfaceHeightFromStep(blockHeight, step);
    assert.ok(Math.abs(recombined - quantizeHeight(h, 'HIGH_RESOLUTION')) < 1e-9);
  }
});

test('LEGACY mode never emits a sub-block step', () => {
  for (let i = 0; i < 200; i++) {
    const { blockHeight, step } = splitSurfaceHeight(30 + i * 0.31, 'LEGACY');
    assert.equal(step, 0);
    assert.ok(Number.isInteger(blockHeight));
  }
});

test('quantization is deterministic and monotonic', () => {
  let prev = -Infinity;
  for (let i = 0; i < 300; i++) {
    const h = 10 + i * 0.05;
    const a = quantizeHeight(h);
    const b = quantizeHeight(h);
    assert.equal(a, b, 'quantization must be pure');
    assert.ok(a >= prev, 'quantization must not invert ordering');
    prev = a;
  }
});

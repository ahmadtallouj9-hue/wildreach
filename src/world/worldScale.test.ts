/**
 * World scale contract.
 *
 * The point of the scale system is that a world stays proportional to itself
 * at any block size, so most of these tests compare ratios rather than
 * absolute lengths.
 *
 * Run: npm run test:worldscale
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  DEFAULT_WORLD_SCALE,
  MAX_WORLD_VOXEL_SIZE,
  MIN_WORLD_VOXEL_SIZE,
  WORLD_SCALE_PRESETS,
  assetMatchesWorldScale,
  assetSizeToWorld,
  describeWorldScale,
  gridDistanceToWorld,
  gridToWorld,
  hasCleanTerrainRatio,
  isPresetScale,
  makeWorldScale,
  matchWorldScaleFactor,
  sameWorldScale,
  sanitizeWorldVoxelSize,
  snapToGrid,
  snapToTerrainCell,
  terrainCellsPerWorldVoxel,
  terrainCellsPerWorldVoxelVolume,
  worldDistanceToGrid,
  worldToGrid,
  worldToGridCell,
} from './worldScale';
import { createDefaultStyle, worldScaleOf } from './style/WorldStyle';
import { sanitizeStyle } from './style/styleValidation';
import { styleFingerprint } from './style/styleHash';

const scaleOf = (worldVoxelSize: number, terrainVoxelSize = 0.25) =>
  makeWorldScale({ worldVoxelSize, terrainVoxelSize });

test('a stock world is one unit per block', () => {
  assert.equal(DEFAULT_WORLD_SCALE.worldVoxelSize, 1);
  assert.equal(DEFAULT_WORLD_SCALE.gameplayBlockSize, 1);
  assert.equal(DEFAULT_WORLD_SCALE.terrainVoxelSize, 0.25);
});

test('grid and world conversion round-trip at every preset', () => {
  for (const size of WORLD_SCALE_PRESETS) {
    const scale = scaleOf(size);
    for (const grid of [0, 1, 7, 16, 144, -12]) {
      assert.equal(worldToGrid(gridToWorld(grid, scale), scale), grid);
    }
  }
});

test('one block measures exactly the world voxel size', () => {
  for (const size of WORLD_SCALE_PRESETS) {
    assert.equal(gridToWorld(1, scaleOf(size)), size);
  }
});

test('distance helpers agree with coordinate helpers', () => {
  const scale = scaleOf(0.25);
  assert.equal(gridDistanceToWorld(12, scale), gridToWorld(12, scale));
  assert.equal(worldDistanceToGrid(3, scale), worldToGrid(3, scale));
});

test('a world coordinate resolves to the block containing it', () => {
  const scale = scaleOf(0.5);
  // Blocks are half a unit, so 0.0-0.5 is block 0 and 0.5-1.0 is block 1.
  assert.equal(worldToGridCell(0.0, scale), 0);
  assert.equal(worldToGridCell(0.49, scale), 0);
  assert.equal(worldToGridCell(0.5, scale), 1);
  assert.equal(worldToGridCell(1.75, scale), 3);
});

test('terrain cells per block are calculated, not assumed', () => {
  // The combinations called out in the specification.
  assert.equal(terrainCellsPerWorldVoxel(scaleOf(1.0, 0.25)), 4);
  assert.equal(terrainCellsPerWorldVoxel(scaleOf(0.5, 0.25)), 2);
  assert.equal(terrainCellsPerWorldVoxel(scaleOf(0.25, 0.125)), 2);
  assert.equal(terrainCellsPerWorldVoxel(scaleOf(0.125, 0.125)), 1);
});

test('a block fills a cube of terrain cells', () => {
  assert.equal(terrainCellsPerWorldVoxelVolume(scaleOf(1.0, 0.25)), 64);
  assert.equal(terrainCellsPerWorldVoxelVolume(scaleOf(0.5, 0.25)), 8);
});

test('power-of-two scales divide cleanly and odd ones are flagged', () => {
  for (const size of WORLD_SCALE_PRESETS) {
    assert.ok(
      hasCleanTerrainRatio(scaleOf(size, size)),
      `scale ${size} should tile itself exactly`,
    );
  }
  // 1.0 / 0.37 is 2.7 cells per block: legal, but not a clean tiling.
  assert.equal(hasCleanTerrainRatio(scaleOf(1.0, 0.37)), false);
});

test('an arbitrary custom scale converts without drift', () => {
  const scale = scaleOf(0.37);
  // Repeated conversion must not walk away from the original value.
  let grid = 250;
  for (let i = 0; i < 1000; i++) {
    grid = worldToGrid(gridToWorld(grid, scale), scale);
  }
  assert.ok(Math.abs(grid - 250) < 1e-9, `drifted to ${grid}`);
});

test('snapping rounds rather than always truncating downward', () => {
  const scale = scaleOf(1, 0.25);
  assert.equal(snapToTerrainCell(0.24, scale), 0.25);
  assert.equal(snapToTerrainCell(0.13, scale), 0.25);
  assert.equal(snapToTerrainCell(0.11, scale), 0);
  assert.equal(snapToGrid(0.6, scaleOf(0.5)), 0.5);
});

test('out of range and malformed scales fall back to stock', () => {
  assert.equal(sanitizeWorldVoxelSize(undefined), 1);
  assert.equal(sanitizeWorldVoxelSize(NaN), 1);
  assert.equal(sanitizeWorldVoxelSize(0), 1);
  assert.equal(sanitizeWorldVoxelSize(-3), 1);
  assert.equal(sanitizeWorldVoxelSize('nonsense'), 1);
  assert.equal(sanitizeWorldVoxelSize(1e9), MAX_WORLD_VOXEL_SIZE);
  assert.equal(sanitizeWorldVoxelSize(1e-9), MIN_WORLD_VOXEL_SIZE);
  // A legitimate custom value survives untouched.
  assert.equal(sanitizeWorldVoxelSize(0.37), 0.37);
});

test('presets are recognised and custom values are not', () => {
  assert.ok(isPresetScale(0.25));
  assert.equal(isPresetScale(0.37), false);
});

test('an asset keeps its block count at every scale', () => {
  // A tree is twelve blocks tall by definition; only its metres change.
  const tree = { width: 5, height: 12, depth: 5 };
  for (const size of WORLD_SCALE_PRESETS) {
    const world = assetSizeToWorld(tree, scaleOf(size));
    assert.equal(world.height / size, 12);
    assert.equal(world.height / world.width, 12 / 5);
  }
});

test('matching an asset to the world reports the conversion needed', () => {
  const scale = scaleOf(0.25);
  // Authored for a full-size world, so it must shrink to a quarter.
  assert.equal(matchWorldScaleFactor(1, scale), 0.25);
  assert.equal(assetMatchesWorldScale(1, scale), false);
  assert.ok(assetMatchesWorldScale(0.25, scale));
});

test('the editor summary explains the grid', () => {
  const summary = describeWorldScale(scaleOf(0.25, 0.125));
  assert.equal(summary.worldVoxelSize, 0.25);
  assert.equal(summary.cellsPerBlock, 2);
  // A quarter-size block is four times the grid resolution of a stock world.
  assert.equal(summary.relativeResolution, 4);
  assert.ok(summary.cleanRatio);
  assert.ok(summary.preset);
});

test('worlds differing only in scale are not the same world', () => {
  assert.ok(sameWorldScale(scaleOf(0.5), scaleOf(0.5)));
  assert.equal(sameWorldScale(scaleOf(0.5), scaleOf(0.25)), false);
  // Same block size, finer terrain, still a different physical world.
  assert.equal(sameWorldScale(scaleOf(0.5, 0.25), scaleOf(0.5, 0.125)), false);
});

test('proportions between everything in the world are scale-invariant', () => {
  // The acceptance test: a scene defined in grid units must keep identical
  // ratios at every scale, so the world can never end up with tiny blocks and
  // giant trees.
  const scene = {
    player: 7,
    tree: 12,
    rock: 4,
    house: 9,
    mountain: 60,
  };

  const ratiosAt = (size: number) => {
    const scale = scaleOf(size);
    const w = (grid: number) => gridDistanceToWorld(grid, scale);
    return {
      treePerPlayer: w(scene.tree) / w(scene.player),
      housePerPlayer: w(scene.house) / w(scene.player),
      rockPerPlayer: w(scene.rock) / w(scene.player),
      mountainPerPlayer: w(scene.mountain) / w(scene.player),
    };
  };

  const reference = ratiosAt(1);
  for (const size of WORLD_SCALE_PRESETS) {
    assert.deepEqual(ratiosAt(size), reference, `proportions changed at scale ${size}`);
  }
});

test('a default style describes a stock scale world', () => {
  const style = createDefaultStyle();
  assert.equal(style.worldScale?.worldVoxelSize, 1);
  assert.equal(worldScaleOf(style).worldVoxelSize, 1);
});

test('a style predating world scale loads as stock rather than being rescaled', () => {
  const old = createDefaultStyle();
  delete old.worldScale;
  assert.equal(worldScaleOf(old).worldVoxelSize, 1);
});

test('world scale survives a save and load round-trip', () => {
  const style = createDefaultStyle();
  style.worldScale = { worldVoxelSize: 0.25 };
  const restored = sanitizeStyle(JSON.parse(JSON.stringify(style)));
  assert.equal(restored.worldScale?.worldVoxelSize, 0.25);
});

test('a hostile world scale in an imported style is clamped', () => {
  const hostile = sanitizeStyle({
    ...createDefaultStyle(),
    worldScale: { worldVoxelSize: 1e9 },
  });
  assert.ok(hostile.worldScale!.worldVoxelSize <= MAX_WORLD_VOXEL_SIZE);

  const negative = sanitizeStyle({
    ...createDefaultStyle(),
    worldScale: { worldVoxelSize: -5 },
  });
  assert.equal(negative.worldScale?.worldVoxelSize, 1);
});

test('styles alike but for their scale are different worlds', () => {
  const a = createDefaultStyle();
  const b = createDefaultStyle({ id: a.id });
  b.worldScale = { worldVoxelSize: 0.25 };
  assert.notEqual(styleFingerprint(a), styleFingerprint(b));
});

test('adding world scale did not change the identity of existing styles', () => {
  // Old rooms and caches key off this fingerprint, so a stock-scale style must
  // hash exactly as it did before the field existed.
  const withField = createDefaultStyle();
  const withoutField = createDefaultStyle({ id: withField.id });
  delete withoutField.worldScale;
  assert.equal(styleFingerprint(withField), styleFingerprint(withoutField));
});

test('changing scale changes physical size but never the block count', () => {
  // Sixteen blocks is sixteen blocks; only the metres it spans move.
  const chunkBlocks = 16;
  const full = gridDistanceToWorld(chunkBlocks, scaleOf(1));
  const quarter = gridDistanceToWorld(chunkBlocks, scaleOf(0.25));
  assert.equal(full, 16);
  assert.equal(quarter, 4);
  assert.equal(worldDistanceToGrid(quarter, scaleOf(0.25)), chunkBlocks);
});

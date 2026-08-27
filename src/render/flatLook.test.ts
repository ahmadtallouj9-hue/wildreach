/**
 * The world and the Custom World preview have to look like the same game.
 * These tests guard the flat, untextured surface look and the single palette
 * both renderers read from.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { ATLAS_GRID, ATLAS_PX, TILE, Tex, flattenTiles, faceTexture } from './TextureAtlas';
import {
  LEAF_COLOR,
  MATERIAL,
  MATERIAL_COLORS,
  WOOD_COLOR,
  materialBytes,
  materialForBlock,
} from '../world/materialPalette';
import { Block } from '../world/blocks';

function blankAtlas(): Uint8ClampedArray {
  return new Uint8ClampedArray(ATLAS_PX * ATLAS_PX * 4);
}

function tileOffset(tile: number): [number, number] {
  return [(tile % ATLAS_GRID) * TILE, Math.floor(tile / ATLAS_GRID) * TILE];
}

/** Fill a tile with per-pixel noise, the speckle the flat look has to remove. */
function paintNoise(
  data: Uint8ClampedArray,
  tile: number,
  base: [number, number, number],
  alpha: (x: number, y: number) => number = () => 255,
): void {
  const [ox, oy] = tileOffset(tile);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const i = ((oy + y) * ATLAS_PX + (ox + x)) * 4;
      const jitter = ((x * 7 + y * 13) % 11) - 5;
      data[i] = base[0] + jitter;
      data[i + 1] = base[1] + jitter;
      data[i + 2] = base[2] + jitter;
      data[i + 3] = alpha(x, y);
    }
  }
}

function tilePixels(data: Uint8ClampedArray, tile: number): Array<[number, number, number, number]> {
  const [ox, oy] = tileOffset(tile);
  const out: Array<[number, number, number, number]> = [];
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const i = ((oy + y) * ATLAS_PX + (ox + x)) * 4;
      out.push([data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!]);
    }
  }
  return out;
}

test('every painted tile ends up a single flat colour', () => {
  const data = blankAtlas();
  paintNoise(data, Tex.Stone, [120, 118, 112]);
  paintNoise(data, Tex.Crystal, [90, 160, 200]);

  flattenTiles(data);

  for (const tile of [Tex.Stone, Tex.Crystal]) {
    const pixels = tilePixels(data, tile);
    const first = pixels[0]!;
    for (const p of pixels) {
      assert.deepEqual(
        [p[0], p[1], p[2]],
        [first[0], first[1], first[2]],
        `tile ${tile} still varies pixel to pixel`,
      );
    }
  }
});

test('terrain tiles take their colour from the shared preview palette', () => {
  const data = blankAtlas();
  paintNoise(data, Tex.GrassTop, [10, 10, 10]);
  paintNoise(data, Tex.Dirt, [10, 10, 10]);
  paintNoise(data, Tex.Sand, [10, 10, 10]);
  paintNoise(data, Tex.Snow, [10, 10, 10]);
  paintNoise(data, Tex.Stone, [10, 10, 10]);
  paintNoise(data, Tex.Water, [10, 10, 10]);

  flattenTiles(data);

  const expected: Array<[number, [number, number, number]]> = [
    [Tex.GrassTop, MATERIAL_COLORS[MATERIAL.Grass]],
    [Tex.Dirt, MATERIAL_COLORS[MATERIAL.Dirt]],
    [Tex.Sand, MATERIAL_COLORS[MATERIAL.Sand]],
    [Tex.Snow, MATERIAL_COLORS[MATERIAL.Snow]],
    [Tex.Stone, MATERIAL_COLORS[MATERIAL.Rock]],
    [Tex.Water, MATERIAL_COLORS[MATERIAL.Water]],
  ];

  for (const [tile, color] of expected) {
    const [r, g, b] = materialBytes(color);
    const px = tilePixels(data, tile)[0]!;
    assert.deepEqual([px[0], px[1], px[2]], [r, g, b], `tile ${tile} ignored the palette`);
  }
});

test('a grass block is the same green on its top and its sides', () => {
  const data = blankAtlas();
  paintNoise(data, Tex.GrassTop, [40, 120, 40]);
  // The old side texture was two-tone: grass band over dirt.
  paintNoise(data, Tex.GrassSide, [110, 78, 48]);

  flattenTiles(data);

  const top = tilePixels(data, Tex.GrassTop)[0]!;
  const side = tilePixels(data, Tex.GrassSide)[0]!;
  assert.deepEqual([side[0], side[1], side[2]], [top[0], top[1], top[2]]);

  // And that colour is the palette green, not the old dirt brown.
  assert.deepEqual(
    [top[0], top[1], top[2]],
    materialBytes(MATERIAL_COLORS[MATERIAL.Grass]),
  );
});

test('wood and leaves match the colours the preview draws trees with', () => {
  const data = blankAtlas();
  paintNoise(data, Tex.WoodSide, [1, 1, 1]);
  paintNoise(data, Tex.Leaves, [1, 1, 1]);

  flattenTiles(data);

  const wood = tilePixels(data, Tex.WoodSide)[0]!;
  const leaf = tilePixels(data, Tex.Leaves)[0]!;
  assert.deepEqual([wood[0], wood[1], wood[2]], materialBytes(WOOD_COLOR));
  assert.deepEqual([leaf[0], leaf[1], leaf[2]], materialBytes(LEAF_COLOR));
});

test('cutout shapes survive flattening because alpha is untouched', () => {
  const data = blankAtlas();
  // A hole through the middle, the way leaves and torch flames are drawn.
  const holed = (x: number, y: number) => (x > 10 && x < 20 && y > 10 && y < 20 ? 0 : 255);
  paintNoise(data, Tex.Leaves, [40, 110, 40], holed);

  const before = tilePixels(data, Tex.Leaves).map((p) => p[3]);
  flattenTiles(data);
  const after = tilePixels(data, Tex.Leaves).map((p) => p[3]);

  assert.deepEqual(after, before, 'flattening changed the cutout silhouette');
  assert.ok(after.some((a) => a === 0), 'the test tile should have had holes');
});

test('blocks outside the palette keep their own identity', () => {
  const data = blankAtlas();
  paintNoise(data, Tex.Stone, [120, 118, 112]);
  paintNoise(data, Tex.Lava, [220, 70, 20]);
  paintNoise(data, Tex.Crystal, [90, 160, 200]);

  flattenTiles(data);

  const stone = tilePixels(data, Tex.Stone)[0]!;
  const lava = tilePixels(data, Tex.Lava)[0]!;
  const crystal = tilePixels(data, Tex.Crystal)[0]!;

  assert.notDeepEqual([lava[0], lava[1], lava[2]], [stone[0], stone[1], stone[2]]);
  assert.notDeepEqual([crystal[0], crystal[1], crystal[2]], [stone[0], stone[1], stone[2]]);
  assert.notDeepEqual([crystal[0], crystal[1], crystal[2]], [lava[0], lava[1], lava[2]]);
});

test('an unpainted tile is left alone rather than turned black', () => {
  const data = blankAtlas();
  paintNoise(data, Tex.Stone, [120, 118, 112]);

  flattenTiles(data);

  // Tile 40 was never painted, so every channel including alpha stays zero.
  for (const p of tilePixels(data, 40)) assert.deepEqual(p, [0, 0, 0, 0]);
});

test('the palette still covers the blocks the world actually generates', () => {
  assert.equal(materialForBlock(Block.Grass), MATERIAL.Grass);
  assert.equal(materialForBlock(Block.Sand), MATERIAL.Sand);
  assert.equal(materialForBlock(Block.Stone), MATERIAL.Rock);
  assert.equal(materialForBlock(Block.Water), MATERIAL.Water);
  assert.equal(materialForBlock(Block.Snow), MATERIAL.Snow);
  assert.equal(materialForBlock(Block.Dirt), MATERIAL.Dirt);
});

test('grass faces resolve to tiles the flat palette actually defines', () => {
  // Top, side and bottom of a grass block.
  assert.equal(faceTexture(Block.Grass, 0), Tex.GrassTop);
  assert.equal(faceTexture(Block.Grass, 2), Tex.GrassSide);
  assert.equal(faceTexture(Block.Grass, 1), Tex.Dirt);
});

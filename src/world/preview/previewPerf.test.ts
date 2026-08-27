/**
 * Tests for the preview's performance machinery.
 *
 * These cover the things that make the editor fast without changing what it
 * shows: cache identity, LOD banding, per-view budgets and the descriptor
 * boundary. Anything that would let an optimisation silently alter the world a
 * style describes is asserted against here.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { CACHE_IGNORED_GROUPS, TerrainCache, terrainCacheKey } from './TerrainCache';
import { TerrainField } from './TerrainField';
import { lodFor } from './TerrainView';
import { lodForDistance, LOD_NEAR, LOD_MEDIUM, LOD_FAR } from './VegetationView';
import {
  DEFAULT_QUALITY,
  PREVIEW_QUALITIES,
  qualityProfile,
  resolutionWarning,
  terrainBudget,
  vegetationBands,
  viewProfile,
} from './previewQuality';
import {
  PARAM_SPECS,
  cloneStyle,
  createDefaultStyle,
  writeParam,
  type ParamSpec,
} from '../style/WorldStyle';
import { sanitizeStyle, parseStyleFile, serializeStyle } from '../style/styleValidation';
import { applyDescriptor, descriptorTargets } from '../style/styleDescriptor';
import { tuningFromStyle } from '../style/styleTuning';

function spec(group: string, key: string): ParamSpec {
  const found = PARAM_SPECS.find((s) => s.group === group && s.key === key);
  assert.ok(found, `missing spec ${group}.${key}`);
  return found;
}

// --- Cache identity ---------------------------------------------------------

test('every terrain-shaping parameter changes the cache key', () => {
  const base = createDefaultStyle();
  const baseKey = terrainCacheKey(base);

  const shaping = PARAM_SPECS.filter((s) => ['terrain', 'water', 'biome'].includes(s.group));
  assert.ok(shaping.length > 10, 'expected a substantial set of terrain parameters');

  for (const s of shaping) {
    // Move the parameter somewhere legal but different.
    const value = s.default === s.max ? s.min : Math.min(s.max, s.default + s.step * 3);
    const moved = writeParam(base, s, value);
    assert.notEqual(
      terrainCacheKey(moved),
      baseKey,
      `${s.group}.${s.key} must invalidate cached terrain`,
    );
  }
});

test('vegetation and atmosphere edits reuse cached terrain', () => {
  const base = createDefaultStyle();
  const baseKey = terrainCacheKey(base);

  const cosmetic = PARAM_SPECS.filter((s) => CACHE_IGNORED_GROUPS.includes(s.group));
  assert.ok(cosmetic.length > 5, 'expected vegetation and atmosphere parameters to exist');

  for (const s of cosmetic) {
    const value = s.default === s.max ? s.min : Math.min(s.max, s.default + s.step * 3);
    const moved = writeParam(base, s, value);
    assert.equal(
      terrainCacheKey(moved),
      baseKey,
      `${s.group}.${s.key} must not throw away terrain`,
    );
  }
});

test('seed and resolution are part of terrain identity', () => {
  const base = createDefaultStyle();
  const key = terrainCacheKey(base);

  const reseeded = cloneStyle(base);
  reseeded.seed = 'somewhere-else';
  assert.notEqual(terrainCacheKey(reseeded), key);

  const finer = cloneStyle(base);
  finer.terrainVoxelSize = finer.terrainVoxelSize === 0.25 ? 0.5 : 0.25;
  assert.notEqual(terrainCacheKey(finer), key);

  const renamed = cloneStyle(base);
  renamed.name = 'A different name entirely';
  renamed.description = 'notes';
  assert.equal(terrainCacheKey(renamed), key, 'cosmetics must not invalidate terrain');
});

test('the cache serves a tile back and drops everything when terrain changes', () => {
  const style = createDefaultStyle();
  const field = new TerrainField(style.seed, 'balanced', tuningFromStyle(style));
  const cache = new TerrainCache();

  assert.equal(cache.setStyle(terrainCacheKey(style)), true, 'first style is a change');
  assert.equal(cache.setStyle(terrainCacheKey(style)), false, 'same style is not a change');

  const tile = field.buildTile(0, 0, 32, 1, 1);
  cache.put(0, 0, 1, tile);

  const hit = cache.get(0, 0, 1);
  assert.equal(hit, tile, 'the same tile comes back');
  assert.equal(cache.get(0, 0, 2), null, 'a different LOD step is a different tile');
  assert.equal(cache.get(32, 0, 1), null, 'a different tile position is a different tile');

  const moved = writeParam(style, spec('terrain', 'mountainStrength'), 2.5);
  assert.equal(cache.setStyle(terrainCacheKey(moved)), true);
  assert.equal(cache.get(0, 0, 1), null, 'changing terrain must empty the cache');
});

test('cache statistics count real hits and misses', () => {
  const style = createDefaultStyle();
  const field = new TerrainField(style.seed, 'balanced', tuningFromStyle(style));
  const cache = new TerrainCache();
  cache.setStyle(terrainCacheKey(style));

  cache.get(0, 0, 1);
  cache.put(0, 0, 1, field.buildTile(0, 0, 32, 1, 1));
  cache.get(0, 0, 1);
  cache.get(0, 0, 1);

  const stats = cache.stats();
  assert.equal(stats.misses, 1);
  assert.equal(stats.hits, 2);
  assert.equal(stats.entries, 1);
  assert.ok(stats.bytes > 0, 'a stored tile occupies measurable memory');

  cache.resetCounters();
  assert.equal(cache.stats().hits, 0);
  assert.equal(cache.stats().entries, 1, 'resetting counters keeps the data');
});

test('a cached tile is byte-identical to a freshly generated one', () => {
  const style = createDefaultStyle();
  const field = new TerrainField(style.seed, 'balanced', tuningFromStyle(style));
  const cache = new TerrainCache();
  cache.setStyle(terrainCacheKey(style));

  const first = field.buildTile(64, 96, 32, 0.5, 1);
  cache.put(64, 96, 1, first);
  const cached = cache.get(64, 96, 1);
  const regenerated = field.buildTile(64, 96, 32, 0.5, 1);

  assert.ok(cached);
  assert.deepEqual(Array.from(cached.heights), Array.from(regenerated.heights));
  assert.deepEqual(Array.from(cached.materials), Array.from(regenerated.materials));
});

// --- Terrain LOD ------------------------------------------------------------

test('terrain detail falls off with distance but never below the chosen size', () => {
  const eye = { x: 0, y: 0, z: 0 } as never;
  const near = lodFor(0, 0, eye, 0.25, 420);
  const mid = lodFor(0, 400, eye, 0.25, 420);
  const far = lodFor(0, 1600, eye, 0.25, 420);

  assert.equal(near, 1, 'the near field is always full detail');
  assert.ok(mid >= near);
  assert.ok(far > mid, 'distant tiles are coarser');
  assert.ok(Number.isInteger(Math.log2(far)), 'steps are powers of two');
});

test('a shorter falloff sheds terrain detail sooner', () => {
  const eye = { x: 0, y: 0, z: 0 } as never;
  const generous = lodFor(0, 600, eye, 0.25, 900);
  const tight = lodFor(0, 600, eye, 0.25, 260);
  assert.ok(tight >= generous, 'a tighter budget is never more detailed');
  assert.ok(tight > generous, 'and at this distance it is genuinely coarser');
});

test('the coarse pass floors cell size without touching the near/far ordering', () => {
  const eye = { x: 0, y: 0, z: 0 } as never;
  const fine = lodFor(0, 0, eye, 0.25, 420, 0);
  const coarse = lodFor(0, 0, eye, 0.25, 420, 1);
  assert.equal(fine, 1);
  assert.equal(coarse, 4, 'flooring at one block is four steps up from 0.25');
  assert.ok(coarse > fine, 'the coarse pass really is cheaper');
});

// --- Vegetation LOD ---------------------------------------------------------

test('vegetation drops through detail levels and is eventually culled', () => {
  const bands = { near: 100, medium: 200, far: 300, cover: 60 };
  assert.equal(lodForDistance(10, bands, false), LOD_NEAR);
  assert.equal(lodForDistance(150, bands, false), LOD_MEDIUM);
  assert.equal(lodForDistance(250, bands, false), LOD_FAR);
  assert.equal(lodForDistance(400, bands, false), null, 'beyond the last band, nothing');
});

test('ground cover uses its own shorter reach', () => {
  const bands = { near: 100, medium: 200, far: 300, cover: 60 };
  assert.equal(lodForDistance(50, bands, true), LOD_NEAR);
  assert.equal(
    lodForDistance(80, bands, true),
    null,
    'cover is culled while a tree at the same spot is still drawn',
  );
  assert.equal(lodForDistance(80, bands, false), LOD_NEAR);
});

test('detail level never increases with distance', () => {
  const bands = vegetationBands(DEFAULT_QUALITY, 'panorama');
  let previous = -1;
  for (let d = 0; d < bands.far + 50; d += 5) {
    const lod = lodForDistance(d, bands, false);
    const rank = lod === null ? 99 : lod;
    assert.ok(rank >= previous, `detail improved at ${d} blocks, which cannot happen`);
    previous = rank;
  }
});

// --- Quality and view budgets ----------------------------------------------

test('quality levels are ordered from cheapest to most detailed', () => {
  const profiles = PREVIEW_QUALITIES.map(qualityProfile);
  for (let i = 1; i < profiles.length; i++) {
    const prev = profiles[i - 1]!;
    const cur = profiles[i]!;
    assert.ok(cur.terrainRadius >= prev.terrainRadius, `${cur.id} reaches at least as far`);
    assert.ok(cur.lodFalloff >= prev.lodFalloff, `${cur.id} holds detail at least as long`);
    assert.ok(cur.vegetation.far >= prev.vegetation.far, `${cur.id} draws plants at least as far`);
    assert.ok(cur.vegetationBudget >= prev.vegetationBudget);
  }
});

test('the default quality is balanced, not the most expensive one', () => {
  assert.equal(DEFAULT_QUALITY, 'balanced');
  assert.ok(qualityProfile('ultra').lodFalloff > qualityProfile(DEFAULT_QUALITY).lodFalloff);
});

test('each view spends its budget where that view is judged', () => {
  const ground = viewProfile('ground');
  const panorama = viewProfile('panorama');
  const hilltop = viewProfile('hilltop');

  // Ground is about voxels and planting underfoot.
  assert.ok(ground.cover > panorama.cover, 'ground keeps ground cover');
  assert.ok(ground.lod > panorama.lod, 'ground holds near detail longer');
  assert.ok(ground.radius < panorama.radius, 'ground does not need the far distance');

  // Panorama is about the whole composition.
  assert.ok(panorama.radius > hilltop.radius);
  assert.ok(panorama.vegetation > ground.vegetation, 'panorama shows distant forest');
  assert.ok(panorama.cover < 1, 'but not individual grass blades');
});

test('budgets combine quality and view without inverting either', () => {
  for (const q of PREVIEW_QUALITIES) {
    const ground = terrainBudget(q, 'ground');
    const panorama = terrainBudget(q, 'panorama');
    assert.ok(panorama.radius > ground.radius, `${q}: panorama reaches further`);
    assert.equal(panorama.regionBlocks, ground.regionBlocks, `${q}: same region either way`);
    assert.ok(ground.lodFalloff > panorama.lodFalloff, `${q}: ground is sharper up close`);
  }
});

test('preview quality never leaks into the world style', () => {
  const style = createDefaultStyle();
  const before = JSON.stringify(style);
  for (const q of PREVIEW_QUALITIES) {
    terrainBudget(q, 'panorama');
    vegetationBands(q, 'ground');
    qualityProfile(q);
  }
  assert.equal(JSON.stringify(style), before, 'quality is a rendering choice only');
  // And it is absent from the parameters that define a world.
  const keys = PARAM_SPECS.map((s) => `${s.group}.${s.key}`);
  assert.ok(!keys.some((k) => k.includes('quality')));
});

test('ultra resolution warns instead of being hidden', () => {
  assert.equal(resolutionWarning(0.25, 'balanced'), null, 'the main target is not scary');
  assert.equal(resolutionWarning(1, 'fast'), null);
  const warned = resolutionWarning(0.125, 'balanced');
  assert.ok(warned && /ultra/i.test(warned), '0.125 says what it will cost');
  assert.ok(resolutionWarning(0.125, 'ultra'), 'still selectable, still honest');
});

// --- Optimisation must not change what is generated -------------------------

test('the optimised tile builder still agrees with direct height sampling', () => {
  const style = createDefaultStyle();
  const field = new TerrainField(style.seed, 'balanced', tuningFromStyle(style));
  const tile = field.buildTile(128, 128, 32, 1, 1);

  // buildTile quantizes; heightAt does not. They must agree once snapped.
  for (let j = 0; j < tile.n; j += 7) {
    for (let i = 0; i < tile.n; i += 7) {
      const direct = field.heightAt(128 + i * tile.cell, 128 + j * tile.cell);
      const snapped = Math.round(direct / tile.cell) * tile.cell;
      assert.ok(
        Math.abs(tile.heights[j * tile.n + i]! - snapped) < 1e-6,
        `tile height disagrees with the field at ${i},${j}`,
      );
    }
  }
});

test('tiles are still deterministic after the fast path', () => {
  const style = createDefaultStyle();
  const a = new TerrainField(style.seed, 'balanced', tuningFromStyle(style));
  const b = new TerrainField(style.seed, 'balanced', tuningFromStyle(style));
  for (const r of [1, 0.5, 0.25] as const) {
    const ta = a.buildTile(64, 32, 32, r, 1);
    const tb = b.buildTile(64, 32, 32, r, 1);
    assert.deepEqual(Array.from(ta.heights), Array.from(tb.heights), `heights differ at ${r}`);
    assert.deepEqual(Array.from(ta.materials), Array.from(tb.materials), `materials differ at ${r}`);
  }
});

test('a tile still reports every material band the world uses', () => {
  const style = createDefaultStyle();
  const field = new TerrainField(style.seed, 'balanced', tuningFromStyle(style));
  const seen = new Set<number>();
  for (let t = 0; t < 64; t++) {
    const tile = field.buildTile((t % 8) * 128, ((t / 8) | 0) * 128, 32, 1, 1);
    for (const m of tile.materials) seen.add(m);
  }
  assert.ok(seen.size >= 3, `expected several materials across the world, saw ${seen.size}`);
});

// --- Descriptor boundary for the future vision pipeline ---------------------

test('a descriptor reaches the terrain, vegetation, water and atmosphere groups', () => {
  const targets = descriptorTargets();
  for (const group of ['terrain', 'vegetation', 'water', 'atmosphere']) {
    assert.ok(
      targets.some((t) => t.startsWith(`${group}.`)),
      `a landscape analysis must be able to describe ${group}`,
    );
  }
  // Every target must be a real parameter, or the mapping is dead code.
  const known = new Set(PARAM_SPECS.map((s) => `${s.group}.${s.key}`));
  for (const t of targets) assert.ok(known.has(t), `${t} is not a real parameter`);
});

test('an empty descriptor leaves the style alone', () => {
  const base = createDefaultStyle();
  const out = applyDescriptor(base, {});
  assert.equal(out.terrain.mountainStrength, base.terrain.mountainStrength);
  assert.equal(out.vegetation.treeDensity, base.vegetation.treeDensity);
  assert.equal(out.origin?.kind, 'vision', 'provenance is still recorded');
});

test('a mid descriptor reproduces the default world rather than drifting', () => {
  const base = createDefaultStyle();
  const out = applyDescriptor(base, {
    terrain: { elevation: 0.5, hills: 0.5 },
    mountains: { height: 0.5 },
    vegetation: { trees: 0.5 },
  });
  assert.equal(out.terrain.heightScale, base.terrain.heightScale);
  assert.equal(out.terrain.mountainStrength, base.terrain.mountainStrength);
  assert.equal(out.vegetation.treeDensity, base.vegetation.treeDensity);
});

test('descriptor extremes move parameters in the expected direction', () => {
  const base = createDefaultStyle();
  const tall = applyDescriptor(base, { mountains: { height: 1 }, valleys: { depth: 1 } });
  const flat = applyDescriptor(base, { mountains: { height: 0 }, valleys: { depth: 0 } });

  assert.ok(tall.terrain.mountainStrength > base.terrain.mountainStrength);
  assert.ok(flat.terrain.mountainStrength < base.terrain.mountainStrength);
  assert.ok(tall.terrain.valleyStrength > flat.terrain.valleyStrength);
});

test('a hostile descriptor cannot push the style outside its ranges', () => {
  const base = createDefaultStyle();
  const out = applyDescriptor(base, {
    terrain: { elevation: 99, hills: -50 },
    mountains: { height: Number.POSITIVE_INFINITY },
    vegetation: { trees: Number.NaN },
    atmosphere: { timeOfDay: 12 },
    palette: ['#aabbcc', 'javascript:alert(1)', '#zzzzzz'],
    label: 'x'.repeat(500),
  });

  for (const s of PARAM_SPECS) {
    const group = out[s.group] as unknown as Record<string, number>;
    const v = group[s.key]!;
    assert.ok(Number.isFinite(v), `${s.group}.${s.key} became non-finite`);
    assert.ok(v >= s.min && v <= s.max, `${s.group}.${s.key} escaped its range at ${v}`);
  }
  assert.deepEqual(out.origin?.palette, ['#aabbcc'], 'only real colours survive');
  assert.ok((out.origin?.label?.length ?? 0) <= 120);
});

test('provenance survives an export and import round trip', () => {
  const styled = applyDescriptor(createDefaultStyle(), {
    label: 'From a photo of a fjord',
    palette: ['#123456', '#abcdef'],
    mountains: { height: 0.9 },
  });
  const parsed = parseStyleFile(serializeStyle(styled));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.style?.origin?.kind, 'vision');
  assert.equal(parsed.style?.origin?.label, 'From a photo of a fjord');
  assert.deepEqual(parsed.style?.origin?.palette, ['#123456', '#abcdef']);
});

test('styles without provenance still load, and junk provenance is dropped', () => {
  const old = JSON.parse(JSON.stringify(createDefaultStyle())) as Record<string, unknown>;
  delete old.origin;
  const loaded = sanitizeStyle(old);
  assert.equal(loaded.origin, undefined, 'absent provenance stays absent');

  const junk = sanitizeStyle({ ...old, origin: { kind: 'evil', palette: 'not-an-array' } });
  assert.equal(junk.origin, undefined, 'an unknown origin kind is discarded');
  assert.ok(junk.terrain, 'and the rest of the style still loads');
});

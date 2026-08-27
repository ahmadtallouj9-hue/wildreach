import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PARAM_SPECS,
  TERRAIN_RESOLUTIONS,
  clampToSpec,
  cloneStyle,
  createDefaultStyle,
  readParam,
  writeParam,
} from './WorldStyle';
import {
  MAX_STYLE_FILE_BYTES,
  checkCompatibility,
  parseStyleFile,
  sanitizeStyle,
  serializeStyle,
} from './styleValidation';
import { NEUTRAL_TUNING, tuningFromStyle } from './styleTuning';
import { applyLandscapePreset, randomizeStyle } from './stylePresets';
import { styleFingerprint } from './styleHash';
import { TerrainShape } from '../gen/TerrainShape';
import { ClimateSampler } from '../gen/Climate';
import { WorldSeed } from '../gen/SeedSystem';
import { WORLD_GENERATION_VERSION } from '../gen/version';

test('a default style produces exactly neutral tuning', () => {
  const tuning = tuningFromStyle(createDefaultStyle());
  for (const key of Object.keys(NEUTRAL_TUNING) as (keyof typeof NEUTRAL_TUNING)[]) {
    const actual = tuning[key];
    const expected = NEUTRAL_TUNING[key];
    if (typeof expected === 'object') {
      // Vegetation is a nested group of multipliers; compare it field by field.
      assert.deepStrictEqual(actual, expected, `${key} is not neutral`);
      continue;
    }
    assert.ok(
      Math.abs((actual as number) - (expected as number)) < 1e-9,
      `${key}: ${actual} != ${expected}`,
    );
  }
});

test('default-style terrain matches stock terrain block for block', () => {
  const seed = new WorldSeed('style-regression');
  const stockClimate = new ClimateSampler(seed);
  const stock = new TerrainShape(seed, 'balanced');

  const tuning = tuningFromStyle(createDefaultStyle());
  const styledClimate = new ClimateSampler(seed, tuning);
  const styled = new TerrainShape(seed, 'balanced', tuning);

  for (let i = 0; i < 150; i++) {
    const x = i * 13.5 - 400;
    const z = 700 - i * 9.25;
    const a = stock.surfaceHeightExact(x, z, stockClimate.sample(x, z));
    const b = styled.surfaceHeightExact(x, z, styledClimate.sample(x, z));
    assert.equal(a, b, `mismatch at ${x},${z}`);
  }
});

test('style parameters actually change the generated terrain', () => {
  const seed = new WorldSeed('style-effect');
  const base = createDefaultStyle();
  const tall = cloneStyle(base);
  tall.terrain.mountainStrength = 2.8;
  tall.terrain.heightScale = 2.5;

  const baseTuning = tuningFromStyle(base);
  const tallTuning = tuningFromStyle(tall);
  const baseShape = new TerrainShape(seed, 'balanced', baseTuning);
  const tallShape = new TerrainShape(seed, 'balanced', tallTuning);
  const baseClimate = new ClimateSampler(seed, baseTuning);
  const tallClimate = new ClimateSampler(seed, tallTuning);

  // Only land is compared: the ocean floor is deliberately unaffected by
  // elevation and mountain settings, so including it would measure nothing.
  let land = 0;
  let different = 0;
  for (let i = 0; i < 200; i++) {
    const x = i * 21;
    const z = i * 17 + 300;
    const climate = baseClimate.sample(x, z);
    if (climate.continentalness <= 0.5) continue;
    land++;
    const a = baseShape.surfaceHeightExact(x, z, climate);
    const b = tallShape.surfaceHeightExact(x, z, tallClimate.sample(x, z));
    if (Math.abs(a - b) > 0.5) different++;
  }

  assert.ok(land > 20, `expected land samples, got ${land}`);
  assert.ok(different > land * 0.9, `expected land to change, got ${different}/${land}`);
});

test('same seed and style always regenerate the same world', () => {
  const style = createDefaultStyle({ seed: 'determinism' });
  style.terrain.valleyStrength = 1.85;
  const tuning = tuningFromStyle(style);

  const heights = (): number[] => {
    const seed = new WorldSeed(style.seed);
    const climate = new ClimateSampler(seed, tuning);
    const shape = new TerrainShape(seed, 'balanced', tuning);
    return Array.from({ length: 40 }, (_, i) =>
      shape.surfaceHeightExact(i * 31, i * 19, climate.sample(i * 31, i * 19)),
    );
  };

  assert.deepEqual(heights(), heights());
});

test('every parameter is clamped to its declared range', () => {
  for (const spec of PARAM_SPECS) {
    assert.equal(clampToSpec(spec, spec.max + 1000), spec.max);
    assert.equal(clampToSpec(spec, spec.min - 1000), spec.min);
    assert.equal(clampToSpec(spec, Number.NaN), spec.default);
    assert.equal(clampToSpec(spec, Number.POSITIVE_INFINITY), spec.default);
  }
});

test('writeParam clamps rather than storing invalid values', () => {
  const spec = PARAM_SPECS[0]!;
  const style = writeParam(createDefaultStyle(), spec, 99999);
  assert.equal(readParam(style, spec), spec.max);
});

test('hostile input is rebuilt into a safe style', () => {
  const style = sanitizeStyle({
    id: '../../etc/passwd',
    name: 'A'.repeat(5000),
    description: 'C:\\Users\\someone\\secret',
    author: 'http://tracker.example.com/beacon',
    seed: '/absolute/path',
    landscape: 'not-a-landscape',
    terrainVoxelSize: 999,
    terrain: { mountainStrength: 1e9, heightScale: -1e9 },
    atmosphere: { skyStyle: 'evil', cloudStyle: 42 },
    __proto__: { polluted: true },
  });

  assert.ok(!style.id.includes('..'));
  assert.ok(style.name.length <= 60);
  assert.equal(style.description, '');
  assert.equal(style.author, '');
  assert.equal(style.landscape, 'rolling');
  assert.ok((TERRAIN_RESOLUTIONS as readonly number[]).includes(style.terrainVoxelSize));
  assert.equal(style.atmosphere.skyStyle, 'clear');
  assert.equal(style.atmosphere.cloudStyle, 'natural');
  assert.equal(
    style.terrain.mountainStrength,
    PARAM_SPECS.find((s) => s.key === 'mountainStrength')!.max,
  );
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test('imported files never execute and bad payloads are rejected', () => {
  assert.equal(parseStyleFile('not json').ok, false);
  assert.equal(parseStyleFile('[]').ok, false);
  assert.equal(parseStyleFile(JSON.stringify({ formatVersion: 999 })).ok, false);

  const future = JSON.stringify({
    style: { ...createDefaultStyle(), generationVersion: WORLD_GENERATION_VERSION + 5 },
  });
  assert.equal(parseStyleFile(future).ok, false);

  const oversized = JSON.stringify({ style: createDefaultStyle(), pad: 'x'.repeat(MAX_STYLE_FILE_BYTES) });
  assert.equal(parseStyleFile(oversized).ok, false);
});

test('round-tripping a style through export and import preserves generation', () => {
  const original = createDefaultStyle({ name: 'Round Trip', seed: 'rt' });
  original.terrain.mountainStrength = 1.75;
  original.water.seaLevel = 70;

  const result = parseStyleFile(serializeStyle(original));
  assert.ok(result.ok && result.style);
  assert.equal(styleFingerprint(result.style), styleFingerprint(original));
});

test('exported styles carry no local machine information', () => {
  const text = serializeStyle(createDefaultStyle({ author: 'Ahmad' }));
  const parsed = JSON.parse(text) as Record<string, unknown>;
  assert.deepEqual(Object.keys(parsed).sort(), ['exportedAt', 'formatVersion', 'kind', 'style']);
  assert.ok(!/[A-Za-z]:\\/.test(text), 'no windows paths');
  assert.ok(!text.includes('/home/') && !text.includes('/Users/'), 'no unix home paths');
});

test('the fingerprint ignores cosmetics but tracks generation settings', () => {
  const a = createDefaultStyle({ name: 'One' });
  const b = cloneStyle(a);
  b.name = 'Two';
  b.description = 'different';
  b.updatedAt = a.updatedAt + 9999;
  assert.equal(styleFingerprint(a), styleFingerprint(b));

  b.terrain.mountainStrength += 0.5;
  assert.notEqual(styleFingerprint(a), styleFingerprint(b));
  assert.equal(styleFingerprint(null), 'default');
});

test('randomize stays inside every range and respects locks', () => {
  let rng = 0;
  const random = (): number => ((rng = (rng * 9301 + 49297) % 233280), rng / 233280);

  const base = createDefaultStyle();
  const locks = { terrain: true, water: false, biome: false, vegetation: false, atmosphere: false };

  for (let i = 0; i < 40; i++) {
    const next = randomizeStyle(base, locks, random);
    for (const spec of PARAM_SPECS) {
      const value = readParam(next, spec);
      assert.ok(value >= spec.min && value <= spec.max, `${spec.key}=${value} out of range`);
    }
    // Locked terrain must be untouched, landscape included.
    assert.equal(next.landscape, base.landscape);
    for (const spec of PARAM_SPECS.filter((s) => s.group === 'terrain')) {
      assert.equal(readParam(next, spec), readParam(base, spec));
    }
  }
});

test('landscape presets leave locked groups alone', () => {
  const base = createDefaultStyle();
  base.water.seaLevel = 92;
  const locked = applyLandscapePreset(base, 'island', {
    terrain: false,
    water: true,
    biome: false,
    vegetation: false,
    atmosphere: false,
  });
  assert.equal(locked.water.seaLevel, 92);
  assert.equal(locked.landscape, 'island');

  const unlocked = applyLandscapePreset(base, 'island', {
    terrain: false,
    water: false,
    biome: false,
    vegetation: false,
    atmosphere: false,
  });
  assert.equal(unlocked.water.seaLevel, 64);
});

test('compatibility reports the versions a player needs to see', () => {
  const current = checkCompatibility(createDefaultStyle());
  assert.equal(current.compatible, true);
  assert.equal(current.generationVersion, WORLD_GENERATION_VERSION);

  const newer = createDefaultStyle();
  newer.generationVersion = WORLD_GENERATION_VERSION + 1;
  assert.equal(checkCompatibility(newer).compatible, false);
});

/**
 * Tests for the miniature world preview: vegetation placement, atmosphere
 * response, preview/world parity and the rebuild dependency rules.
 *
 * These exercise the same modules the running editor uses. Nothing here mocks
 * placement — if a test says trees get denser, the shipped rule got denser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { TerrainField } from './TerrainField';
import {
  NEUTRAL_VEGETATION,
  SITE_STEP,
  forEachPlant,
  plantAt,
  sitePosition,
  vegHash,
  type PlantKind,
  type PlantSite,
} from '../gen/VegetationPlacement';
import { createDefaultStyle, type VytheraWorldStyle } from '../style/WorldStyle';
import { NEUTRAL_TUNING, tuningFromStyle } from '../style/styleTuning';
import { sanitizeStyle } from '../style/styleValidation';
import { BiomeId } from '../Biomes';
import { WorldSeed } from '../gen/SeedSystem';
import {
  WEATHER_LOOKS,
  cloudCover,
  dayFactor,
  fogDistance,
  sunDirection,
  sunFor,
} from './atmosphere';
import { scopeForGroup, widestScope } from '../../ui/customworld/rebuildScope';

const REGION = 192;

function fieldFor(style: VytheraWorldStyle): TerrainField {
  return new TerrainField(style.seed, 'balanced', tuningFromStyle(style));
}

/** Collect every plant the shared rules place in a fixed region. */
function census(style: VytheraWorldStyle): Record<PlantKind, number> & { sites: PlantSite[] } {
  const field = fieldFor(style);
  const counts = { tree: 0, bush: 0, grass: 0, flower: 0, rock: 0 } as Record<PlantKind, number>;
  const sites: PlantSite[] = [];
  forEachPlant(
    0,
    0,
    REGION,
    field.vegetationSalt,
    0,
    (x, z) => {
      const height = field.heightAt(x, z);
      return {
        biome: field.biomeAt(x, z),
        climate: field.sampleClimate(x, z),
        height,
        slope: field.slopeAt(x, z, height),
        seaLevel: field.seaLevel,
        veg: field.vegetation,
      };
    },
    (site) => {
      counts[site.kind]++;
      sites.push(site);
    },
  );
  return { ...counts, sites };
}

function styleWith(mutate: (s: VytheraWorldStyle) => void): VytheraWorldStyle {
  const s = createDefaultStyle({ seed: 'preview-tests' });
  mutate(s);
  return s;
}

// --- Vegetation density ---

test('zero tree density means no trees at all', () => {
  const none = census(styleWith((s) => (s.vegetation.treeDensity = 0)));
  assert.equal(none.tree, 0, 'treeDensity 0 must produce no trees');

  const some = census(styleWith(() => undefined));
  assert.ok(some.tree > 0, 'the default style should grow trees somewhere');
});

test('raising tree density visibly increases the number of trees', () => {
  const normal = census(styleWith(() => undefined));
  const dense = census(styleWith((s) => (s.vegetation.treeDensity = 2)));
  assert.ok(
    dense.tree > normal.tree * 1.4,
    `expected substantially more trees, got ${normal.tree} -> ${dense.tree}`,
  );
});

test('each plant kind responds to its own density and nothing else', () => {
  const base = census(styleWith(() => undefined));
  const kinds: [PlantKind, keyof VytheraWorldStyle['vegetation']][] = [
    ['flower', 'flowerDensity'],
    ['rock', 'rockDensity'],
    ['bush', 'bushDensity'],
  ];
  for (const [kind, key] of kinds) {
    const off = census(styleWith((s) => ((s.vegetation[key] as number) = 0)));
    assert.equal(off[kind], 0, `${key} 0 should remove every ${kind}`);
    const up = census(styleWith((s) => ((s.vegetation[key] as number) = 3)));
    assert.ok(up[kind] > base[kind], `${key} 3 should add ${kind}s (${base[kind]} -> ${up[kind]})`);
  }
});

test('grass density changes ground cover', () => {
  const off = census(styleWith((s) => (s.vegetation.grassDensity = 0)));
  const on = census(styleWith((s) => (s.vegetation.grassDensity = 3)));
  assert.equal(off.grass, 0);
  assert.ok(on.grass > 0);
});

// --- Determinism ---

test('same seed and style always reproduce the same vegetation', () => {
  const a = census(styleWith(() => undefined));
  const b = census(styleWith(() => undefined));
  assert.equal(a.sites.length, b.sites.length);
  for (let i = 0; i < a.sites.length; i++) {
    assert.deepEqual(a.sites[i], b.sites[i], `plant ${i} differs between runs`);
  }
});

test('a different seed produces a different forest', () => {
  const a = census(createDefaultStyle({ seed: 'seed-a' }));
  const b = census(createDefaultStyle({ seed: 'seed-b' }));
  const key = (s: PlantSite): string => `${s.x},${s.z},${s.kind}`;
  const setA = new Set(a.sites.map(key));
  const shared = b.sites.filter((s) => setA.has(key(s))).length;
  assert.ok(shared < b.sites.length * 0.5, 'different seeds should not share most plants');
});

test('raising density only adds plants, it never moves the existing ones', () => {
  // Density is a threshold on a fixed roll, so a forest grows denser around
  // the trees already there instead of being reshuffled.
  const base = census(styleWith(() => undefined));
  const dense = census(styleWith((s) => (s.vegetation.treeDensity = 2)));
  const denseTrees = new Set(
    dense.sites.filter((s) => s.kind === 'tree').map((s) => `${s.x},${s.z}`),
  );
  for (const site of base.sites.filter((s) => s.kind === 'tree')) {
    assert.ok(
      denseTrees.has(`${site.x},${site.z}`),
      `tree at ${site.x},${site.z} vanished when density rose`,
    );
  }
});

test('plant variation changes tree sizes without moving them', () => {
  const uniform = census(styleWith((s) => (s.vegetation.variation = 0)));
  const varied = census(styleWith((s) => (s.vegetation.variation = 2)));
  const uniformTrees = uniform.sites.filter((s) => s.kind === 'tree');
  const variedTrees = varied.sites.filter((s) => s.kind === 'tree');
  assert.equal(uniformTrees.length, variedTrees.length, 'variation must not change placement');

  const sizes = new Set(uniformTrees.map((s) => `${s.treeKind}:${s.size}`));
  const variedSizes = new Set(variedTrees.map((s) => `${s.treeKind}:${s.size}`));
  assert.ok(
    variedSizes.size > sizes.size,
    `variation 2 should widen the size spread (${sizes.size} -> ${variedSizes.size})`,
  );
});

// --- Distribution rules ---

test('nothing roots below sea level or in the ocean', () => {
  const style = styleWith(() => undefined);
  const field = fieldFor(style);
  for (const site of census(style).sites) {
    if (site.kind === 'rock') continue;
    const h = field.heightAt(site.x, site.z);
    assert.ok(h > field.seaLevel, `a ${site.kind} was placed at or below sea level`);
  }
});

test('cliffs hold no rooted plants', () => {
  const salt = 1234;
  const climate = fieldFor(styleWith(() => undefined)).sampleClimate(10, 10);
  const steep = plantAt(30, 30, salt, {
    biome: BiomeId.Forest,
    climate,
    height: 80,
    slope: 3,
    seaLevel: 48,
    veg: { ...NEUTRAL_VEGETATION, treeDensity: 3, bushDensity: 3, grassDensity: 3 },
  });
  assert.ok(steep === null || steep.kind === 'rock', 'only loose rock belongs on a cliff');
});

test('vegetation follows the biome, not a uniform scatter', () => {
  const climate = fieldFor(styleWith(() => undefined)).sampleClimate(64, 64);
  const at = (biome: BiomeId): PlantSite | null =>
    plantAt(120, 120, 99, {
      biome,
      climate,
      height: 70,
      slope: 0.1,
      seaLevel: 48,
      veg: NEUTRAL_VEGETATION,
    });

  // A desert can never grow the broadleaf species a forest does.
  const desert = at(BiomeId.Desert);
  if (desert?.kind === 'tree') assert.equal(desert.treeKind, 'cactus');
  const taiga = at(BiomeId.Taiga);
  if (taiga?.kind === 'tree') assert.equal(taiga.treeKind, 'pine');
  assert.equal(at(BiomeId.Ocean), null, 'the open ocean grows nothing');
});

test('denser biomes carry more trees than sparse ones', () => {
  const climate = fieldFor(styleWith(() => undefined)).sampleClimate(64, 64);
  const count = (biome: BiomeId): number => {
    let n = 0;
    for (let gz = 0; gz < 300; gz += SITE_STEP) {
      for (let gx = 0; gx < 300; gx += SITE_STEP) {
        const site = plantAt(gx, gz, 7, {
          biome,
          climate,
          height: 60,
          slope: 0.1,
          seaLevel: 48,
          veg: NEUTRAL_VEGETATION,
        });
        if (site?.kind === 'tree') n++;
      }
    }
    return n;
  };
  assert.ok(
    count(BiomeId.DenseForest) > count(BiomeId.Plains),
    'old-growth forest should out-tree open plains',
  );
});

// --- Preview / world parity ---

test('the preview field and the world generator share one vegetation salt', () => {
  // Both derive 'trees' from the same seed; if either side changed its salt,
  // the preview would show a forest the world does not have.
  const style = createDefaultStyle({ seed: 'parity-seed' });
  const field = fieldFor(style);
  assert.equal(field.vegetationSalt, new WorldSeed(style.seed).derive('trees'));
});

test('preview and world generation read the same style values', () => {
  const style = styleWith((s) => {
    s.terrain.mountainStrength = 2.1;
    s.terrain.snowLine = 96;
    s.water.seaLevel = 61;
    s.biome.temperature = 0.4;
    s.vegetation.treeDensity = 1.8;
    s.vegetation.rockDensity = 0.3;
    s.vegetation.variation = 0.5;
  });
  const tuning = tuningFromStyle(style);
  const field = fieldFor(style);

  // The values the preview renders with must be the values the generator gets.
  assert.equal(field.seaLevel, style.water.seaLevel);
  assert.equal(field.snowLine, style.terrain.snowLine);
  assert.equal(tuning.mountainStrength, style.terrain.mountainStrength);
  assert.equal(tuning.temperatureOffset, style.biome.temperature);
  assert.deepEqual(field.vegetation, {
    treeDensity: 1.8,
    grassDensity: 1,
    flowerDensity: 1,
    rockDensity: 0.3,
    bushDensity: 1,
    variation: 0.5,
  });
  assert.deepEqual(tuning.vegetation, field.vegetation);
});

test('a default style still leaves vegetation tuning neutral', () => {
  assert.deepEqual(tuningFromStyle(createDefaultStyle()).vegetation, NEUTRAL_TUNING.vegetation);
});

test('sea level lifts the whole landform with the water', () => {
  // Terrain is generated relative to sea level, so moving the sea moves the
  // land with it and coastlines keep their shape at a new altitude. The
  // preview must show the same relationship the generator produces.
  const low = fieldFor(styleWith((s) => (s.water.seaLevel = 40)));
  const high = fieldFor(styleWith((s) => (s.water.seaLevel = 100)));
  assert.equal(low.seaLevel, 40);
  assert.equal(high.seaLevel, 100);

  const rise = high.heightAt(120, 90) - low.heightAt(120, 90);
  assert.ok(Math.abs(rise - 60) < 6, `land should rise with the sea, moved ${rise}`);
});

test('the snow line decides how much of the land is white', () => {
  // Unlike sea level the snow line is an absolute altitude, so lowering it
  // must visibly whiten more ground.
  const snowFraction = (snowLine: number): number => {
    const field = fieldFor(
      styleWith((s) => {
        s.terrain.snowLine = snowLine;
        s.terrain.mountainStrength = 2.4;
        s.terrain.heightScale = 2;
      }),
    );
    const tile = field.buildTile(0, 0, 48, 1);
    return [...tile.materials].filter((m) => m === 4).length / tile.materials.length;
  };
  const high = snowFraction(150);
  const low = snowFraction(55);
  assert.ok(low > high, `a lower snow line should add snow (${high} -> ${low})`);
});

// --- Atmosphere ---

test('time of day drives the sun through a real day', () => {
  const noon = sunDirection(0.5, 0.15);
  const midnight = sunDirection(0, 0.15);
  const sunrise = sunDirection(0.25, 0.15);

  assert.ok(noon.y > 0.9, 'the sun should be overhead at noon');
  assert.ok(midnight.y < -0.9, 'the sun should be below the horizon at midnight');
  assert.ok(Math.abs(sunrise.y) < 0.2, 'the sun should sit on the horizon at sunrise');
  assert.ok(noon.day > 0.95 && midnight.day < 0.05, 'day factor should follow the sun');
});

test('sun bearing swings the sun around the compass', () => {
  const east = sunDirection(0.25, 0);
  const west = sunDirection(0.25, 0.5);
  assert.ok(east.x * west.x < 0, 'opposite bearings should face opposite directions');
});

test('dawn and dusk presets resolve to different hours', () => {
  const dawn = sunFor(styleWith((s) => {
    s.atmosphere.skyStyle = 'dawn';
    s.atmosphere.timeOfDay = 0.23;
  }));
  const dusk = sunFor(styleWith((s) => {
    s.atmosphere.skyStyle = 'dusk';
    s.atmosphere.timeOfDay = 0.78;
  }));
  assert.ok(dawn.x * dusk.x < 0 || Math.sign(dawn.z) !== Math.sign(dusk.z));
});

test('cloud density and cloud style both change cover', () => {
  const base = cloudCover(styleWith(() => undefined));
  const more = cloudCover(styleWith((s) => (s.atmosphere.cloudDensity = 2)));
  const clear = cloudCover(styleWith((s) => (s.atmosphere.cloudDensity = 0)));
  const heavy = cloudCover(styleWith((s) => (s.atmosphere.cloudStyle = 'heavy')));
  const sparse = cloudCover(styleWith((s) => (s.atmosphere.cloudStyle = 'sparse')));

  assert.ok(more > base, 'raising cloud density should add cover');
  assert.equal(clear, 0, 'zero density with clear weather is an empty sky');
  assert.ok(heavy > base && sparse < base, 'cloud presets should differ');
});

test('weather changes cover, fog and light', () => {
  const clear = styleWith(() => undefined);
  const foggy = styleWith((s) => (s.atmosphere.weather = 'fog'));
  const rainy = styleWith((s) => (s.atmosphere.weather = 'rain'));

  assert.ok(fogDistance(foggy) < fogDistance(clear), 'fog should close the view in');
  assert.ok(cloudCover(rainy) > cloudCover(clear), 'rain should bring cloud');
  assert.ok(WEATHER_LOOKS.rain.particles > 0 && WEATHER_LOOKS.snow.particles > 0);
  assert.equal(WEATHER_LOOKS.clear.particles, 0);
  assert.ok(WEATHER_LOOKS.rain.lightScale < 1, 'rain should dim the sun');
});

test('fog distance is honoured and never collapses to nothing', () => {
  const near = fogDistance(styleWith((s) => (s.atmosphere.fogDistance = 60)));
  const far = fogDistance(styleWith((s) => (s.atmosphere.fogDistance = 1200)));
  assert.ok(far > near);
  assert.ok(near >= 80, 'fog should always leave something visible');
});

test('ambient light is a real style value with a safe default', () => {
  assert.equal(createDefaultStyle().atmosphere.ambientIntensity, 1);
  assert.ok(dayFactor(1) > dayFactor(-1));
});

// --- Backward compatibility ---

test('styles saved before the sky and vegetation fields existed still load', () => {
  // An older .vyworld: no atmosphere extras, no plant variation.
  const legacy = {
    id: 'vws_legacy00000000',
    name: 'Legacy',
    seed: 'old-world',
    terrainVoxelSize: 0.25,
    terrain: { heightScale: 1.4, snowLine: 90 },
    water: { seaLevel: 48 },
    biome: { scale: 1 },
    vegetation: { treeDensity: 1.5, grassDensity: 1, flowerDensity: 1, rockDensity: 1, bushDensity: 1 },
    atmosphere: { fogDistance: 500, skyStyle: 'clear', cloudStyle: 'natural' },
  };
  const style = sanitizeStyle(legacy);

  assert.equal(style.terrain.heightScale, 1.4, 'existing values must survive');
  assert.equal(style.vegetation.treeDensity, 1.5);
  assert.equal(style.vegetation.variation, 1, 'missing variation defaults to neutral');
  assert.equal(style.atmosphere.weather, 'clear', 'missing weather defaults to clear');
  assert.equal(style.atmosphere.timeOfDay, 0.32);
  assert.equal(style.atmosphere.cloudDensity, 1);
  assert.equal(style.atmosphere.ambientIntensity, 1);

  // And the defaults must still render a sane sky.
  assert.ok(cloudCover(style) > 0);
  assert.ok(sunFor(style).day > 0.5, 'the default hour should be daytime');
});

test('an unknown weather value is rejected rather than trusted', () => {
  const style = sanitizeStyle({
    atmosphere: { weather: 'meteors', cloudDensity: 999, timeOfDay: -5 },
  });
  assert.equal(style.atmosphere.weather, 'clear');
  assert.equal(style.atmosphere.cloudDensity, 2, 'out-of-range cover is clamped');
  assert.equal(style.atmosphere.timeOfDay, 0);
});

// --- Rebuild dependency rules ---

test('only the systems an edit touches are rebuilt', () => {
  assert.equal(scopeForGroup('atmosphere'), 'sky', 'clouds must not regenerate terrain');
  assert.equal(scopeForGroup('vegetation'), 'vegetation', 'trees must not regenerate mountains');
  assert.equal(scopeForGroup('terrain'), 'terrain');
  assert.equal(scopeForGroup('water'), 'terrain', 'sea level repaints the material bands');
  assert.equal(scopeForGroup('biome'), 'terrain');
});

test('pending scopes coalesce to the widest one', () => {
  assert.equal(widestScope('sky', 'vegetation'), 'vegetation');
  assert.equal(widestScope('vegetation', 'terrain'), 'terrain');
  assert.equal(widestScope('terrain', 'sky'), 'terrain');
  assert.equal(widestScope('sky', 'sky'), 'sky');
});

// --- Resolution ---

test('terrain resolution changes cell size without changing the landform', () => {
  const style = styleWith(() => undefined);
  const field = fieldFor(style);
  const coarse = field.buildTile(0, 0, 32, 1);
  const fine = field.buildTile(0, 0, 32, 0.25);

  assert.equal(coarse.n, 32, '1.0 gives one cell per block');
  assert.equal(fine.n, 128, '0.25 gives four cells per block');
  assert.ok(fine.heights.length > coarse.heights.length * 15);

  // The underlying surface is the same; only sampling density differs.
  const mid = field.heightAt(16, 16);
  assert.ok(Math.abs(coarse.heights[16 * 32 + 16]! - mid) <= 1.01);
  assert.ok(Math.abs(fine.heights[64 * 128 + 64]! - mid) <= 0.26);
});

test('quantization actually snaps to the chosen voxel grid', () => {
  const field = fieldFor(styleWith(() => undefined));
  for (const r of [1, 0.5, 0.25, 0.125] as const) {
    const tile = field.buildTile(0, 0, 16, r);
    for (let i = 0; i < 64; i++) {
      const h = tile.heights[i]!;
      const steps = h / r;
      assert.ok(
        Math.abs(steps - Math.round(steps)) < 1e-6,
        `height ${h} is not on the ${r} grid`,
      );
    }
  }
});

// --- Placement plumbing ---

test('the placement lattice is global, so chunk borders line up', () => {
  // Both neighbours must agree on the site for a cell on their shared edge.
  const a = sitePosition(48, 48, 5);
  const b = sitePosition(48, 48, 5);
  assert.deepEqual(a, b);
  assert.ok(a.x >= 48 && a.x < 48 + 2, 'jitter stays within the lattice cell');
});

test('the placement hash is stable and well spread', () => {
  assert.equal(vegHash(10, 20, 3), vegHash(10, 20, 3));
  assert.notEqual(vegHash(10, 20, 3), vegHash(10, 21, 3));
  let sum = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) sum += vegHash(i, i * 7, 11);
  const mean = sum / n;
  assert.ok(mean > 0.45 && mean < 0.55, `hash mean ${mean} should sit near 0.5`);
});

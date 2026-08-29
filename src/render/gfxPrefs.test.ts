import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  GFX_PRESET_CONFIGS,
  getPresetConfig,
  detectDefaultGfxPreset,
  type GfxPreset,
} from './gfxPrefs';

test('GFX Presets - all 5 presets are defined with valid keys', () => {
  const presets: GfxPreset[] = ['very-low', 'low', 'medium', 'high', 'max'];
  for (const p of presets) {
    const config = getPresetConfig(p);
    assert.equal(config.preset, p);
    assert.ok(typeof config.pixelRatioCap === 'number');
    assert.ok(typeof config.maxRenderDimension === 'number');
    assert.ok(typeof config.renderDistance === 'number');
    assert.ok(['none', 'basic', 'soft'].includes(config.shadows));
    assert.ok(typeof config.postProcessing === 'boolean');
    assert.ok(typeof config.bloom === 'boolean');
    assert.ok(typeof config.colorGrade === 'boolean');
    assert.ok(['flat', 'simple', 'bsl'].includes(config.waterShading));
    assert.ok(typeof config.particles === 'boolean');
    assert.ok([512, 1024].includes(config.atlasResolution));
    assert.ok(typeof config.fpsCap === 'number');
    assert.ok(typeof config.chunkBudget === 'number');
    assert.ok(typeof config.pauseHidden === 'boolean');
  }
});

test('Very Low Preset - matches 2GB mobile targets and skips EffectComposer', () => {
  const vl = GFX_PRESET_CONFIGS['very-low'];
  assert.equal(vl.pixelRatioCap, 1.0, 'pixelRatio capped at 1.0');
  assert.equal(vl.maxRenderDimension, 1280, 'maxRenderDimension <= 1280');
  assert.equal(vl.renderDistance, 3, 'minimum view distance');
  assert.equal(vl.shadows, 'none', 'no shadows');
  assert.equal(vl.postProcessing, false, 'postProcessing false skips EffectComposer');
  assert.equal(vl.bloom, false, 'no bloom');
  assert.equal(vl.colorGrade, false, 'no color grade');
  assert.equal(vl.waterShading, 'flat', 'flat water transparent color');
  assert.equal(vl.particles, false, 'no extra particles');
  assert.equal(vl.atlasResolution, 512, 'low-res atlas');
  assert.equal(vl.fpsCap, 30, '30 fps cap');
  assert.equal(vl.chunkBudget, 1, 'tight chunk streaming queue');
  assert.equal(vl.pauseHidden, true, 'pause meshing when tab hidden');
});

test('Low Preset - skips EffectComposer and shadows with slightly more chunks', () => {
  const low = GFX_PRESET_CONFIGS.low;
  assert.equal(low.pixelRatioCap, 1.0);
  assert.equal(low.renderDistance, 4);
  assert.equal(low.shadows, 'none');
  assert.equal(low.postProcessing, false);
  assert.equal(low.waterShading, 'flat');
  assert.equal(low.particles, false);
});

test('Medium Preset - skips EffectComposer with full-res atlas and simple water', () => {
  const med = GFX_PRESET_CONFIGS.medium;
  assert.equal(med.renderDistance, 6);
  assert.equal(med.shadows, 'none');
  assert.equal(med.postProcessing, false);
  assert.equal(med.waterShading, 'simple');
  assert.equal(med.atlasResolution, 1024);
  assert.equal(med.particles, true);
});

test('High & Max Presets - BSL-like look with shadows, warm sun, and EffectComposer', () => {
  const high = GFX_PRESET_CONFIGS.high;
  assert.equal(high.shadows, 'basic');
  assert.equal(high.postProcessing, true);
  assert.equal(high.bloom, true);
  assert.equal(high.colorGrade, true);
  assert.equal(high.waterShading, 'bsl');
  assert.equal(high.warmSun, true);

  const max = GFX_PRESET_CONFIGS.max;
  assert.equal(max.shadows, 'soft');
  assert.equal(max.postProcessing, true);
  assert.equal(max.bloom, true);
  assert.equal(max.colorGrade, true);
  assert.equal(max.waterShading, 'bsl');
  assert.equal(max.warmSun, true);
  assert.equal(max.renderDistance, 8);
});

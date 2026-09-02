import assert from 'node:assert/strict';
import {
  QUALITY_TIERS,
  QUALITY_TIER_CONFIGS,
  detectDefaultQualityTier,
  getTierConfig,
  isQualityTier,
  nextTierDown,
} from './QualityConfig';

function testTierTableIntegrity(): void {
  assert.equal(QUALITY_TIERS.length, 5);
  for (const tier of QUALITY_TIERS) {
    const cfg = QUALITY_TIER_CONFIGS[tier];
    assert.equal(cfg.preset, tier);
    assert(cfg.pixelRatioCap > 0);
    assert(cfg.renderDistance >= 3 && cfg.renderDistance <= 8);
    assert(cfg.chunkBudget >= 1 && cfg.chunkBudget <= 4);
  }
}

function testMonotonicScaling(): void {
  // Higher tiers must never shrink the view distance or mesh budget —
  // otherwise the "quality" ladder would be a lie.
  let prevDistance = 0;
  let prevBudget = 0;
  for (const tier of QUALITY_TIERS) {
    const cfg = QUALITY_TIER_CONFIGS[tier];
    assert(cfg.renderDistance >= prevDistance, `${tier} renderDistance regresses`);
    assert(cfg.chunkBudget >= prevBudget, `${tier} chunkBudget regresses`);
    prevDistance = cfg.renderDistance;
    prevBudget = cfg.chunkBudget;
  }
}

function testTierDownLadder(): void {
  assert.equal(nextTierDown('max'), 'high');
  assert.equal(nextTierDown('very-low'), null);
}

function testGetTierConfigCopies(): void {
  const a = getTierConfig('high');
  const b = getTierConfig('high');
  assert.notEqual(a, b);
  a.renderDistance = 99;
  assert.equal(QUALITY_TIER_CONFIGS.high.renderDistance, 7, 'table must not be mutated');
  assert.equal(b.renderDistance, 7);
}

function testIsQualityTier(): void {
  assert.equal(isQualityTier('max'), true);
  assert.equal(isQualityTier('ultra'), false);
  assert.equal(isQualityTier(3), false);
  assert.equal(isQualityTier(null), false);
}

function testDefaultDetectionWithoutNavigator(): void {
  // Node test env: no window/navigator → desktop default.
  assert.equal(detectDefaultQualityTier(), 'high');
}

testTierTableIntegrity();
testMonotonicScaling();
testTierDownLadder();
testGetTierConfigCopies();
testIsQualityTier();
testDefaultDetectionWithoutNavigator();
console.log('engine quality config tests: ok');

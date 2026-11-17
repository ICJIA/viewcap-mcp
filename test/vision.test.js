import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { VISION_TIERS, resolveVisionTier } from '../src/config.js';
import { visualTokens, fitDimensions, maxTileHeight, fitBuffer } from '../src/vision.js';

const HIGH = VISION_TIERS.high;
const STD = VISION_TIERS.standard;

describe('VISION_TIERS', () => {
  it('match the published limits', () => {
    assert.deepEqual(HIGH, { maxEdge: 2576, maxTokens: 4784 });
    assert.deepEqual(STD, { maxEdge: 1568, maxTokens: 1568 });
  });
});

describe('visualTokens', () => {
  // Values from the vision docs' cost table
  it('1000x1000 → 1296', () => assert.equal(visualTokens(1000, 1000), 1296));
  it('1092x1092 → 1521', () => assert.equal(visualTokens(1092, 1092), 1521));
  it('1920x1080 → 2691', () => assert.equal(visualTokens(1920, 1080), 2691));
  it('200x200 → 64', () => assert.equal(visualTokens(200, 200), 64));
});

describe('fitDimensions', () => {
  it('leaves images inside the tier alone', () => {
    assert.deepEqual(fitDimensions(1920, 1080, HIGH), { width: 1920, height: 1080 });
    assert.deepEqual(fitDimensions(1280, 800, STD), { width: 1280, height: 800 });
  });

  it('caps the long edge', () => {
    const { width, height } = fitDimensions(5000, 1000, HIGH);
    assert.ok(width <= 2576);
    assert.ok(Math.abs(width / height - 5) < 0.02);
  });

  it('caps the token count (4K → within 4784 tokens, like the docs)', () => {
    const { width, height } = fitDimensions(3840, 2160, HIGH);
    assert.ok(visualTokens(width, height) <= 4784);
    assert.ok(width <= 2576);
    assert.ok(width >= 2500, `kept close to the max (got ${width})`);
  });

  it('standard tier: 1920x1080 fits within 1568 tokens', () => {
    const { width, height } = fitDimensions(1920, 1080, STD);
    assert.ok(visualTokens(width, height) <= 1568);
    assert.ok(Math.max(width, height) <= 1568);
  });

  it('every result fits, across many shapes', () => {
    for (const tier of [HIGH, STD]) {
      for (const [w, h] of [[1, 9000], [9000, 1], [2577, 2577], [1600, 1600], [3000, 200], [123, 4567]]) {
        const out = fitDimensions(w, h, tier);
        assert.ok(Math.max(out.width, out.height) <= tier.maxEdge, `${w}x${h} edge`);
        assert.ok(visualTokens(out.width, out.height) <= tier.maxTokens, `${w}x${h} tokens`);
      }
    }
  });
});

describe('maxTileHeight', () => {
  it('1280 wide, high tier → full 2576 px tile within the token cap', () => {
    const h = maxTileHeight(1280, HIGH);
    assert.equal(h, 2576);
    assert.ok(visualTokens(1280, h) <= 4784);
  });

  it('wide images get shorter tiles so tokens stay in budget', () => {
    const h = maxTileHeight(2576, HIGH);
    assert.ok(h < 2576);
    assert.ok(visualTokens(2576, h) <= 4784);
  });

  it('standard tier, 1072 wide → ~1120 px tiles within 1568 tokens', () => {
    const h = maxTileHeight(1072, STD);
    assert.ok(visualTokens(1072, h) <= 1568);
    assert.ok(h >= 1072);
  });
});

describe('fitBuffer', () => {
  it('downscales an oversized PNG to fit the tier', async () => {
    const big = await sharp({ create: { width: 3840, height: 2160, channels: 3, background: '#fff' } }).png().toBuffer();
    const { buffer, width, height } = await fitBuffer(big, HIGH);
    const meta = await sharp(buffer).metadata();
    assert.equal(meta.width, width);
    assert.equal(meta.height, height);
    assert.ok(visualTokens(width, height) <= 4784);
  });

  it('returns the same buffer when no resize is needed', async () => {
    const small = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#fff' } }).png().toBuffer();
    const out = await fitBuffer(small, HIGH);
    assert.equal(out.buffer, small);
  });
});

describe('resolveVisionTier', () => {
  it('defaults to high', () => assert.equal(resolveVisionTier([], {}), 'high'));
  it('reads VIEWCAP_VISION_TIER', () => assert.equal(resolveVisionTier([], { VIEWCAP_VISION_TIER: 'standard' }), 'standard'));
  it('--vision-tier beats the env var', () => {
    assert.equal(resolveVisionTier(['--vision-tier', 'high'], { VIEWCAP_VISION_TIER: 'standard' }), 'high');
    assert.equal(resolveVisionTier(['--vision-tier=standard'], {}), 'standard');
  });
  it('falls back to high on an unknown value', () => {
    assert.equal(resolveVisionTier(['--vision-tier=huge'], {}), 'high');
  });
});

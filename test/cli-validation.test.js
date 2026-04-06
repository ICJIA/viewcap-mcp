import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Re-implement clampInt/clampFloat here to test the logic
// (they're not exported from cli.js since they're local helpers)
function clampInt(val, min, max, fallback) {
  const n = parseInt(val);
  if (isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampFloat(val, min, max, fallback) {
  const n = parseFloat(val);
  if (isNaN(n) || !isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

describe('clampInt', () => {
  it('returns value within range', () => {
    assert.equal(clampInt('500', 1, 1072, 1072), 500);
  });

  it('clamps to max', () => {
    assert.equal(clampInt('9999', 1, 1072, 1072), 1072);
  });

  it('clamps to min', () => {
    assert.equal(clampInt('-5', 1, 1072, 1072), 1);
  });

  it('returns fallback for NaN', () => {
    assert.equal(clampInt('abc', 1, 1072, 1072), 1072);
  });

  it('returns fallback for empty string', () => {
    assert.equal(clampInt('', 1, 1072, 1072), 1072);
  });

  it('returns fallback for undefined', () => {
    assert.equal(clampInt(undefined, 1, 1072, 1072), 1072);
  });

  it('handles zero correctly', () => {
    assert.equal(clampInt('0', 0, 30000, 0), 0);
  });

  it('handles exact max boundary', () => {
    assert.equal(clampInt('1072', 1, 1072, 1072), 1072);
  });

  it('handles exact min boundary', () => {
    assert.equal(clampInt('1', 1, 1072, 1072), 1);
  });

  it('prevents OOM-level dimensions', () => {
    assert.equal(clampInt('1000000', 1, 1072, 1072), 1072);
  });
});

describe('clampFloat', () => {
  it('returns value within range', () => {
    assert.equal(clampFloat('5.5', 0.5, 30, 2), 5.5);
  });

  it('clamps to max', () => {
    assert.equal(clampFloat('100', 0.5, 30, 2), 30);
  });

  it('clamps to min', () => {
    assert.equal(clampFloat('0.1', 0.5, 30, 2), 0.5);
  });

  it('returns fallback for NaN', () => {
    assert.equal(clampFloat('abc', 0.5, 30, 2), 2);
  });

  it('returns fallback for Infinity', () => {
    assert.equal(clampFloat('Infinity', 0.5, 30, 2), 2);
  });

  it('returns fallback for -Infinity', () => {
    assert.equal(clampFloat('-Infinity', 0.5, 30, 2), 2);
  });

  it('handles negative values', () => {
    assert.equal(clampFloat('-5', 1, 60, 10), 1);
  });
});

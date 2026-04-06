import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';

describe('CONFIG', () => {
  it('MAX_DIMENSION is positive', () => {
    assert.ok(CONFIG.MAX_DIMENSION > 0);
  });

  it('MAX_DIMENSION is 1072 (Claude Vision sweet spot)', () => {
    assert.equal(CONFIG.MAX_DIMENSION, 1072);
  });

  it('TILE_OVERLAP is positive and less than MAX_DIMENSION', () => {
    assert.ok(CONFIG.TILE_OVERLAP > 0);
    assert.ok(CONFIG.TILE_OVERLAP < CONFIG.MAX_DIMENSION);
  });

  it('MAX_TILES is positive', () => {
    assert.ok(CONFIG.MAX_TILES > 0);
  });

  it('IDLE_TIMEOUT is 60 seconds', () => {
    assert.equal(CONFIG.IDLE_TIMEOUT, 60_000);
  });

  it('NAV_TIMEOUT is 30 seconds', () => {
    assert.equal(CONFIG.NAV_TIMEOUT, 30_000);
  });

  it('WAIT_FOR_MAX is 30 seconds', () => {
    assert.equal(CONFIG.WAIT_FOR_MAX, 30_000);
  });

  it('SELECTOR_TIMEOUT_MAX > SELECTOR_TIMEOUT_DEFAULT', () => {
    assert.ok(CONFIG.SELECTOR_TIMEOUT_MAX > CONFIG.SELECTOR_TIMEOUT_DEFAULT);
  });

  it('SELECTOR_MAX_LENGTH is positive', () => {
    assert.ok(CONFIG.SELECTOR_MAX_LENGTH > 0);
  });

  it('DEFAULT_VIEWPORT dimensions match MAX_DIMENSION', () => {
    assert.equal(CONFIG.DEFAULT_VIEWPORT.width, CONFIG.MAX_DIMENSION);
    assert.equal(CONFIG.DEFAULT_VIEWPORT.height, CONFIG.MAX_DIMENSION);
  });

  it('BLOCKED_HOSTNAMES includes cloud metadata endpoints', () => {
    assert.ok(CONFIG.BLOCKED_HOSTNAMES.includes('169.254.169.254'));
    assert.ok(CONFIG.BLOCKED_HOSTNAMES.includes('metadata.google.internal'));
    assert.ok(CONFIG.BLOCKED_HOSTNAMES.includes('metadata.azure.com'));
  });

  it('BLOCKED_IP_PREFIXES includes link-local', () => {
    assert.ok(CONFIG.BLOCKED_IP_PREFIXES.includes('169.254.'));
  });

  it('LOCALHOST_HOSTS includes all localhost variants', () => {
    assert.ok(CONFIG.LOCALHOST_HOSTS.includes('localhost'));
    assert.ok(CONFIG.LOCALHOST_HOSTS.includes('127.0.0.1'));
    assert.ok(CONFIG.LOCALHOST_HOSTS.includes('::1'));
  });
});

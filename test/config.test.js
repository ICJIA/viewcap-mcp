import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { CONFIG } from '../src/config.js';
import * as config from '../src/config.js';

describe('CONFIG', () => {
  it('MAX_VIEWPORT matches the high-res long edge (2576)', () => {
    assert.equal(CONFIG.MAX_VIEWPORT, 2576);
  });

  it('TILE_OVERLAP is positive and far smaller than any tile', () => {
    assert.ok(CONFIG.TILE_OVERLAP > 0);
    assert.ok(CONFIG.TILE_OVERLAP < 500);
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

  it('DEFAULT_VIEWPORT is a 1280x800 desktop, within MAX_VIEWPORT', () => {
    assert.deepEqual(CONFIG.DEFAULT_VIEWPORT, { width: 1280, height: 800 });
    assert.ok(CONFIG.DEFAULT_VIEWPORT.width <= CONFIG.MAX_VIEWPORT);
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

describe('VERSION', () => {
  it('matches package.json version (single source of truth)', () => {
    const pkg = JSON.parse(
      fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );
    assert.equal(config.VERSION, pkg.version);
  });
});

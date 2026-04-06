import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { _test } from '../src/capture.js';
import { CONFIG } from '../src/config.js';

const { calculateTilePositions } = _test;

describe('calculateTilePositions', () => {
  it('returns single tile for image within MAX_DIMENSION', () => {
    const tiles = calculateTilePositions(1072);
    assert.equal(tiles.length, 1);
    assert.deepEqual(tiles[0], { y: 0, height: 1072 });
  });

  it('returns single tile for image shorter than MAX_DIMENSION', () => {
    const tiles = calculateTilePositions(500);
    assert.equal(tiles.length, 1);
    assert.deepEqual(tiles[0], { y: 0, height: 500 });
  });

  it('returns two tiles with correct overlap for slightly tall image', () => {
    const tiles = calculateTilePositions(1500);
    assert.equal(tiles.length, 2);
    assert.deepEqual(tiles[0], { y: 0, height: 1072 });
    assert.equal(tiles[1].y, 1072 - CONFIG.TILE_OVERLAP); // 1022
    assert.equal(tiles[1].y, 1022);
    assert.equal(tiles[1].height, 1500 - 1022); // 478
  });

  it('handles exact two-tile boundary', () => {
    // 1072 + (1072 - 50) = 2094
    const tiles = calculateTilePositions(2094);
    assert.equal(tiles.length, 2);
    assert.deepEqual(tiles[0], { y: 0, height: 1072 });
    assert.deepEqual(tiles[1], { y: 1022, height: 1072 });
  });

  it('tiles three-tile image correctly', () => {
    const tiles = calculateTilePositions(2930);
    assert.equal(tiles.length, 3);
    assert.deepEqual(tiles[0], { y: 0, height: 1072 });
    assert.equal(tiles[1].y, 1022);
    assert.equal(tiles[2].y, 2044);
  });

  it('caps at MAX_TILES', () => {
    // Very tall image
    const tiles = calculateTilePositions(50000);
    assert.equal(tiles.length, CONFIG.MAX_TILES);
    assert.equal(tiles.length, 8);
  });

  it('first tile always starts at y=0', () => {
    for (const h of [500, 1072, 2000, 5000, 10000]) {
      const tiles = calculateTilePositions(h);
      assert.equal(tiles[0].y, 0);
    }
  });

  it('tiles have consistent overlap', () => {
    const tiles = calculateTilePositions(5000);
    for (let i = 1; i < tiles.length; i++) {
      const prevEnd = tiles[i - 1].y + tiles[i - 1].height;
      const overlap = prevEnd - tiles[i].y;
      // Overlap should be TILE_OVERLAP for all but potentially the last tile
      if (i < tiles.length - 1) {
        assert.equal(overlap, CONFIG.TILE_OVERLAP);
      }
    }
  });

  it('last tile does not exceed image height', () => {
    for (const h of [1500, 2930, 5000, 8000]) {
      const tiles = calculateTilePositions(h);
      const lastTile = tiles[tiles.length - 1];
      assert.ok(lastTile.y + lastTile.height <= h);
    }
  });

  it('tiles cover the full image (no gaps)', () => {
    const h = 3000;
    const tiles = calculateTilePositions(h);
    // Check every pixel row is covered by at least one tile
    for (let row = 0; row < h; row++) {
      const covered = tiles.some(t => row >= t.y && row < t.y + t.height);
      if (!covered) {
        // Only fail if we haven't hit the tile cap
        if (tiles.length < CONFIG.MAX_TILES) {
          assert.fail(`Row ${row} not covered by any tile`);
        }
      }
    }
  });

  it('returns empty for zero height', () => {
    const tiles = calculateTilePositions(0);
    assert.equal(tiles.length, 0);
  });
});

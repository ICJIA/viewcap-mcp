import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';

describe('screencast config limits', () => {
  it('MAX_SCREENCAST_FRAMES is positive', () => {
    assert.ok(CONFIG.MAX_SCREENCAST_FRAMES > 0);
  });

  it('MAX_SCREENCAST_FRAMES is 20', () => {
    assert.equal(CONFIG.MAX_SCREENCAST_FRAMES, 20);
  });

  it('MAX_SCREENCAST_DURATION is positive', () => {
    assert.ok(CONFIG.MAX_SCREENCAST_DURATION > 0);
  });

  it('MAX_SCREENCAST_DURATION is 60 seconds', () => {
    assert.equal(CONFIG.MAX_SCREENCAST_DURATION, 60);
  });

  it('frame count calculation respects limits', () => {
    const duration = 10;
    const interval = 2;
    const maxFrames = Math.min(
      Math.floor(duration / interval) + 1,
      CONFIG.MAX_SCREENCAST_FRAMES
    );
    assert.equal(maxFrames, 6); // frames at 0, 2, 4, 6, 8, 10
  });

  it('frame count capped at MAX_SCREENCAST_FRAMES', () => {
    const duration = 60;
    const interval = 1;
    const maxFrames = Math.min(
      Math.floor(duration / interval) + 1,
      CONFIG.MAX_SCREENCAST_FRAMES
    );
    assert.equal(maxFrames, CONFIG.MAX_SCREENCAST_FRAMES);
  });

  it('duration capped at MAX_SCREENCAST_DURATION', () => {
    const requestedDuration = 120;
    const capped = Math.min(requestedDuration, CONFIG.MAX_SCREENCAST_DURATION);
    assert.equal(capped, 60);
  });
});

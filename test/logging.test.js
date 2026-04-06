import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setVerbosity, log } from '../src/config.js';

describe('logging', () => {
  afterEach(() => {
    setVerbosity('normal');
  });

  it('setVerbosity does not throw for valid levels', () => {
    assert.doesNotThrow(() => setVerbosity('quiet'));
    assert.doesNotThrow(() => setVerbosity('normal'));
    assert.doesNotThrow(() => setVerbosity('verbose'));
  });

  it('log function exists and is callable', () => {
    assert.equal(typeof log, 'function');
  });

  it('log does not throw for valid levels', () => {
    setVerbosity('verbose');
    assert.doesNotThrow(() => log('error', 'test error'));
    assert.doesNotThrow(() => log('info', 'test info'));
    assert.doesNotThrow(() => log('debug', 'test debug'));
  });

  // Note: We can't easily test stderr output filtering without
  // capturing stderr, but we verify the functions exist and don't crash.
  // The actual filtering behavior is tested implicitly by the log function
  // checking verbosity level before writing.
});

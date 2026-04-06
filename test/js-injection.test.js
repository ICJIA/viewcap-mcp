import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { _test, setAllowJs } from '../src/capture.js';

const { handleJsInjection } = _test;

describe('JavaScript injection gate', () => {
  beforeEach(() => {
    setAllowJs(false);
  });

  it('throws when JS injection is disabled', () => {
    setAllowJs(false);
    assert.throws(() => handleJsInjection('alert(1)'), {
      message: 'JavaScript injection is disabled. Launch viewcap with --allow-js to enable.',
    });
  });

  it('does not throw when JS injection is enabled', () => {
    setAllowJs(true);
    assert.doesNotThrow(() => handleJsInjection('alert(1)'));
  });

  it('error message does not leak internal details', () => {
    setAllowJs(false);
    try {
      handleJsInjection('alert(1)');
      assert.fail('should have thrown');
    } catch (err) {
      assert.ok(!err.message.includes('/'));
      assert.ok(err.message.includes('--allow-js'));
    }
  });

  // Reset to disabled after tests
  it('setAllowJs toggles the gate', () => {
    setAllowJs(true);
    assert.doesNotThrow(() => handleJsInjection('test'));
    setAllowJs(false);
    assert.throws(() => handleJsInjection('test'));
  });
});

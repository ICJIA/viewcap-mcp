import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { _test } from '../src/capture.js';

const { isBlockedIp } = _test;

describe('isBlockedIp', () => {
  it('does not block localhost', async () => {
    assert.equal(await isBlockedIp('localhost'), false);
  });

  it('does not block 127.0.0.1', async () => {
    assert.equal(await isBlockedIp('127.0.0.1'), false);
  });

  it('does not block ::1', async () => {
    assert.equal(await isBlockedIp('::1'), false);
  });

  it('blocks unresolvable hostnames (fail closed)', async () => {
    assert.equal(await isBlockedIp('this-will-never-resolve-viewcap-test.invalid'), true);
  });

  it('does not block normal external hostnames', async () => {
    // example.com resolves to 93.184.215.14 — not in blocked ranges
    assert.equal(await isBlockedIp('example.com'), false);
  });
});

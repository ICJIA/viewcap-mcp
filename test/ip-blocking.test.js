import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { _test } from '../src/capture.js';
import { CONFIG } from '../src/config.js';

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

  it('does not block [::1]', async () => {
    assert.equal(await isBlockedIp('[::1]'), false);
  });

  it('blocks unresolvable hostnames (fail closed)', async () => {
    assert.equal(await isBlockedIp('this-will-never-resolve-viewcap-test.invalid'), true);
  });

  it('does not block normal external hostnames', async () => {
    // example.com resolves to 93.184.215.14 — not in blocked ranges
    assert.equal(await isBlockedIp('example.com'), false);
  });
});

describe('BLOCKED_IP_PREFIXES coverage', () => {
  it('includes IPv4 link-local (169.254.x)', () => {
    assert.ok(CONFIG.BLOCKED_IP_PREFIXES.includes('169.254.'));
  });

  it('includes RFC1918 Class A (10.x)', () => {
    assert.ok(CONFIG.BLOCKED_IP_PREFIXES.includes('10.'));
  });

  it('includes RFC1918 Class B (172.16-31.x)', () => {
    for (let i = 16; i <= 31; i++) {
      assert.ok(
        CONFIG.BLOCKED_IP_PREFIXES.includes(`172.${i}.`),
        `Missing 172.${i}.`
      );
    }
  });

  it('includes RFC1918 Class C (192.168.x)', () => {
    assert.ok(CONFIG.BLOCKED_IP_PREFIXES.includes('192.168.'));
  });

  it('includes IPv6 unique-local (fd00:)', () => {
    assert.ok(CONFIG.BLOCKED_IP_PREFIXES.includes('fd00:'));
  });

  it('includes IPv6 link-local (fe80:)', () => {
    assert.ok(CONFIG.BLOCKED_IP_PREFIXES.includes('fe80:'));
  });

  it('prefix matching works for all blocked ranges', () => {
    const testIPs = [
      '169.254.169.254',
      '10.0.0.1',
      '10.255.255.255',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.0.1',
      '192.168.255.255',
      'fd00::1',
      'fe80::1',
    ];
    for (const ip of testIPs) {
      const blocked = CONFIG.BLOCKED_IP_PREFIXES.some(prefix => ip.startsWith(prefix));
      assert.ok(blocked, `Expected ${ip} to be blocked`);
    }
  });

  it('does not block public IPs', () => {
    const publicIPs = [
      '93.184.215.14',   // example.com
      '8.8.8.8',         // Google DNS
      '1.1.1.1',         // Cloudflare DNS
      '172.15.0.1',      // Just outside 172.16-31 range
      '172.32.0.1',      // Just outside 172.16-31 range
      '11.0.0.1',        // Not 10.x
      '193.168.0.1',     // Not 192.168.x
    ];
    for (const ip of publicIPs) {
      const blocked = CONFIG.BLOCKED_IP_PREFIXES.some(prefix => ip.startsWith(prefix));
      assert.ok(!blocked, `Expected ${ip} to NOT be blocked`);
    }
  });
});

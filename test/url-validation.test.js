import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { _test } from '../src/capture.js';

const { validateUrl } = _test;

describe('validateUrl', () => {
  // ─── Allowed URLs ──────────────────────────────────────────────

  it('allows http localhost', async () => {
    const result = await validateUrl('http://localhost:3000');
    assert.equal(result, 'http://localhost:3000/');
  });

  it('allows http 127.0.0.1', async () => {
    const result = await validateUrl('http://127.0.0.1:3000');
    assert.equal(result, 'http://127.0.0.1:3000/');
  });

  it('allows http ::1', async () => {
    const result = await validateUrl('http://[::1]:3000');
    assert.equal(result, 'http://[::1]:3000/');
  });

  it('allows https external URLs', async () => {
    const result = await validateUrl('https://example.com');
    assert.equal(result, 'https://example.com/');
  });

  it('allows http external URLs', async () => {
    const result = await validateUrl('http://example.com');
    assert.equal(result, 'http://example.com/');
  });

  it('allows URLs with paths and query strings', async () => {
    const result = await validateUrl('http://localhost:3000/page?q=test');
    assert.equal(result, 'http://localhost:3000/page?q=test');
  });

  // ─── Blocked schemes ──────────────────────────────────────────

  it('blocks file:// URLs', async () => {
    await assert.rejects(() => validateUrl('file:///etc/passwd'), {
      message: 'Blocked URL scheme',
    });
  });

  it('blocks data: URLs', async () => {
    await assert.rejects(() => validateUrl('data:text/html,<h1>hi</h1>'), {
      message: 'Blocked URL scheme',
    });
  });

  it('blocks javascript: URLs', async () => {
    await assert.rejects(() => validateUrl('javascript:alert(1)'), {
      message: 'Blocked URL scheme',
    });
  });

  it('blocks ftp: URLs', async () => {
    await assert.rejects(() => validateUrl('ftp://example.com'), {
      message: 'Blocked URL scheme',
    });
  });

  // ─── Blocked hostnames ────────────────────────────────────────

  it('blocks AWS metadata endpoint', async () => {
    await assert.rejects(() => validateUrl('http://169.254.169.254/latest/meta-data/'), {
      message: 'Blocked URL',
    });
  });

  it('blocks GCP metadata endpoint', async () => {
    await assert.rejects(() => validateUrl('http://metadata.google.internal/'), {
      message: 'Blocked URL',
    });
  });

  it('blocks Azure metadata endpoint', async () => {
    await assert.rejects(() => validateUrl('http://metadata.azure.com/'), {
      message: 'Blocked URL',
    });
  });

  // ─── Invalid URLs ─────────────────────────────────────────────

  it('throws on invalid URL', async () => {
    await assert.rejects(() => validateUrl('not-a-url'));
  });

  it('throws on empty string', async () => {
    await assert.rejects(() => validateUrl(''));
  });

  // ─── Error message safety ─────────────────────────────────────

  it('error messages are generic (no internal details)', async () => {
    try {
      await validateUrl('file:///etc/passwd');
      assert.fail('should have thrown');
    } catch (err) {
      assert.equal(err.message, 'Blocked URL scheme');
      assert.ok(!err.message.includes('/etc'));
      assert.ok(!err.message.includes('home'));
    }
  });
});

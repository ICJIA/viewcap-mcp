import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { _test } from '../src/capture.js';

const { validateOutputDir } = _test;

describe('validateOutputDir', () => {
  const testDirs = [];

  afterEach(() => {
    for (const dir of testDirs) {
      try { fs.rmSync(dir, { recursive: true }); } catch {}
    }
    testDirs.length = 0;
  });

  it('accepts path under home directory', () => {
    const dir = path.join(os.homedir(), '.viewcap-test-' + Date.now());
    testDirs.push(dir);
    const result = validateOutputDir(dir);
    assert.ok(fs.existsSync(result));
  });

  it('accepts path under /tmp', () => {
    const dir = '/tmp/viewcap-test-' + Date.now();
    testDirs.push(dir);
    const result = validateOutputDir(dir);
    assert.ok(fs.existsSync(result));
  });

  it('creates nested directories', () => {
    const dir = path.join(os.homedir(), '.viewcap-test-' + Date.now(), 'nested', 'deep');
    testDirs.push(path.join(os.homedir(), '.viewcap-test-' + dir.split('viewcap-test-')[1].split('/')[0]));
    const result = validateOutputDir(dir);
    assert.ok(fs.existsSync(result));
  });

  it('rejects path outside home and /tmp', () => {
    assert.throws(() => validateOutputDir('/etc/viewcap'), {
      message: 'Output directory is outside allowed paths',
    });
  });

  it('rejects traversal attempts', () => {
    assert.throws(() => validateOutputDir('/tmp/../../etc/viewcap'), {
      message: 'Output directory is outside allowed paths',
    });
  });

  it('rejects root path', () => {
    assert.throws(() => validateOutputDir('/'), {
      message: 'Output directory is outside allowed paths',
    });
  });

  it('error messages are generic', () => {
    try {
      validateOutputDir('/etc/viewcap');
      assert.fail('should have thrown');
    } catch (err) {
      assert.equal(err.message, 'Output directory is outside allowed paths');
      assert.ok(!err.message.includes(os.homedir()));
    }
  });
});

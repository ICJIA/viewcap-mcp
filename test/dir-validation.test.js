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

  it('rejects /var/log (outside allowed paths)', () => {
    assert.throws(() => validateOutputDir('/var/log/viewcap'), {
      message: 'Output directory is outside allowed paths',
    });
  });

  it('rejects /usr/local (outside allowed paths)', () => {
    assert.throws(() => validateOutputDir('/usr/local/viewcap'), {
      message: 'Output directory is outside allowed paths',
    });
  });

  it('accepts deeply nested path under /tmp', () => {
    const dir = `/tmp/viewcap-test-${Date.now()}/a/b/c/d`;
    testDirs.push(`/tmp/viewcap-test-${dir.split('viewcap-test-')[1].split('/')[0]}`);
    const result = validateOutputDir(dir);
    assert.ok(fs.existsSync(result));
  });

  it('rejects symlink escape from /tmp to /etc', () => {
    // Create a symlink in /tmp that points outside allowed paths
    const linkDir = `/tmp/viewcap-symlink-test-${Date.now()}`;
    testDirs.push(linkDir);
    try {
      fs.symlinkSync('/etc', linkDir);
      assert.throws(() => validateOutputDir(path.join(linkDir, 'viewcap')), {
        message: 'Output directory is outside allowed paths',
      });
    } finally {
      try { fs.unlinkSync(linkDir); } catch {}
    }
  });

  it('returned path is the real path (no symlinks)', () => {
    const dir = '/tmp/viewcap-realpath-test-' + Date.now();
    testDirs.push(dir);
    const result = validateOutputDir(dir);
    // On macOS, /tmp -> /private/tmp, so result should be under /private/tmp
    if (process.platform === 'darwin') {
      assert.ok(result.startsWith('/private/tmp'), `Expected /private/tmp prefix, got ${result}`);
    }
    assert.ok(fs.existsSync(result));
  });
});

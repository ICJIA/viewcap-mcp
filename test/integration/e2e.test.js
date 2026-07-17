// End-to-end tests: real Chromium, real HTTP server, real captures.
// Run with: npm run test:integration
// Not part of the default `npm test` glob (slow — launches Chromium).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { CONFIG } from '../../src/config.js';
import { takeScreenshot } from '../../src/capture.js';
import { takeScreencast } from '../../src/screencast.js';
import * as browserMod from '../../src/browser.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

let srv;
let base;
const tmpDirs = [];

function makeTmpDir() {
  const dir = fs.mkdtempSync('/tmp/viewcap-e2e-');
  tmpDirs.push(dir);
  return dir;
}

// Spawn the packaged bin (restart.js) and capture output, with a hang guard.
function runBin(args, timeoutMs) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(ROOT, 'src/restart.js'), ...args], { cwd: ROOT });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => (stderr += d));
    const t = setTimeout(() => {
      p.kill('SIGKILL');
      resolve({ timedOut: true, code: null, stdout, stderr });
    }, timeoutMs);
    p.on('exit', (code) => {
      clearTimeout(t);
      resolve({ timedOut: false, code, stdout, stderr });
    });
  });
}

before(async () => {
  srv = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    if (req.url === '/tall') {
      res.end('<html><body style="margin:0"><div style="height:3000px;background:linear-gradient(red,blue)">tall</div></body></html>');
    } else if (req.url === '/anim') {
      // Content that visibly changes between frames — consecutive identical
      // frames are (correctly) deduplicated by libvips when building the WebP.
      res.end('<html><body><h1 id="t" style="font-size:80px"></h1><script>setInterval(() => { document.getElementById("t").textContent = Date.now(); }, 100);</script></body></html>');
    } else {
      res.end('<html><body><h1>ok</h1></body></html>');
    }
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});

after(async () => {
  await browserMod.shutdown();
  srv.close();
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('browser idle lifecycle', () => {
  it('completes an operation longer than IDLE_TIMEOUT without the browser being killed', { timeout: 60_000 }, async () => {
    const orig = CONFIG.IDLE_TIMEOUT;
    CONFIG.IDLE_TIMEOUT = 1200; // scaled: real config is 60s idle vs up to 60s screencast
    try {
      const content = await takeScreencast({
        url: base, duration: 3, interval: 1,
        waitUntil: 'domcontentloaded', waitFor: 0,
      });
      assert.equal(content.length, 4); // frames at 0s, 1s, 2s, 3s
      assert.ok(content.every((c) => c.type === 'image'));
    } finally {
      CONFIG.IDLE_TIMEOUT = orig;
    }
  });

  it('re-arms the idle timer after operations so the browser still idle-closes', { timeout: 30_000 }, async () => {
    assert.ok(browserMod._test, 'browser.js should export _test helpers');
    const orig = CONFIG.IDLE_TIMEOUT;
    CONFIG.IDLE_TIMEOUT = 800;
    try {
      await takeScreenshot({
        url: base, width: 800, height: 600, fullPage: false,
        waitUntil: 'domcontentloaded', waitFor: 0,
      });
      assert.equal(browserMod._test.isBrowserRunning(), true, 'browser should still be up right after an operation');
      await new Promise((r) => setTimeout(r, 2500));
      assert.equal(browserMod._test.isBrowserRunning(), false, 'browser should idle-close after IDLE_TIMEOUT of inactivity');
    } finally {
      CONFIG.IDLE_TIMEOUT = orig;
    }
  });
});

describe('screencast animated WebP', () => {
  it('writes a genuinely animated WebP with per-frame delay matching the interval', { timeout: 60_000 }, async () => {
    const dir = makeTmpDir();
    const content = await takeScreencast({
      url: `${base}/anim`, duration: 2, interval: 2,
      waitUntil: 'domcontentloaded', waitFor: 0, directory: dir,
    });
    const webp = content.find((c) => c.type === 'text' && c.text.endsWith('.webp'));
    assert.ok(webp, 'screencast should produce a .webp when saving to a directory');
    const meta = await sharp(webp.text, { animated: true }).metadata();
    assert.equal(meta.pages, 2, 'WebP should contain one page per frame');
    assert.deepEqual(meta.delay, [2000, 2000], 'frame delay should match the capture interval');
  });
});

describe('full-page tiling output', () => {
  it('names all tiles of one capture with a shared timestamp prefix', { timeout: 60_000 }, async () => {
    const dir = makeTmpDir();
    const content = await takeScreenshot({
      url: `${base}/tall`, width: 1072, height: 1072, fullPage: true,
      waitUntil: 'domcontentloaded', waitFor: 0, directory: dir,
    });
    assert.ok(content.length >= 2, 'a 3000px page should produce multiple tiles');
    const prefixes = new Set(
      content.map((c) => path.basename(c.text).replace(/-tile-\d+\.png$/, ''))
    );
    assert.equal(prefixes.size, 1, `tiles of one capture should share a timestamp prefix, got: ${[...prefixes].join(', ')}`);
  });
});

describe('bin routing (restart.js)', () => {
  it('viewcap --help prints usage and exits instead of starting the server', { timeout: 15_000 }, async () => {
    const r = await runBin(['--help'], 10_000);
    assert.equal(r.timedOut, false, '--help must not hang as an MCP server');
    assert.equal(r.code, 0);
    assert.match(r.stdout, /Usage:/);
    assert.match(r.stdout, /capture/);
  });

  it('viewcap --version prints the package.json version and exits', { timeout: 15_000 }, async () => {
    const r = await runBin(['--version'], 10_000);
    assert.equal(r.timedOut, false, '--version must not hang as an MCP server');
    assert.equal(r.code, 0);
    assert.equal(r.stdout.trim(), PKG.version);
  });

  it('viewcap --allow-js capture <url> runs the CLI capture, not the server', { timeout: 90_000 }, async () => {
    const dir = makeTmpDir();
    const out = path.join(dir, 'cli-shot.png');
    const r = await runBin(['--allow-js', 'capture', `${base}/`, '-o', out], 60_000);
    assert.equal(r.timedOut, false, 'global flag before subcommand must still route to the CLI');
    assert.equal(r.code, 0, `CLI exited ${r.code}; stderr: ${r.stderr.slice(0, 300)}`);
    assert.ok(fs.existsSync(out), 'capture should write the output PNG');
  });
});

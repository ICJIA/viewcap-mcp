import sharp from 'sharp';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { lookup } from 'dns/promises';
import { createHash } from 'crypto';
import { CONFIG, getVisionLimits } from './config.js';
import { maxTileHeight, fitBuffer } from './vision.js';
import { getPage, closePage } from './browser.js';

let allowJs = false;
export function setAllowJs(flag) { allowJs = flag; }

// Request serialization — one capture at a time
let queue = Promise.resolve();

function enqueue(fn) {
  queue = queue.then(() => fn(), () => fn());
  return queue;
}

export function takeScreenshot(params) {
  return enqueue(() => _takeScreenshot(params));
}

export function captureSelector(params) {
  return enqueue(() => _captureSelector(params));
}

// ─── URL Validation ────────────────────────────────────────────────

async function isBlockedIp(hostname) {
  if (CONFIG.LOCALHOST_HOSTS.includes(hostname)) return false;

  try {
    const { address } = await lookup(hostname);
    return CONFIG.BLOCKED_IP_PREFIXES.some(prefix => address.startsWith(prefix));
  } catch {
    // DNS resolution failed — fail closed (block the request).
    // Let Puppeteer surface a navigation error instead of allowing
    // a potentially dangerous hostname through.
    return true;
  }
}

async function validateUrl(url) {
  const parsed = new URL(url);

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Blocked URL scheme');
  }

  if (CONFIG.BLOCKED_HOSTNAMES.includes(parsed.hostname)) {
    throw new Error('Blocked URL');
  }

  if (await isBlockedIp(parsed.hostname)) {
    throw new Error('Blocked URL');
  }

  if (!CONFIG.LOCALHOST_HOSTS.includes(parsed.hostname)) {
    console.error(`[viewcap] Navigating to external host: ${parsed.hostname}`);
  }

  return parsed.href;
}

// ─── Directory Validation ──────────────────────────────────────────

function validateOutputDir(dir) {
  const resolved = path.resolve(dir);
  const home = os.homedir();
  const realHome = fs.realpathSync(home);
  const realTmp = fs.realpathSync('/tmp');

  // Logical path check (fast reject for obvious violations)
  if (!resolved.startsWith(home) && !resolved.startsWith('/tmp') && !resolved.startsWith('/private/tmp')) {
    throw new Error('Output directory is outside allowed paths');
  }

  // Walk up to the deepest existing ancestor and resolve its real path.
  // This catches symlink escapes BEFORE we create any directories.
  let existing = resolved;
  while (!fs.existsSync(existing)) {
    existing = path.dirname(existing);
  }
  const realExisting = fs.realpathSync(existing);
  if (!realExisting.startsWith(realHome) && !realExisting.startsWith(realTmp)) {
    throw new Error('Output directory is outside allowed paths');
  }

  // Now safe to create — the ancestor is verified
  fs.mkdirSync(resolved, { recursive: true });
  const real = fs.realpathSync(resolved);

  // Final check on the created path (belt and suspenders)
  if (!real.startsWith(realHome) && !real.startsWith(realTmp)) {
    throw new Error('Output directory is outside allowed paths');
  }

  return real;
}

// ─── JS Injection Gate ─────────────────────────────────────────────

function handleJsInjection(javascript) {
  if (!allowJs) {
    throw new Error('JavaScript injection is disabled. Launch viewcap with --allow-js to enable.');
  }
  const hash = createHash('sha256').update(javascript).digest('hex').slice(0, 16);
  console.error(`[viewcap] Executing JS (${hash}): ${javascript.substring(0, 200)}`);
}

// ─── Tiling ────────────────────────────────────────────────────────

// Split an image of `imageHeight` px into tiles of at most `tileHeight` px,
// overlapping by TILE_OVERLAP so text on a seam appears whole in one tile.
// The tile height comes from maxTileHeight() for the image's width, so each
// tile fits the active vision tier.
function calculateTilePositions(imageHeight, tileHeight) {
  const positions = [];
  let y = 0;

  while (y < imageHeight && positions.length < CONFIG.MAX_TILES) {
    const remaining = imageHeight - y;
    positions.push({ y, height: Math.min(tileHeight, remaining) });

    if (y + tileHeight >= imageHeight) break;
    y += tileHeight - CONFIG.TILE_OVERLAP;
  }

  return positions;
}

// ─── take_screenshot ───────────────────────────────────────────────

async function _takeScreenshot({ url, width, height, fullPage, waitUntil, waitFor, javascript, directory }) {
  await validateUrl(url);

  let outputDir;
  if (directory) {
    outputDir = validateOutputDir(directory);
  }

  width = Math.min(width, CONFIG.MAX_VIEWPORT);
  height = Math.min(height, CONFIG.MAX_VIEWPORT);

  let buffer;
  let page;
  try {
    page = await getPage(width, height);
    await page.goto(url, { waitUntil, timeout: CONFIG.NAV_TIMEOUT });

    // Post-navigation recheck
    await validateUrl(page.url());

    if (waitFor > 0) {
      await new Promise(r => setTimeout(r, Math.min(waitFor, CONFIG.WAIT_FOR_MAX)));
    }

    if (javascript !== undefined && javascript !== null) {
      handleJsInjection(javascript);
      await page.evaluate(javascript);
    }

    buffer = await page.screenshot({ fullPage, type: 'png', encoding: 'binary' });
  } finally {
    if (page) await closePage(page);
  }

  // Image processing — page is closed, work with buffer only
  const limits = getVisionLimits();
  const meta = await sharp(buffer).metadata();
  let workBuffer = buffer;
  let workWidth = meta.width;
  let workHeight = meta.height;

  // Wider than the tier's max edge: scale the whole capture down to that
  // width first (tiles are then cut from the scaled image).
  if (workWidth > limits.maxEdge) {
    workBuffer = await sharp(buffer)
      .resize({ width: limits.maxEdge, withoutEnlargement: true })
      .png()
      .toBuffer();
    const resizedMeta = await sharp(workBuffer).metadata();
    workWidth = resizedMeta.width;
    workHeight = resizedMeta.height;
  }

  // Tallest tile this width allows within the tier's edge and token limits.
  const tileHeight = maxTileHeight(workWidth, limits);

  // One timestamp per capture so all tiles share a filename prefix
  const timestamp = Date.now();

  // Single image — no tiling needed
  if (workHeight <= tileHeight) {
    if (outputDir) {
      const filePath = path.join(outputDir, `screenshot-${timestamp}-tile-1.png`);
      fs.writeFileSync(filePath, workBuffer);
      return [{ type: 'text', text: filePath }];
    }
    return [{ type: 'image', data: workBuffer.toString('base64'), mimeType: 'image/png' }];
  }

  // Tiling
  const tiles = calculateTilePositions(workHeight, tileHeight);
  const content = [];

  for (let i = 0; i < tiles.length; i++) {
    const { y, height: tileHeight } = tiles[i];
    const tileBuffer = await sharp(workBuffer)
      .extract({ left: 0, top: y, width: workWidth, height: tileHeight })
      .png()
      .toBuffer();

    if (outputDir) {
      const filePath = path.join(outputDir, `screenshot-${timestamp}-tile-${i + 1}.png`);
      fs.writeFileSync(filePath, tileBuffer);
      content.push({ type: 'text', text: filePath });
    } else {
      content.push({ type: 'image', data: tileBuffer.toString('base64'), mimeType: 'image/png' });
    }
  }

  return content;
}

// ─── capture_selector ──────────────────────────────────────────────

async function _captureSelector({ url, selector, width, height, waitUntil, waitFor, selectorTimeout, directory }) {
  await validateUrl(url);

  if (selector.length > CONFIG.SELECTOR_MAX_LENGTH) {
    throw new Error('Selector too long');
  }

  let outputDir;
  if (directory) {
    outputDir = validateOutputDir(directory);
  }

  width = Math.min(width, CONFIG.MAX_VIEWPORT);
  height = Math.min(height, CONFIG.MAX_VIEWPORT);

  let buffer;
  let page;
  try {
    page = await getPage(width, height);
    await page.goto(url, { waitUntil, timeout: CONFIG.NAV_TIMEOUT });

    // Post-navigation recheck
    await validateUrl(page.url());

    if (waitFor > 0) {
      await new Promise(r => setTimeout(r, Math.min(waitFor, CONFIG.WAIT_FOR_MAX)));
    }

    const el = await page.waitForSelector(selector, {
      timeout: Math.min(selectorTimeout, CONFIG.SELECTOR_TIMEOUT_MAX),
    });

    if (!el) {
      throw new Error('Element not found for selector');
    }

    buffer = await el.screenshot({ type: 'png', encoding: 'binary' });
  } finally {
    if (page) await closePage(page);
  }

  // Resize if needed — proportional, to fit the vision tier's edge and
  // token limits
  const { buffer: workBuffer } = await fitBuffer(buffer);

  if (outputDir) {
    const filePath = path.join(outputDir, `selector-${Date.now()}.png`);
    fs.writeFileSync(filePath, workBuffer);
    return [{ type: 'text', text: filePath }];
  }

  return [{ type: 'image', data: workBuffer.toString('base64'), mimeType: 'image/png' }];
}

// ─── Test-only exports ─────────────────────────────────────────────

// Shared queue — also used by screencast.js to prevent concurrent page ops
export { enqueue };

export const _test = {
  validateUrl,
  validateOutputDir,
  calculateTilePositions,
  handleJsInjection,
  isBlockedIp,
};

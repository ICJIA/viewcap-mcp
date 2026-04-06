import sharp from 'sharp';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { lookup } from 'dns/promises';
import { createHash } from 'crypto';
import { CONFIG } from './config.js';
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
    return false;
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
    console.error(`[viewcap] Navigating to external URL: ${url}`);
  }

  return parsed.href;
}

// ─── Directory Validation ──────────────────────────────────────────

function validateOutputDir(dir) {
  const resolved = path.resolve(dir);
  const home = os.homedir();

  if (!resolved.startsWith(home) && !resolved.startsWith('/tmp') && !resolved.startsWith('/private/tmp')) {
    throw new Error('Output directory is outside allowed paths');
  }

  fs.mkdirSync(resolved, { recursive: true });
  const real = fs.realpathSync(resolved);

  const realHome = fs.realpathSync(home);
  const realTmp = fs.realpathSync('/tmp');
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

function calculateTilePositions(imageHeight) {
  const positions = [];
  let y = 0;

  while (y < imageHeight && positions.length < CONFIG.MAX_TILES) {
    const remaining = imageHeight - y;
    const tileHeight = Math.min(CONFIG.MAX_DIMENSION, remaining);
    positions.push({ y, height: tileHeight });

    if (y + CONFIG.MAX_DIMENSION >= imageHeight) break;
    y += CONFIG.MAX_DIMENSION - CONFIG.TILE_OVERLAP;
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

  width = Math.min(width, CONFIG.MAX_DIMENSION);
  height = Math.min(height, CONFIG.MAX_DIMENSION);

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
  const meta = await sharp(buffer).metadata();
  let workBuffer = buffer;
  let workWidth = meta.width;
  let workHeight = meta.height;

  if (workWidth > CONFIG.MAX_DIMENSION) {
    workBuffer = await sharp(buffer)
      .resize({ width: CONFIG.MAX_DIMENSION, withoutEnlargement: true })
      .png()
      .toBuffer();
    const resizedMeta = await sharp(workBuffer).metadata();
    workWidth = resizedMeta.width;
    workHeight = resizedMeta.height;
  }

  // Single image — no tiling needed
  if (workHeight <= CONFIG.MAX_DIMENSION) {
    if (outputDir) {
      const filePath = path.join(outputDir, `screenshot-${Date.now()}-tile-1.png`);
      fs.writeFileSync(filePath, workBuffer);
      return [{ type: 'text', text: filePath }];
    }
    return [{ type: 'image', data: workBuffer.toString('base64'), mimeType: 'image/png' }];
  }

  // Tiling
  const tiles = calculateTilePositions(workHeight);
  const content = [];

  for (let i = 0; i < tiles.length; i++) {
    const { y, height: tileHeight } = tiles[i];
    const tileBuffer = await sharp(workBuffer)
      .extract({ left: 0, top: y, width: workWidth, height: tileHeight })
      .png()
      .toBuffer();

    if (outputDir) {
      const filePath = path.join(outputDir, `screenshot-${Date.now()}-tile-${i + 1}.png`);
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

  width = Math.min(width, CONFIG.MAX_DIMENSION);
  height = Math.min(height, CONFIG.MAX_DIMENSION);

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

  // Resize if needed — proportional so largest edge = MAX_DIMENSION
  const meta = await sharp(buffer).metadata();
  let workBuffer = buffer;

  if (meta.width > CONFIG.MAX_DIMENSION || meta.height > CONFIG.MAX_DIMENSION) {
    const scale = Math.min(CONFIG.MAX_DIMENSION / meta.width, CONFIG.MAX_DIMENSION / meta.height);
    const newWidth = Math.round(meta.width * scale);
    workBuffer = await sharp(buffer)
      .resize({ width: newWidth, withoutEnlargement: true })
      .png()
      .toBuffer();
  }

  if (outputDir) {
    const filePath = path.join(outputDir, `selector-${Date.now()}.png`);
    fs.writeFileSync(filePath, workBuffer);
    return [{ type: 'text', text: filePath }];
  }

  return [{ type: 'image', data: workBuffer.toString('base64'), mimeType: 'image/png' }];
}

// ─── Test-only exports ─────────────────────────────────────────────

export const _test = {
  validateUrl,
  validateOutputDir,
  calculateTilePositions,
  handleJsInjection,
  isBlockedIp,
};

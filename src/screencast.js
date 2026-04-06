import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { CONFIG, log } from './config.js';
import { getPage, closePage } from './browser.js';

// Import validation helpers and shared queue from capture.js
import { _test, enqueue } from './capture.js';
const { validateUrl, validateOutputDir, handleJsInjection } = _test;

export function takeScreencast(params) {
  return enqueue(() => _takeScreencast(params));
}

async function _takeScreencast({ url, duration, interval, waitUntil, waitFor, javascript, directory }) {
  await validateUrl(url);

  let outputDir;
  if (directory) {
    outputDir = validateOutputDir(directory);
  }

  // Enforce limits
  duration = Math.min(duration, CONFIG.MAX_SCREENCAST_DURATION);
  const maxFrames = Math.min(Math.floor(duration / interval) + 1, CONFIG.MAX_SCREENCAST_FRAMES);

  const frames = [];
  let page;
  try {
    page = await getPage(CONFIG.MAX_DIMENSION, CONFIG.MAX_DIMENSION);
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

    // Capture frames
    log('debug', `Screencast: ${maxFrames} frames over ${duration}s (interval ${interval}s)`);

    for (let i = 0; i < maxFrames; i++) {
      if (i > 0) {
        await new Promise(r => setTimeout(r, interval * 1000));
      }

      const buffer = await page.screenshot({
        type: 'png',
        encoding: 'binary',
        clip: { x: 0, y: 0, width: CONFIG.MAX_DIMENSION, height: CONFIG.MAX_DIMENSION },
      });

      frames.push(buffer);
      log('debug', `Screencast: captured frame ${i + 1}/${maxFrames}`);
    }
  } finally {
    if (page) await closePage(page);
  }

  // Process frames — page is closed
  const content = [];
  const timestamp = Date.now();

  for (let i = 0; i < frames.length; i++) {
    const meta = await sharp(frames[i]).metadata();
    let frameBuffer = frames[i];

    if (meta.width > CONFIG.MAX_DIMENSION || meta.height > CONFIG.MAX_DIMENSION) {
      frameBuffer = await sharp(frames[i])
        .resize({ width: CONFIG.MAX_DIMENSION, height: CONFIG.MAX_DIMENSION, fit: 'inside' })
        .png()
        .toBuffer();
    }

    if (outputDir) {
      const filePath = path.join(outputDir, `screencast-${timestamp}-frame-${i + 1}.png`);
      fs.writeFileSync(filePath, frameBuffer);
      content.push({ type: 'text', text: filePath });
    } else {
      content.push({ type: 'image', data: frameBuffer.toString('base64'), mimeType: 'image/png' });
    }

    frames[i] = frameBuffer;
  }

  // Generate animated WebP if saving to directory
  if (outputDir && frames.length > 1) {
    try {
      const webpPath = path.join(outputDir, `screencast-${timestamp}.webp`);
      const meta = await sharp(frames[0]).metadata();
      const { width, height } = meta;

      // Stack frames vertically, then use pageHeight to split into animation frames
      const stacked = await sharp({
        create: {
          width,
          height: height * frames.length,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite(
          frames.map((buf, i) => ({
            input: buf,
            top: i * height,
            left: 0,
          }))
        )
        .webp({
          loop: 0,
          delay: frames.map(() => 1000),
          pageHeight: height,
        })
        .toBuffer();

      fs.writeFileSync(webpPath, stacked);
      content.push({ type: 'text', text: webpPath });
      log('info', `Screencast: animated WebP saved`);
    } catch (err) {
      // Animated WebP is a convenience — don't fail the whole screencast
      log('error', `Animated WebP generation failed: ${err.message}`);
    }
  }

  return content;
}

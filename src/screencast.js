import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { CONFIG, log } from './config.js';
import { getPage, closePage } from './browser.js';
import { fitBuffer } from './vision.js';

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
    const { width: vw, height: vh } = CONFIG.DEFAULT_VIEWPORT;
    page = await getPage(vw, vh);
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
        clip: { x: 0, y: 0, width: vw, height: vh },
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
    // Fit each frame to the vision tier's edge and token limits
    const { buffer: frameBuffer } = await fitBuffer(frames[i]);

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
      const animated = await sharp(frames, { join: { animated: true } })
        .webp({
          loop: 0,
          delay: frames.map(() => Math.round(interval * 1000)),
        })
        .toBuffer();

      fs.writeFileSync(webpPath, animated);
      content.push({ type: 'text', text: webpPath });
      log('info', `Screencast: animated WebP saved`);
    } catch (err) {
      // Animated WebP is a convenience — don't fail the whole screencast
      log('error', `Animated WebP generation failed: ${err.message}`);
    }
  }

  return content;
}

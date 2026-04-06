#!/usr/bin/env node

import { program } from 'commander';
import fs from 'fs';
import path from 'path';
import { takeScreenshot, captureSelector, setAllowJs } from './capture.js';
import { takeScreencast } from './screencast.js';
import { setVerbosity } from './config.js';
import { shutdown } from './browser.js';

program
  .name('viewcap')
  .description('Vision-optimized web page screenshot tool')
  .version('0.1.1');

// Global options
program
  .option('--allow-js', 'Enable JavaScript injection')
  .option('--verbose', 'Verbose logging')
  .option('--quiet', 'Errors only');

import { CONFIG } from './config.js';

function applyGlobalOptions(opts) {
  if (opts.allowJs) setAllowJs(true);
  if (opts.verbose) setVerbosity('verbose');
  if (opts.quiet) setVerbosity('quiet');
}

function clampInt(val, min, max, fallback) {
  const n = parseInt(val);
  if (isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampFloat(val, min, max, fallback) {
  const n = parseFloat(val);
  if (isNaN(n) || !isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

program
  .command('capture <url>')
  .description('Take a screenshot of a web page')
  .option('-o, --output <path>', 'Output file path (PNG)', 'screenshot.png')
  .option('-w, --width <n>', 'Viewport width', '1072')
  .option('-h, --height <n>', 'Viewport height', '1072')
  .option('--no-full-page', 'Capture viewport only, no full-page scroll')
  .option('--wait-until <event>', 'Page load event', 'domcontentloaded')
  .option('--wait-for <ms>', 'Additional delay in ms', '0')
  .option('--js <code>', 'JavaScript to evaluate before capture')
  .option('-d, --directory <path>', 'Save tiles to directory instead of single file')
  .action(async (url, opts) => {
    applyGlobalOptions(program.opts());
    try {
      const params = {
        url,
        width: clampInt(opts.width, 1, CONFIG.MAX_DIMENSION, CONFIG.MAX_DIMENSION),
        height: clampInt(opts.height, 1, CONFIG.MAX_DIMENSION, CONFIG.MAX_DIMENSION),
        fullPage: opts.fullPage,
        waitUntil: opts.waitUntil,
        waitFor: clampInt(opts.waitFor, 0, CONFIG.WAIT_FOR_MAX, 0),
      };

      if (opts.js) params.javascript = opts.js;
      if (opts.directory) params.directory = opts.directory;

      const content = await takeScreenshot(params);

      if (opts.directory) {
        for (const block of content) {
          console.log(block.text);
        }
      } else {
        // Save tiles to files
        for (let i = 0; i < content.length; i++) {
          const block = content[i];
          if (block.type === 'image') {
            const buffer = Buffer.from(block.data, 'base64');
            const ext = path.extname(opts.output);
            const base = path.basename(opts.output, ext);
            const dir = path.dirname(opts.output);
            const filePath = content.length === 1
              ? opts.output
              : path.join(dir, `${base}-tile-${i + 1}${ext}`);
            fs.writeFileSync(filePath, buffer);
            console.log(filePath);
          }
        }
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exitCode = 1;
    } finally {
      await shutdown();
    }
  });

program
  .command('selector <url> <selector>')
  .description('Capture a specific DOM element')
  .option('-o, --output <path>', 'Output file path (PNG)', 'element.png')
  .option('-w, --width <n>', 'Viewport width', '1072')
  .option('-h, --height <n>', 'Viewport height', '1072')
  .option('--wait-until <event>', 'Page load event', 'domcontentloaded')
  .option('--wait-for <ms>', 'Additional delay in ms', '0')
  .option('--selector-timeout <ms>', 'Max ms to wait for selector', '5000')
  .option('-d, --directory <path>', 'Save to directory instead of single file')
  .action(async (url, selector, opts) => {
    applyGlobalOptions(program.opts());
    try {
      const params = {
        url,
        selector,
        width: clampInt(opts.width, 1, CONFIG.MAX_DIMENSION, CONFIG.MAX_DIMENSION),
        height: clampInt(opts.height, 1, CONFIG.MAX_DIMENSION, CONFIG.MAX_DIMENSION),
        waitUntil: opts.waitUntil,
        waitFor: clampInt(opts.waitFor, 0, CONFIG.WAIT_FOR_MAX, 0),
        selectorTimeout: clampInt(opts.selectorTimeout, 0, CONFIG.SELECTOR_TIMEOUT_MAX, CONFIG.SELECTOR_TIMEOUT_DEFAULT),
      };

      if (opts.directory) params.directory = opts.directory;

      const content = await captureSelector(params);

      if (opts.directory) {
        for (const block of content) {
          console.log(block.text);
        }
      } else {
        for (const block of content) {
          if (block.type === 'image') {
            const buffer = Buffer.from(block.data, 'base64');
            fs.writeFileSync(opts.output, buffer);
            console.log(opts.output);
          }
        }
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exitCode = 1;
    } finally {
      await shutdown();
    }
  });

program
  .command('screencast <url>')
  .description('Capture multiple frames over time')
  .option('-d, --directory <path>', 'Save frames + animated WebP to directory', '.')
  .option('--duration <s>', 'Total capture time in seconds', '10')
  .option('--interval <s>', 'Seconds between frames', '2')
  .option('--wait-until <event>', 'Page load event', 'domcontentloaded')
  .option('--wait-for <ms>', 'Additional delay in ms', '0')
  .option('--js <code>', 'JavaScript to execute before first frame')
  .action(async (url, opts) => {
    applyGlobalOptions(program.opts());
    try {
      const params = {
        url,
        duration: clampFloat(opts.duration, 1, CONFIG.MAX_SCREENCAST_DURATION, 10),
        interval: clampFloat(opts.interval, 0.5, 30, 2),
        waitUntil: opts.waitUntil,
        waitFor: clampInt(opts.waitFor, 0, CONFIG.WAIT_FOR_MAX, 0),
        directory: opts.directory,
      };

      if (opts.js) params.javascript = opts.js;

      const content = await takeScreencast(params);

      for (const block of content) {
        if (block.type === 'text') {
          console.log(block.text);
        }
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exitCode = 1;
    } finally {
      await shutdown();
    }
  });

// Default command: start MCP server (when no subcommand given)
if (process.argv.length <= 2 || process.argv[2].startsWith('-')) {
  // No subcommand — run as MCP server
  // Import server.js dynamically to start MCP mode
  await import('./server.js');
} else {
  program.parse();
}

#!/usr/bin/env node

import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { takeScreenshot, captureSelector, setAllowJs } from './capture.js';
import { takeScreencast } from './screencast.js';
import { readPackageVersion, fetchLatestVersion } from './version.js';
import { setVerbosity, VERSION, CONFIG, getVisionTier, getVisionLimits } from './config.js';

const allowJs = process.argv.includes('--allow-js');
if (allowJs) console.error('[viewcap] JavaScript injection ENABLED');
setAllowJs(allowJs);

if (process.argv.includes('--verbose')) setVerbosity('verbose');
if (process.argv.includes('--quiet')) setVerbosity('quiet');

const server = new McpServer({
  name: 'viewcap',
  version: VERSION,
});

server.registerTool(
  'take_screenshot',
  {
    description: 'Capture a screenshot of a web page, optimized for Claude Vision. Images are sized to what Claude reads at full resolution (2576 px / 4784 visual tokens on Claude 4.7+); full pages are tiled to fit. Returns base64 PNG images.',
    inputSchema: z.object({
      url: z.string().describe('HTTP or HTTPS URL to screenshot'),
      width: z.number().int().min(1).max(CONFIG.MAX_VIEWPORT).default(CONFIG.DEFAULT_VIEWPORT.width).describe('Viewport width in pixels (default 1280, max 2576)'),
      height: z.number().int().min(1).max(CONFIG.MAX_VIEWPORT).default(CONFIG.DEFAULT_VIEWPORT.height).describe('Viewport height in pixels (default 800, max 2576)'),
      fullPage: z.boolean().default(true).describe('Capture full scrollable page with automatic tiling'),
      waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle0', 'networkidle2']).default('domcontentloaded').describe('Page load event to wait for'),
      waitFor: z.number().int().min(0).max(30000).default(0).describe('Additional delay in ms after page load (max 30000)'),
      javascript: z.string().optional().describe('JS to evaluate before capture (requires --allow-js flag)'),
      directory: z.string().optional().describe('Save PNGs to this directory and return file paths instead of base64'),
    }),
  },
  async (params) => {
    try {
      const content = await takeScreenshot(params);
      return { content };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
    }
  }
);

server.registerTool(
  'capture_selector',
  {
    description: 'Capture a screenshot of a specific DOM element by CSS selector, optimized for Claude Vision. Returns a single base64 PNG image.',
    inputSchema: z.object({
      url: z.string().describe('HTTP or HTTPS URL to load'),
      selector: z.string().describe('CSS selector for the target element'),
      width: z.number().int().min(1).max(CONFIG.MAX_VIEWPORT).default(CONFIG.DEFAULT_VIEWPORT.width).describe('Viewport width in pixels (default 1280, max 2576)'),
      height: z.number().int().min(1).max(CONFIG.MAX_VIEWPORT).default(CONFIG.DEFAULT_VIEWPORT.height).describe('Viewport height in pixels (default 800, max 2576)'),
      waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle0', 'networkidle2']).default('domcontentloaded').describe('Page load event to wait for'),
      waitFor: z.number().int().min(0).max(30000).default(0).describe('Additional delay in ms after page load (max 30000)'),
      selectorTimeout: z.number().int().min(0).max(15000).default(5000).describe('Max ms to wait for selector to appear (max 15000)'),
      directory: z.string().optional().describe('Save PNG to this directory and return file path instead of base64'),
    }),
  },
  async (params) => {
    try {
      const content = await captureSelector(params);
      return { content };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
    }
  }
);

server.registerTool(
  'take_screencast',
  {
    description: 'Capture multiple frames of a web page over time. Returns one image per frame. Captures the top 1280x800 viewport per frame. When saving to directory, also generates an animated WebP.',
    inputSchema: z.object({
      url: z.string().describe('HTTP or HTTPS URL to capture'),
      duration: z.number().min(1).max(60).default(10).describe('Total capture time in seconds (max 60)'),
      interval: z.number().min(0.5).max(30).default(2).describe('Seconds between frames'),
      waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle0', 'networkidle2']).default('domcontentloaded').describe('Page load event to wait for'),
      waitFor: z.number().int().min(0).max(30000).default(0).describe('Pre-capture delay in ms (max 30000)'),
      javascript: z.string().optional().describe('JS to execute before first frame (requires --allow-js flag)'),
      directory: z.string().optional().describe('Save frames + animated WebP to this directory'),
    }),
  },
  async (params) => {
    try {
      const content = await takeScreencast(params);
      return { content };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
    }
  }
);

// ─── get_status ────────────────────────────────────────────────────

const puppeteerVersion = readPackageVersion('puppeteer');
const sharpVersion = readPackageVersion('sharp');

// Non-blocking npm registry check, kicked off at startup
let _latestVersion = null;
const _latestPromise = fetchLatestVersion('@icjia/viewcap').then((v) => {
  _latestVersion = v;
  return v;
});

server.registerTool(
  'get_status',
  {
    description: 'Returns viewcap server version, installed Puppeteer and sharp versions, whether JavaScript injection is enabled, and whether a newer viewcap version is available on npm.',
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const latest = _latestVersion ?? await _latestPromise;
      const updateNote = (latest === 'unknown' || latest === VERSION)
        ? '(latest)'
        : `(latest: v${latest} — update available)`;

      const text = [
        'viewcap status',
        `  Server:       @icjia/viewcap v${VERSION} ${updateNote}`,
        `  Puppeteer:    v${puppeteerVersion}`,
        `  sharp:        v${sharpVersion}`,
        `  JS injection: ${allowJs ? 'enabled (--allow-js)' : 'disabled (launch with --allow-js to enable)'}`,
        `  Vision tier:  ${getVisionTier()} (images up to ${getVisionLimits().maxEdge} px / ${getVisionLimits().maxTokens} visual tokens; set with --vision-tier or VIEWCAP_VISION_TIER)`,
        `  Node:         v${process.versions.node}`,
        `  Platform:     ${process.platform} ${process.arch}`,
      ].join('\n');

      return { content: [{ type: 'text', text }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
    }
  }
);

console.error(`[viewcap] Server started — tools: take_screenshot, capture_selector, take_screencast, get_status — vision tier: ${getVisionTier()}`);
const transport = new StdioServerTransport();
await server.connect(transport);

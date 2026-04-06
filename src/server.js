#!/usr/bin/env node

import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { takeScreenshot, captureSelector, setAllowJs } from './capture.js';
import { takeScreencast } from './screencast.js';
import { setVerbosity } from './config.js';

const allowJs = process.argv.includes('--allow-js');
if (allowJs) console.error('[viewcap] JavaScript injection ENABLED');
setAllowJs(allowJs);

if (process.argv.includes('--verbose')) setVerbosity('verbose');
if (process.argv.includes('--quiet')) setVerbosity('quiet');

const server = new McpServer({
  name: 'viewcap',
  version: '0.1.0',
});

server.registerTool(
  'take_screenshot',
  {
    description: 'Capture a screenshot of a web page, optimized for Claude Vision. Full pages are automatically tiled into 1072x1072 chunks. Returns base64 PNG images.',
    inputSchema: z.object({
      url: z.string().describe('HTTP or HTTPS URL to screenshot'),
      width: z.number().int().min(1).max(1072).default(1072).describe('Viewport width in pixels (max 1072)'),
      height: z.number().int().min(1).max(1072).default(1072).describe('Viewport height in pixels (max 1072)'),
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
      width: z.number().int().min(1).max(1072).default(1072).describe('Viewport width in pixels (max 1072)'),
      height: z.number().int().min(1).max(1072).default(1072).describe('Viewport height in pixels (max 1072)'),
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
    description: 'Capture multiple frames of a web page over time. Returns one image per frame. Only captures the top 1072x1072 viewport per frame. When saving to directory, also generates an animated WebP.',
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

console.error('[viewcap] Server started — tools: take_screenshot, capture_selector, take_screencast');
const transport = new StdioServerTransport();
await server.connect(transport);

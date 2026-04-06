# ViewCap — Phase 1 Build Prompt

> **Feed this entire document to Claude Code to build Phase 1.**
> This is a self-contained build prompt. Do not reference external documents.

---

## What You Are Building

ViewCap is a local MCP server for Claude Code that captures screenshots of web pages, optimized for Claude Vision analysis. It communicates over stdio (no HTTP, no ports). This is Phase 1: the core screenshot tool with security mitigations.

**This is a clean-room implementation.** The design is inspired by `@just-every/mcp-screenshot-website-fast` but no code from that package is used. All implementation is original.

---

## Project Setup

### Initialize the repo

use this current directory. I've already created a viewcap-mcp directory -- and everything should be placed in the directory's root,.

### Set `package.json` to exactly this:

```json
{
  "name": "@icjia/viewcap",
  "version": "0.1.0",
  "description": "MCP screenshot server for Claude Code — Vision-optimized page capture with automatic tiling",
  "type": "module",
  "main": "src/server.js",
  "bin": {
    "viewcap": "./src/server.js"
  },
  "scripts": {
    "start": "node src/server.js",
    "dev": "node src/server.js --allow-js",
    "test": "node --test test/"
  },
  "files": [
    "src/",
    "README.md"
  ],
  "engines": {
    "node": ">=18"
  },
  "keywords": ["mcp", "screenshot", "puppeteer", "claude", "vision"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/ICJIA/viewcap.git"
  }
}
```

### Install dependencies (exactly these, nothing else):

```bash
npm install @modelcontextprotocol/server zod puppeteer sharp
```

`@modelcontextprotocol/server` is the MCP server SDK. `zod` is a required peer dependency for tool input schema validation. No `commander` yet (that's Phase 3). No TypeScript. No build tools. No dev dependencies.

### Create `.gitignore`:

```
node_modules/
.DS_Store
```

### Create file structure:

```
viewcap/
├── package.json
├── .gitignore
├── publish.sh
├── README.md
└── src/
    ├── server.js
    ├── browser.js
    ├── capture.js
    └── config.js
```

Phase 1 has four source files. `screencast.js`, `restart.js`, and `cli.js` come in later phases. Create a minimal `README.md` placeholder with just the project name and one-line description — the full README is a Phase 3 deliverable.

> **Phase 3 transition note:** When `restart.js` is added in Phase 3, the `bin` field in `package.json` must change from `"./src/server.js"` to `"./src/restart.js"`. This is a required change — don't forget it.

### Create `publish.sh`:

Create the publish script and make it executable:

```bash
chmod +x publish.sh
```

The script handles both first-time and subsequent publishes to npm. Usage:

```bash
./publish.sh              # bump patch + publish (default)
./publish.sh minor        # bump minor + publish
./publish.sh major        # bump major + publish
./publish.sh --dry-run    # dry run only, no changes
```

It performs these safety checks before publishing:
- Verifies you're in the project root with the correct `package.json`
- Checks npm login status (prompts login if needed)
- Rejects if there are uncommitted git changes
- Detects first-time publish (uses `--access public` automatically)
- Always runs a dry run first and asks for confirmation
- After publish: commits the version bump, creates a git tag, pushes both

**IMPORTANT — ESM compatibility:** This project uses `"type": "module"` in `package.json`, which means `node -e` treats inline code as ESM. You **cannot** use `require()` in `node -e` calls. Use one of these patterns instead:

```bash
# Read a field from package.json (ESM-safe)
node --input-type=commonjs -e "console.log(require('./package.json').name)"

# Or use a process import:
node -e "import {readFileSync} from 'fs'; const p = JSON.parse(readFileSync('./package.json','utf8')); console.log(p.name)"
```

The full `publish.sh` script should use the `--input-type=commonjs` approach for all `node -e` calls that read `package.json`.

Also ensure the script creates a git tag for the **first-time publish** too (v0.1.0 deserves a tag), not just for subsequent version bumps.

The full script already exists in the project root as `publish.sh`. It needs to be **updated** to fix the ESM compatibility issue and first-time tagging. After fixing, verify it is executable (`chmod +x publish.sh`).

---

## File Specifications

### `src/config.js`

Export a single config object with these constants:

```javascript
export const CONFIG = {
  MAX_DIMENSION: 1072,         // Claude Vision optimal: ~1.15 megapixels
  TILE_OVERLAP: 50,            // Pixels of overlap between tiles for context continuity
  MAX_TILES: 8,                // Cap to prevent flooding context from infinite-scroll pages
  IDLE_TIMEOUT: 60_000,        // 60s — close browser after inactivity
  NAV_TIMEOUT: 30_000,         // 30s — page navigation timeout
  WAIT_FOR_MAX: 30_000,        // 30s — max waitFor delay to prevent indefinite blocking
  SELECTOR_TIMEOUT_DEFAULT: 5_000,
  SELECTOR_TIMEOUT_MAX: 15_000,
  SELECTOR_MAX_LENGTH: 1000,   // Max CSS selector string length
  DEFAULT_VIEWPORT: { width: 1072, height: 1072 },
  DEFAULT_WAIT_UNTIL: 'domcontentloaded',
  BLOCKED_HOSTNAMES: [
    '169.254.169.254',         // AWS metadata
    'metadata.google.internal', // GCP metadata
    'metadata.azure.com',      // Azure metadata
  ],
  BLOCKED_IP_PREFIXES: [
    '169.254.',                // Link-local (AWS metadata lives here)
    'fd00:',                   // IPv6 unique-local
  ],
  LOCALHOST_HOSTS: ['localhost', '127.0.0.1', '::1'],
};
```

---

### `src/browser.js`

Manages a singleton Puppeteer browser instance with automatic idle shutdown.

**Imports:**

```javascript
import puppeteer from 'puppeteer';
import { CONFIG } from './config.js';
```

**Exports:**
- `getPage(width, height)` — returns a new page with the given viewport. Launches browser if not running. Resets idle timer.
- `closePage(page)` — closes the page. Always call this after capture.
- `shutdown()` — immediately closes the browser. Called on process exit.

**Behavior:**
- On first call to `getPage()`, launch Puppeteer with these args:

```javascript
const COMMON_ARGS = [
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-sync',
  '--no-first-run',
];

// Only disable sandbox on Linux where user namespaces may not be available.
// On macOS, keep the sandbox for stronger process isolation.
const LINUX_ARGS = ['--no-sandbox', '--disable-setuid-sandbox'];

const args = process.platform === 'linux'
  ? [...COMMON_ARGS, ...LINUX_ARGS]
  : COMMON_ARGS;

const browser = await puppeteer.launch({ headless: true, args });
```

> **Note:** Use `headless: true`, not `headless: 'new'`. In Puppeteer 22+, `true` already uses the modern headless implementation. The `'new'` string value was a transitional option and is now deprecated.

- Store the browser instance in module-level variable.
- Start a 60-second idle timer (`setTimeout`). Every call to `getPage()` clears and resets this timer.
- When the timer fires, call `browser.close()` and set the instance to `null`.
- `closePage(page)` wraps `page.close()` in a try/catch (page may already be closed if browser crashed).
- Register `process.on('exit', shutdown)` and `process.on('SIGINT', shutdown)` to clean up.

**Error handling:**
- If `puppeteer.launch()` fails, throw with a clear message ("Failed to launch Chromium — is puppeteer installed?").
- If browser disconnects unexpectedly (`browser.on('disconnected')`), set instance to `null` so next `getPage()` relaunches.

---

### `src/capture.js`

Contains the screenshot logic, URL validation, tiling, and directory output.

**Imports:**

```javascript
import sharp from 'sharp';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { lookup } from 'dns/promises';
import { createHash } from 'crypto';
import { CONFIG } from './config.js';
import { getPage, closePage } from './browser.js';
```

**Exports:**
- `takeScreenshot(params)` — captures a screenshot, returns MCP content blocks.
- `captureSelector(params)` — captures a specific DOM element, returns MCP content block.
- `setAllowJs(flag)` — module-level setter for the JS injection gate.

**Module-level state:**

```javascript
let allowJs = false;
export function setAllowJs(flag) { allowJs = flag; }
```

#### Request Serialization

All capture operations are serialized through a simple async queue to prevent concurrent Puppeteer page operations from colliding:

```javascript
let queue = Promise.resolve();

function enqueue(fn) {
  queue = queue.then(() => fn(), () => fn()); // continue chain even on error
  return queue;
}
```

Both `takeScreenshot` and `captureSelector` wrap their logic in `enqueue()` and **return the enqueued promise**:

```javascript
export function takeScreenshot(params) {
  return enqueue(() => _takeScreenshot(params));
}

export function captureSelector(params) {
  return enqueue(() => _captureSelector(params));
}
```

The actual logic lives in `_takeScreenshot` and `_captureSelector` (private functions). This ensures only one capture runs at a time and the return value flows back to the MCP handler.

#### URL Validation

Create an **async** `validateUrl(url)` function used by both exports. This runs both **before** and **after** navigation (post-navigation recheck catches HTTP redirects and DNS rebinding).

```javascript
async function validateUrl(url) {
  const parsed = new URL(url); // throws on invalid URL

  // 1. Scheme whitelist
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Blocked URL scheme');
  }

  // 2. Hostname blocklist (exact match)
  if (CONFIG.BLOCKED_HOSTNAMES.includes(parsed.hostname)) {
    throw new Error('Blocked URL');
  }

  // 3. IP resolution check — catches hex, octal, IPv6-mapped, and DNS wildcard bypasses
  if (!CONFIG.LOCALHOST_HOSTS.includes(parsed.hostname)) {
    try {
      const { address } = await lookup(parsed.hostname);
      if (CONFIG.BLOCKED_IP_PREFIXES.some(prefix => address.startsWith(prefix))) {
        throw new Error('Blocked URL');
      }
    } catch (err) {
      if (err.message === 'Blocked URL') throw err;
      // DNS failure — let Puppeteer handle it (will fail at navigation)
    }
    console.error(`[viewcap] Navigating to external URL: ${url}`);
  }

  return parsed.href;
}
```

**Post-navigation recheck:** After `page.goto()` completes, call `await validateUrl(page.url())`. If the final URL fails validation, close the page and throw before taking any screenshot. This catches redirects to `file://` or metadata endpoints and DNS rebinding attacks.

**Error messages:** Use generic messages (`'Blocked URL scheme'`, `'Blocked URL'`) in thrown errors — these are returned to Claude. Log the specific URL and reason to stderr only.

#### Directory Validation

Create a `validateOutputDir(dir)` function:

```javascript
function validateOutputDir(dir) {
  const resolved = path.resolve(dir);
  const home = os.homedir();

  // Logical path check (fast reject)
  if (!resolved.startsWith(home) && !resolved.startsWith('/tmp') && !resolved.startsWith('/private/tmp')) {
    throw new Error('Output directory is outside allowed paths');
  }

  // Create directory, then resolve symlinks to catch symlink escapes
  fs.mkdirSync(resolved, { recursive: true });
  const real = fs.realpathSync(resolved);

  // Real path check (on macOS, /tmp → /private/tmp)
  const realHome = fs.realpathSync(home);
  const realTmp = fs.realpathSync('/tmp');
  if (!real.startsWith(realHome) && !real.startsWith(realTmp)) {
    throw new Error('Output directory is outside allowed paths');
  }

  return real;
}
```

The `realpathSync` step is critical: it follows symlinks to detect escapes like `/tmp/evil` → `/etc`. Without this, an attacker could create a symlink chain that passes the `startsWith` check but writes outside allowed paths.

#### JavaScript Injection Gate

Uses the module-level `allowJs` flag set by `setAllowJs()`. If `javascript` parameter is provided but `allowJs` is false, throw: `JavaScript injection is disabled. Launch viewcap with --allow-js to enable.`

When JS is allowed and provided, log a truncated preview and SHA-256 hash for audit traceability:

```javascript
const hash = createHash('sha256').update(javascript).digest('hex').slice(0, 16);
console.error(`[viewcap] Executing JS (${hash}): ${javascript.substring(0, 200)}`);
```

#### `_takeScreenshot(params)`

Parameters object: `{ url, width, height, fullPage, waitUntil, waitFor, javascript, directory }`

All parameters have defaults populated by Zod in `server.js` — no need to apply defaults here.

Steps:
1. `await validateUrl(url)` — pre-navigation check.
2. If `directory` is provided, validate it with `validateOutputDir(dir)`.
3. Clamp `width` and `height` to `CONFIG.MAX_DIMENSION`.
4. **Begin try/finally block.** Get a page via `getPage(width, height)`. `getPage()` handles `page.setViewport()` internally — do not set the viewport again.
5. Navigate: `await page.goto(url, { waitUntil, timeout: CONFIG.NAV_TIMEOUT })`.
6. **Post-navigation recheck:** `await validateUrl(page.url())`. If the page redirected to a blocked destination, this throws before any screenshot is taken.
7. If `waitFor > 0`, delay: `await new Promise(r => setTimeout(r, Math.min(waitFor, CONFIG.WAIT_FOR_MAX)))`.
8. If `javascript` is provided and `allowJs` is true, log with hash and run `await page.evaluate(javascript)`. If `javascript` is provided but `allowJs` is false, throw.
9. Capture screenshot: `await page.screenshot({ fullPage, type: 'png', encoding: 'binary' })` — returns a Buffer.
10. **In the `finally` block:** close the page via `closePage(page)`. This runs whether steps 5-9 succeed or fail.
11. **After the try/finally** (page is closed, buffer is in hand): process the image with sharp. Do not hold the page open during image processing.

#### Image Processing (sharp)

After capturing the raw PNG buffer:

1. Get metadata: `const meta = await sharp(buffer).metadata()`.
2. **If width > MAX_DIMENSION:** resize so width = MAX_DIMENSION, height scales proportionally. **Important:** materialize the resized image as a buffer before any further operations:
   ```javascript
   const resizedBuffer = await sharp(buffer)
     .resize({ width: CONFIG.MAX_DIMENSION, withoutEnlargement: true })
     .png()
     .toBuffer();
   ```
   Then get the resized metadata: `const resizedMeta = await sharp(resizedBuffer).metadata()`.
3. **If resulting image fits in MAX_DIMENSION × MAX_DIMENSION:** return as a single image content block.
4. **If height > MAX_DIMENSION (needs tiling):**
   - Calculate tile positions with `CONFIG.TILE_OVERLAP` overlap.
   - Tile 1: y=0, height=MAX_DIMENSION.
   - Tile N: y = previous_y + MAX_DIMENSION - TILE_OVERLAP.
   - Last tile: from y to end of image (may be shorter than MAX_DIMENSION).
   - Cap at `CONFIG.MAX_TILES` tiles.
   - Extract each tile from the **materialized `resizedBuffer`** (not the original):
     ```javascript
     await sharp(resizedBuffer)
       .extract({ left: 0, top: y, width: MAX_DIMENSION, height: tileHeight })
       .png()
       .toBuffer()
     ```
   - Do not chain `.resize()` and `.extract()` — sharp requires separate pipeline instances for this.
5. Return array of content blocks.

#### Content Block Format

Each image is returned as an MCP image content block:

```javascript
{
  type: 'image',
  data: buffer.toString('base64'),
  mimeType: 'image/png',
}
```

If `directory` is provided, instead save each tile to disk as `screenshot-{timestamp}-tile-{N}.png` and return text content blocks with the file paths:

```javascript
{
  type: 'text',
  text: `/path/to/screenshot-1712345678-tile-1.png`,
}
```

#### `_captureSelector(params)`

Parameters: `{ url, selector, width, height, waitUntil, waitFor, selectorTimeout, directory }`

> **Note:** `captureSelector` does not accept a `javascript` parameter. This is intentional — element captures target a specific selector as-is. Page modification before capture should be done via a separate `takeScreenshot` call with JS.

Steps:
1. `await validateUrl(url)`. Clamp dimensions. If `directory` is provided, validate it. Validate selector length: if `selector.length > CONFIG.SELECTOR_MAX_LENGTH`, throw `'Selector too long'`.
2. **Begin try/finally block.** Get page, navigate, wait. Cap `waitFor` at `CONFIG.WAIT_FOR_MAX`.
3. **Post-navigation recheck:** `await validateUrl(page.url())`.
4. Wait for selector and capture the returned element handle in one step:
   ```javascript
   const el = await page.waitForSelector(selector, {
     timeout: Math.min(selectorTimeout, CONFIG.SELECTOR_TIMEOUT_MAX),
   });
   ```
   `waitForSelector` returns the `ElementHandle` directly — do **not** call `page.$(selector)` separately (that introduces a race where the element could disappear between calls).
5. If `el` is null, throw `'Element not found for selector'`.
6. Screenshot the element: `await el.screenshot({ type: 'png', encoding: 'binary' })`.
7. **In the `finally` block:** close page via `closePage(page)`.
8. **After try/finally:** resize with sharp if either dimension exceeds MAX_DIMENSION (resize proportionally so largest edge = MAX_DIMENSION).
9. If `directory` is set, save PNG to disk as `selector-{timestamp}.png` and return a text content block with the file path. Otherwise return single image content block (no tiling — element screenshots are returned as-is).

---

### `src/server.js`

The entry point. Initializes the MCP server, parses CLI args, registers tools.

**Shebang line:** `#!/usr/bin/env node`

**Imports:**

```javascript
#!/usr/bin/env node

import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { takeScreenshot, captureSelector, setAllowJs } from './capture.js';
```

**CLI arg parsing:**

```javascript
const allowJs = process.argv.includes('--allow-js');
if (allowJs) console.error('[viewcap] JavaScript injection ENABLED');
setAllowJs(allowJs);
```

`setAllowJs` is a module-level setter exported from `capture.js` (see below). This avoids threading `allowJs` through every function call.

**MCP Server Setup:**

```javascript
const server = new McpServer({
  name: 'viewcap',
  version: '0.1.0',
});
```

**Tool Registration — `take_screenshot`:**

```javascript
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
      waitFor: z.number().int().min(0).default(0).describe('Additional delay in ms after page load (max 30000)'),
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
```

**Tool Registration — `capture_selector`:**

```javascript
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
      waitFor: z.number().int().min(0).default(0).describe('Additional delay in ms after page load (max 30000)'),
      selectorTimeout: z.number().int().min(0).default(5000).describe('Max ms to wait for selector to appear (max 15000)'),
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
```

**Connect transport and start:**

```javascript
console.error('[viewcap] Server started — tools: take_screenshot, capture_selector');
const transport = new StdioServerTransport();
await server.connect(transport);
```

**Key points:**
- Zod schemas define all parameter types, defaults, and constraints. The MCP SDK converts these to JSON Schema automatically for the tool manifest.
- `waitUntil` uses `z.enum()` — invalid values are rejected by Zod before reaching the handler. No manual validation needed.
- Defaults are baked into the Zod schema (`z.default()`), so `params` always has all fields populated by the time the handler runs.
- Error handling returns text content blocks — MCP tools never throw to the client.

---

## What NOT To Do

- **No TypeScript.** Plain `.js` with ES modules (`"type": "module"` in package.json).
- **No build step.** The source files are what ships.
- **No extra dependencies** beyond the four in `npm install`. No lodash, no axios, no anything else.
- **No HTTP server.** stdio only. The MCP SDK handles JSON-RPC framing over stdin/stdout.
- **No caching.** Every screenshot navigates fresh.
- **No screencast yet.** That's Phase 2.
- **No restart wrapper yet.** That's Phase 3.
- **No CLI yet.** That's Phase 3.
- **Do not copy code** from `@just-every/mcp-screenshot-website-fast` or any other package. This is a clean-room implementation.

---

## Testing Locally

### There is no build step

ViewCap is plain JavaScript with ES modules. There is nothing to compile, transpile, or bundle. The source files are what runs. `node src/server.js` starts the server directly.

### Local development workflow

```
Edit source files
      │
      ▼
Restart Claude Code (re-spawns the server from source)
      │
      ▼
Test by talking to Claude Code ("screenshot localhost:3000")
      │
      ▼
See a bug? Edit the file, restart Claude Code, repeat.
```

### Step 1: Register viewcap pointing at your local source

After Claude Code creates the files, register the server. Run this once:

```bash
claude mcp add viewcap -s user -- node /absolute/path/to/viewcap/src/server.js
```

Or with JS injection enabled:

```bash
claude mcp add viewcap -s user -- node /absolute/path/to/viewcap/src/server.js --allow-js
```

Replace `/absolute/path/to/viewcap` with the actual path on your machine (e.g. `/Users/chris/projects/viewcap`).

This writes to `~/.claude/settings.json`. You only run this command once — it persists across sessions.

### Step 2: Restart Claude Code

Claude Code reads MCP config on startup and spawns `node src/server.js` as a child process. Every time you edit a source file, restart Claude Code to pick up the changes.

### Step 3: Spin up something to screenshot

In a separate terminal:

```bash
npx serve -l 3000 .
```

This gives you a local HTTP server at `http://localhost:3000` to test against.

### Step 4: Test from Claude Code

Say these things in Claude Code:

1. **"Use viewcap to take a screenshot of http://localhost:3000"**
   - Should return one or more image tiles.

2. **"Use viewcap to capture a screenshot of http://localhost:3000 with fullPage set to false"**
   - Should return a single image (no tiling).

3. **"Use viewcap to screenshot file:///etc/passwd"**
   - Should return an error (generic: "Blocked URL scheme").

4. **"Use viewcap to capture the selector 'body' on http://localhost:3000"**
   - Should return a single image of the body element.

### Security tests

Verify these are **rejected** (all should return generic error messages, not internal details):

```
file:///etc/passwd                           → blocked (scheme)
data:text/html,<h1>hi</h1>                  → blocked (scheme)
http://169.254.169.254/latest/meta-data/     → blocked (metadata endpoint)
javascript:alert(1)                          → blocked (scheme)
http://[::ffff:169.254.169.254]/             → blocked (IP resolution catches IPv6-mapped)
http://0xA9FEA9FE/                           → blocked (IP resolution catches hex IP)
```

Verify these **work**:

```
http://localhost:3000                         → allowed (primary use case)
http://127.0.0.1:3000                        → allowed
https://example.com                           → allowed (logged to stderr)
```

Verify **error messages are generic** — no home directory paths, no internal IPs in the text content returned to Claude.

If `--allow-js` is NOT passed, verify:

```
take_screenshot with javascript param        → error: "JavaScript injection is disabled..."
```

---

## Done Criteria

Phase 1 is complete when:

- [ ] `npm install` succeeds with only four dependencies (`@modelcontextprotocol/server`, `zod`, `puppeteer`, `sharp`)
- [ ] Server starts via `node src/server.js` without errors
- [ ] `take_screenshot` returns base64 PNG image content blocks
- [ ] Full-page screenshots are tiled into 1072×1072 chunks with 50px overlap
- [ ] Max 8 tiles per screenshot
- [ ] `capture_selector` returns a single resized image
- [ ] `file://` and metadata URLs are rejected (pre-navigation check)
- [ ] Post-navigation URL recheck catches redirects to blocked destinations
- [ ] IP resolution blocks alternate encodings of metadata IPs (hex, IPv6-mapped)
- [ ] Directory validation uses `realpathSync` to catch symlink escapes
- [ ] Error messages returned to Claude are generic (no internal paths or IPs)
- [ ] Directory output saves PNGs and returns file paths
- [ ] `--allow-js` gating works (rejected without flag, works with flag)
- [ ] JS execution is logged with SHA-256 hash prefix
- [ ] CSS selector length capped at 1000 characters
- [ ] Pages are closed after every capture (no memory leaks)
- [ ] Browser shuts down after 60s idle
- [ ] Registered and working in Claude Code via `claude mcp add`

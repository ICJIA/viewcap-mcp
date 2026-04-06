# ViewCap — Design Document

> **Project name:** `viewcap`
> **npm package:** `@icjia/viewcap`
> **GitHub repo:** `https://github.com/ICJIA/viewcap`
> **Platforms:** macOS, Linux (Ubuntu)
> **Node:** >= 18

## Purpose

A lightweight local MCP server for Claude Code that does one thing well: takes screenshots of web pages optimized for Claude Vision. Replaces Chrome MCP's unreliable screenshot functionality. Chrome MCP continues to handle all other browser automation.

## Use Case

From Claude Code: *"Take a screenshot of localhost:3000"* — this server captures it, tiles it for Claude Vision, and returns optimized images directly in the conversation.

---

## Reference & Clean-Room Disclaimer

This design is informed by the feature set and API patterns of [`@just-every/mcp-screenshot-website-fast`](https://www.npmjs.com/package/@just-every/mcp-screenshot-website-fast). **This is a clean-room implementation. No code from the reference package is used. API design and feature set are informed by the reference but all implementation is original.**

Patterns retained from the reference (reimplemented from scratch):
- 1072×1072 Vision-optimized max dimensions
- Full-page tiling with automatic splitting
- Screencast → animated WebP export
- JS injection before capture
- `waitUntil` + `waitFor` delay strategies
- Directory save option (file paths instead of base64)
- Auto-restart with exponential backoff

Added beyond reference:
- `capture_selector` tool for element-level screenshots
- CLI for standalone use outside MCP
- npx-first distribution under `@icjia` scope

---

## Architecture

```
Claude Code
    ├── Chrome MCP ──► browser automation, DOM, navigation
    └── @icjia/viewcap ──► screenshots only (this project)
            │
            src/
            ├── server.js ........... MCP server init + tool handlers
            ├── browser.js .......... Singleton Puppeteer lifecycle + idle cleanup
            ├── capture.js .......... Screenshot, resize, tile, selector capture
            ├── screencast.js ....... Multi-frame capture + animated WebP
            ├── config.js ........... Constants
            ├── restart.js .......... Auto-restart wrapper with backoff
            └── cli.js .............. CLI entry point (bin)
```

| File | Lines (est.) | Role |
|------|-------------|------|
| `server.js` | ~140 | MCP init, 3 tool registrations, request routing |
| `browser.js` | ~70 | Singleton browser, 60s idle shutdown, page factory |
| `capture.js` | ~120 | Navigate → wait → screenshot → resize → tile or extract selector |
| `screencast.js` | ~90 | Interval frames, animated WebP via sharp |
| `config.js` | ~25 | `MAX_DIM`, `TILE_OVERLAP`, `IDLE_TIMEOUT`, defaults |
| `restart.js` | ~50 | Process wrapper: crash recovery, exponential backoff (max 10/min) |
| `cli.js` | ~60 | Commander-based CLI for standalone usage |

**Total: ~555 lines.**

---

## MCP Tools

### 1. `take_screenshot`

Full-page or viewport screenshot with automatic tiling.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | *(required)* | HTTP/HTTPS URL (see Security for restrictions) |
| `width` | number | 1072 | Viewport width (max 1072) |
| `height` | number | 1072 | Viewport height (max 1072) |
| `fullPage` | boolean | true | Capture full scrollable page; auto-tiles if tall |
| `waitUntil` | string | `domcontentloaded` | `load` / `domcontentloaded` / `networkidle0` / `networkidle2` |
| `waitFor` | number | 0 | Additional delay in ms after waitUntil |
| `javascript` | string | — | JS to evaluate before capture (requires `--allow-js` flag) |
| `directory` | string | — | If set, saves PNGs to disk and returns file paths instead of base64 |

**Returns:** Array of `image` content blocks (base64 PNG), or array of `text` content blocks with file paths if `directory` is set.

### 2. `capture_selector`

Screenshot a specific DOM element.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | *(required)* | URL to load |
| `selector` | string | *(required)* | CSS selector for target element |
| `width` | number | 1072 | Viewport width |
| `height` | number | 1072 | Viewport height |
| `waitUntil` | string | `domcontentloaded` | Page load wait strategy |
| `waitFor` | number | 0 | Additional delay in ms |
| `selectorTimeout` | number | 5000 | Max ms to wait for selector to appear |
| `directory` | string | — | If set, saves PNG to disk and returns file path instead of base64 |

**Returns:** Single `image` content block (resized to fit 1072×1072), or a `text` content block with the file path if `directory` is set.

> **Note:** `capture_selector` does not support the `javascript` parameter. Element captures target a specific selector on the page as-is. If you need to modify the page before capturing an element, use `take_screenshot` with `javascript` to prepare the page, then use `capture_selector` in a follow-up call.

### 3. `take_screencast`

Capture frames over time. Only captures top 1072×1072 tile of viewport per frame.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | *(required)* | URL to capture |
| `duration` | number | 10 | Total capture time in seconds |
| `interval` | number | 2 | Seconds between frames |
| `waitUntil` | string | `domcontentloaded` | Page load wait strategy |
| `waitFor` | number | 0 | Pre-capture delay in ms |
| `javascript` | string | — | JS to execute before first frame (requires `--allow-js` flag) |
| `directory` | string | — | If set, saves animated WebP + individual PNGs to disk |

**Returns:** Array of `image` content blocks (one per frame), or file paths if `directory` is set. When saving to directory, also generates an animated WebP with 1s intervals.

> **Platform note:** Animated WebP assembly depends on sharp's libvips backend. On some platforms (notably older Linux distros or Alpine musl builds), animated WebP support may be incomplete. If `sharp` fails to produce the animated WebP, the screencast should still return the individual frame PNGs and log a warning to stderr. The animated WebP is a convenience output, not the primary deliverable.

---

## Tiling Logic

```
Input: 1280 × 3500 full-page screenshot

Step 1: Resize width to 1072, height scales proportionally → 1072 × 2930

Step 2: Slice into 1072 × 1072 tiles with 50px overlap:
  Tile 1: y=0    → y=1072
  Tile 2: y=1022 → y=2094
  Tile 3: y=2044 → y=2930 (shorter final tile)

Step 3: Return tiles as ordered image content blocks
```

- **Tile overlap:** 50px (hardcoded)
- **Max tiles:** 8 (pages taller than ~8200px are truncated: 1072 + 7×1022 = 8226px; covers localhost dev servers and most production pages)

---

## Browser Lifecycle

```
take_screenshot request
    │
    ▼
browser instance exists?
    ├── yes → reset idle timer, reuse browser
    └── no  → launch puppeteer.launch({ headless: 'new' })
    │
    ▼
const page = await browser.newPage()
page.setViewport({ width, height })
    │
    ▼
navigate → wait → optional JS eval → screenshot
    │
    ▼
await page.close()     ← always, prevents memory leaks
    │
    ▼
idle timer (60s) ──── timeout ──► await browser.close()
```

No caching. Every request navigates fresh.

### Concurrency & Request Queuing

Puppeteer's singleton browser instance is not designed for concurrent page operations from rapid sequential requests. To prevent race conditions and resource contention:

- **Request queue:** All tool calls are serialized through a simple async queue (one capture at a time). This prevents overlapping `newPage()` / `page.close()` cycles from colliding.
- **Implementation:** A module-level promise chain in `capture.js`. Each incoming request awaits the previous one before starting.

```javascript
let queue = Promise.resolve();

function enqueue(fn) {
  queue = queue.then(() => fn(), () => fn()); // continue chain even on error
  return queue;
}
```

This is intentionally simple. Parallel captures are not a goal — Claude Code sends tool calls sequentially, and the queue is a safety net.

### Error Recovery

Capture operations follow a **fail-clean** strategy:

- **Page cleanup is unconditional.** `page.close()` runs in a `finally` block regardless of navigation or screenshot errors.
- **Partial tile failure:** If tiling fails mid-way (e.g., sharp crashes on tile 3 of 5), the entire request fails and returns an error. No partial results — partial tiles would confuse Claude Vision.
- **Browser crash during capture:** The `browser.on('disconnected')` handler sets the instance to `null`. The next request relaunches cleanly. The failed request returns an error message.
- **Navigation timeout:** Returns an error with the URL and timeout duration. Does not retry — the caller (Claude) can retry if appropriate.

---

## Security

### Threat Model

This server runs locally and communicates via stdio — there is no network listener and no remote attack surface. The primary risks are **prompt injection** (Claude being tricked by malicious page content into misusing the tools) and **local resource access** (the server being asked to reach things it shouldn't).

### Mitigations

#### 1. SSRF Prevention (URL Validation)

The server validates URLs at **two points**: before navigation (pre-check) and after navigation (post-check). Both are required because pre-checks alone can be bypassed by DNS rebinding and HTTP redirects.

**Pre-navigation validation:**

- **Allowed schemes:** `http:` and `https:` only
- **Blocked:** `file://`, `data:`, `javascript:`, `ftp:`, and all other schemes
- **Blocked by default:** Cloud metadata endpoints and the entire link-local IP range
- **Localhost always allowed:** `localhost`, `127.0.0.1`, `::1` — this is the primary use case
- **External URLs allowed:** Production pages are a valid use case, but the URL is logged to stderr for auditability

**Post-navigation validation:**

After `page.goto()` completes, check the final URL via `page.url()` and re-validate it through the same checks. This catches:

- **HTTP redirects:** A valid URL like `http://localhost:3000/redirect` could 302-redirect to `file:///etc/passwd` or a metadata endpoint. Puppeteer follows redirects by default.
- **DNS rebinding:** An attacker-controlled hostname could resolve to `127.0.0.1` at validation time, then re-resolve to `169.254.169.254` when Puppeteer navigates.

```javascript
// After page.goto():
const finalUrl = page.url();
validateUrl(finalUrl); // re-run same checks on the final destination
```

If post-navigation validation fails, close the page immediately and throw before taking any screenshot.

**IP resolution for alternate encodings:**

The hostname blocklist checks exact strings, but cloud metadata endpoints can be reached via alternate IP representations:

- `http://[::ffff:169.254.169.254]/` (IPv6-mapped IPv4)
- `http://0xA9FEA9FE/` (hex IP)
- `http://2852039166/` (decimal IP)
- `http://0251.0376.0251.0376/` (octal IP)
- `http://169.254.169.254.nip.io/` (DNS wildcard services)

To catch these, `validateUrl()` resolves the hostname to an IP address and checks it against blocked IP **ranges**, not just exact strings:

```javascript
import { lookup } from 'dns/promises';
import net from 'net';

// Blocked IP ranges (CIDR-style check)
const BLOCKED_IP_RANGES = [
  { prefix: '169.254.', description: 'link-local' },    // AWS metadata lives here
  { prefix: 'fd00:', description: 'IPv6 unique-local' }, // fc00::/7
];

async function isBlockedIp(hostname) {
  // Skip resolution for known-safe localhost
  if (['localhost', '127.0.0.1', '::1'].includes(hostname)) return false;

  try {
    const { address } = await lookup(hostname);
    return BLOCKED_IP_RANGES.some(range => address.startsWith(range.prefix));
  } catch {
    return false; // DNS failure — let Puppeteer handle it
  }
}
```

This makes `validateUrl()` async. Both pre-navigation and post-navigation checks run this resolution.

Implementation in `capture.js`:

```javascript
async function validateUrl(url) {
  const parsed = new URL(url);

  // Scheme whitelist
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Blocked URL scheme');
  }

  // Hostname blocklist (exact match)
  if (CONFIG.BLOCKED_HOSTNAMES.includes(parsed.hostname)) {
    throw new Error('Blocked URL');
  }

  // IP resolution check (catches hex/octal/IPv6-mapped encodings)
  if (await isBlockedIp(parsed.hostname)) {
    throw new Error('Blocked URL');
  }

  // Log non-localhost external URLs
  if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
    console.error(`[viewcap] Navigating to external URL: ${url}`);
  }

  return parsed.href;
}
```

#### 2. JavaScript Injection (Opt-In)

The `javascript` parameter executes arbitrary code in the page context via `page.evaluate()`. This is powerful but dangerous if Claude is tricked by prompt injection into running attacker-controlled scripts.

- **Disabled by default.** The `javascript` parameter is rejected unless the server is launched with `--allow-js`.
- **When enabled:** JS execution is logged to stderr with a truncated preview (200 chars) and a SHA-256 hash of the full script for audit traceability.
- **Scope:** JS runs in the *page* context (sandboxed by Chromium), not the Node.js server process. It cannot access the filesystem or Node APIs directly.

**Logging format:**

```javascript
import { createHash } from 'crypto';
const hash = createHash('sha256').update(javascript).digest('hex').slice(0, 16);
console.error(`[viewcap] Executing JS (${hash}): ${javascript.substring(0, 200)}`);
```

**Known risk when `--allow-js` is enabled:** Injected JS can make arbitrary network requests from the page context (`fetch`, `XMLHttpRequest`). Chromium does not enforce CORS in `page.evaluate()`. This means injected scripts can exfiltrate page data to external servers. This is an accepted trade-off of enabling `--allow-js`.

> **Future hardening (not in Phase 1):** When `--allow-js` is enabled, consider using `page.setRequestInterception(true)` to restrict outbound requests to the navigation domain only. This would prevent exfiltration while still allowing page-modification scripts. Not implemented now because it adds complexity and may break legitimate JS that loads cross-origin resources.

Claude Code config with JS enabled:

```json
{
  "mcpServers": {
    "viewcap": {
      "command": "npx",
      "args": ["-y", "@icjia/viewcap", "--allow-js"]
    }
  }
}
```

#### 3. Directory Traversal Prevention

The `directory` parameter writes screenshot files to disk. All output paths are validated:

- Path is resolved to absolute via `path.resolve()`
- Directory is created with `{ recursive: true }` only after logical path validation
- After creation, the **real path** is resolved via `fs.realpathSync()` to follow symlinks
- The real path must be within the user's home directory or `/tmp`

The symlink resolution step is critical: on macOS `/tmp` is a symlink to `/private/tmp`, and an attacker could create `/tmp/evil` → `/etc` to escape the allowed directory. Checking the real path after `mkdirSync` catches this.

```javascript
function validateOutputDir(dir) {
  const resolved = path.resolve(dir);
  const home = os.homedir();

  // Logical path check (fast reject for obvious violations)
  if (!resolved.startsWith(home) && !resolved.startsWith('/tmp') && !resolved.startsWith('/private/tmp')) {
    throw new Error('Output directory is outside allowed paths');
  }

  // Create directory, then resolve symlinks
  fs.mkdirSync(resolved, { recursive: true });
  const real = fs.realpathSync(resolved);

  // Real path check (catches symlink escapes)
  const realHome = fs.realpathSync(home);
  const realTmp = fs.realpathSync('/tmp');
  if (!real.startsWith(realHome) && !real.startsWith(realTmp)) {
    throw new Error('Output directory is outside allowed paths');
  }

  return real;
}
```

#### 4. Error Message Sanitization

Error messages returned to Claude (as text content blocks) must not leak sensitive system information. Two categories:

- **User-facing errors** (returned in content blocks): Generic messages only. Examples: `"Blocked URL scheme"`, `"Blocked URL"`, `"Output directory is outside allowed paths"`, `"Element not found for selector"`.
- **Debug errors** (logged to stderr): May include full paths, URLs, and stack traces for debugging.

Never include the user's home directory path, internal IP addresses, or filesystem paths in content blocks returned to Claude. These details go to stderr only.

#### 4. Resource Exhaustion Limits

| Resource | Limit | Enforced In |
|----------|-------|-------------|
| Screenshot tiles | 8 max | `capture.js` |
| Screencast frames | 20 max | `screencast.js` |
| Screencast duration | 60s max | `screencast.js` |
| Page navigation timeout | 30s | `browser.js` |
| `waitFor` delay | 30s max | `capture.js` |
| Selector wait timeout | 5s default, 15s max | `capture.js` |
| Selector string length | 1000 chars max | `capture.js` |
| Browser idle shutdown | 60s | `browser.js` |

#### 5. Puppeteer Hardening

```javascript
const COMMON_ARGS = [
  '--disable-dev-shm-usage',   // Prevents /dev/shm exhaustion in containers
  '--disable-gpu',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-sync',
  '--no-first-run',
];

// Only disable sandbox on Linux where user namespaces may not be available.
// On macOS, Chromium's sandbox provides meaningful isolation — keep it.
const LINUX_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
];

const args = process.platform === 'linux'
  ? [...COMMON_ARGS, ...LINUX_ARGS]
  : COMMON_ARGS;

const browser = await puppeteer.launch({ headless: true, args });
```

Note: `--no-sandbox` is applied only on Linux, where it is commonly required due to missing user namespace support. On macOS, the Chromium sandbox remains active for stronger process isolation.

### Security Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| SSRF via URL parameter | **High** | Scheme whitelist, metadata endpoint blocklist, IP resolution against blocked ranges, post-navigation URL recheck |
| SSRF via HTTP redirect | **High** | Post-navigation URL recheck catches redirects to blocked destinations |
| SSRF via DNS rebinding | **Medium** | Post-navigation URL recheck + IP resolution |
| JS injection via prompt injection | **Medium** | Disabled by default; `--allow-js` opt-in flag; script hash logging |
| Directory traversal via output path | **Medium** | Path resolution + symlink resolution via `realpathSync` + home / `/tmp` restriction |
| Information leakage via errors | **Low** | Generic user-facing errors; detailed info to stderr only |
| Resource exhaustion | **Low** | Hard caps on tiles, frames, duration, timeouts, selector length |
| Remote network access | **None** | stdio transport — no listener, no ports |

---

## Auto-Restart

`restart.js` wraps the server process:

- Catches unhandled exceptions and promise rejections
- Restarts with exponential backoff: 1s, 2s, 4s, 8s...
- Max 10 restart attempts within 1 minute window
- Graceful shutdown on SIGINT/SIGTERM
- All restarts logged to stderr
- **`--no-restart` flag:** Bypasses the restart wrapper and runs `server.js` directly. Useful for debugging crashes that the wrapper would mask.

Entry point in `package.json`:

```json
{
  "bin": {
    "viewcap": "./src/restart.js"
  }
}
```

The `restart.js` spawns `server.js` as a child process. When `--no-restart` is passed, `restart.js` execs `server.js` directly (no child process, no restart loop).

---

## Distribution & Configuration

### npm / npx

> **Version note:** Phase 1 starts at `0.1.0`. The version below reflects the final published state after all phases are complete.

```json
{
  "name": "@icjia/viewcap",
  "version": "1.0.0",
  "bin": {
    "viewcap": "./src/restart.js"
  },
  "files": ["src/", "README.md"],
  "engines": { "node": ">=18" }
}
```

### Claude Code Registration

There are two equivalent ways to register viewcap with Claude Code. Both produce the same result.

**Option A — CLI command (recommended):**

```bash
# User-level (all projects)
claude mcp add viewcap -s user -- npx -y @icjia/viewcap

# User-level with JS injection enabled
claude mcp add viewcap -s user -- npx -y @icjia/viewcap --allow-js

# Project-level (current repo only)
claude mcp add viewcap -s project -- npx -y @icjia/viewcap
```

**Option B — Edit `~/.claude/settings.json` directly:**

```json
{
  "mcpServers": {
    "viewcap": {
      "command": "npx",
      "args": ["-y", "@icjia/viewcap"]
    }
  }
}
```

With JS injection enabled:

```json
{
  "mcpServers": {
    "viewcap": {
      "command": "npx",
      "args": ["-y", "@icjia/viewcap", "--allow-js"]
    }
  }
}
```

**During development (local clone, no npm):**

Point at `server.js` directly during Phase 1–2 development (before `restart.js` exists). Switch to `restart.js` once Phase 3 is complete.

```bash
# Phase 1–2: run server directly
claude mcp add viewcap -s user -- node /absolute/path/to/viewcap/src/server.js

# Phase 3+: run through restart wrapper
claude mcp add viewcap -s user -- node /absolute/path/to/viewcap/src/restart.js
```

Or in JSON (Phase 1–2):

```json
{
  "mcpServers": {
    "viewcap": {
      "command": "node",
      "args": ["/absolute/path/to/viewcap/src/server.js"]
    }
  }
}
```

---

## Context Weight & Tool Routing

### How much context does viewcap consume?

**At rest (server registered but not used):** ~50-60 lines of JSON tool manifest — the tool names, descriptions, and parameter schemas. Negligible. Comparable to a single built-in tool.

**Per screenshot returned:** Each 1072×1072 base64 PNG tile consumes context. This is why the 8-tile max exists. A typical localhost page produces 2-4 tiles. The context cost only occurs when you actually call a tool, not from having the server registered.

### Using viewcap alongside Chrome MCP

When both Chrome MCP and viewcap are registered, Claude Code sees tools from both servers. To ensure Claude uses viewcap for screenshots (and Chrome MCP for everything else), add a `CLAUDE.md` file to your project root:

```markdown
# Tool preferences
- For all screenshots, use the `viewcap` MCP server (take_screenshot, capture_selector, take_screencast).
- Use Chrome MCP for browser automation, DOM interaction, and navigation only.
```

Claude Code reads `CLAUDE.md` at session start and follows these preferences. This is the most reliable routing method.

Alternatively, you can specify inline: *"Use viewcap to screenshot localhost:3000"* — Claude Code understands tool routing by server name.

### Server lifecycle

You don't start viewcap manually. Claude Code manages it:

1. **On Claude Code startup:** reads config, runs `npx -y @icjia/viewcap`, server starts as a child process over stdio
2. **First launch:** npx downloads the package + Chromium (~170MB one-time)
3. **Subsequent launches:** uses cached npx version, starts in ~1s
4. **Server stays running** for the duration of the Claude Code session
5. **On Claude Code exit:** server process is killed automatically

### CLI (standalone)

```bash
# Install globally
npm install -g @icjia/viewcap

# Full page screenshot
viewcap capture https://example.com -o screenshot.png

# Viewport only
viewcap capture https://example.com --no-full-page -o shot.png

# Selector capture
viewcap selector https://example.com "#main-content" -o element.png

# Wait for SPA to render
viewcap capture https://localhost:3000 --wait-until networkidle0 --wait-for 2000 -o app.png

# With JS injection (must explicitly opt in)
viewcap capture https://localhost:3000 --allow-js --js "document.querySelector('.modal').remove()" -o clean.png
```

---

## Logging

All log output goes to stderr (stdout is reserved for MCP JSON-RPC). Logging verbosity is controlled by the `--verbose` and `--quiet` flags:

| Flag | Behavior |
|------|----------|
| *(default)* | Startup banner, errors, external URL warnings, JS execution notices |
| `--verbose` | All of the above + navigation events, tile counts, timing, browser lifecycle |
| `--quiet` | Errors only |

Implementation: a `log(level, msg)` helper in `config.js` that checks the current verbosity level before writing to stderr. Levels: `error`, `info`, `debug`.

```bash
# Debug a misbehaving capture
npx -y @icjia/viewcap --verbose

# Silence non-error output
npx -y @icjia/viewcap --quiet
```

---

## Publishing to npm

### `publish.sh`

A bash script in the project root handles all publishing. It works for both first-time and subsequent publishes.

```bash
./publish.sh              # bump patch version + publish (default)
./publish.sh minor        # bump minor version + publish
./publish.sh major        # bump major version + publish
./publish.sh --dry-run    # dry run only, no changes made
```

The script automatically:

1. **Preflight checks** — verifies `package.json` name, npm login, no uncommitted git changes
2. **Detects first-time publish** — uses `--access public` if the package doesn't exist on npm yet
3. **Bumps the version** — patch/minor/major (skipped on first publish, uses current version)
4. **Runs a dry run** — shows exactly what would be published
5. **Asks for confirmation** — y/N prompt before publishing
6. **Publishes** — `npm publish`
7. **Git commit + tag + push** — commits the version bump, tags `v1.0.1`, pushes both

If you abort at the confirmation prompt, all changes (including version bump) are reverted.

### What happens on the consumer side

After you publish a new version:

- **`npx -y @icjia/viewcap`** automatically picks up the latest version next time Claude Code starts (npx checks the registry each run)
- **No action needed** by anyone using the npx config — they get the update on next session
- **Global installs** (`npm install -g`) need to run `npm update -g @icjia/viewcap` manually

### Version strategy

For a tool this small, keep it simple:

- `patch` for bug fixes and tweaks (most changes)
- `minor` for new tools or parameters
- `major` only if you change existing tool names or parameter schemas (would break CLAUDE.md references)

---

## Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/server": "^1.12.0",
    "zod": "^3.25.0",
    "puppeteer": "^24.0.0",
    "sharp": "^0.33.0",
    "commander": "^13.0.0"
  }
}
```

Five dependencies. `@modelcontextprotocol/server` requires `zod` as a peer dependency for tool input schema validation. `commander` adds ~30KB for CLI support. Puppeteer pulls Chromium on first install (~170MB one-time).

---

## Build Phases

### Phase 1 — Core screenshot + security (~2.5 hours)

- `config.js` + `browser.js` + `capture.js` + `server.js`
- `take_screenshot` tool working end-to-end
- URL validation (SSRF prevention) baked in from the start
- Directory traversal prevention baked in from the start
- Tiling logic with 50px overlap, 8-tile max
- Test from Claude Code against localhost

**Testable deliverable:** "Screenshot localhost:3000" works from Claude Code and returns tiled images. `file://` URLs are rejected. Output to `../../etc` is rejected.

### Phase 2 — Selector + screencast (~1.5 hours)

- `capture_selector` in `capture.js`
- `screencast.js` with frame capture + animated WebP assembly
- `take_screencast` tool registered
- Directory save mode for all three tools
- Resource exhaustion limits enforced (20-frame cap, 60s max duration)

**Testable deliverable:** "Capture the #header element" and "Record 5 frames of localhost:3000" both work.

### Phase 3 — Distribution (~1 hour)

- `restart.js` auto-restart wrapper (with `--no-restart` flag)
- `cli.js` with commander (includes `--allow-js`, `--verbose`, `--quiet` flags)
- `log(level, msg)` helper in `config.js` for verbosity control
- `package.json` bin field updated from `server.js` → `restart.js`
- README with install/config/usage and security notes
- npm publish as `@icjia/viewcap`

**Testable deliverable:** `npx -y @icjia/viewcap` works in Claude Code config.

---

## Testing Locally

### There is no build step

ViewCap is plain JavaScript with ES modules. There is nothing to compile, transpile, or bundle. `node src/server.js` starts the server directly. The source files are what ships to npm.

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

### Step-by-step

**1. Register viewcap pointing at local source (run once):**

```bash
claude mcp add viewcap -s user -- node /absolute/path/to/viewcap/src/server.js
```

This writes to `~/.claude/settings.json` and persists across sessions.

**2. Restart Claude Code** — it reads MCP config on startup and spawns the server as a child process.

**3. Spin up a test target** in a separate terminal:

```bash
npx serve -l 3000 .
```

**4. Test from Claude Code:**

- "Use viewcap to screenshot http://localhost:3000" — should return tiled images
- "Use viewcap to screenshot file:///etc/passwd" — should return a blocked error
- "Use viewcap to capture the selector 'body' on http://localhost:3000" — should return single image

**5. After editing source files**, restart Claude Code to pick up changes. The server is re-spawned fresh each startup.

### When to switch to npx

Once all phases are complete, tested locally, and published to npm:

```bash
# Remove the local registration
claude mcp remove viewcap -s user

# Register the npm version
claude mcp add viewcap -s user -- npx -y @icjia/viewcap
```

From this point forward, Claude Code pulls from npm on startup. You edit → `npm version patch` → `npm publish` → restart Claude Code to pick up the new version.

---

## Automated Tests

While manual testing via Claude Code is the primary validation method during development, a minimal automated test suite should be added before the first npm publish. Tests run via `node --test` (built-in Node 18+ test runner) — no test framework dependency needed.

### Test scope (add to `test/` directory):

| Test file | What it covers |
|-----------|---------------|
| `test/url-validation.test.js` | `validateUrl()` — accepts `http:`, `https:`, localhost; rejects `file:`, `data:`, `javascript:`, metadata endpoints |
| `test/dir-validation.test.js` | `validateOutputDir()` — accepts paths under `$HOME` and `/tmp`; rejects traversal attempts like `../../etc` |
| `test/tiling.test.js` | Tiling math — correct tile count, overlap positions, max-tile cap for various image heights |
| `test/config.test.js` | Constants are sane (MAX_DIMENSION > 0, TILE_OVERLAP < MAX_DIMENSION, etc.) |

### What NOT to test automatically:

- Puppeteer launch / navigation (requires Chromium — integration test territory)
- MCP server protocol (tested via Claude Code in manual testing)
- sharp image processing (tested indirectly via tiling math + manual screenshots)

### `package.json` script:

```json
{
  "scripts": {
    "test": "node --test test/"
  }
}
```

This keeps the test footprint minimal — no dev dependencies, no test framework, no CI pipeline (yet). The goal is to catch regressions in pure-logic functions before publishing.

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Clean-room implementation | State agency repo — no third-party code reuse, only pattern inspiration |
| Security from Phase 1 | URL validation and path checks are not afterthoughts; they ship with the first working build |
| stdio transport, not HTTP | Claude Code MCP uses stdio. No ports, no auth. |
| 1072×1072 max dimension | Claude Vision sweet spot (~1.15 megapixels) |
| 50px tile overlap (hardcoded) | Context continuity between tiles; not worth exposing as a parameter |
| 8-tile max | Sufficient for localhost dev servers and most production pages |
| JS injection disabled by default | Prompt injection is a real risk; opt-in via `--allow-js` flag |
| `domcontentloaded` default | Faster than `networkidle`; works for most pages. User can override. |
| No caching | Always-fresh screenshots; that's the entire point |
| Page-per-request, closed after | Prevents memory leaks from accumulated pages |
| 60s idle browser shutdown | Balances resource use vs. cold-start latency |
| Auto-restart by default | MCP servers in Claude Code should be resilient |
| Separate from Chrome MCP | Single responsibility; Chrome MCP for automation, this for screenshots |
| Plain JS, no TypeScript | Keeps it simple; no build step. Add types later if wanted. |
| `commander` for CLI | Lightweight, familiar, one extra dep for standalone usability |
| macOS + Linux only | ICJIA dev environment; no Windows `.cmd` shim needed |

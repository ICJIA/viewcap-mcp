# Changelog

## 0.1.4 — 2026-07-17

### Fixed

- **Idle timer killed the browser mid-capture.** The 60s idle shutdown timer was armed when an operation *started* (`getPage`), so any single capture running longer than 60s — e.g. a screencast near the documented 60s max, or a slow page plus a long `waitFor` — had Chromium closed underneath it and failed with `Protocol error: Session closed`. The timer is now disarmed while a page is in use and re-armed when the operation finishes, so the idle countdown only runs between operations.
- **`--help`, `--version`, and global flags before a subcommand silently started the MCP server.** Routing only looked at the first argument, so `viewcap --help` (the README's own smoke test) and `viewcap --allow-js capture <url>` (a documented CLI example) hung as a stdio server instead of running the CLI. Routing now detects a subcommand anywhere in the args and sends `--help`/`--version` to the CLI (new `src/routing.js`, shared by `restart.js` and `cli.js`).
- **"Animated" WebP output was a static image.** Screencast WebP generation passed a `pageHeight` option that sharp does not support, silently producing a static vertically-stacked strip instead of an animation. Now built with sharp's `join: { animated: true }` API, and the frame delay matches the capture `interval` (was hardcoded 1000ms). Note: consecutive identical frames are deduplicated by libvips with their delays accumulated, so the animation timeline is preserved for partially-static pages.
- **Version drift (again).** `server.js` and `cli.js` hardcoded `0.1.1` while package.json said `0.1.3` — the same class of bug hand-fixed in 0.1.1, regressed by the next release bump. The version is now read from package.json at startup (`VERSION` in `config.js`), so MCP `serverInfo` and `viewcap --version` can no longer drift.
- Tiles of one capture now share a single timestamp prefix — `Date.now()` was called per tile, so tiles of the same screenshot got different, ungroupable filenames.
- After an idle shutdown, an unexpected crash of the *next* browser instance was silently treated as intentional (`intentionalClose` was never reset on relaunch).

### Testing

- Unit suite: 97 → 106 tests (CLI/server routing detection, version single-source).
- New integration suite (`npm run test:integration`, 7 tests) driving real Chromium against a local HTTP server: operations longer than the idle timeout, idle re-arm, animated WebP page count and frame delay, tile filename grouping, and `restart.js` bin routing end-to-end.

## 0.1.3 — 2026-07-01

### Fixed

- **Server failed to start under `npx` (MCP SDK prerelease drift).** `npx -y @icjia/viewcap` crashed on startup with `SyntaxError: The requested module '@modelcontextprotocol/server' does not provide an export named 'StdioServerTransport'`, surfacing in Claude Code as `Failed to reconnect to viewcap: -32000`. The dependency was pinned with a caret on a **prerelease** (`"@modelcontextprotocol/server": "^2.0.0-alpha.2"`) and the published tarball ships no lockfile, so every fresh `npx` install re-resolved that range to the newest matching prerelease. `2.0.0-alpha.3` moved `StdioServerTransport` from the package root to the `@modelcontextprotocol/server/stdio` subpath, so `src/server.js`'s root import stopped resolving. **Fix:** pin the SDK to exactly `2.0.0-alpha.2` (never range a prerelease). Existing npx installs must clear the cache to pick this up: `rm -rf ~/.npm/_npx`.

## 0.1.1 — 2026-04-06

### Security audit fixes

Red/blue team adversarial audit identified and resolved the following:

**Critical**
- Zod schemas for `waitFor` and `selectorTimeout` described a max value but didn't enforce it — a caller could hang the browser indefinitely. Added `.max(30000)` and `.max(15000)` respectively.
- CLI accepted arbitrary numeric inputs (width, height, duration, interval) with no bounds checking, allowing OOM via huge viewport dimensions. Added `clampInt`/`clampFloat` validation with CONFIG-based limits.

**High**
- SSRF: Only `169.254.x.x` was blocked. Added full RFC1918 private ranges (`10.x`, `172.16-31.x`, `192.168.x`) and IPv6 link-local (`fe80:`) to BLOCKED_IP_PREFIXES — prevents reaching internal network services.
- DNS resolution failure in `isBlockedIp` returned `false` (allow). Changed to fail closed — unresolvable hostnames are now blocked by default.
- `validateOutputDir` had a TOCTOU symlink race: mkdir ran before realpath. Now resolves the deepest existing ancestor's real path before creating any directories.
- Screencast module had its own request queue separate from capture.js — concurrent screenshot + screencast calls could collide on the browser. Unified to a single shared queue.

**Medium**
- External URL logging included full URL with query parameters, risking token leakage. Now logs hostname only.

### Test coverage (97 tests)
- Added RFC1918 private IP prefix verification (all 172.16-31.x ranges, 10.x, 192.168.x, fe80:, fd00:) with boundary checks for public IPs
- Added CLI clampInt/clampFloat tests: NaN, Infinity, out-of-range, empty strings, OOM-level dimensions
- Added directory validation: symlink escape from /tmp to /etc, realpath verification on macOS, additional reject paths

### What passed audit (no changes needed)
- JavaScript injection gate: properly isolated, no bypass vectors
- Error message sanitization: generic messages to Claude, details to stderr only
- Post-navigation URL recheck: catches redirects to blocked schemes
- Tile/frame caps: hard limits enforced
- Page cleanup: try/finally ensures pages close on errors

---

## 0.1.0 — 2026-04-06

### Phase 1: Core screenshot + security

- `take_screenshot` tool: full-page and viewport screenshots with automatic 1072x1072 tiling
- `capture_selector` tool: element-level screenshots by CSS selector
- SSRF prevention: scheme whitelist, metadata endpoint blocklist, IP resolution checks, post-navigation URL revalidation
- Directory traversal prevention with symlink-aware path validation
- JavaScript injection gated behind `--allow-js` flag with SHA-256 audit logging
- Singleton Puppeteer browser with 60s idle shutdown
- Request serialization queue (one capture at a time)
- Resource limits: 8-tile max, 30s navigation timeout, 30s waitFor cap, 15s selector timeout cap, 1000-char selector limit
- Generic error messages returned to Claude (no internal path/IP leakage)
- Directory output mode: save PNGs to disk, return file paths

### Phase 2: Screencast

- `take_screencast` tool: multi-frame capture over time with configurable duration and interval
- Animated WebP generation when saving to directory
- 20-frame cap and 60-second duration limit
- JavaScript injection support for screencasts (requires `--allow-js`)

### Phase 3: Distribution

- Auto-restart wrapper (`restart.js`) with exponential backoff and crash recovery
- `--no-restart` flag to bypass the wrapper for debugging
- Standalone CLI via `commander` with `capture`, `selector`, and `screencast` subcommands
- `--verbose` and `--quiet` flags for logging verbosity control
- `log(level, msg)` helper in config.js for structured logging
- Updated `bin` entry point from `server.js` to `restart.js`

### Infrastructure

- 66 automated tests covering URL validation, directory validation, tiling, config, JS injection, IP blocking, screencast limits, and logging
- MIT license
- ESM-safe `publish.sh` script for npm publishing
- Detailed README with setup instructions for Claude Code, Cursor, and other MCP clients

# Changelog

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

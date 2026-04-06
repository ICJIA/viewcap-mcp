# Changelog

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

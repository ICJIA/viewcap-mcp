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

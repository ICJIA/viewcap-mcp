import { readFileSync } from 'fs';

// Single source of truth for the version — package.json.
export const VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
).version;

// ─── Vision tiers ──────────────────────────────────────────────────
// Claude reads an image at up to a maximum long edge AND a maximum number of
// visual tokens (one token per 28×28-px patch: ceil(w/28) × ceil(h/28)).
// Anything larger is downscaled by the API before the model sees it, so
// viewcap sizes every image it returns to fit the tier — no silent
// server-side shrinking, no wasted pixels.
//   high     — Claude 4.7 and later (Opus 4.7/4.8/5/5.5, Sonnet 5/5.5,
//              Haiku 5.5, Fable / Mythos 5.x): 2576 px, 4784 tokens
//   standard — older models (Opus 4.6 / Sonnet 4.6 / Haiku 4.5 and before):
//              1568 px, 1568 tokens
// Source: https://platform.claude.com/docs/en/build-with-claude/vision
export const VISION_TIERS = {
  high:     { maxEdge: 2576, maxTokens: 4784 },
  standard: { maxEdge: 1568, maxTokens: 1568 },
};

export const DEFAULT_VISION_TIER = 'high';

// Tier from `--vision-tier <tier>` / `--vision-tier=<tier>` in argv, else the
// VIEWCAP_VISION_TIER env var, else 'high'. Unknown values fall back to the
// default with a warning rather than failing the server start.
export function resolveVisionTier(argv = process.argv, env = process.env) {
  let raw;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--vision-tier') raw = argv[i + 1];
    else if (a.startsWith('--vision-tier=')) raw = a.slice('--vision-tier='.length);
  }
  raw = (raw ?? env.VIEWCAP_VISION_TIER ?? DEFAULT_VISION_TIER).toLowerCase();
  if (!VISION_TIERS[raw]) {
    console.error(`[viewcap] Unknown vision tier '${raw}' — using '${DEFAULT_VISION_TIER}' (valid: ${Object.keys(VISION_TIERS).join(', ')})`);
    raw = DEFAULT_VISION_TIER;
  }
  return raw;
}

let visionTier = resolveVisionTier();
export function setVisionTier(tier) { if (VISION_TIERS[tier]) visionTier = tier; }
export function getVisionTier() { return visionTier; }
export function getVisionLimits() { return VISION_TIERS[visionTier]; }

export const CONFIG = {
  // Largest browser viewport viewcap will open (either dimension). Separate
  // from the image limits above: a wider viewport is still captured, then
  // scaled to fit the active vision tier.
  MAX_VIEWPORT: 2576,
  TILE_OVERLAP: 50,
  MAX_TILES: 8,
  IDLE_TIMEOUT: 60_000,
  NAV_TIMEOUT: 30_000,
  WAIT_FOR_MAX: 30_000,
  SELECTOR_TIMEOUT_DEFAULT: 5_000,
  SELECTOR_TIMEOUT_MAX: 15_000,
  SELECTOR_MAX_LENGTH: 1000,
  MAX_SCREENCAST_FRAMES: 20,
  MAX_SCREENCAST_DURATION: 60,
  // A common desktop size (and cheaper per viewport than the old 1072×1072).
  DEFAULT_VIEWPORT: { width: 1280, height: 800 },
  DEFAULT_WAIT_UNTIL: 'domcontentloaded',
  BLOCKED_HOSTNAMES: [
    '169.254.169.254',
    'metadata.google.internal',
    'metadata.azure.com',
  ],
  BLOCKED_IP_PREFIXES: [
    '169.254.',                // IPv4 link-local (AWS metadata)
    '10.',                     // RFC1918 Class A private
    '172.16.', '172.17.', '172.18.', '172.19.',  // RFC1918 Class B private
    '172.20.', '172.21.', '172.22.', '172.23.',
    '172.24.', '172.25.', '172.26.', '172.27.',
    '172.28.', '172.29.', '172.30.', '172.31.',
    '192.168.',                // RFC1918 Class C private
    'fd00:',                   // IPv6 unique-local
    'fe80:',                   // IPv6 link-local
  ],
  LOCALHOST_HOSTS: ['localhost', '127.0.0.1', '::1', '[::1]'],
};

// Logging — levels: error, info, debug
// Verbosity: 'quiet' = error only, 'normal' = error+info, 'verbose' = all
let verbosity = 'normal';

export function setVerbosity(level) { verbosity = level; }

export function log(level, msg) {
  if (verbosity === 'quiet' && level !== 'error') return;
  if (verbosity === 'normal' && level === 'debug') return;
  console.error(`[viewcap] ${msg}`);
}

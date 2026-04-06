export const CONFIG = {
  MAX_DIMENSION: 1072,
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
  DEFAULT_VIEWPORT: { width: 1072, height: 1072 },
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

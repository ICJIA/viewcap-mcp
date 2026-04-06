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
  DEFAULT_VIEWPORT: { width: 1072, height: 1072 },
  DEFAULT_WAIT_UNTIL: 'domcontentloaded',
  BLOCKED_HOSTNAMES: [
    '169.254.169.254',
    'metadata.google.internal',
    'metadata.azure.com',
  ],
  BLOCKED_IP_PREFIXES: [
    '169.254.',
    'fd00:',
  ],
  LOCALHOST_HOSTS: ['localhost', '127.0.0.1', '::1', '[::1]'],
};

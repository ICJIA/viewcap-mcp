import puppeteer from 'puppeteer';
import { CONFIG } from './config.js';

const COMMON_ARGS = [
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-sync',
  '--no-first-run',
];

const LINUX_ARGS = ['--no-sandbox', '--disable-setuid-sandbox'];

let browser = null;
let idleTimer = null;

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    if (browser) {
      console.error('[viewcap] Idle timeout — closing browser');
      try { await browser.close(); } catch {}
      browser = null;
    }
  }, CONFIG.IDLE_TIMEOUT);
}

async function launchBrowser() {
  const args = process.platform === 'linux'
    ? [...COMMON_ARGS, ...LINUX_ARGS]
    : COMMON_ARGS;

  try {
    browser = await puppeteer.launch({ headless: true, args });
  } catch (err) {
    throw new Error('Failed to launch Chromium — is puppeteer installed?');
  }

  browser.on('disconnected', () => {
    console.error('[viewcap] Browser disconnected unexpectedly');
    browser = null;
    if (idleTimer) clearTimeout(idleTimer);
  });
}

export async function getPage(width, height) {
  if (!browser) {
    await launchBrowser();
  }
  resetIdleTimer();

  const page = await browser.newPage();
  await page.setViewport({ width, height });
  return page;
}

export async function closePage(page) {
  try {
    await page.close();
  } catch {
    // Page may already be closed if browser crashed
  }
}

export async function shutdown() {
  if (idleTimer) clearTimeout(idleTimer);
  if (browser) {
    try { await browser.close(); } catch {}
    browser = null;
  }
}

process.on('exit', () => { shutdown(); });
process.on('SIGINT', async () => { await shutdown(); process.exit(0); });
process.on('SIGTERM', async () => { await shutdown(); process.exit(0); });

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
let intentionalClose = false;

function disarmIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function armIdleTimer() {
  disarmIdleTimer();
  idleTimer = setTimeout(async () => {
    if (browser) {
      console.error('[viewcap] Idle timeout — closing browser');
      intentionalClose = true;
      try { await browser.close(); } catch {}
      browser = null;
    }
  }, CONFIG.IDLE_TIMEOUT);
}

async function launchBrowser() {
  const args = process.platform === 'linux'
    ? [...COMMON_ARGS, ...LINUX_ARGS]
    : COMMON_ARGS;

  intentionalClose = false;

  try {
    browser = await puppeteer.launch({ headless: true, args });
  } catch (err) {
    throw new Error('Failed to launch Chromium — is puppeteer installed?');
  }

  browser.on('disconnected', () => {
    if (!intentionalClose) {
      console.error('[viewcap] Browser disconnected unexpectedly');
    }
    browser = null;
    disarmIdleTimer();
  });
}

export async function getPage(width, height) {
  if (!browser) {
    await launchBrowser();
  }
  // The browser must stay alive for the whole operation, however long it runs —
  // the idle countdown starts when the page is closed, not when it opens.
  disarmIdleTimer();

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    return page;
  } catch (err) {
    if (browser) armIdleTimer();
    throw err;
  }
}

export async function closePage(page) {
  try {
    await page.close();
  } catch {
    // Page may already be closed if browser crashed
  }
  if (browser) armIdleTimer();
}

export async function shutdown() {
  disarmIdleTimer();
  if (browser) {
    intentionalClose = true;
    try { await browser.close(); } catch {}
    browser = null;
  }
}

export const _test = {
  isBrowserRunning: () => browser !== null,
};

process.on('exit', () => { shutdown(); });
process.on('SIGINT', async () => { await shutdown(); process.exit(0); });
process.on('SIGTERM', async () => { await shutdown(); process.exit(0); });

#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.join(__dirname, 'server.js');

// Pass through all args except --no-restart
const args = process.argv.slice(2);

if (args.includes('--no-restart')) {
  // Run server directly — no wrapper, no restart loop
  const filteredArgs = args.filter(a => a !== '--no-restart');
  const { default: child_process } = await import('child_process');
  // execv-style: replace this process with server.js
  const proc = spawn('node', [serverPath, ...filteredArgs], {
    stdio: 'inherit',
  });
  proc.on('exit', (code) => process.exit(code ?? 1));
  proc.on('error', (err) => {
    console.error(`[viewcap] Failed to start server: ${err.message}`);
    process.exit(1);
  });
} else {
  // Restart wrapper with exponential backoff
  const MAX_RESTARTS = 10;
  const WINDOW_MS = 60_000;
  let restartTimes = [];
  let backoff = 1000;
  let child = null;
  let shuttingDown = false;

  function startServer() {
    if (shuttingDown) return;

    // Prune restart timestamps outside the window
    const now = Date.now();
    restartTimes = restartTimes.filter(t => now - t < WINDOW_MS);

    if (restartTimes.length >= MAX_RESTARTS) {
      console.error(`[viewcap] Max restarts (${MAX_RESTARTS}) exceeded in ${WINDOW_MS / 1000}s window. Giving up.`);
      process.exit(1);
    }

    console.error(`[viewcap] Starting server${restartTimes.length > 0 ? ` (restart #${restartTimes.length}, backoff ${backoff}ms)` : ''}...`);

    child = spawn('node', [serverPath, ...args], {
      stdio: 'inherit',
    });

    child.on('exit', (code, signal) => {
      if (shuttingDown) return;

      if (code === 0) {
        console.error('[viewcap] Server exited cleanly.');
        process.exit(0);
      }

      console.error(`[viewcap] Server crashed (code=${code}, signal=${signal}). Restarting in ${backoff}ms...`);
      restartTimes.push(Date.now());

      setTimeout(() => {
        backoff = Math.min(backoff * 2, 30_000); // cap at 30s
        startServer();
      }, backoff);
    });

    child.on('error', (err) => {
      console.error(`[viewcap] Failed to spawn server: ${err.message}`);
    });
  }

  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error('[viewcap] Shutting down...');
    if (child) {
      child.kill('SIGTERM');
      // Force kill after 5s
      setTimeout(() => {
        if (child) child.kill('SIGKILL');
        process.exit(0);
      }, 5000);
    } else {
      process.exit(0);
    }
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  startServer();
}

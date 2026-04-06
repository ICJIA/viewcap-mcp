#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.join(__dirname, 'server.js');
const cliPath = path.join(__dirname, 'cli.js');

const args = process.argv.slice(2);

// Detect CLI subcommands — these run cli.js directly (no restart wrapper)
const CLI_COMMANDS = ['capture', 'selector', 'screencast'];
const firstArg = args[0];
const isCliMode = firstArg && CLI_COMMANDS.includes(firstArg);

if (isCliMode) {
  // CLI mode — run cli.js directly, no restart wrapper
  const proc = spawn('node', [cliPath, ...args], { stdio: 'inherit' });
  proc.on('exit', (code) => process.exit(code ?? 1));
  proc.on('error', (err) => {
    console.error(`[viewcap] Failed to start CLI: ${err.message}`);
    process.exit(1);
  });
} else if (args.includes('--no-restart')) {
  // MCP server without restart wrapper (for debugging)
  const filteredArgs = args.filter(a => a !== '--no-restart');
  const proc = spawn('node', [serverPath, ...filteredArgs], {
    stdio: 'inherit',
  });
  proc.on('exit', (code) => process.exit(code ?? 1));
  proc.on('error', (err) => {
    console.error(`[viewcap] Failed to start server: ${err.message}`);
    process.exit(1);
  });
} else {
  // MCP server with auto-restart and exponential backoff
  const MAX_RESTARTS = 10;
  const WINDOW_MS = 60_000;
  let restartTimes = [];
  let backoff = 1000;
  let child = null;
  let shuttingDown = false;

  function startServer() {
    if (shuttingDown) return;

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
        backoff = Math.min(backoff * 2, 30_000);
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

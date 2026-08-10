#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const VITE_BIN = resolve(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
const TSX_BIN = resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');

function start(command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...extraEnv,
    },
    shell: false,
  });
  child.on('exit', (code, signal) => {
    if (signal) process.exitCode = 1;
    else if (typeof code === 'number' && code !== 0) process.exitCode = code;
  });
  return child;
}

const vite = start(process.execPath, [VITE_BIN]);
const server = start(process.execPath, [TSX_BIN, 'server/start.ts'], { ALLOW_DEV_ADMIN: '1' });

function shutdown() {
  vite.kill();
  server.kill();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

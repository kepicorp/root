// Entry point that initializes dd-trace BEFORE any other module is imported.
// This is required because dd-trace monkey-patches Node.js built-ins (http,
// net, etc.) and must run before those modules are loaded. A dynamic import
// at the end guarantees the tracer is fully initialized before index.ts
// and its transitive dependencies execute.

import tracer from 'dd-trace';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotEnv(path: string): void {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv(resolve(process.cwd(), '.env'));
loadDotEnv(resolve(process.cwd(), '.env.local'));

if (process.env.DD_TRACE_ENABLED === 'true') {
  // DD_AGENT_HOST, DD_TRACE_AGENT_PORT, DD_ENV, DD_VERSION, DD_SITE are read
  // automatically from the environment by dd-trace.
  tracer.init({
    service: process.env.DD_SERVICE ?? 'root-game',
    logInjection: false,
  });
}

await import('./index.js');

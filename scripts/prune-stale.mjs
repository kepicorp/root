#!/usr/bin/env node
// One-shot stale-room cleanup. Run via cron or manually:
//
//   node scripts/prune-stale.mjs              # default: 90 days
//   node scripts/prune-stale.mjs --days 30
//   DATA_DIR=/var/lib/root/rooms node scripts/prune-stale.mjs
//
// Works against the on-disk room files directly so it can run while the
// server is down — useful for cron without coordination.

import { readdirSync, readFileSync, unlinkSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}

const DATA_DIR = resolve(process.env.DATA_DIR ?? './data/rooms');
const DAYS = Number(arg('days', process.env.MAX_ROOM_AGE_DAYS ?? 90));
const DRY = args.includes('--dry-run');
const cutoff = Date.now() - DAYS * 24 * 60 * 60 * 1000;

let files;
try { files = readdirSync(DATA_DIR).filter((f) => f.endsWith('.json')); }
catch (e) {
  console.error(`Cannot read ${DATA_DIR}:`, e.message);
  process.exit(1);
}

let kept = 0;
let removed = 0;
let errors = 0;
for (const file of files) {
  const path = join(DATA_DIR, file);
  let last;
  try {
    const raw = readFileSync(path, 'utf8');
    const snap = JSON.parse(raw);
    last = Number(snap.lastActivityAt ?? snap.lastActivity ?? statSync(path).mtimeMs);
  } catch (e) {
    console.warn(`! cannot read ${file}: ${e.message}`);
    errors += 1;
    continue;
  }
  if (last < cutoff) {
    const ageDays = ((Date.now() - last) / 86400000).toFixed(0);
    console.log(`${DRY ? '[dry] ' : ''}prune ${file} (idle ${ageDays}d)`);
    if (!DRY) {
      try { unlinkSync(path); removed += 1; }
      catch (e) { console.warn(`! failed to delete ${file}: ${e.message}`); errors += 1; }
    } else {
      removed += 1;
    }
  } else {
    kept += 1;
  }
}

console.log(`\nSummary: ${removed} ${DRY ? 'would be pruned' : 'pruned'}, ${kept} kept, ${errors} error(s). Cutoff = ${DAYS} days.`);

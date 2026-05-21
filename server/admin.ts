// Admin endpoints — protected by ADMIN_PASSWORD env. If unset, all admin
// endpoints return 503 (feature disabled) rather than 401, so a misconfigured
// server can't accidentally accept any token.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { RoomManager } from './rooms';
import type { Faction } from '../src/engine/types';
import { ALL_FACTIONS } from '../src/engine/types';

const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD ?? '').trim();
const ADMIN_ENABLED = ADMIN_PASSWORD.length > 0;

export interface RoomInfo {
  id: string;
  createdAt: number;
  lastActivityAt: number;
  started: boolean;
  hasActiveSubscribers: boolean;
  claimedFactions: Faction[];
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

/** Constant-time check of the Bearer token against ADMIN_PASSWORD. */
function checkAuth(req: IncomingMessage): boolean {
  if (!ADMIN_ENABLED) return false;
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const provided = auth.slice('Bearer '.length);
  const a = Buffer.from(provided);
  const b = Buffer.from(ADMIN_PASSWORD);
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}

function roomInfo(manager: RoomManager): RoomInfo[] {
  return manager.list().map((r) => {
    const snap = r.toSnapshot();
    const claimed: Faction[] = ALL_FACTIONS.filter((f) => snap.seats[f] !== null);
    return {
      id: snap.id,
      createdAt: snap.createdAt,
      lastActivityAt: snap.lastActivityAt,
      started: snap.started,
      hasActiveSubscribers: r.hasActiveSubscribers(),
      claimedFactions: claimed,
    };
  }).sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}

async function readJsonBody(req: IncomingMessage, maxBytes = 64 * 1024): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}

/**
 * Try to handle an admin request. Returns true if the request matched an
 * admin route (and was answered), false otherwise so the caller continues.
 */
export async function handleAdmin(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  manager: RoomManager,
): Promise<boolean> {
  if (!path.startsWith('/api/admin/')) return false;

  if (!ADMIN_ENABLED) {
    send(res, 503, { error: 'admin disabled: set ADMIN_PASSWORD on the server to enable' });
    return true;
  }
  if (!checkAuth(req)) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    send(res, 401, { error: 'unauthorized' });
    return true;
  }

  // GET /api/admin/rooms → list
  if (req.method === 'GET' && path === '/api/admin/rooms') {
    send(res, 200, { rooms: roomInfo(manager) });
    return true;
  }

  // DELETE /api/admin/rooms/:id
  if (req.method === 'DELETE' && path.startsWith('/api/admin/rooms/')) {
    const id = path.slice('/api/admin/rooms/'.length);
    const removed = manager.delete(id);
    send(res, removed ? 200 : 404, { id, removed });
    return true;
  }

  // POST /api/admin/prune  body { days?: number, dryRun?: boolean }
  if (req.method === 'POST' && path === '/api/admin/prune') {
    let body: { days?: number; dryRun?: boolean } = {};
    try { body = (await readJsonBody(req)) as typeof body; }
    catch (e) { send(res, 400, { error: String(e) }); return true; }
    const days = Number(body.days ?? 90);
    const dryRun = body.dryRun === true;
    if (!Number.isFinite(days) || days < 0) {
      send(res, 400, { error: 'days must be a non-negative number' });
      return true;
    }
    const maxAgeMs = days * 24 * 60 * 60 * 1000;
    if (dryRun) {
      const wouldRemove = manager.list()
        .filter((r) => !r.hasActiveSubscribers() && r.lastActivityAt < Date.now() - maxAgeMs)
        .map((r) => r.id);
      send(res, 200, { dryRun: true, wouldRemove, kept: manager.list().length - wouldRemove.length });
      return true;
    }
    const { removed, kept } = manager.pruneStale(maxAgeMs);
    send(res, 200, { dryRun: false, removed, kept });
    return true;
  }

  // POST /api/admin/check — verify the token without listing anything.
  if (req.method === 'POST' && path === '/api/admin/check') {
    send(res, 200, { ok: true });
    return true;
  }

  send(res, 404, { error: 'unknown admin route' });
  return true;
}

export const ADMIN_FEATURE_ENABLED = ADMIN_ENABLED;

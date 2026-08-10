import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';

const SITE_PASSWORD = (process.env.SITE_PASSWORD ?? '').trim();
const SITE_AUTH_ENABLED = SITE_PASSWORD.length > 0;
const SESSION_COOKIE = 'root-site-session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type Session = {
  ip: string;
  expiresAt: number;
};

const sessions = new Map<string, Session>();

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]!.trim();
  }
  const socketIp = req.socket.remoteAddress ?? 'unknown';
  return socketIp.startsWith('::ffff:') ? socketIp.slice('::ffff:'.length) : socketIp;
}

function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((part) => {
      const eq = part.indexOf('=');
      if (eq < 0) return [part.trim(), ''];
      return [part.slice(0, eq).trim(), decodeURIComponent(part.slice(eq + 1).trim())];
    }),
  );
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage, maxBytes = 32 * 1024): Promise<unknown> {
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

function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
}

function createSessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`;
}

function setSession(res: ServerResponse, req: IncomingMessage): void {
  const token = randomBytes(24).toString('hex');
  sessions.set(token, { ip: clientIp(req), expiresAt: Date.now() + SESSION_TTL_MS });
  res.setHeader('Set-Cookie', createSessionCookie(token));
}

function clearSession(res: ServerResponse, token: string | undefined): void {
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

export function isSiteAuthEnabled(): boolean {
  return SITE_AUTH_ENABLED;
}

export function hasSiteAccess(req: IncomingMessage): boolean {
  if (!SITE_AUTH_ENABLED) return true;
  cleanupExpiredSessions();
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return false;
  }
  if (session.ip !== clientIp(req)) return false;
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return true;
}

export async function handleSiteAuth(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
  if (!path.startsWith('/api/site-auth/')) return false;

  if (req.method === 'GET' && path === '/api/site-auth/status') {
    send(res, 200, { enabled: SITE_AUTH_ENABLED, authed: hasSiteAccess(req) });
    return true;
  }

  if (req.method === 'POST' && path === '/api/site-auth/login') {
    if (!SITE_AUTH_ENABLED) {
      send(res, 503, { error: 'site password is disabled: set SITE_PASSWORD on the server to enable it' });
      return true;
    }
    let body: { password?: string } = {};
    try { body = (await readJsonBody(req)) as typeof body; }
    catch (e) { send(res, 400, { error: String(e) }); return true; }
    if ((body.password ?? '').trim() !== SITE_PASSWORD) {
      send(res, 401, { error: 'wrong password' });
      return true;
    }
    setSession(res, req);
    send(res, 200, { ok: true, enabled: true, authed: true });
    return true;
  }

  if (req.method === 'POST' && path === '/api/site-auth/logout') {
    const token = parseCookies(req)[SESSION_COOKIE];
    clearSession(res, token);
    send(res, 200, { ok: true });
    return true;
  }

  send(res, 404, { error: 'unknown site auth route' });
  return true;
}

export function requireSiteAccess(req: IncomingMessage, res: ServerResponse): boolean {
  if (hasSiteAccess(req)) return true;
  send(res, 401, { error: 'site locked: enter the maintainer password' });
  return false;
}
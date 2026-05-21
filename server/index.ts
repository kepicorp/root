// Hosted multi-room server. One HTTP + WebSocket server on a single port:
//
//   GET  /                     — React UI (SPA, falls back to index.html)
//   GET  /healthz              — liveness check
//   GET  /api/rooms/:id        — { exists: boolean }
//   POST /api/rooms            — { id } create a new room
//   WS   /ws?room=ID           — connect to a specific room
//
// Persistence: every room is a JSON file in `DATA_DIR` (default ./data/rooms).
// Stale-room cleanup: every 6 hours, rooms idle > MAX_ROOM_AGE_DAYS days
// (default 90) with no live subscribers are deleted.

import http from 'node:http';
import { URL } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { RoomManager, NINETY_DAYS_MS } from './rooms';
import type { Room } from './room';
import { makeStaticHandler } from './static';
import { handleAdmin, ADMIN_FEATURE_ENABLED } from './admin';
import type { ClientMessage, ServerMessage } from './protocol';

const PORT = Number(process.env.PORT ?? 8787);
const DIST_DIR = resolve(process.env.DIST_DIR ?? './dist');
const DATA_DIR = resolve(process.env.DATA_DIR ?? './data/rooms');
const MAX_ROOM_AGE_DAYS = Number(process.env.MAX_ROOM_AGE_DAYS ?? 90);
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

const manager = new RoomManager({ dataDir: DATA_DIR });
const staticHandler = makeStaticHandler(DIST_DIR);
let nextClientId = 1;

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

const httpServer = http.createServer((req, res) => {
  // We `void` the async admin handler so the http callback stays sync from
  // Node's perspective; it writes the response itself.
  void handleRequest(req, res);
});

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const path = url.pathname;

  if (path === '/healthz') { res.writeHead(200); res.end('ok'); return; }

  // Admin endpoints (password-protected). Tried first so they win over the
  // SPA fallback.
  if (await handleAdmin(req, res, path, manager)) return;

  // POST /api/rooms — create a new room
  if (req.method === 'POST' && path === '/api/rooms') {
    const room = manager.create();
    sendJson(res, 201, { id: room.id });
    return;
  }
  // GET /api/rooms/:id — existence check
  if (req.method === 'GET' && path.startsWith('/api/rooms/')) {
    const id = path.slice('/api/rooms/'.length);
    const exists = manager.get(id) !== null;
    sendJson(res, 200, { id, exists });
    return;
  }

  // Static SPA
  if (staticHandler(req, res)) return;
  res.writeHead(503);
  res.end('UI bundle not found at ' + DIST_DIR + ' — run `npm run build`.');
}

const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (req, socket, head) => {
  if (!req.url) { socket.destroy(); return; }
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== '/ws') { socket.destroy(); return; }
  const roomId = url.searchParams.get('room');
  if (!roomId) { socket.destroy(); return; }
  const room = manager.get(roomId);
  if (!room) {
    // Tell the client by completing the upgrade and immediately closing
    // with a message — easier than juggling raw HTTP errors here.
    wss.handleUpgrade(req, socket, head, (ws) => {
      try { ws.send(JSON.stringify({ kind: 'error', message: 'room not found' } satisfies ServerMessage)); } catch {}
      ws.close();
    });
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => attachToRoom(ws, room));
});

function send(ws: WebSocket, msg: ServerMessage): void {
  try { ws.send(JSON.stringify(msg)); } catch { /* dead socket */ }
}

function attachToRoom(ws: WebSocket, room: Room): void {
  const clientId = `c${nextClientId++}`;
  let displayName = clientId;
  send(ws, { kind: 'welcome', clientId });

  const subscriber = {
    send: () => {
      const snap = room.snapshotFor(clientId);
      // Echo session (token + seat) on every broadcast — cheap, idempotent,
      // and keeps the client's localStorage in sync after any state change.
      send(ws, { kind: 'session', rejoinToken: snap.rejoinToken, faction: snap.yourFaction });
      send(ws, { kind: 'lobby', lobby: snap.lobby });
      if (snap.started) {
        send(ws, { kind: 'gameState', state: snap.state, yourFaction: snap.yourFaction });
      }
    },
  };

  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try { msg = JSON.parse(raw.toString()) as ClientMessage; }
    catch { send(ws, { kind: 'error', message: 'bad json' }); return; }

    switch (msg.kind) {
      case 'hello':
        displayName = msg.displayName || clientId;
        room.connect(clientId, displayName, subscriber, msg.rejoinToken);
        break;
      case 'claimSeat': {
        const err = room.claimSeat(clientId, msg.faction, msg.vagabondCharacter);
        if (err) send(ws, { kind: 'error', message: err });
        break;
      }
      case 'releaseSeat':
        room.releaseSeat(clientId);
        break;
      case 'chooseVagabondCharacter':
        room.chooseVagabondCharacter(msg.character);
        break;
      case 'startGame': {
        const err = room.startGame();
        if (err) send(ws, { kind: 'error', message: err });
        break;
      }
      case 'newGame':
        room.newGameReset();
        break;
      case 'action': {
        const err = room.applyAction(clientId, msg.action);
        if (err) send(ws, { kind: 'error', message: err });
        break;
      }
      case 'ping':
        send(ws, { kind: 'pong' });
        break;
    }
  });

  ws.on('close', () => room.disconnect(clientId));
  ws.on('error', () => room.disconnect(clientId));
}

function ifaceIp(): string {
  for (const list of Object.values(networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

// ─── Stale-room cleanup ─────────────────────────────────────────────────────

function runCleanup(): void {
  const maxAgeMs = MAX_ROOM_AGE_DAYS * 24 * 60 * 60 * 1000;
  const { removed, kept } = manager.pruneStale(maxAgeMs);
  if (removed.length > 0) {
    console.log(`Pruned ${removed.length} stale room(s); ${kept} remaining. (${removed.join(', ')})`);
  }
}

setInterval(runCleanup, CLEANUP_INTERVAL_MS);
// Run once on startup so a restarted server immediately cleans up old data.
runCleanup();

// ─── Graceful shutdown ──────────────────────────────────────────────────────

function shutdown(): void {
  console.log('Shutting down — flushing room state…');
  manager.flush();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

httpServer.listen(PORT, () => {
  const host = ifaceIp();
  console.log(
    `\n  Root server listening.\n` +
    `  Local:    http://localhost:${PORT}/\n` +
    `  LAN/web:  http://${host}:${PORT}/\n` +
    `  Data dir: ${DATA_DIR}\n` +
    `  Stale rooms older than ${MAX_ROOM_AGE_DAYS} days are pruned every 6h.\n` +
    `  Admin:    ${ADMIN_FEATURE_ENABLED ? `enabled — visit http://${host}:${PORT}/admin` : 'disabled (set ADMIN_PASSWORD to enable)'}\n`,
  );
});

// Suppress unused-import warning in the no-NINETY-DAYS-MS code path.
void NINETY_DAYS_MS;

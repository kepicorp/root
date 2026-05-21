// LAN multiplayer + static UI server. Single port serves both the built
// React bundle (from ./dist) and the WebSocket endpoint at /ws.
//
//   npm run server           # serve only (assumes dist/ exists)
//   npm run host             # vite --host + ws server (dev mode, 2 ports)
//   docker compose up        # production single-port deployment
//
// Default port 8787 (overridable via PORT env var).

import http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { Room } from './room';
import { makeStaticHandler } from './static';
import type { ClientMessage, ServerMessage } from './protocol';

const PORT = Number(process.env.PORT ?? 8787);
const DIST_DIR = resolve(process.env.DIST_DIR ?? './dist');

const room = new Room();
let nextClientId = 1;

const staticHandler = makeStaticHandler(DIST_DIR);

const httpServer = http.createServer((req, res) => {
  if (req.url === '/healthz') { res.writeHead(200); res.end('ok'); return; }
  if (staticHandler(req, res)) return;
  res.writeHead(503);
  res.end('UI bundle not found at ' + DIST_DIR + ' — run `npm run build` or rebuild the container.');
});

const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/ws')) {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

function send(ws: WebSocket, msg: ServerMessage): void {
  try { ws.send(JSON.stringify(msg)); } catch { /* dead socket */ }
}

function ifaceIp(): string {
  for (const list of Object.values(networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

wss.on('connection', (ws) => {
  const clientId = `c${nextClientId++}`;
  let displayName = clientId;
  send(ws, { kind: 'welcome', clientId });

  const subscriber = {
    send: () => {
      const snap = room.snapshotFor(clientId);
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
        room.connect(clientId, displayName, subscriber);
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
});

httpServer.listen(PORT, () => {
  const host = ifaceIp();
  console.log(
    `\n  Root server listening.\n` +
    `  Open on this machine:  http://localhost:${PORT}/\n` +
    `  Open from the LAN:     http://${host}:${PORT}/\n` +
    `  WebSocket endpoint:    ws://${host}:${PORT}/ws\n`,
  );
});

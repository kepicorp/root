// LAN multiplayer server. Listens for WebSocket connections, hosts one Room.
//
//   npm run server    # start the server only
//   npm run host      # start server + Vite dev server on LAN
//
// Default port 8787 (overridable via PORT env var).

import { WebSocketServer, type WebSocket } from 'ws';
import { Room } from './room';
import type { ClientMessage, ServerMessage } from './protocol';
import { networkInterfaces } from 'node:os';

const PORT = Number(process.env.PORT ?? 8787);
const wss = new WebSocketServer({ port: PORT });
const room = new Room();

let nextClientId = 1;

function send(ws: WebSocket, msg: ServerMessage): void {
  try { ws.send(JSON.stringify(msg)); } catch { /* socket dead */ }
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

  // Subscription: server pushes lobby + game state snapshots to this client.
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

const host = ifaceIp();
console.log(`\n  Root LAN server running.\n  WS endpoint: ws://${host}:${PORT}\n  Players on the same network should open: http://${host}:5173/?room=ws://${host}:${PORT}\n`);

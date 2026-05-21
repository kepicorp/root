// Client-side WebSocket bridge for LAN multiplayer. Manages a single
// connection and surfaces it to the store via a tiny event interface.

import type { ClientMessage, ServerMessage, LobbyState } from '../../server/protocol';
import type { GameState, Action, Faction } from '../engine/types';

export type NetMode = 'off' | 'connecting' | 'lobby' | 'in-game' | 'disconnected';

export interface NetState {
  mode: NetMode;
  endpoint: string | null;
  clientId: string | null;
  lobby: LobbyState | null;
  state: GameState | null;
  yourFaction: Faction | null;
  lastError: string | null;
}

type Listener = (s: NetState) => void;

class NetClient {
  private ws: WebSocket | null = null;
  private state: NetState = {
    mode: 'off',
    endpoint: null,
    clientId: null,
    lobby: null,
    state: null,
    yourFaction: null,
    lastError: null,
  };
  private listeners = new Set<Listener>();
  private displayName = 'Player';

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const l of this.listeners) l(this.state);
  }

  private patch(partial: Partial<NetState>): void {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  connect(endpoint: string, displayName = 'Player'): void {
    if (this.ws) this.ws.close();
    this.displayName = displayName;
    this.patch({ mode: 'connecting', endpoint, lastError: null });
    try {
      this.ws = new WebSocket(endpoint);
    } catch (e) {
      this.patch({ mode: 'disconnected', lastError: String(e) });
      return;
    }
    this.ws.addEventListener('open', () => {
      this.send({ kind: 'hello', displayName: this.displayName });
      this.patch({ mode: 'lobby' });
    });
    this.ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(ev.data) as ServerMessage;
        this.handle(msg);
      } catch { /* drop */ }
    });
    this.ws.addEventListener('close', () => {
      this.patch({ mode: 'disconnected', ws: null } as any);
    });
    this.ws.addEventListener('error', () => {
      this.patch({ lastError: 'connection error' });
    });
  }

  disconnect(): void {
    if (this.ws) this.ws.close();
    this.ws = null;
    this.patch({ mode: 'off', state: null, lobby: null, yourFaction: null, clientId: null });
  }

  private handle(msg: ServerMessage): void {
    switch (msg.kind) {
      case 'welcome':
        this.patch({ clientId: msg.clientId });
        break;
      case 'lobby':
        this.patch({
          lobby: msg.lobby,
          mode: msg.lobby.started ? 'in-game' : 'lobby',
          yourFaction: this.state.clientId
            ? (Object.entries(msg.lobby.seats).find(([_, c]) => c === this.state.clientId)?.[0] as Faction | undefined) ?? null
            : null,
        });
        break;
      case 'gameState':
        this.patch({ state: msg.state, yourFaction: msg.yourFaction, mode: 'in-game' });
        break;
      case 'error':
        this.patch({ lastError: msg.message });
        break;
      case 'pong':
        // ignore
        break;
    }
  }

  send(msg: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  // Convenience wrappers for the UI.
  claimSeat(faction: Faction, vagabondCharacter?: 'thief' | 'tinker' | 'ranger'): void {
    this.send({ kind: 'claimSeat', faction, vagabondCharacter });
  }
  releaseSeat(): void { this.send({ kind: 'releaseSeat' }); }
  startGame(): void { this.send({ kind: 'startGame' }); }
  newGame(): void { this.send({ kind: 'newGame' }); }
  dispatch(action: Action): void { this.send({ kind: 'action', action }); }
  chooseVagabondCharacter(character: 'thief' | 'tinker' | 'ranger'): void {
    this.send({ kind: 'chooseVagabondCharacter', character });
  }

  getState(): NetState { return this.state; }
}

export const netClient = new NetClient();

/** Auto-connect rules, in priority order:
 *   1. `?host=ws://...` URL param → use that explicit endpoint
 *   2. The page is served by the LAN server itself (i.e., there's a /ws
 *      endpoint at the same origin → connect to ws://<same-origin>/ws)
 *   3. Otherwise, stay offline (single-player mode).
 *
 * #2 makes the Docker deployment work with no manual URL editing.
 */
export function autoConnectFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const explicit = url.searchParams.get('host');
  const name = url.searchParams.get('name') ?? 'Player';
  if (explicit) {
    netClient.connect(explicit, name);
    return;
  }
  // Heuristic: when not running on Vite dev port (5173), assume the host
  // bundle is being served by our LAN server, which exposes /ws at the
  // same origin.
  const port = window.location.port;
  if (port && port !== '5173' && port !== '3000') {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const sameOrigin = `${proto}://${window.location.host}/ws`;
    netClient.connect(sameOrigin, name);
  }
}

/** URL of the same-origin WS endpoint (used by the host banner). */
export function sameOriginWsUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:8787/ws';
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
}

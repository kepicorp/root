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

/** Read a `?host=ws://...` URL parameter that auto-connects on page load. */
export function autoConnectFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const host = url.searchParams.get('host');
  if (!host) return;
  const name = url.searchParams.get('name') ?? 'Player';
  netClient.connect(host, name);
}

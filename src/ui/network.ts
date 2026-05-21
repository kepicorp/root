// Client-side WebSocket bridge. Manages a single connection and surfaces it
// to the store via a small subscription interface.

import type { ClientMessage, ServerMessage, LobbyState } from '../../server/protocol';
import type { GameState, Action, Faction } from '../engine/types';

export type NetMode = 'off' | 'connecting' | 'lobby' | 'in-game' | 'disconnected';

export interface NetState {
  mode: NetMode;
  endpoint: string | null;
  roomId: string | null;
  clientId: string | null;
  lobby: LobbyState | null;
  state: GameState | null;
  yourFaction: Faction | null;
  lastError: string | null;
}

// Per-room rejoin token storage. The server issues an opaque token when a
// seat is claimed; persisting it locally lets a page reload reclaim the same
// seat instead of dropping back to a spectator.
const REJOIN_KEY_PREFIX = 'root-rejoin-v1:';
function rejoinKey(roomId: string): string { return REJOIN_KEY_PREFIX + roomId; }
function loadRejoinToken(roomId: string | null): string | undefined {
  if (!roomId || typeof localStorage === 'undefined') return undefined;
  return localStorage.getItem(rejoinKey(roomId)) ?? undefined;
}
function saveRejoinToken(roomId: string | null, token: string | null): void {
  if (!roomId || typeof localStorage === 'undefined') return;
  if (token) localStorage.setItem(rejoinKey(roomId), token);
  else localStorage.removeItem(rejoinKey(roomId));
}

type Listener = (s: NetState) => void;

class NetClient {
  private ws: WebSocket | null = null;
  private state: NetState = {
    mode: 'off',
    endpoint: null,
    roomId: null,
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

  private emit(): void { for (const l of this.listeners) l(this.state); }

  private patch(p: Partial<NetState>): void {
    this.state = { ...this.state, ...p };
    this.emit();
  }

  /** Open a WS connection to `endpoint`. If `roomId` is provided, the
   *  endpoint should already include the `?room=` query (we just remember
   *  it for UI display). */
  connect(endpoint: string, displayName = 'Player', roomId: string | null = null): void {
    if (this.ws) this.ws.close();
    this.displayName = displayName;
    this.patch({ mode: 'connecting', endpoint, roomId, lastError: null });
    try { this.ws = new WebSocket(endpoint); }
    catch (e) { this.patch({ mode: 'disconnected', lastError: String(e) }); return; }
    this.ws.addEventListener('open', () => {
      const rejoinToken = loadRejoinToken(this.state.roomId);
      this.send({ kind: 'hello', displayName: this.displayName, ...(rejoinToken ? { rejoinToken } : {}) });
      this.patch({ mode: 'lobby' });
    });
    this.ws.addEventListener('message', (ev) => {
      try { this.handle(JSON.parse(ev.data) as ServerMessage); } catch { /* drop */ }
    });
    this.ws.addEventListener('close', () => {
      this.patch({ mode: 'disconnected' });
    });
    this.ws.addEventListener('error', () => {
      this.patch({ lastError: 'connection error' });
    });
  }

  disconnect(): void {
    if (this.ws) this.ws.close();
    this.ws = null;
    this.patch({ mode: 'off', state: null, lobby: null, yourFaction: null, clientId: null, roomId: null });
  }

  private handle(msg: ServerMessage): void {
    switch (msg.kind) {
      case 'welcome':
        this.patch({ clientId: msg.clientId });
        break;
      case 'session':
        // Persist the per-room rejoin token. Null clears the entry, e.g.
        // after releaseSeat or when the server didn't recognize our token.
        saveRejoinToken(this.state.roomId, msg.rejoinToken);
        break;
      case 'lobby':
        this.patch({
          lobby: msg.lobby,
          mode: msg.lobby.started ? 'in-game' : 'lobby',
          yourFaction: this.state.clientId
            ? (Object.entries(msg.lobby.seats).find(([, c]) => c === this.state.clientId)?.[0] as Faction | undefined) ?? null
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
        break;
    }
  }

  send(msg: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

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

/** Same-origin WebSocket URL with `?room=<id>` appended. */
export function wsUrlForRoom(roomId: string): string {
  if (typeof window === 'undefined') return `ws://localhost:8787/ws?room=${roomId}`;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws?room=${encodeURIComponent(roomId)}`;
}

/** Parse `/r/<roomId>` out of the current URL. */
export function roomIdFromPath(): string | null {
  if (typeof window === 'undefined') return null;
  const m = window.location.pathname.match(/^\/r\/([a-z0-9]+)\/?$/i);
  return m ? m[1]! : null;
}

/** Auto-connect rules, in priority order:
 *   1. /r/<id>      → same-origin /ws?room=<id>
 *   2. ?host=ws://… → use the explicit endpoint (LAN dev mode)
 *   3. Otherwise stay offline (single-player mode).
 */
export function autoConnectFromUrl(): void {
  if (typeof window === 'undefined') return;
  const name = new URL(window.location.href).searchParams.get('name') ?? 'Player';
  const roomId = roomIdFromPath();
  if (roomId) {
    netClient.connect(wsUrlForRoom(roomId), name, roomId);
    return;
  }
  const explicit = new URL(window.location.href).searchParams.get('host');
  if (explicit) {
    netClient.connect(explicit, name);
  }
}

// ─── REST helpers ───────────────────────────────────────────────────────────

export async function createRoom(): Promise<string> {
  const res = await fetch('/api/rooms', { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to create room (HTTP ${res.status})`);
  const body = await res.json() as { id: string };
  return body.id;
}

export async function checkRoomExists(id: string): Promise<boolean> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(id)}`);
  if (!res.ok) return false;
  const body = await res.json() as { exists: boolean };
  return body.exists;
}

/** Navigate the browser to /r/<id> so refresh works and links can be shared. */
export function navigateToRoom(id: string): void {
  if (typeof window === 'undefined') return;
  window.history.pushState({}, '', `/r/${id}`);
  autoConnectFromUrl();
}

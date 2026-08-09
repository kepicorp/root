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

const NAME_KEY_PREFIX = 'root-name-v1:';
function nameKey(roomId: string): string { return NAME_KEY_PREFIX + roomId; }
function loadRoomDisplayName(roomId: string | null): string | null {
  if (!roomId || typeof localStorage === 'undefined') return null;
  return localStorage.getItem(nameKey(roomId));
}
function saveRoomDisplayName(roomId: string | null, displayName: string): void {
  if (!roomId || typeof localStorage === 'undefined') return;
  localStorage.setItem(nameKey(roomId), displayName);
}

type Listener = (s: NetState) => void;

class NetClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private manualDisconnect = false;
  private reconnectAttempts = 0;
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

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ kind: 'ping' });
    }, 25_000);
  }

  private scheduleReconnect(): void {
    if (this.manualDisconnect) return;
    const endpoint = this.state.endpoint;
    if (!endpoint) return;
    this.clearReconnectTimer();
    const delay = Math.min(10_000, 1_000 + this.reconnectAttempts * 1_000);
    this.reconnectAttempts += 1;
    this.patch({ mode: 'connecting' });
    this.reconnectTimer = setTimeout(() => {
      this.connect(endpoint, this.displayName, this.state.roomId);
    }, delay);
  }

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
    this.clearReconnectTimer();
    this.manualDisconnect = false;
    if (this.ws) this.ws.close();
    this.displayName = loadRoomDisplayName(roomId) ?? displayName;
    this.patch({ mode: 'connecting', endpoint, roomId, lastError: null });
    try { this.ws = new WebSocket(endpoint); }
    catch (e) { this.patch({ mode: 'disconnected', lastError: String(e) }); return; }
    this.ws.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      const rejoinToken = loadRejoinToken(this.state.roomId);
      this.send({ kind: 'hello', displayName: this.displayName, ...(rejoinToken ? { rejoinToken } : {}) });
    });
    this.ws.addEventListener('message', (ev) => {
      try { this.handle(JSON.parse(ev.data) as ServerMessage); } catch { /* drop */ }
    });
    this.ws.addEventListener('close', () => {
      this.clearHeartbeat();
      this.patch({ mode: 'disconnected' });
      this.scheduleReconnect();
    });
    this.ws.addEventListener('error', () => {
      this.patch({ lastError: 'connection error' });
    });
  }

  disconnect(): void {
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    this.clearHeartbeat();
    if (this.ws) this.ws.close();
    this.ws = null;
    this.reconnectAttempts = 0;
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
  setAutoFillBots(autoFillBots: boolean): void {
    this.send({ kind: 'setAutoFillBots', autoFillBots });
  }

  setDisplayName(displayName: string): void {
    const trimmed = displayName.trim();
    if (!trimmed) return;
    const capped = trimmed.slice(0, 32);
    this.displayName = capped;
    saveRoomDisplayName(this.state.roomId, capped);
    this.send({ kind: 'setDisplayName', displayName: capped });
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

export async function createRoom(autoFillBots = true): Promise<string> {
  const res = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoFillBots }),
  });
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

// Room: holds canonical game state, the seat→player mapping, and the bot loop.
// Each public-server instance owns many rooms (see rooms.ts).

import type { GameState, Action, Faction } from '../src/engine/types';
import { ALL_FACTIONS } from '../src/engine/types';
import { newGame, reduce } from '../src/engine/state';
import { startGame, checkVictory } from '../src/engine/loop';
import { performSetup } from '../src/engine/setup';
import { checkCoalitionVictory } from '../src/engine/factions/vagabond/reducer';
import type { VagabondCharacter } from '../src/engine/factions/vagabond/state';
import { STARTING_ITEMS } from '../src/engine/factions/vagabond/state';
import { pickAction } from '../src/bots/bot';
import { produce } from 'immer';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { ClientId, LobbyState } from './protocol';
import { filterStateForRecipient } from './viewFilter';

const BOT_TICK_MS = 400;

interface Subscriber {
  send: () => void;
}

/** Internal player record. The token is private (never broadcast); only
 *  echoed back to the owning client via the per-client `session` message. */
interface PlayerRecord {
  clientId: ClientId;
  displayName: string;
  faction: Faction | null;
  token: string | null;
  online: boolean;
}

/** What we persist per seat: enough to let a token holder reclaim the seat
 *  across a server restart. ClientIds are ephemeral and intentionally not
 *  persisted. */
export interface SeatPersistence {
  token: string;
  displayName: string;
}

/** Serializable snapshot of a room — used for disk persistence. */
export interface RoomSnapshot {
  id: string;
  createdAt: number;
  lastActivityAt: number;
  // Persisted as {token, displayName} per seat. Old snapshots used
  // `ClientId | null` and were reset to all-null on load — those still load
  // fine, they just won't restore identity.
  seats: Record<Faction, SeatPersistence | null>;
  vagabondCharacter: VagabondCharacter;
  state: GameState;
  started: boolean;
}

function tokensEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export class Room {
  readonly id: string;
  readonly createdAt: number;
  lastActivityAt: number;

  private players = new Map<ClientId, PlayerRecord>();
  private seats: Record<Faction, ClientId | null> = {
    marquise: null, eyrie: null, alliance: null, vagabond: null,
  };
  private vagabondCharacter: VagabondCharacter = 'thief';
  private state: GameState;
  private started = false;
  private subscribers = new Map<ClientId, Subscriber>();
  private aiTimer: ReturnType<typeof setTimeout> | null = null;
  private onChange: ((room: Room) => void) | null = null;
  private syntheticIdCounter = 0;

  constructor(id: string, opts: { createdAt?: number; state?: GameState; started?: boolean } = {}) {
    this.id = id;
    this.createdAt = opts.createdAt ?? Date.now();
    this.lastActivityAt = Date.now();
    this.state = opts.state ?? newGame({ seed: Math.floor(Math.random() * 1e9) });
    this.started = opts.started ?? false;
  }

  /** Registered by the manager so every state change schedules a disk write. */
  onPersist(fn: (room: Room) => void): void { this.onChange = fn; }

  private touched(): void {
    this.lastActivityAt = Date.now();
    if (this.onChange) this.onChange(this);
  }

  // ─── Hydrate from / serialize to disk ────────────────────────────────────

  static fromSnapshot(snap: RoomSnapshot): Room {
    const r = new Room(snap.id, { createdAt: snap.createdAt, state: snap.state, started: snap.started });
    r.lastActivityAt = snap.lastActivityAt;
    r.vagabondCharacter = snap.vagabondCharacter;
    // Rehydrate offline player records from persisted seat tokens. They sit
    // in the players map under synthetic clientIds until someone reconnects
    // with the matching token and is rebound to a live clientId.
    for (const f of ALL_FACTIONS) {
      const persisted = snap.seats?.[f];
      if (!persisted || typeof persisted !== 'object' || !persisted.token) continue;
      const offlineId = r.synthClientId();
      r.players.set(offlineId, {
        clientId: offlineId,
        displayName: persisted.displayName || 'Player',
        faction: f,
        token: persisted.token,
        online: false,
      });
      r.seats[f] = offlineId;
    }
    if (r.started && !r.state.winner) r.scheduleAITurn();
    return r;
  }

  toSnapshot(): RoomSnapshot {
    const persistedSeats: Record<Faction, SeatPersistence | null> = {
      marquise: null, eyrie: null, alliance: null, vagabond: null,
    };
    for (const f of ALL_FACTIONS) {
      const seatClientId = this.seats[f];
      if (!seatClientId) continue;
      const p = this.players.get(seatClientId);
      if (p?.token) persistedSeats[f] = { token: p.token, displayName: p.displayName };
    }
    return {
      id: this.id,
      createdAt: this.createdAt,
      lastActivityAt: this.lastActivityAt,
      seats: persistedSeats,
      vagabondCharacter: this.vagabondCharacter,
      state: this.state,
      started: this.started,
    };
  }

  private synthClientId(): string { return `offline-${++this.syntheticIdCounter}`; }

  private newToken(): string { return randomBytes(16).toString('hex'); }

  private findPlayerByToken(token: string): PlayerRecord | null {
    for (const p of this.players.values()) {
      if (p.token && tokensEqual(p.token, token)) return p;
    }
    return null;
  }

  // ─── Connection lifecycle ────────────────────────────────────────────────

  /** Bind a fresh WS connection to this room. If `rejoinToken` matches an
   *  existing player record (typically offline from a prior disconnect or
   *  hydration), the record is rebound to the new clientId — preserving the
   *  seat. Otherwise a fresh player record is created. */
  connect(clientId: ClientId, displayName: string, sub: Subscriber, rejoinToken?: string): void {
    if (rejoinToken) {
      const existing = this.findPlayerByToken(rejoinToken);
      if (existing) {
        const oldId = existing.clientId;
        // Move the record under the new live clientId.
        if (oldId !== clientId) {
          this.players.delete(oldId);
          // If another tab was holding this record live, drop its subscriber
          // so we stop broadcasting to it. The old WS will see no further
          // updates and any messages it sends will be rejected.
          this.subscribers.delete(oldId);
          if (existing.faction && this.seats[existing.faction] === oldId) {
            this.seats[existing.faction] = clientId;
          }
        }
        existing.clientId = clientId;
        existing.displayName = displayName;
        existing.online = true;
        this.players.set(clientId, existing);
        this.subscribers.set(clientId, sub);
        this.broadcastLobby();
        if (this.started) this.sendStateTo(clientId);
        this.touched();
        return;
      }
    }
    if (!this.players.has(clientId)) {
      this.players.set(clientId, { clientId, displayName, faction: null, token: null, online: true });
    } else {
      const p = this.players.get(clientId)!;
      p.displayName = displayName;
      p.online = true;
    }
    this.subscribers.set(clientId, sub);
    this.broadcastLobby();
    if (this.started) this.sendStateTo(clientId);
    this.touched();
  }

  /** A WS closed. In lobby, this is symmetric with the old behavior: the
   *  player record is removed and any held seat is freed. Once the game has
   *  started, seat holders stick around as offline records so they can
   *  reclaim their seat via the rejoin token. The bot covers their seat
   *  while they're away. */
  disconnect(clientId: ClientId): void {
    this.subscribers.delete(clientId);
    const player = this.players.get(clientId);
    if (!player) { this.touched(); return; }
    if (this.started && player.faction) {
      player.online = false;
    } else {
      if (player.faction) this.seats[player.faction] = null;
      this.players.delete(clientId);
    }
    this.broadcastLobby();
    if (this.started) this.scheduleAITurn();
    this.touched();
  }

  hasActiveSubscribers(): boolean { return this.subscribers.size > 0; }

  // ─── Lobby ───────────────────────────────────────────────────────────────

  claimSeat(clientId: ClientId, faction: Faction, character?: VagabondCharacter): string | null {
    if (this.started) return 'game already started';
    const player = this.players.get(clientId);
    if (!player) return 'not connected';
    if (this.seats[faction] && this.seats[faction] !== clientId) return 'seat already taken';
    if (player.faction && player.faction !== faction) {
      this.seats[player.faction] = null;
    }
    this.seats[faction] = clientId;
    player.faction = faction;
    // Issue a token at claim time so a tab close between claim and game start
    // (or right after start) can still reclaim the seat via reload.
    if (!player.token) player.token = this.newToken();
    if (faction === 'vagabond' && character) this.vagabondCharacter = character;
    this.broadcastLobby();
    this.touched();
    return null;
  }

  releaseSeat(clientId: ClientId): void {
    const player = this.players.get(clientId);
    if (!player || !player.faction) return;
    this.seats[player.faction] = null;
    player.faction = null;
    // Releasing the seat invalidates the token — the user is no longer
    // associated with this room. A future claim re-issues a fresh token.
    player.token = null;
    this.broadcastLobby();
    this.touched();
  }

  chooseVagabondCharacter(character: VagabondCharacter): void {
    this.vagabondCharacter = character;
    this.broadcastLobby();
    this.touched();
  }

  // ─── Start / restart ─────────────────────────────────────────────────────

  startGame(): string | null {
    if (this.started) return 'already started';
    let base = newGame({ seed: Math.floor(Math.random() * 1e9) });
    base = produce(base, draft => {
      if (draft.factions.vagabond) {
        draft.factions.vagabond.character = this.vagabondCharacter;
        draft.factions.vagabond.items = [];
        for (const kind of STARTING_ITEMS[this.vagabondCharacter]) {
          draft.factions.vagabond.items.push({ kind, state: 'face-up', exhausted: false });
        }
      }
    });
    this.state = startGame(performSetup(base));
    this.started = true;
    this.broadcastLobby();
    this.broadcastState();
    this.scheduleAITurn();
    this.touched();
    return null;
  }

  newGameReset(): void {
    if (this.aiTimer) { clearTimeout(this.aiTimer); this.aiTimer = null; }
    this.state = newGame({ seed: Math.floor(Math.random() * 1e9) });
    this.started = false;
    this.vagabondCharacter = 'thief';
    this.broadcastLobby();
    this.touched();
  }

  // ─── Actions ─────────────────────────────────────────────────────────────

  applyAction(clientId: ClientId, action: Action): string | null {
    if (!this.started) return 'game not started';
    const player = this.players.get(clientId);
    if (!player) return 'not connected';
    const isSystem = action.kind.startsWith('system.');
    const isCombat = action.kind.startsWith('combat.');
    if (isCombat) {
      // combat.playAmbush / skipAmbush carry an explicit `faction` field
      // that identifies the responder. Authorize the player's seat against it.
      const respondent = (action as { faction?: Faction }).faction;
      if (respondent && player.faction !== respondent) return 'not your seat';
    } else if (!isSystem) {
      const factionPrefix = action.kind.split('.')[0];
      if (player.faction !== factionPrefix) return 'not your seat';
    }
    const next = this.reduceFull(this.state, action);
    if (next === this.state) return 'action had no effect';
    this.state = next;
    this.broadcastState();
    this.scheduleAITurn();
    this.touched();
    return null;
  }

  // ─── Bot loop ────────────────────────────────────────────────────────────

  private scheduleAITurn(): void {
    if (this.aiTimer) return;
    this.aiTimer = setTimeout(() => this.runAITurn(), BOT_TICK_MS);
  }

  private runAITurn(): void {
    this.aiTimer = null;
    if (!this.started || this.state.winner) return;
    if (this.state.phase === 'setup' || this.state.phase === 'gameOver') return;
    // A pending prompt (e.g. defender ambush) pauses the active-faction
    // turn — the respondent is the one to act. Check their seat first.
    let actingFaction: Faction | undefined;
    if (this.state.pendingPrompts.length > 0) {
      actingFaction = this.state.pendingPrompts[0]!.faction;
    } else {
      actingFaction = this.state.factionOrder[this.state.activeIndex];
    }
    const seatClientId = this.seats[actingFaction!];
    if (seatClientId) {
      const holder = this.players.get(seatClientId);
      // Only block the bot if a *live* human is seated. An offline holder
      // gets covered by the bot until they reconnect with their token.
      if (holder?.online) return;
    }
    const action = pickAction(this.state);
    if (!action) return;
    let next = this.reduceFull(this.state, action);
    if (next === this.state) {
      next = this.reduceFull(this.state, { kind: 'system.advancePhase' });
      if (next === this.state) return;
    }
    this.state = next;
    this.broadcastState();
    this.touched();
    if (!this.state.winner) this.scheduleAITurn();
  }

  private reduceFull(state: GameState, action: Action): GameState {
    return checkCoalitionVictory(checkVictory(reduce(state, action)));
  }

  // ─── Snapshots ───────────────────────────────────────────────────────────

  private lobbySnapshot(): LobbyState {
    return {
      // Hide offline ghosts from the broadcast so other clients see them
      // "leave" on disconnect; they'll reappear when their owner reconnects.
      // Tokens are stripped here — they're per-client and never broadcast.
      players: Array.from(this.players.values())
        .filter(p => p.online)
        .map(({ clientId, displayName, faction }) => ({ clientId, displayName, faction })),
      seats: { ...this.seats },
      vagabondCharacter: this.vagabondCharacter,
      started: this.started,
    };
  }

  private broadcastLobby(): void {
    for (const sub of this.subscribers.values()) sub.send();
  }

  private broadcastState(): void {
    for (const sub of this.subscribers.values()) sub.send();
  }

  private sendStateTo(clientId: ClientId): void {
    const sub = this.subscribers.get(clientId);
    if (sub) sub.send();
  }

  snapshotFor(clientId: ClientId): {
    lobby: LobbyState;
    state: GameState;
    yourFaction: Faction | null;
    rejoinToken: string | null;
    started: boolean;
  } {
    const player = this.players.get(clientId);
    const faction = player?.faction ?? null;
    return {
      lobby: this.lobbySnapshot(),
      // Strip hidden info (other players' hands, deck order, supporters,
      // quests) before this state goes out over the wire.
      state: filterStateForRecipient(this.state, faction),
      yourFaction: faction,
      rejoinToken: player?.token ?? null,
      started: this.started,
    };
  }

  hasAnyClaimedSeat(): boolean {
    return ALL_FACTIONS.some(f => this.seats[f] !== null);
  }

  dispose(): void {
    if (this.aiTimer) { clearTimeout(this.aiTimer); this.aiTimer = null; }
    this.subscribers.clear();
    this.players.clear();
  }
}

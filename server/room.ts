// Room: holds canonical game state, the seat→player mapping, and the bot loop.
// Each public-server instance owns many rooms (see rooms.ts).

import type { GameState, Action, Faction } from '../src/engine/types';
import { metrics } from './telemetry';
import { ALL_FACTIONS } from '../src/engine/types';
import { newGame, reduce } from '../src/engine/state';
import { buildStateSnapshot, serializeStateSnapshot } from '../src/engine/stateSnapshot';
import { checkVictory } from '../src/engine/loop';
import { getLegalActions } from '../src/engine/legal';
import { checkCoalitionVictory } from '../src/engine/factions/vagabond/reducer';
import type { VagabondCharacter } from '../src/engine/factions/vagabond/state';
import { pickAction } from '../src/bots/bot';
import { produce } from 'immer';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { ClientId, LobbyState, SeatAssignment } from './protocol';
import { filterStateForRecipient } from './viewFilter';

const BOT_TICK_MS = 400;
const MAX_HISTORY_ENTRIES = 400;

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

export interface RoomHistoryEntry {
  id: number;
  createdAt: number;
  logIndex: number;
  turn: number;
  faction: Faction | 'system';
  message: string;
  state: GameState;
}

export type RoomHistorySummaryEntry = Omit<RoomHistoryEntry, 'state'>;

/** Serializable snapshot of a room — used for disk persistence. */
export interface RoomSnapshot {
  id: string;
  createdAt: number;
  lastActivityAt: number;
  /** @deprecated kept for older snapshots/backward compat only. */
  autoFillBots: boolean;
  seatPlans?: Record<Faction, SeatAssignment>;
  // Persisted as {token, displayName} per seat. Old snapshots used
  // `ClientId | null` and were reset to all-null on load — those still load
  // fine, they just won't restore identity.
  seats: Record<Faction, SeatPersistence | null>;
  vagabondCharacter: VagabondCharacter;
  state: GameState;
  paused: boolean;
  pausedSnapshot: GameState | null;
  history?: RoomHistoryEntry[];
  nextHistoryId?: number;
  pendingLoadedState?: GameState | null;
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
  private seatPlans: Record<Faction, SeatAssignment> = {
    marquise: 'open', eyrie: 'open', alliance: 'open', vagabond: 'open',
  };
  private hostClientId: ClientId | null = null;
  private vagabondCharacter: VagabondCharacter = 'thief';
  private state: GameState;
  private paused = false;
  private pausedSnapshot: GameState | null = null;
  private history: RoomHistoryEntry[] = [];
  private nextHistoryId = 1;
  private pendingLoadedState: GameState | null;
  private started = false;
  private subscribers = new Map<ClientId, Subscriber>();
  private aiTimer: ReturnType<typeof setTimeout> | null = null;
  private onChange: ((room: Room) => void) | null = null;
  private syntheticIdCounter = 0;

  constructor(
    id: string,
    opts: {
      createdAt?: number;
      state?: GameState;
      paused?: boolean;
      pausedSnapshot?: GameState | null;
      history?: RoomHistoryEntry[];
      nextHistoryId?: number;
      pendingLoadedState?: GameState | null;
      started?: boolean;
      seatPlans?: Record<Faction, SeatAssignment>;
    } = {},
  ) {
    this.id = id;
    this.createdAt = opts.createdAt ?? Date.now();
    this.lastActivityAt = Date.now();
    this.state = opts.state ?? newGame({ seed: Math.floor(Math.random() * 1e9) });
    this.paused = opts.paused ?? false;
    this.pausedSnapshot = opts.pausedSnapshot ?? null;
    this.history = opts.history ? opts.history.slice(-MAX_HISTORY_ENTRIES) : [];
    this.nextHistoryId = opts.nextHistoryId ?? (this.history.length + 1);
    this.pendingLoadedState = opts.pendingLoadedState ?? null;
    this.started = opts.started ?? false;
    if (opts.seatPlans) this.seatPlans = { ...opts.seatPlans };
  }

  private static isSeatPersistence(value: unknown): value is SeatPersistence {
    return !!value && typeof value === 'object' && 'token' in (value as Record<string, unknown>);
  }

  private static inferSeatPlans(snap: RoomSnapshot): Record<Faction, SeatAssignment> {
    const empty: Record<Faction, SeatAssignment> = {
      marquise: 'open', eyrie: 'open', alliance: 'open', vagabond: 'open',
    };
    if (snap.seatPlans) {
      return { ...empty, ...snap.seatPlans };
    }
    if (snap.started) {
      const active = new Set(snap.state?.factionOrder ?? []);
      for (const f of ALL_FACTIONS) {
        if (!active.has(f)) { empty[f] = 'open'; continue; }
        empty[f] = Room.isSeatPersistence(snap.seats?.[f]) ? 'human' : 'bot';
      }
      return empty;
    }
    const legacyAutoFill = snap.autoFillBots ?? true;
    for (const f of ALL_FACTIONS) {
      const raw = snap.seats?.[f];
      if (raw !== null && raw !== undefined) empty[f] = 'human';
      else empty[f] = legacyAutoFill ? 'bot' : 'open';
    }
    return empty;
  }

  /** Registered by the manager so every state change schedules a disk write. */
  onPersist(fn: (room: Room) => void): void { this.onChange = fn; }

  private touched(): void {
    this.lastActivityAt = Date.now();
    if (this.onChange) this.onChange(this);
  }

  // ─── Hydrate from / serialize to disk ────────────────────────────────────

  static fromSnapshot(snap: RoomSnapshot): Room {
    const r = new Room(snap.id, {
      createdAt: snap.createdAt,
      state: snap.state,
      paused: snap.paused ?? false,
      pausedSnapshot: snap.pausedSnapshot ?? null,
      history: snap.history ?? [],
      nextHistoryId: snap.nextHistoryId,
      pendingLoadedState: snap.pendingLoadedState ?? null,
      started: snap.started,
      seatPlans: Room.inferSeatPlans(snap),
    });
    r.lastActivityAt = snap.lastActivityAt;
    r.vagabondCharacter = snap.vagabondCharacter;
    r.paused = snap.paused ?? false;
    r.pausedSnapshot = snap.pausedSnapshot ?? null;
    if ((!snap.history || snap.history.length === 0) && r.state.log.length > 0) {
      const rebuilt: RoomHistoryEntry[] = [];
      for (let i = 0; i < r.state.log.length; i++) {
        const log = r.state.log[i]!;
        rebuilt.push({
          id: i + 1,
          createdAt: r.lastActivityAt,
          logIndex: i,
          turn: log.turn,
          faction: log.faction,
          message: log.message,
          state: r.cloneState(r.state),
        });
      }
      r.history = rebuilt.slice(-MAX_HISTORY_ENTRIES);
      r.nextHistoryId = rebuilt.length + 1;
    }
    // Rehydrate offline player records from persisted seat tokens. They sit
    // in the players map under synthetic clientIds until someone reconnects
    // with the matching token and is rebound to a live clientId.
    for (const f of ALL_FACTIONS) {
      const persisted = snap.seats?.[f];
      if (!Room.isSeatPersistence(persisted) || !persisted.token) continue;
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
    if (r.started && !r.paused && !r.state.winner) r.scheduleAITurn();
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
      autoFillBots: ALL_FACTIONS.some((f) => this.seatPlans[f] === 'bot'),
      seatPlans: { ...this.seatPlans },
      seats: persistedSeats,
      vagabondCharacter: this.vagabondCharacter,
      state: this.state,
      paused: this.paused,
      pausedSnapshot: this.pausedSnapshot,
      history: this.history,
      nextHistoryId: this.nextHistoryId,
      pendingLoadedState: this.pendingLoadedState,
      started: this.started,
    };
  }

  private cloneState(state: GameState): GameState {
    return JSON.parse(JSON.stringify(state)) as GameState;
  }

  isPaused(): boolean {
    return this.paused;
  }

  getHistorySummary(): RoomHistorySummaryEntry[] {
    return this.history.map(({ state, ...rest }) => rest);
  }

  restoreHistoryEntryById(entryId: number): string | null {
    const hit = this.history.find((h) => h.id === entryId);
    if (!hit) return 'history entry not found';
    if (this.aiTimer) { clearTimeout(this.aiTimer); this.aiTimer = null; }
    this.state = this.cloneState(hit.state);
    this.paused = true;
    this.pausedSnapshot = this.cloneState(this.state);
    this.pendingLoadedState = null;
    this.started = this.state.phase !== 'setup';
    this.vagabondCharacter = this.state.factions.vagabond?.character ?? this.vagabondCharacter;
    // Keep current pre-game seat plan settings; history restore is an in-game tool.
    this.broadcastLobby();
    this.broadcastState();
    this.touched();
    return null;
  }

  private appendHistoryFromLogs(prevState: GameState, nextState: GameState): void {
    if (nextState.log.length <= prevState.log.length) return;
    const now = Date.now();
    for (let i = prevState.log.length; i < nextState.log.length; i++) {
      const log = nextState.log[i]!;
      this.history.push({
        id: this.nextHistoryId++,
        createdAt: now,
        logIndex: i,
        turn: log.turn,
        faction: log.faction,
        message: log.message,
        state: this.cloneState(nextState),
      });
    }
    if (this.history.length > MAX_HISTORY_ENTRIES) {
      this.history = this.history.slice(-MAX_HISTORY_ENTRIES);
    }
  }

  pauseByAdmin(): string | null {
    if (!this.started) return 'game not started';
    if (this.paused) return null;
    this.paused = true;
    this.pausedSnapshot = this.cloneState(this.state);
    if (this.aiTimer) { clearTimeout(this.aiTimer); this.aiTimer = null; }
    const prev = this.state;
    this.state = produce(this.state, draft => {
      draft.log.push({ turn: draft.turn, faction: 'system', message: 'Admin paused the room.' });
    });
    this.appendHistoryFromLogs(prev, this.state);
    this.broadcastLobby();
    this.broadcastState();
    this.touched();
    return null;
  }

  resumeByAdmin(): string | null {
    if (!this.started) return 'game not started';
    if (!this.paused) return null;
    this.paused = false;
    this.pausedSnapshot = null;
    const prev = this.state;
    this.state = produce(this.state, draft => {
      draft.log.push({ turn: draft.turn, faction: 'system', message: 'Admin resumed the room.' });
    });
    this.appendHistoryFromLogs(prev, this.state);
    this.broadcastLobby();
    this.broadcastState();
    this.scheduleAITurn();
    this.touched();
    return null;
  }

  refreshFromPauseSnapshotByAdmin(): string | null {
    if (!this.started) return 'game not started';
    if (!this.paused) return 'room is not paused';
    if (!this.pausedSnapshot) return 'no paused snapshot available';
    const prev = this.state;
    this.state = this.cloneState(this.pausedSnapshot);
    this.state = produce(this.state, draft => {
      draft.log.push({ turn: draft.turn, faction: 'system', message: 'Admin refreshed room from paused snapshot.' });
    });
    this.appendHistoryFromLogs(prev, this.state);
    this.broadcastState();
    this.touched();
    return null;
  }

  private synthClientId(): string { return `offline-${++this.syntheticIdCounter}`; }

  private newToken(): string { return randomBytes(16).toString('hex'); }

  private findPlayerByToken(token: string): PlayerRecord | null {
    for (const p of this.players.values()) {
      if (p.token && tokensEqual(p.token, token)) return p;
    }
    return null;
  }

  private isHost(clientId: ClientId): boolean {
    return this.hostClientId === clientId;
  }

  private assignHostIfNeeded(preferred?: ClientId): void {
    if (!this.hostClientId && preferred && this.players.get(preferred)?.online) {
      this.hostClientId = preferred;
      return;
    }
    if (this.hostClientId && this.players.get(this.hostClientId)?.online) return;
    for (const p of this.players.values()) {
      if (p.online) {
        this.hostClientId = p.clientId;
        return;
      }
    }
    this.hostClientId = null;
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
          if (this.hostClientId === oldId) this.hostClientId = clientId;
        }
        existing.clientId = clientId;
        existing.online = true;
        this.players.set(clientId, existing);
        this.subscribers.set(clientId, sub);
        this.assignHostIfNeeded(clientId);
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
    this.assignHostIfNeeded(clientId);
    this.broadcastLobby();
    if (this.started) this.sendStateTo(clientId);
    this.touched();
  }

  /** A WS closed. In lobby, this is symmetric with the old behavior: the
   *  player record is removed and any held seat is freed. Once the game has
   *  started, seat holders stick around as offline records so they can
   *  reclaim their seat via the rejoin token. */
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
    if (this.hostClientId === clientId) this.assignHostIfNeeded();
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
    if (this.seatPlans[faction] === 'bot') return 'seat is assigned to AI';
    if (this.seatPlans[faction] === 'open') this.seatPlans[faction] = 'human';
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

  setSeatPlan(clientId: ClientId, faction: Faction, assignment: SeatAssignment): string | null {
    if (this.started) return 'game already started';
    if (!this.players.has(clientId)) return 'not connected';
    if (!this.isHost(clientId)) return 'only host can configure seats';
    this.seatPlans[faction] = assignment;
    if (assignment !== 'human') {
      const seatClientId = this.seats[faction];
      if (seatClientId) {
        const occupant = this.players.get(seatClientId);
        if (occupant?.faction === faction) occupant.faction = null;
      }
      this.seats[faction] = null;
    }
    this.broadcastLobby();
    this.touched();
    return null;
  }

  assignSeat(clientId: ClientId, faction: Faction, targetClientId: ClientId | null): string | null {
    if (this.started) return 'game already started';
    if (!this.players.has(clientId)) return 'not connected';
    if (!this.isHost(clientId)) return 'only host can assign seats';
    if (this.seatPlans[faction] !== 'human') return 'seat is not configured for human assignment';

    const prevSeatHolderId = this.seats[faction];
    if (prevSeatHolderId && prevSeatHolderId !== targetClientId) {
      const prevSeatHolder = this.players.get(prevSeatHolderId);
      if (prevSeatHolder?.faction === faction) prevSeatHolder.faction = null;
    }

    if (targetClientId === null) {
      this.seats[faction] = null;
      this.broadcastLobby();
      this.touched();
      return null;
    }

    const target = this.players.get(targetClientId);
    if (!target || !target.online) return 'target player not connected';
    if (target.faction && target.faction !== faction) {
      this.seats[target.faction] = null;
    }
    target.faction = faction;
    if (!target.token) target.token = this.newToken();
    this.seats[faction] = targetClientId;
    this.broadcastLobby();
    this.touched();
    return null;
  }

  releaseSeat(clientId: ClientId): void {
    const player = this.players.get(clientId);
    if (!player || !player.faction) return;
    this.seats[player.faction] = null;
    player.faction = null;
    // Releasing the seat invalidates the token. The host may re-assign the
    // player to a seat again, which issues a fresh token.
    player.token = null;
    this.broadcastLobby();
    this.touched();
  }

  setDisplayName(clientId: ClientId, displayName: string): string | null {
    const player = this.players.get(clientId);
    if (!player) return 'not connected';
    const trimmed = displayName.trim();
    if (!trimmed) return 'display name cannot be empty';
    player.displayName = trimmed.slice(0, 32);
    this.broadcastLobby();
    this.touched();
    return null;
  }

  chooseVagabondCharacter(character: VagabondCharacter): void {
    this.vagabondCharacter = character;
    this.broadcastLobby();
    this.touched();
  }

  // ─── Start / restart ─────────────────────────────────────────────────────

  startGame(): string | null {
    if (this.started) return 'already started';
    const activeFactions = ALL_FACTIONS.filter((f) => this.seatPlans[f] !== 'open');
    if (activeFactions.length === 0) return 'need at least one configured faction';
    for (const faction of activeFactions) {
      if (this.seatPlans[faction] === 'human' && this.seats[faction] === null) {
        return `${faction} is set to human but has no assigned player`;
      }
    }
    this.history = [];
    this.nextHistoryId = 1;
    const prevState = this.state;
    if (this.pendingLoadedState) {
      this.state = this.pendingLoadedState;
      this.pendingLoadedState = null;
    } else {
      const factions = activeFactions;
      let base = newGame({ seed: Math.floor(Math.random() * 1e9), factions });
      base = produce(base, draft => {
        if (draft.factions.vagabond) {
          // Only set the character; setupVagabond() will add the correct starting items.
          draft.factions.vagabond.character = this.vagabondCharacter;
          draft.factions.vagabond.items = [];
          if (draft.setup) {
            draft.setup.vagabondCharacterChosen = true;
          }
        }
      });
      this.state = base;
    }
    this.started = true;
    this.paused = false;
    this.pausedSnapshot = null;
    this.state = this.autoAdvanceSystemSteps(this.state);
    this.appendHistoryFromLogs(prevState, this.state);
    metrics.increment('root.game.started', { factions: this.state.factionOrder.join(',') });
    this.broadcastLobby();
    this.broadcastState();
    this.scheduleAITurn();
    this.touched();
    return null;
  }

  newGameReset(): void {
    if (this.aiTimer) { clearTimeout(this.aiTimer); this.aiTimer = null; }
    this.state = newGame({ seed: Math.floor(Math.random() * 1e9) });
    this.history = [];
    this.nextHistoryId = 1;
    this.pendingLoadedState = null;
    this.paused = false;
    this.pausedSnapshot = null;
    this.started = false;
    this.vagabondCharacter = 'thief';
    this.broadcastLobby();
    this.touched();
  }

  exportStateText(clientId: ClientId): string | null {
    if (!this.players.has(clientId)) return null;
    const player = this.players.get(clientId);
    const snapshot = buildStateSnapshot(this.state, {
      source: 'online',
      roomId: this.id,
      autoFillBots: ALL_FACTIONS.some((f) => this.seatPlans[f] === 'bot'),
      playerFaction: player?.faction ?? null,
    });
    return serializeStateSnapshot(snapshot);
  }

  // ─── Actions ─────────────────────────────────────────────────────────────

  applyAction(clientId: ClientId, action: Action): string | null {
    if (!this.started) return 'game not started';
    if (this.paused) return 'game is paused by admin';
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
    const prev = this.state;
    const next = this.reduceFull(prev, action);
    if (next === prev) return 'action had no effect';
    this.state = this.autoAdvanceSystemSteps(next);
    this.appendHistoryFromLogs(prev, this.state);
    metrics.increment('root.action.applied', { kind: action.kind.replace('.', '_') });
    if (next.winner) metrics.increment('root.game.over', { winner: next.winner.faction, via: next.winner.via });
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
    if (!this.started || this.paused || this.state.winner) return;
    if (this.state.phase === 'gameOver') return;

    const progressed = this.autoAdvanceSystemSteps(this.state);
    if (progressed !== this.state) {
      const prev = this.state;
      this.state = progressed;
      this.appendHistoryFromLogs(prev, this.state);
      this.broadcastState();
      this.touched();
      if (!this.state.winner) this.scheduleAITurn();
      return;
    }

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
      // A human seat remains paused while its owner is offline. The owner
      // must rejoin before the turn can continue.
      if (holder && this.seatPlans[actingFaction!] !== 'bot') return;
    }
    const action = pickAction(this.state);
    if (!action) return;
    const t0 = Date.now();
    const prev = this.state;
    let next = this.reduceFull(prev, action);
    if (next === prev) {
      next = this.reduceFull(prev, { kind: 'system.advancePhase' });
      if (next === prev) return;
    }
    metrics.histogram('root.bot.turn_ms', Date.now() - t0);
    this.state = this.autoAdvanceSystemSteps(next);
    this.appendHistoryFromLogs(prev, this.state);
    this.broadcastState();
    this.touched();
    if (!this.state.winner) this.scheduleAITurn();
  }

  private reduceFull(state: GameState, action: Action): GameState {
    return checkCoalitionVictory(checkVictory(reduce(state, action)));
  }

  /** Auto-progress through system-only transitions; stop at the next real choice. */
  private autoAdvanceSystemSteps(state: GameState): GameState {
    let cur = state;
    for (let i = 0; i < 48; i++) {
      if (cur.phase === 'setup' || cur.phase === 'gameOver' || cur.winner) return cur;
      if (cur.pendingPrompts.length > 0) return cur;
      const legal = getLegalActions(cur);
      if (legal.length === 0) return cur;
      const hasNonSystem = legal.some((a) => !a.kind.startsWith('system.'));
      if (hasNonSystem) return cur;

      let next = cur;
      if (legal.some((a) => a.kind === 'system.advancePhase')) {
        next = this.reduceFull(cur, { kind: 'system.advancePhase' });
      } else if (legal.some((a) => a.kind === 'system.endTurn')) {
        next = this.reduceFull(cur, { kind: 'system.endTurn' });
      }
      if (next === cur) return cur;
      cur = next;
    }
    return cur;
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
      seatPlans: { ...this.seatPlans },
      hostClientId: this.hostClientId,
      vagabondCharacter: this.vagabondCharacter,
      hasLoadedState: this.pendingLoadedState !== null,
      paused: this.paused,
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
    return ALL_FACTIONS.some(f => this.seatPlans[f] !== 'open');
  }

  onlinePlayerCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (p.online) n++;
    return n;
  }

  dispose(): void {
    if (this.aiTimer) { clearTimeout(this.aiTimer); this.aiTimer = null; }
    this.subscribers.clear();
    this.players.clear();
  }
}

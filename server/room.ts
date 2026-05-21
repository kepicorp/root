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
import type { ClientId, LobbyState, PlayerInfo } from './protocol';

const BOT_TICK_MS = 400;

interface Subscriber {
  send: () => void;
}

/** Serializable snapshot of a room — used for disk persistence. */
export interface RoomSnapshot {
  id: string;
  createdAt: number;
  lastActivityAt: number;
  seats: Record<Faction, ClientId | null>;
  vagabondCharacter: VagabondCharacter;
  state: GameState;
  started: boolean;
}

export class Room {
  readonly id: string;
  readonly createdAt: number;
  lastActivityAt: number;

  private players = new Map<ClientId, PlayerInfo>();
  private seats: Record<Faction, ClientId | null> = {
    marquise: null, eyrie: null, alliance: null, vagabond: null,
  };
  private vagabondCharacter: VagabondCharacter = 'thief';
  private state: GameState;
  private started = false;
  private subscribers = new Map<ClientId, Subscriber>();
  private aiTimer: ReturnType<typeof setTimeout> | null = null;
  private onChange: ((room: Room) => void) | null = null;

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
    // Seats reset on hydration — humans reconnect and re-claim. Persistent
    // identity / rejoin tokens are a follow-up.
    r.seats = { marquise: null, eyrie: null, alliance: null, vagabond: null };
    r.vagabondCharacter = snap.vagabondCharacter;
    if (r.started && !r.state.winner) r.scheduleAITurn();
    return r;
  }

  toSnapshot(): RoomSnapshot {
    return {
      id: this.id,
      createdAt: this.createdAt,
      lastActivityAt: this.lastActivityAt,
      seats: { ...this.seats },
      vagabondCharacter: this.vagabondCharacter,
      state: this.state,
      started: this.started,
    };
  }

  // ─── Connection lifecycle ────────────────────────────────────────────────

  connect(clientId: ClientId, displayName: string, sub: Subscriber): void {
    if (!this.players.has(clientId)) {
      this.players.set(clientId, { clientId, displayName, faction: null });
    } else {
      const p = this.players.get(clientId)!;
      p.displayName = displayName;
    }
    this.subscribers.set(clientId, sub);
    this.broadcastLobby();
    if (this.started) this.sendStateTo(clientId);
    this.touched();
  }

  disconnect(clientId: ClientId): void {
    this.subscribers.delete(clientId);
    const seat = this.players.get(clientId)?.faction ?? null;
    if (seat) {
      this.seats[seat] = null;
      const p = this.players.get(clientId);
      if (p) p.faction = null;
    }
    this.players.delete(clientId);
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
    if (!isSystem) {
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
    const active = this.state.factionOrder[this.state.activeIndex];
    if (this.seats[active!]) return;
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
      players: Array.from(this.players.values()),
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
    started: boolean;
  } {
    return {
      lobby: this.lobbySnapshot(),
      state: this.state,
      yourFaction: this.players.get(clientId)?.faction ?? null,
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

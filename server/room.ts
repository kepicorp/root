// Room: holds canonical game state, the seat→player mapping, and the bot loop.
//
// One server, one room (LAN, single party). Multi-room support can be added
// later if needed.

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
  send: (faction: Faction | null) => void;
}

export class Room {
  private players = new Map<ClientId, PlayerInfo>();
  private seats: Record<Faction, ClientId | null> = {
    marquise: null, eyrie: null, alliance: null, vagabond: null,
  };
  private vagabondCharacter: VagabondCharacter = 'thief';
  private state: GameState = newGame({ seed: Math.floor(Math.random() * 1e9) });
  private started = false;
  private subscribers = new Map<ClientId, Subscriber>();
  private aiTimer: ReturnType<typeof setTimeout> | null = null;

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
  }

  disconnect(clientId: ClientId): void {
    this.subscribers.delete(clientId);
    // The seat stays claimed for a grace period in a future improvement;
    // for now, free it immediately so a bot can take over.
    const seat = this.players.get(clientId)?.faction ?? null;
    if (seat) {
      this.seats[seat] = null;
      const p = this.players.get(clientId);
      if (p) p.faction = null;
    }
    this.players.delete(clientId);
    this.broadcastLobby();
    if (this.started) this.scheduleAITurn();
  }

  // ─── Lobby ───────────────────────────────────────────────────────────────

  claimSeat(clientId: ClientId, faction: Faction, character?: VagabondCharacter): string | null {
    if (this.started) return 'game already started';
    const player = this.players.get(clientId);
    if (!player) return 'not connected';
    if (this.seats[faction] && this.seats[faction] !== clientId) return 'seat already taken';
    // Release previous seat if any.
    if (player.faction && player.faction !== faction) {
      this.seats[player.faction] = null;
    }
    this.seats[faction] = clientId;
    player.faction = faction;
    if (faction === 'vagabond' && character) this.vagabondCharacter = character;
    this.broadcastLobby();
    return null;
  }

  releaseSeat(clientId: ClientId): void {
    const player = this.players.get(clientId);
    if (!player || !player.faction) return;
    this.seats[player.faction] = null;
    player.faction = null;
    this.broadcastLobby();
  }

  chooseVagabondCharacter(character: VagabondCharacter): void {
    this.vagabondCharacter = character;
    this.broadcastLobby();
  }

  // ─── Start / restart ─────────────────────────────────────────────────────

  startGame(): string | null {
    if (this.started) return 'already started';
    let base = newGame({ seed: Math.floor(Math.random() * 1e9) });
    // Apply chosen Vagabond character.
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
    return null;
  }

  newGameReset(): void {
    if (this.aiTimer) { clearTimeout(this.aiTimer); this.aiTimer = null; }
    this.state = newGame({ seed: Math.floor(Math.random() * 1e9) });
    this.started = false;
    this.vagabondCharacter = 'thief';
    this.broadcastLobby();
  }

  // ─── Actions ─────────────────────────────────────────────────────────────

  applyAction(clientId: ClientId, action: Action): string | null {
    if (!this.started) return 'game not started';
    const player = this.players.get(clientId);
    if (!player) return 'not connected';
    // Authority: the action's faction prefix must match the player's seat,
    // OR the action is a system action.
    const isSystem = action.kind.startsWith('system.');
    if (!isSystem) {
      const factionPrefix = action.kind.split('.')[0];
      if (player.faction !== factionPrefix) return 'not your turn / seat';
    }
    const next = this.reduceFull(this.state, action);
    if (next === this.state) return 'action had no effect';
    this.state = next;
    this.broadcastState();
    this.scheduleAITurn();
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
    // Skip if a human is in this seat.
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
    for (const sub of this.subscribers.values()) sub.send(null);
  }

  private broadcastState(): void {
    for (const sub of this.subscribers.values()) sub.send(null);
  }

  private sendStateTo(_clientId: ClientId): void {
    const sub = this.subscribers.get(_clientId);
    if (sub) sub.send(null);
  }

  /** Snapshot for a specific client (currently no view filtering). */
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

  /** Whether the game has at least one human-claimed seat. */
  hasAnyClaimedSeat(): boolean {
    return ALL_FACTIONS.some(f => this.seats[f] !== null);
  }
}

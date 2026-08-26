// Shared protocol for the LAN multiplayer client/server.
//
// All messages are JSON-serializable. The server is the source of truth for
// game state; clients send actions and receive state snapshots.

import type { GameState, Action, Faction } from '../src/engine/types';
import type { VagabondCharacter } from '../src/engine/factions/vagabond/state';

export type ClientId = string;
export type SeatAssignment = 'open' | 'human' | 'bot';

export interface PlayerInfo {
  clientId: ClientId;
  displayName: string;
  faction: Faction | null;     // claimed seat (or null = spectator)
}

export interface LobbyState {
  players: PlayerInfo[];
  /** Map of faction → clientId who claimed it (or null = empty seat). */
  seats: Record<Faction, ClientId | null>;
  /** Map of faction → pre-game seat assignment type. */
  seatPlans: Record<Faction, SeatAssignment>;
  /** Current room host (can edit pre-game seat plans). */
  hostClientId: ClientId | null;
  /** Vagabond character (only meaningful if vagabond seat is claimed). */
  vagabondCharacter: VagabondCharacter;
  /** True when start game will hydrate from a loaded snapshot instead of new setup. */
  hasLoadedState: boolean;
  /** True when an admin has paused gameplay for this room. */
  paused: boolean;
  started: boolean;
}

// ─── Client → Server ────────────────────────────────────────────────────────

export type ClientMessage =
  | { kind: 'hello'; displayName: string; rejoinToken?: string }
  | { kind: 'setDisplayName'; displayName: string }
  | { kind: 'claimSeat'; faction: Faction; vagabondCharacter?: VagabondCharacter }
  | { kind: 'releaseSeat' }
  | { kind: 'setSeatPlan'; faction: Faction; assignment: SeatAssignment }
  | { kind: 'assignSeat'; faction: Faction; clientId: ClientId | null }
  | { kind: 'chooseVagabondCharacter'; character: VagabondCharacter }
  | { kind: 'startGame' }
  | { kind: 'exportState' }
  | { kind: 'action'; action: Action }
  | { kind: 'newGame' }
  | { kind: 'ping' };

// ─── Server → Client ────────────────────────────────────────────────────────

export type ServerMessage =
  | { kind: 'welcome'; clientId: ClientId }
  // Private, per-client. Carries the rejoin token (if any) and current seat
  // so the client can persist them to localStorage and rebind after a reload.
  | { kind: 'session'; rejoinToken: string | null; faction: Faction | null }
  | { kind: 'lobby'; lobby: LobbyState }
  | { kind: 'gameState'; state: GameState; yourFaction: Faction | null }
  | { kind: 'stateExport'; text: string }
  | { kind: 'error'; message: string }
  | { kind: 'pong' };

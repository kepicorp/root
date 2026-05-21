// Shared protocol for the LAN multiplayer client/server.
//
// All messages are JSON-serializable. The server is the source of truth for
// game state; clients send actions and receive state snapshots.

import type { GameState, Action, Faction } from '../src/engine/types';
import type { VagabondCharacter } from '../src/engine/factions/vagabond/state';

export type ClientId = string;

export interface PlayerInfo {
  clientId: ClientId;
  displayName: string;
  faction: Faction | null;     // claimed seat (or null = spectator)
}

export interface LobbyState {
  players: PlayerInfo[];
  /** Map of faction → clientId who claimed it (or null = AI bot fill). */
  seats: Record<Faction, ClientId | null>;
  /** Vagabond character (only meaningful if vagabond seat is claimed). */
  vagabondCharacter: VagabondCharacter;
  started: boolean;
}

// ─── Client → Server ────────────────────────────────────────────────────────

export type ClientMessage =
  | { kind: 'hello'; displayName: string }
  | { kind: 'claimSeat'; faction: Faction; vagabondCharacter?: VagabondCharacter }
  | { kind: 'releaseSeat' }
  | { kind: 'chooseVagabondCharacter'; character: VagabondCharacter }
  | { kind: 'startGame' }
  | { kind: 'action'; action: Action }
  | { kind: 'newGame' }
  | { kind: 'ping' };

// ─── Server → Client ────────────────────────────────────────────────────────

export type ServerMessage =
  | { kind: 'welcome'; clientId: ClientId }
  | { kind: 'lobby'; lobby: LobbyState }
  | { kind: 'gameState'; state: GameState; yourFaction: Faction | null }
  | { kind: 'error'; message: string }
  | { kind: 'pong' };

// Core engine types. The engine is a pure module: (state, action) => state.
// No React, no DOM, no I/O. RNG is injected via state.seed.

export type Suit = 'fox' | 'mouse' | 'rabbit';
export type CardSuit = Suit | 'bird';

export type Faction = 'marquise' | 'eyrie' | 'alliance' | 'vagabond';

export type ClearingId = number; // 1..12 on the autumn map

export type Path = readonly [ClearingId, ClearingId];

export type MarquiseBuilding = 'sawmill' | 'workshop' | 'recruiter';
export type EyrieBuilding = 'roost';
export type AllianceBuilding = 'base-fox' | 'base-mouse' | 'base-rabbit';
export type Building = MarquiseBuilding | EyrieBuilding | AllianceBuilding;

export type TokenKind =
  | 'wood'           // Marquise
  | 'sympathy'       // Alliance
  | 'keep';          // Marquise

export interface Clearing {
  id: ClearingId;
  suit: Suit;
  buildingSlots: number;       // 1, 2, or 3
  hasRuin: boolean;
  /** Display coordinates for rendering (board-space, 0..1000 x 0..800). */
  x: number;
  y: number;
}

export interface RootMap {
  clearings: readonly Clearing[];
  paths: readonly Path[];
}

// ─── Game state ──────────────────────────────────────────────────────────────

export type Phase = 'setup' | 'birdsong' | 'daylight' | 'evening' | 'gameOver';

export interface PendingPrompt {
  kind: string;                // e.g. 'ambush', 'remove-piece', 'discard-card'
  faction: Faction;            // which faction must answer
  payload: unknown;
}

export interface GameState {
  seed: number;
  phase: Phase;
  activeFaction: Faction;
  subphase: string;            // faction-specific sub-state, e.g. 'daylight.actions'
  pendingPrompts: PendingPrompt[];
  scores: Record<Faction, number>;
  winner?: { faction: Faction; via: 'points' | 'dominance' | 'coalition' };
  log: LogEntry[];
  // Faction-specific state lives under state.factions.* (added per phase).
}

export interface LogEntry {
  turn: number;
  faction: Faction | 'system';
  message: string;
}

// ─── Actions ────────────────────────────────────────────────────────────────
// Actions are a tagged union; per-faction action kinds are added in later phases.

export type Action =
  | { kind: 'system.advancePhase' }
  | { kind: 'system.endTurn' };

// Marker so future imports compile against this skeleton.
export const ENGINE_VERSION = '0.0.0-phase0';

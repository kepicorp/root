// Core engine types. The engine is a pure module: (state, action) => state.
// No React, no DOM, no I/O. RNG is injected via state.seed.
//
// EXTENSION POINTS for per-faction phases:
//
//   * Each faction owns a file at engine/factions/<faction>/state.ts that
//     exports its `XState` interface. types.ts re-imports them below.
//   * Each faction owns a file at engine/factions/<faction>/actions.ts that
//     exports its `XAction` union. types.ts unions them into `Action`.
//   * Buildings and tokens are stringly-typed at the shared layer; each
//     faction defines its own concrete strings.
//
// This indirection means a faction agent can edit only its own files plus
// add one import line here — easy to merge across parallel branches.

import type { CardId } from './cards';
import type { MarquiseState } from './factions/marquise/state';
import type { EyrieState }    from './factions/eyrie/state';
import type { AllianceState } from './factions/alliance/state';
import type { VagabondState } from './factions/vagabond/state';
import type { MarquiseAction } from './factions/marquise/actions';
import type { EyrieAction }    from './factions/eyrie/actions';
import type { AllianceAction } from './factions/alliance/actions';
import type { VagabondAction } from './factions/vagabond/actions';

export type Suit = 'fox' | 'mouse' | 'rabbit';
export type CardSuit = Suit | 'bird';

export type Faction = 'marquise' | 'eyrie' | 'alliance' | 'vagabond';
export const ALL_FACTIONS: readonly Faction[] = ['marquise', 'eyrie', 'alliance', 'vagabond'];

export type ClearingId = number;
export type Path = readonly [ClearingId, ClearingId];

// ─── Map data ───────────────────────────────────────────────────────────────

export interface Clearing {
  id: ClearingId;
  suit: Suit;
  buildingSlots: number;
  hasRuin: boolean;
  x: number;
  y: number;
}

export interface RootMap {
  clearings: readonly Clearing[];
  paths: readonly Path[];
}

// ─── Per-clearing dynamic state ─────────────────────────────────────────────

export interface BuildingInstance {
  faction: Faction;
  kind: string;              // faction-specific: 'sawmill', 'roost', 'base-fox', ...
}

export interface TokenInstance {
  faction: Faction;
  kind: string;              // 'wood', 'sympathy', 'keep', 'trade-post', ...
}

export interface ClearingState {
  warriors: Partial<Record<Faction, number>>;
  buildings: BuildingInstance[];
  tokens: TokenInstance[];
  vagabondHere: boolean;
}

export interface MapState {
  clearings: Record<ClearingId, ClearingState>;
}

// ─── Game state ─────────────────────────────────────────────────────────────

export type Phase = 'setup' | 'birdsong' | 'daylight' | 'evening' | 'gameOver';

export interface PendingPrompt {
  id: string;
  kind: string;
  faction: Faction;          // which faction must answer
  payload: unknown;
}

export type WinReason = 'points' | 'dominance' | 'coalition';
export interface WinResult { faction: Faction; via: WinReason; }

export interface LogEntry {
  turn: number;
  faction: Faction | 'system';
  message: string;
}

export interface FactionsState {
  marquise?: MarquiseState;
  eyrie?: EyrieState;
  alliance?: AllianceState;
  vagabond?: VagabondState;
}

export interface GameState {
  seed: number;
  rngStep: number;           // monotonic counter mixed into the per-action sub-seed
  turn: number;
  phase: Phase;
  factionOrder: Faction[];   // birdsong → daylight → evening rotates per faction
  activeIndex: number;       // index into factionOrder
  factions: FactionsState;
  map: MapState;
  deck: CardId[];
  discard: CardId[];
  hands: Record<Faction, CardId[]>;
  craftedPersistents: { faction: Faction; cardId: CardId }[];
  itemSupply: ItemKind[];
  scores: Record<Faction, number>;
  pendingPrompts: PendingPrompt[];
  winner?: WinResult;
  log: LogEntry[];
}

export type ItemKind = 'sword' | 'hammer' | 'crossbow' | 'boots' | 'bag' | 'tea' | 'coin' | 'torch';

// ─── Actions ────────────────────────────────────────────────────────────────

export type SystemAction =
  | { kind: 'system.advancePhase' }
  | { kind: 'system.endTurn' };

export type CombatAction =
  | { kind: 'combat.declare'; clearing: ClearingId; attacker: Faction; defender: Faction }
  | { kind: 'combat.playAmbush'; faction: Faction; cardId: CardId }
  | { kind: 'combat.skipAmbush'; faction: Faction };

export type PromptAction =
  | { kind: 'prompt.respond'; promptId: string; response: unknown };

export type Action =
  | SystemAction
  | CombatAction
  | PromptAction
  | MarquiseAction
  | EyrieAction
  | AllianceAction
  | VagabondAction;

export type ActionKind = Action['kind'];

export const ENGINE_VERSION = '0.1.0-phase1';

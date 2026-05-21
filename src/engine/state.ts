// Game state construction + reducer entry point.

import { produce } from 'immer';
import { AUTUMN_MAP } from './map';
import { SHARED_DECK, type CardId } from './cards';
import { mulberry32, shuffle } from './rng';
import type {
  GameState, Faction, ClearingState, ItemKind, Action, ALL_FACTIONS as _F,
} from './types';
import { ALL_FACTIONS } from './types';
import { INITIAL_MARQUISE_STATE } from './factions/marquise/state';
import { INITIAL_EYRIE_STATE } from './factions/eyrie/state';
import { INITIAL_ALLIANCE_STATE } from './factions/alliance/state';
import { INITIAL_VAGABOND_STATE } from './factions/vagabond/state';
import { resolveCombat } from './combat';
import { advancePhase, endTurn } from './loop';

export interface NewGameOptions {
  seed?: number;
  factions?: readonly Faction[];   // factions present (default: all 4)
}

export function newGame(opts: NewGameOptions = {}): GameState {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const factions = opts.factions ?? ALL_FACTIONS;

  // Empty clearings.
  const clearings: Record<number, ClearingState> = {};
  for (const c of AUTUMN_MAP.clearings) {
    clearings[c.id] = { warriors: {}, buildings: [], tokens: [], vagabondHere: false };
  }

  const rng = mulberry32(seed);
  const deck = shuffle(SHARED_DECK.map(c => c.id), rng);

  const hands: Record<Faction, CardId[]> = {
    marquise: [], eyrie: [], alliance: [], vagabond: [],
  };
  // Deal starting hand of 3 to each playing faction. The Eyrie also gets 2 viziers,
  // handled by the eyrie setup module (Phase 3); we deal a generic 3 here.
  for (const f of factions) {
    for (let i = 0; i < 3; i++) {
      const card = deck.pop();
      if (card) hands[f].push(card);
    }
  }

  const itemSupply: ItemKind[] = [
    'sword', 'sword', 'crossbow', 'hammer',
    'boots', 'boots', 'bag', 'bag',
    'tea', 'tea', 'coin', 'coin',
    'torch', 'torch', 'torch', 'torch',
  ];

  const state: GameState = {
    seed,
    rngStep: 0,
    turn: 1,
    phase: 'setup',
    factionOrder: factions.slice(),
    activeIndex: 0,
    factions: {
      marquise: factions.includes('marquise') ? { ...INITIAL_MARQUISE_STATE } : undefined,
      eyrie:    factions.includes('eyrie')    ? { ...INITIAL_EYRIE_STATE }    : undefined,
      alliance: factions.includes('alliance') ? { ...INITIAL_ALLIANCE_STATE } : undefined,
      vagabond: factions.includes('vagabond') ? { ...INITIAL_VAGABOND_STATE } : undefined,
    },
    map: { clearings },
    deck,
    discard: [],
    hands,
    craftedPersistents: [],
    itemSupply,
    scores: { marquise: 0, eyrie: 0, alliance: 0, vagabond: 0 },
    pendingPrompts: [],
    log: [{ turn: 1, faction: 'system', message: `New game (seed ${seed})` }],
  };

  return state;
}

// ─── Reducer ────────────────────────────────────────────────────────────────
// The top-level reducer is a dispatcher: it routes to combat / loop / faction
// reducers. Faction phases register their own reducers here.

import { marquiseReducer } from './factions/marquise/reducer';
import { eyrieReducer } from './factions/eyrie/reducer';
import { allianceReducer } from './factions/alliance/reducer';
import { vagabondReducer } from './factions/vagabond/reducer';

export function reduce(state: GameState, action: Action): GameState {
  if (state.winner) return state;

  switch (action.kind) {
    case 'system.advancePhase':
      return advancePhase(state);
    case 'system.endTurn':
      return endTurn(state);
    case 'combat.declare':
      return resolveCombat(state, {
        clearing: action.clearing,
        attacker: action.attacker,
        defender: action.defender,
      });
    case 'combat.playAmbush':
    case 'combat.skipAmbush':
    case 'prompt.respond':
      // These flow through the pendingPrompts system; faction reducers handle them.
      return state;
    default:
      if (action.kind.startsWith('marquise.')) return marquiseReducer(state, action);
      if (action.kind.startsWith('eyrie.'))    return eyrieReducer(state, action);
      if (action.kind.startsWith('alliance.')) return allianceReducer(state, action);
      if (action.kind.startsWith('vagabond.')) return vagabondReducer(state, action);
      return state;
  }
}

/** Convenience: clone a state (Immer-safe, structural). */
export function cloneState(s: GameState): GameState {
  return produce(s, () => {});
}

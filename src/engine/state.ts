// Game state construction + reducer entry point.

import { produce } from 'immer';
import { AUTUMN_MAP } from './map';
import { BASE_SHARED_DECK, SD_SHARED_DECK, DOMINANCE_CARDS, getCard, type CardId } from './cards';
import { mulberry32, shuffle } from './rng';
import type {
  GameState, Faction, ClearingState, ItemKind, Action, DeckVariant, ALL_FACTIONS as _F,
} from './types';
import { ALL_FACTIONS } from './types';
import { INITIAL_MARQUISE_STATE } from './factions/marquise/state';
import { INITIAL_EYRIE_STATE } from './factions/eyrie/state';
import { INITIAL_ALLIANCE_STATE } from './factions/alliance/state';
import { INITIAL_VAGABOND_STATE } from './factions/vagabond/state';
import { declareBattle, defenderAmbushOptions, resolveAmbushPrompt, resolveMiceCancelPrompt } from './combat';
import { advancePhase, endTurn } from './loop';

export interface NewGameOptions {
  seed?: number;
  factions?: readonly Faction[];   // factions present (default: all 4)
  deckVariant?: DeckVariant;       // card deck to use (default: 'base')
}

export function newGame(opts: NewGameOptions = {}): GameState {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const factions = opts.factions ?? ALL_FACTIONS;
  const deckVariant: DeckVariant = opts.deckVariant ?? 'base';

  // Empty clearings.
  const clearings: Record<number, ClearingState> = {};
  for (const c of AUTUMN_MAP.clearings) {
    clearings[c.id] = { warriors: {}, buildings: [], tokens: [], vagabondHere: false };
  }

  // Randomly assign the 4 ruin items to the 4 ruin clearings.
  const ruinItems: ItemKind[] = shuffle(['crossbow', 'hammer', 'boots', 'sword'] as ItemKind[], mulberry32(seed + 1));
  let ruinIdx = 0;
  for (const c of AUTUMN_MAP.clearings) {
    if (c.hasRuin) {
      clearings[c.id]!.ruinItem = ruinItems[ruinIdx++];
    }
  }

  const rng = mulberry32(seed);
  const sharedDeck = deckVariant === 'squires' ? SD_SHARED_DECK : BASE_SHARED_DECK;
  // Dominance cards are shuffled into the shared deck; players draw and play them from hand.
  const deck = shuffle([...sharedDeck, ...DOMINANCE_CARDS].map(c => c.id), rng);

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
    deckVariant,
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
    dominanceAvailable: [],
    craftedItemLog: [],
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
import { cardEffectsReducer } from './card-effects';
import type { CardAction } from './card-effects';

/** Migrate state saved by older engine versions to the current shape. */
function migrateState(state: GameState): GameState {
  let s = state;
  if (!s.craftedItemLog) s = { ...s, craftedItemLog: [] };
  if (s.factions.alliance && !(s.factions.alliance as any).craftedThisTurn) {
    s = { ...s, factions: { ...s.factions, alliance: { ...s.factions.alliance, craftedThisTurn: [] } } };
  }
  return s;
}

export function reduce(state: GameState, action: Action): GameState {
  state = migrateState(state);
  if (state.winner) return state;

  switch (action.kind) {
    case 'system.advancePhase':
      return advancePhase(state);
    case 'system.endTurn':
      return endTurn(state);
    case 'system.playDominance':
      return produce(state, draft => {
        if (draft.dominance) return; // already claimed
        if ((draft.scores[action.faction] ?? 0) < 10) return;
        const card = getCard(action.cardId);
        if (card.category !== 'dominance') return;
        // Card must be in the player's hand.
        const handIdx = draft.hands[action.faction].indexOf(action.cardId);
        if (handIdx < 0) return;
        draft.hands[action.faction].splice(handIdx, 1);
        draft.discard.push(action.cardId);
        draft.dominance = { faction: action.faction, suit: card.suit };
        // The faction abandons their VP track when chasing dominance.
        draft.scores[action.faction] = 0;
        draft.log.push({ turn: draft.turn, faction: action.faction, message: `Played ${card.name} — chasing dominance.` });
      });
    case 'combat.declare':
      return declareBattle(state, {
        clearing: action.clearing,
        attacker: action.attacker,
        defender: action.defender,
      });
    case 'combat.playAmbush': {
      const prompt = state.pendingPrompts.find(p => p.kind === 'combat.defenderAmbush');
      if (!prompt || prompt.faction !== action.faction) return state;
      const card = getCard(action.cardId);
      if (card.category !== 'ambush') return state;
      if (!(state.hands[action.faction] ?? []).includes(action.cardId)) return state;
      // The ambush card must match the clearing's suit (or be a bird).
      const params = prompt.payload as { clearing: number };
      const validIds = defenderAmbushOptions(state, params.clearing, action.faction);
      if (!validIds.includes(action.cardId)) return state;
      return resolveAmbushPrompt(state, { playedCard: action.cardId });
    }
    case 'combat.skipAmbush': {
      const micePrompt = state.pendingPrompts.find(p => p.kind === 'combat.miceCancel');
      if (micePrompt && micePrompt.faction === action.faction) {
        return resolveMiceCancelPrompt(state, { cancel: false });
      }
      const prompt = state.pendingPrompts.find(p => p.kind === 'combat.defenderAmbush');
      if (!prompt || prompt.faction !== action.faction) return state;
      return resolveAmbushPrompt(state, {});
    }
    case 'system.resolveOutrage':
      return produce(state, draft => {
        const o = draft.pendingOutrage;
        if (!o) return;
        const al = draft.factions.alliance;
        if (action.cardId) {
          // Moving faction pays a matching card to Alliance supporters
          const idx = draft.hands[o.faction].indexOf(action.cardId);
          if (idx < 0) return;
          draft.hands[o.faction].splice(idx, 1);
          if (al) al.supporters.push(action.cardId);
          else draft.discard.push(action.cardId);
          draft.log.push({ turn: draft.turn, faction: o.faction, message: `Outrage: gave ${getCard(action.cardId).name} to Alliance supporters.` });
        } else {
          // No matching card — Alliance draws from deck
          if (al && draft.deck.length > 0) {
            const drawn = draft.deck.pop()!;
            al.supporters.push(drawn);
            draft.log.push({ turn: draft.turn, faction: o.faction, message: `Outrage: no matching card — Alliance drew a supporter from the deck.` });
          }
        }
        draft.pendingOutrage = undefined;
      });
    case 'prompt.respond':
      // Generic prompt response — faction reducers handle their own.
      return state;
    default:
      if (action.kind.startsWith('card.'))    return cardEffectsReducer(state, action as CardAction);
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

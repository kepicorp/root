// Game state construction + reducer entry point.

import { produce } from 'immer';
import { AUTUMN_MAP } from './map';
import { BASE_SHARED_DECK, SD_SHARED_DECK, DOMINANCE_CARDS, discardCard, getCard, type CardId } from './cards';
import { mulberry32, shuffle } from './rng';
import type {
  GameState, Faction, ClearingState, ItemKind, Action, DeckVariant, ALL_FACTIONS as _F,
} from './types';
import { ALL_FACTIONS } from './types';
import { INITIAL_MARQUISE_STATE } from './factions/marquise/state';
import { INITIAL_EYRIE_STATE } from './factions/eyrie/state';
import { INITIAL_ALLIANCE_STATE } from './factions/alliance/state';
import { INITIAL_VAGABOND_STATE } from './factions/vagabond/state';
import { declareBattle, defenderAmbushOptions, resolveAmbushPrompt, resolveCounterAmbushPrompt, resolveMiceCancelPrompt, resolveOptionalEffectPrompt, resolveRemovalPiecesPrompt, resolveFieldHospitalsPrompt } from './combat';
import { advancePhase, endTurn } from './loop';
import { initializeSetupState, reduceSetupAction } from './setup';

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
    battleOverlay: undefined,
    log: [{ turn: 1, faction: 'system', message: `New game (seed ${seed})` }],
  };

  return initializeSetupState(state);
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
  if (s.factions.vagabond && (s.factions.vagabond as any).pendingRefresh === undefined) {
    s = { ...s, factions: { ...s.factions, vagabond: { ...s.factions.vagabond, pendingRefresh: 0 } } };
  }
  const al = s.factions.alliance;
  if (al) {
    let newAl = al;
    if (!(newAl as any).craftedThisTurn) newAl = { ...newAl, craftedThisTurn: [] };
    // Old endDaylight zeroed daylightActionsLeft; restore ops if stuck in evening with officers.
    if (s.phase === 'evening' && newAl.officers > 0 && newAl.daylightActionsLeft === 0) {
      newAl = { ...newAl, daylightActionsLeft: newAl.officers };
    }
    if (newAl !== al) s = { ...s, factions: { ...s.factions, alliance: newAl } };
  }
  const m = s.factions.marquise;
  if (m && !(m as any).daylightCraftState) {
    s = { ...s, factions: { ...s.factions, marquise: { ...m, daylightCraftState: 'prompt' } } };
  }
  const e = s.factions.eyrie;
  if (e && (e as any).birdCardsAddedThisBirdsong === undefined) {
    s = { ...s, factions: { ...s.factions, eyrie: { ...e, birdCardsAddedThisBirdsong: 0 } } };
  }
  const misplacedDominance = s.discard.filter(id => getCard(id).category === 'dominance');
  if (misplacedDominance.length > 0) {
    const available = [...s.dominanceAvailable];
    for (const id of misplacedDominance) if (!available.includes(id)) available.push(id);
    s = { ...s, discard: s.discard.filter(id => getCard(id).category !== 'dominance'), dominanceAvailable: available };
  }
  if (s.phase === 'setup' && !s.setup) {
    s = initializeSetupState(s);
  }
  return s;
}

export function reduce(state: GameState, action: Action): GameState {
  state = migrateState(state);
  if (state.winner) return state;

  if (state.phase === 'setup') {
    const setupNext = reduceSetupAction(state, action);
    if (setupNext !== state) return setupNext;
  }

  switch (action.kind) {
    case 'system.advancePhase':
      return advancePhase(state);
    case 'system.endTurn':
      return endTurn(state);
    case 'system.takeDominance':
      return produce(state, draft => {
        if (draft.phase !== 'birdsong' || draft.factionOrder[draft.activeIndex] !== action.faction) return;
        const availableIdx = draft.dominanceAvailable.indexOf(action.cardId);
        const handIdx = draft.hands[action.faction].indexOf(action.spendCard);
        if (availableIdx < 0 || handIdx < 0) return;
        const dominance = getCard(action.cardId);
        const payment = getCard(action.spendCard);
        if (dominance.category !== 'dominance') return;
        if (payment.category !== 'dominance' && payment.suit !== dominance.suit && payment.suit !== 'bird') return;
        draft.dominanceAvailable.splice(availableIdx, 1);
        draft.hands[action.faction].splice(handIdx, 1);
        if (payment.category === 'dominance') {
          if (!draft.dominanceAvailable.includes(action.spendCard)) {
            draft.dominanceAvailable.push(action.spendCard);
          }
        } else {
          discardCard(draft, action.spendCard);
        }
        draft.hands[action.faction].push(action.cardId);
        draft.log.push({ turn: draft.turn, faction: action.faction, message: `Took ${dominance.name} from the available dominance cards.` });
      });
    case 'system.playDominance':
      return produce(state, draft => {
        if (draft.dominance) return; // already claimed
        if (draft.phase !== 'daylight' || draft.factionOrder[draft.activeIndex] !== action.faction) return;
        if ((draft.scores[action.faction] ?? 0) < 10) return;
        const card = getCard(action.cardId);
        if (card.category !== 'dominance') return;
        // Card must be in the player's hand.
        const handIdx = draft.hands[action.faction].indexOf(action.cardId);
        if (handIdx < 0) return;
        draft.hands[action.faction].splice(handIdx, 1);
        // Activated cards remain face-up in the dominance area.
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
      const counterPrompt = state.pendingPrompts.find(p => p.kind === 'combat.attackerCounterAmbush');
      const activePrompt = prompt ?? counterPrompt;
      if (!activePrompt || activePrompt.faction !== action.faction) return state;
      const card = getCard(action.cardId);
      if (card.category !== 'ambush') return state;
      if (!(state.hands[action.faction] ?? []).includes(action.cardId)) return state;
      // The ambush card must match the clearing's suit (or be a bird).
      const params = activePrompt.payload as { clearing: number };
      const validIds = defenderAmbushOptions(state, params.clearing, action.faction);
      if (!validIds.includes(action.cardId)) return state;
      if (activePrompt.kind === 'combat.attackerCounterAmbush') {
        return resolveCounterAmbushPrompt(state, { playedCard: action.cardId });
      }
      return resolveAmbushPrompt(state, { playedCard: action.cardId });
    }
    case 'combat.skipAmbush': {
      const micePrompt = state.pendingPrompts.find(p => p.kind === 'combat.miceCancel');
      if (micePrompt && micePrompt.faction === action.faction) {
        return resolveMiceCancelPrompt(state, { cancel: false });
      }
      const counterPrompt = state.pendingPrompts.find(p => p.kind === 'combat.attackerCounterAmbush');
      if (counterPrompt && counterPrompt.faction === action.faction) {
        return resolveCounterAmbushPrompt(state, {});
      }
      const prompt = state.pendingPrompts.find(p => p.kind === 'combat.defenderAmbush');
      if (!prompt || prompt.faction !== action.faction) return state;
      return resolveAmbushPrompt(state, {});
    }
    case 'combat.chooseOptional': {
      return resolveOptionalEffectPrompt(state, {
        faction: action.faction,
        effect: action.effect,
        use: action.use,
      });
    }
    case 'combat.chooseRemovalPieces': {
      return resolveRemovalPiecesPrompt(state, {
        faction: action.faction,
        side: action.side,
        pieceIds: action.pieceIds,
      });
    }
    case 'combat.resolveFieldHospitals': {
      return resolveFieldHospitalsPrompt(state, {
        faction: action.faction,
        cardId: action.cardId,
      });
    }
    case 'system.resolveOutrage':
      return produce(state, draft => {
        const o = draft.pendingOutrage;
        if (!o) return;
        const al = draft.factions.alliance;
        const triggerLabel = o.trigger === 'sympathyRemoved'
          ? 'sympathy was removed'
          : 'warriors entered sympathy';
        if (action.cardId) {
          // Moving faction pays a matching card to Alliance supporters
          const idx = draft.hands[o.faction].indexOf(action.cardId);
          if (idx < 0) return;
          draft.hands[o.faction].splice(idx, 1);
          if (al) al.supporters.push(action.cardId);
          else discardCard(draft, action.cardId);
          draft.log.push({ turn: draft.turn, faction: o.faction, message: `Outrage (${triggerLabel}): gave ${getCard(action.cardId).name} to Alliance supporters.` });
        } else {
          // No matching card — reveal hand to Alliance, then Alliance draws
          const reveal = draft.hands[o.faction].map((id) => getCard(id).name);
          draft.log.push({
            turn: draft.turn,
            faction: o.faction,
            message: reveal.length > 0
              ? `Outrage (${triggerLabel}): revealed hand to Alliance (${reveal.join(', ')}).`
              : `Outrage (${triggerLabel}): revealed an empty hand to Alliance.`,
          });
          if (al && draft.deck.length > 0) {
            const drawn = draft.deck.pop()!;
            al.supporters.push(drawn);
            draft.log.push({ turn: draft.turn, faction: o.faction, message: `Outrage: no matching card — Alliance drew a supporter from the deck.` });
          }
        }
        const queued = draft.pendingOutrageQueue ?? [];
        draft.pendingOutrage = queued.shift();
        draft.pendingOutrageQueue = queued.length > 0 ? queued : undefined;
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

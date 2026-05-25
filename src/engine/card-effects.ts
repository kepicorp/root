// Shared persistent-card actions and reducer.
// Any faction can hold and play these cards from their hand.
// The top-level dispatcher in state.ts routes action kinds starting with
// 'card.' here before the per-faction reducers.

import { produce } from 'immer';
import type { GameState, Faction, Action } from './types';
import type { CardId } from './cards';
import { getCard } from './cards';
import { activeFaction } from './loop';
import { AUTUMN_MAP } from './map';
import { declareBattle, hasCraftedPersistent, returnCraftedToHand, resolveMiceCancelPrompt } from './combat';
import { mulberry32 } from './rng';

// ─── Action types ────────────────────────────────────────────────────────────

export type CardAction =
  // Birdsong (hand)
  | { kind: 'card.royalClaim';       faction: Faction; cardId: CardId }
  | { kind: 'card.standAndDeliver';  faction: Faction; cardId: CardId; target: Faction }
  | { kind: 'card.betterBurrowBank'; faction: Faction; cardId: CardId; target: Faction }
  // Daylight (hand)
  | { kind: 'card.taxCollector';     faction: Faction; cardId: CardId; clearing: number }
  | { kind: 'card.commandWarren';    faction: Faction; cardId: CardId; clearing: number; defender: Faction }
  | { kind: 'card.codebreakers';     faction: Faction; cardId: CardId; target: Faction }
  // Evening (hand)
  | { kind: 'card.cobbler';          faction: Faction; cardId: CardId; from: number; to: number; count: number }
  // Crafted-persistent activations
  | { kind: 'card.hiddenWarrens';    faction: Faction; cardId: CardId; from: number; to: number; count: number }
  | { kind: 'card.featherRufflers';  faction: Faction; cardId: CardId; clearing: number }
  | { kind: 'card.riversteads';      faction: Faction; cardId: CardId }
  | { kind: 'card.supplyTrain';      faction: Faction; cardId: CardId; from: number; to: number; count: number }
  | { kind: 'card.raidingParty';     faction: Faction; cardId: CardId; clearing: number; defender: Faction }
  | { kind: 'card.standardBearer';   faction: Faction; cardId: CardId; clearing: number; defender: Faction }
  | { kind: 'card.tactician';        faction: Faction; cardId: CardId; from: number; to: number; count: number }
  | { kind: 'card.miceInABush';      faction: Faction; cardId: CardId }
  | { kind: 'card.squires';          faction: Faction; cardId: CardId; spendCard: CardId }
  | { kind: 'card.friendWildcard';   faction: Faction; cardId: CardId; targetCard: CardId }
  | { kind: 'card.spyNetwork';       faction: Faction; cardId: CardId; giveCard: CardId; target: Faction; takeCardId: CardId }
  | { kind: 'card.shadowCouncil';    faction: Faction; cardId: CardId; spendCard: CardId; clearing: number; forceDefender: Faction }
  | { kind: 'card.apprenticeCraft';  faction: Faction; cardId: CardId; craftCardId: CardId }
  | { kind: 'card.silverTongue';     faction: Faction; cardId: CardId; from: number; to: number; count: number }
  | { kind: 'card.brazenDemagogue';  faction: Faction; cardId: CardId; spendCard: CardId; takeDominance: CardId };

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Draw one card for `faction`, reshuffling the discard when the deck is empty. */
function drawCard(draft: GameState, faction: Faction): void {
  if (draft.deck.length === 0 && draft.discard.length > 0) {
    // Reshuffle — use a sub-seed so the shuffle is deterministic.
    const rng = mulberry32(draft.seed + draft.rngStep * 997);
    draft.rngStep++;
    const shuffled = [...draft.discard].sort(() => rng() - 0.5);
    draft.deck = shuffled;
    draft.discard = [];
    draft.log.push({ turn: draft.turn, faction: 'system', message: 'Deck reshuffled from discard.' });
  }
  const c = draft.deck.pop();
  if (c) draft.hands[faction].push(c);
}

function hasCard(state: GameState, faction: Faction, cardId: CardId): boolean {
  return (state.hands[faction] ?? []).includes(cardId);
}

function discard(draft: GameState, faction: Faction, cardId: CardId): void {
  const hand = draft.hands[faction];
  const idx = hand.indexOf(cardId);
  if (idx >= 0) { hand.splice(idx, 1); draft.discard.push(cardId); }
}

/** True if `faction` rules clearing `id` (more warriors+buildings than every other faction).
 *  Per §2.5: tokens and pawns do not count. */
function factionRules(state: GameState, faction: Faction, id: number): boolean {
  const cl = state.map.clearings[id];
  if (!cl) return false;
  const score = (f: string) =>
    ((cl.warriors as Record<string, number | undefined>)[f] ?? 0)
    + cl.buildings.filter(b => b.faction === f).length;
  const mine = score(faction);
  if (mine <= 0) return false;
  for (const other of ['marquise', 'eyrie', 'alliance', 'vagabond'] as const) {
    if (other === faction) continue;
    if (score(other) >= mine) return false;
  }
  return true;
}

function adjacent(a: number, b: number): boolean {
  return AUTUMN_MAP.paths.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

function discardCrafted(draft: GameState, faction: Faction, cardId: CardId): void {
  const idx = draft.craftedPersistents.findIndex(e => e.cardId === cardId && e.faction === faction);
  if (idx >= 0) {
    draft.craftedPersistents.splice(idx, 1);
    draft.discard.push(cardId);
  }
}

function getWarriorSupply(state: GameState, faction: Faction): number {
  if (faction === 'marquise') return state.factions.marquise?.warriorSupply ?? 0;
  if (faction === 'eyrie')    return state.factions.eyrie?.warriorSupply    ?? 0;
  if (faction === 'alliance') return state.factions.alliance?.warriorSupply ?? 0;
  return 0;
}

function deductWarriorSupply(draft: GameState, faction: Faction, count: number): void {
  if (faction === 'marquise' && draft.factions.marquise) draft.factions.marquise.warriorSupply -= count;
  else if (faction === 'eyrie' && draft.factions.eyrie)  draft.factions.eyrie.warriorSupply    -= count;
  else if (faction === 'alliance' && draft.factions.alliance) draft.factions.alliance.warriorSupply -= count;
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

export function cardEffectsReducer(state: GameState, action: CardAction): GameState {
  if (activeFaction(state) !== action.faction) return state;
  const { faction } = action;

  switch (action.kind) {

    // ── Royal Claim (birdsong) ────────────────────────────────────────────────
    case 'card.royalClaim': {
      if (state.phase !== 'birdsong') return state;
      if (!hasCard(state, faction, action.cardId)) return state;
      if (getCard(action.cardId).name !== 'Royal Claim') return state;
      const ruled = Object.keys(state.map.clearings)
        .filter(id => factionRules(state, faction, Number(id))).length;
      return produce(state, draft => {
        discard(draft, faction, action.cardId);
        draft.scores[faction] = (draft.scores[faction] ?? 0) + ruled;
        draft.log.push({
          turn: draft.turn, faction,
          message: `Royal Claim: scored ${ruled} VP (rules ${ruled} clearing${ruled !== 1 ? 's' : ''}).`,
        });
      });
    }

    // ── Stand and Deliver! (birdsong) ─────────────────────────────────────────
    case 'card.standAndDeliver': {
      if (state.phase !== 'birdsong') return state;
      if (!hasCard(state, faction, action.cardId)) return state;
      if (getCard(action.cardId).name !== 'Stand and Deliver!') return state;
      const target = action.target;
      if (target === faction) return state;
      const targetHand = state.hands[target] ?? [];
      if (targetHand.length === 0) return state;
      // Pick a random card from the target's hand.
      const rng = mulberry32(state.seed + state.rngStep * 1009);
      const pickedCard = targetHand[Math.floor(rng() * targetHand.length)]!;
      return produce(state, draft => {
        draft.rngStep++;
        discard(draft, faction, action.cardId);
        const tHand = draft.hands[target];
        const idx = tHand.indexOf(pickedCard);
        if (idx >= 0) tHand.splice(idx, 1);
        draft.hands[faction].push(pickedCard);
        draft.scores[target] = (draft.scores[target] ?? 0) + 1;
        draft.log.push({
          turn: draft.turn, faction,
          message: `Stand and Deliver!: took a card from ${target} (they score 1 VP).`,
        });
      });
    }

    // ── Better Burrow Bank (birdsong) ─────────────────────────────────────────
    case 'card.betterBurrowBank': {
      if (state.phase !== 'birdsong') return state;
      const inHand = hasCard(state, faction, action.cardId);
      const isCrafted = state.craftedPersistents.some(e => e.cardId === action.cardId && e.faction === faction);
      if (!inHand && !isCrafted) return state;
      if (getCard(action.cardId).name !== 'Better Burrow Bank') return state;
      const target = action.target;
      if (target === faction) return state;
      return produce(state, draft => {
        if (inHand) discard(draft, faction, action.cardId); // hand version: discard after use
        drawCard(draft, faction);
        drawCard(draft, target);
        draft.log.push({
          turn: draft.turn, faction,
          message: `Better Burrow Bank: ${faction} and ${target} each drew a card.`,
        });
      });
    }

    // ── Tax Collector (daylight) ──────────────────────────────────────────────
    case 'card.taxCollector': {
      if (state.phase !== 'daylight') return state;
      if (!hasCard(state, faction, action.cardId)) return state;
      if (getCard(action.cardId).name !== 'Tax Collector') return state;
      const cl = state.map.clearings[action.clearing];
      if (!cl || (cl.warriors[faction] ?? 0) <= 0) return state;
      return produce(state, draft => {
        // Remove one warrior, return it to supply.
        const w = draft.map.clearings[action.clearing]!.warriors;
        w[faction] = (w[faction] ?? 1) - 1;
        if (w[faction] === 0) delete w[faction];
        const fs = draft.factions[faction];
        if (fs && 'warriorSupply' in fs) (fs as { warriorSupply: number }).warriorSupply++;
        discard(draft, faction, action.cardId);
        drawCard(draft, faction);
        draft.log.push({
          turn: draft.turn, faction,
          message: `Tax Collector: removed warrior from clearing ${action.clearing}, drew a card.`,
        });
      });
    }

    // ── Command Warren (daylight) ─────────────────────────────────────────────
    // Gives one extra free battle (doesn't cost a daylight action).
    case 'card.commandWarren': {
      if (state.phase !== 'daylight') return state;
      if (!hasCard(state, faction, action.cardId)) return state;
      if (getCard(action.cardId).name !== 'Command Warren') return state;
      // Discard the card, then initiate the battle.
      const next = produce(state, draft => {
        discard(draft, faction, action.cardId);
        draft.log.push({
          turn: draft.turn, faction,
          message: `Command Warren: initiating a free battle in clearing ${action.clearing}.`,
        });
      });
      return declareBattle(next, {
        clearing: action.clearing,
        attacker: faction,
        defender: action.defender,
      });
    }

    // ── Codebreakers (daylight) ───────────────────────────────────────────────
    // Peek at a target faction's hand. No hidden information in our pure engine,
    // so we just log the action and discard.
    case 'card.codebreakers': {
      if (state.phase !== 'daylight') return state;
      if (!hasCard(state, faction, action.cardId)) return state;
      if (getCard(action.cardId).name !== 'Codebreakers') return state;
      const target = action.target;
      if (target === faction) return state;
      return produce(state, draft => {
        discard(draft, faction, action.cardId);
        draft.log.push({
          turn: draft.turn, faction,
          message: `Codebreakers: peeked at ${target}'s hand.`,
        });
      });
    }

    // ── Cobbler (evening) ─────────────────────────────────────────────────────
    // Free move at start of evening: discard, move `count` warriors from→to.
    case 'card.cobbler': {
      if (state.phase !== 'evening') return state;
      if (!hasCard(state, faction, action.cardId)) return state;
      if (getCard(action.cardId).name !== 'Cobbler') return state;
      const { from, to, count } = action;
      if (count <= 0) return state;
      if (!adjacent(from, to)) return state;
      const w = state.map.clearings[from]?.warriors[faction] ?? 0;
      if (w < count) return state;
      return produce(state, draft => {
        discard(draft, faction, action.cardId);
        draft.map.clearings[from]!.warriors[faction] = w - count;
        if (draft.map.clearings[from]!.warriors[faction] === 0)
          delete draft.map.clearings[from]!.warriors[faction];
        const dest = draft.map.clearings[to]!;
        dest.warriors[faction] = (dest.warriors[faction] ?? 0) + count;
        draft.log.push({
          turn: draft.turn, faction,
          message: `Cobbler: moved ${count} warrior${count > 1 ? 's' : ''} from clearing ${from} to ${to}.`,
        });
      });
    }

    // ── Hidden Warrens (birdsong, crafted persistent) ─────────────────────────
    // Free move; card returns to hand for reuse next turn.
    case 'card.hiddenWarrens': {
      if (state.phase !== 'birdsong') return state;
      const entry = state.craftedPersistents.find(
        e => e.cardId === action.cardId && e.faction === faction && getCard(e.cardId).name === 'Hidden Warrens',
      );
      if (!entry) return state;
      const { from, to, count } = action;
      if (count <= 0) return state;
      if (!adjacent(from, to)) return state;
      const w = state.map.clearings[from]?.warriors[faction] ?? 0;
      if (w < count) return state;
      return produce(state, draft => {
        draft.map.clearings[from]!.warriors[faction] = w - count;
        if (draft.map.clearings[from]!.warriors[faction] === 0)
          delete draft.map.clearings[from]!.warriors[faction];
        const dest = draft.map.clearings[to]!;
        dest.warriors[faction] = (dest.warriors[faction] ?? 0) + count;
        returnCraftedToHand(draft, faction, action.cardId);
        draft.log.push({
          turn: draft.turn, faction,
          message: `Hidden Warrens: moved ${count} warrior${count > 1 ? 's' : ''} from clearing ${from} to ${to}.`,
        });
      });
    }

    // ── Feather Rufflers (daylight, crafted persistent) ───────────────────────
    // Place up to 2 warriors from supply into a clearing you rule; then discard.
    case 'card.featherRufflers': {
      if (state.phase !== 'daylight') return state;
      const entry = state.craftedPersistents.find(
        e => e.cardId === action.cardId && e.faction === faction && getCard(e.cardId).name === 'Feather Rufflers',
      );
      if (!entry) return state;
      if (!factionRules(state, faction, action.clearing)) return state;
      const supply = getWarriorSupply(state, faction);
      if (supply <= 0) return state;
      const toPlace = Math.min(2, supply);
      return produce(state, draft => {
        const w = draft.map.clearings[action.clearing]!.warriors;
        w[faction] = (w[faction] ?? 0) + toPlace;
        deductWarriorSupply(draft, faction, toPlace);
        discardCrafted(draft, faction, action.cardId);
        draft.log.push({
          turn: draft.turn, faction,
          message: `Feather Rufflers: placed ${toPlace} warrior${toPlace !== 1 ? 's' : ''} in clearing ${action.clearing}.`,
        });
      });
    }

    // ── Riversteads (birdsong, crafted persistent) ────────────────────────────
    // Draw 1 card per river clearing with your warriors; discard the card.
    case 'card.riversteads': {
      if (state.phase !== 'birdsong') return state;
      const entry = state.craftedPersistents.find(
        e => e.cardId === action.cardId && e.faction === faction && getCard(e.cardId).name === 'Riversteads',
      );
      if (!entry) return state;
      const riverClearings = AUTUMN_MAP.clearings.filter(c => c.hasRiver && (state.map.clearings[c.id]?.warriors[faction] ?? 0) > 0);
      return produce(state, draft => {
        for (let i = 0; i < riverClearings.length; i++) drawCard(draft, faction);
        discardCrafted(draft, faction, action.cardId);
        draft.log.push({
          turn: draft.turn, faction,
          message: `Riversteads: drew ${riverClearings.length} card${riverClearings.length !== 1 ? 's' : ''} from ${riverClearings.length} river clearing${riverClearings.length !== 1 ? 's' : ''}.`,
        });
      });
    }

    // ── Supply Train (any phase after a move, crafted persistent) ─────────────
    // Take one extra move to or from lastMoveClearing; return to hand.
    case 'card.supplyTrain': {
      const entry = state.craftedPersistents.find(
        e => e.cardId === action.cardId && e.faction === faction && getCard(e.cardId).name === 'Supply Train',
      );
      if (!entry) return state;
      if (!state.lastMoveClearing) return state;
      const { from, to, count } = action;
      if (count <= 0) return state;
      if (!adjacent(from, to)) return state;
      if (from !== state.lastMoveClearing && to !== state.lastMoveClearing) return state;
      const w = state.map.clearings[from]?.warriors[faction] ?? 0;
      if (w < count) return state;
      return produce(state, draft => {
        draft.map.clearings[from]!.warriors[faction] = w - count;
        if (draft.map.clearings[from]!.warriors[faction] === 0)
          delete draft.map.clearings[from]!.warriors[faction];
        draft.map.clearings[to]!.warriors[faction] = (draft.map.clearings[to]!.warriors[faction] ?? 0) + count;
        draft.lastMoveClearing = to;
        returnCraftedToHand(draft, faction, action.cardId);
        draft.log.push({ turn: draft.turn, faction, message: `Supply Train: moved ${count} from clearing ${from} to ${to}.` });
      });
    }

    // ── Raiding Party (after a move, crafted persistent) ─────────────────────
    // Battle at lastMoveClearing; return to hand.
    case 'card.raidingParty': {
      const entry = state.craftedPersistents.find(
        e => e.cardId === action.cardId && e.faction === faction && getCard(e.cardId).name === 'Raiding Party',
      );
      if (!entry) return state;
      if (!state.lastMoveClearing || action.clearing !== state.lastMoveClearing) return state;
      const cl = state.map.clearings[action.clearing];
      if (!cl || (cl.warriors[faction] ?? 0) === 0) return state;
      const pre = produce(state, draft => {
        returnCraftedToHand(draft, faction, action.cardId);
        draft.log.push({ turn: draft.turn, faction, message: `Raiding Party: initiating battle at clearing ${action.clearing}.` });
      });
      return declareBattle(pre, { clearing: action.clearing, attacker: faction, defender: action.defender });
    }

    // ── Standard Bearer (after a battle, crafted persistent) ─────────────────
    // Battle in the same clearing again; return to hand.
    case 'card.standardBearer': {
      const entry = state.craftedPersistents.find(
        e => e.cardId === action.cardId && e.faction === faction && getCard(e.cardId).name === 'Standard Bearer',
      );
      if (!entry) return state;
      if (!state.lastBattleClearing || action.clearing !== state.lastBattleClearing) return state;
      const cl = state.map.clearings[action.clearing];
      if (!cl || (cl.warriors[faction] ?? 0) === 0) return state;
      const pre = produce(state, draft => {
        returnCraftedToHand(draft, faction, action.cardId);
        draft.log.push({ turn: draft.turn, faction, message: `Standard Bearer: initiating another battle at clearing ${action.clearing}.` });
      });
      return declareBattle(pre, { clearing: action.clearing, attacker: faction, defender: action.defender });
    }

    // ── Tactician (any phase, crafted persistent) ─────────────────────────────
    // Move warriors to a clearing before declaring a battle there; return to hand.
    case 'card.tactician': {
      const entry = state.craftedPersistents.find(
        e => e.cardId === action.cardId && e.faction === faction && getCard(e.cardId).name === 'Tactician',
      );
      if (!entry) return state;
      const { from, to, count } = action;
      if (count <= 0) return state;
      if (!adjacent(from, to)) return state;
      const w = state.map.clearings[from]?.warriors[faction] ?? 0;
      if (w < count) return state;
      return produce(state, draft => {
        draft.map.clearings[from]!.warriors[faction] = w - count;
        if (draft.map.clearings[from]!.warriors[faction] === 0)
          delete draft.map.clearings[from]!.warriors[faction];
        draft.map.clearings[to]!.warriors[faction] = (draft.map.clearings[to]!.warriors[faction] ?? 0) + count;
        returnCraftedToHand(draft, faction, action.cardId);
        draft.log.push({ turn: draft.turn, faction, message: `Tactician: moved ${count} to clearing ${to} before battle.` });
      });
    }

    // ── Mice-in-a-Bush (pending-prompt response) ──────────────────────────────
    // Discard to cancel an incoming battle. Triggered via combat.miceCancel prompt.
    case 'card.miceInABush': {
      const prompt = state.pendingPrompts.find(p => p.kind === 'combat.miceCancel');
      if (!prompt || prompt.faction !== faction) return state;
      const entry = state.craftedPersistents.find(
        e => e.cardId === action.cardId && e.faction === faction && getCard(e.cardId).name === 'Mice-in-a-Bush',
      );
      if (!entry) return state;
      return resolveMiceCancelPrompt(state, { cancel: true });
    }

    // ── Squires (Fox/Mouse/Rabbit, daylight, crafted persistent) ─────────────
    // Spend the squires card OR a matching-suit hand card to gain 1 extra action.
    case 'card.squires': {
      if (state.phase !== 'daylight') return state;
      const entry = state.craftedPersistents.find(
        e => e.cardId === action.cardId && e.faction === faction
          && ['Fox Squires', 'Mouse Squires', 'Rabbit Squires'].includes(getCard(e.cardId).name),
      );
      if (!entry) return state;
      const squireCard = getCard(action.cardId);
      // spendCard is either the squires itself (from craftedPersistents) or a hand card.
      const spendingSquires = action.spendCard === action.cardId;
      if (spendingSquires) {
        // Spending the squires card itself.
      } else {
        // Spending a matching-suit hand card.
        const spendCard = getCard(action.spendCard);
        const neededSuit = squireCard.name === 'Fox Squires' ? 'fox' : squireCard.name === 'Mouse Squires' ? 'mouse' : 'rabbit';
        if (spendCard.suit !== neededSuit && spendCard.suit !== 'bird') return state;
        if (!hasCard(state, faction, action.spendCard)) return state;
      }
      return produce(state, draft => {
        if (spendingSquires) {
          discardCrafted(draft, faction, action.cardId);
        } else {
          discard(draft, faction, action.spendCard);
        }
        const fs = draft.factions;
        if (faction === 'marquise' && fs.marquise) fs.marquise.daylightActionsLeft += 1;
        else if (faction === 'eyrie' && fs.eyrie) { /* Eyrie uses decree, grant doesn't map cleanly */ }
        else if (faction === 'alliance' && fs.alliance) fs.alliance.daylightActionsLeft += 1;
        draft.log.push({ turn: draft.turn, faction, message: `${squireCard.name}: gained 1 extra action.` });
      });
    }

    // ── Friend of X (any phase, crafted persistent) ───────────────────────────
    // Mark one matching-suit hand card as a wildcard (any suit) for one action.
    case 'card.friendWildcard': {
      const entry = state.craftedPersistents.find(
        e => e.cardId === action.cardId && e.faction === faction
          && ['Friend of the Foxes', 'Friend of the Mice', 'Friend of the Rabbits'].includes(getCard(e.cardId).name),
      );
      if (!entry) return state;
      if (state.wildCard) return state; // already used this turn
      const friendCard = getCard(action.cardId);
      const neededSuit = friendCard.name === 'Friend of the Foxes' ? 'fox'
        : friendCard.name === 'Friend of the Mice' ? 'mouse' : 'rabbit';
      const targetCard = getCard(action.targetCard);
      if (targetCard.suit !== neededSuit) return state;
      if (!hasCard(state, faction, action.targetCard)) return state;
      return produce(state, draft => {
        draft.wildCard = action.targetCard;
        draft.log.push({ turn: draft.turn, faction, message: `${friendCard.name}: treating ${targetCard.name} as any suit this turn.` });
      });
    }

    // ── Spy Network (daylight, crafted persistent) ────────────────────────────
    // Give a hand card to an enemy; take one of their crafted persistents.
    case 'card.spyNetwork': {
      if (state.phase !== 'daylight') return state;
      const entry = state.craftedPersistents.find(
        e => e.cardId === action.cardId && e.faction === faction && getCard(e.cardId).name === 'Spy Network',
      );
      if (!entry) return state;
      if (!hasCard(state, faction, action.giveCard)) return state;
      const targetEntry = state.craftedPersistents.find(
        e => e.cardId === action.takeCardId && e.faction === action.target,
      );
      if (!targetEntry) return state;
      return produce(state, draft => {
        // Move giveCard from our hand to target's hand.
        const gi = draft.hands[faction].indexOf(action.giveCard);
        if (gi >= 0) { draft.hands[faction].splice(gi, 1); draft.hands[action.target].push(action.giveCard); }
        // Take target's crafted persistent into our play area.
        const ti = draft.craftedPersistents.findIndex(e => e.cardId === action.takeCardId && e.faction === action.target);
        if (ti >= 0) {
          draft.craftedPersistents.splice(ti, 1);
          draft.craftedPersistents.push({ faction, cardId: action.takeCardId });
        }
        draft.log.push({
          turn: draft.turn, faction,
          message: `Spy Network: gave ${getCard(action.giveCard).name} to ${action.target}, took their ${getCard(action.takeCardId).name}.`,
        });
      });
    }

    // ── Shadow Council (birdsong, crafted persistent) ─────────────────────────
    // Spend a card; force an enemy to battle in a clearing you rule.
    case 'card.shadowCouncil': {
      if (state.phase !== 'birdsong') return state;
      const entry = state.craftedPersistents.find(
        e => e.cardId === action.cardId && e.faction === faction && getCard(e.cardId).name === 'Shadow Council',
      );
      if (!entry) return state;
      if (!hasCard(state, faction, action.spendCard)) return state;
      if (!factionRules(state, faction, action.clearing)) return state;
      const cl = state.map.clearings[action.clearing];
      if (!cl || (cl.warriors[action.forceDefender] ?? 0) === 0) return state;
      const pre = produce(state, draft => {
        discard(draft, faction, action.spendCard);
        draft.log.push({ turn: draft.turn, faction, message: `Shadow Council: forced ${action.forceDefender} to battle in clearing ${action.clearing}.` });
      });
      // The forced faction attacks someone in that clearing (us if we're there, otherwise first enemy).
      return declareBattle(pre, { clearing: action.clearing, attacker: action.forceDefender, defender: faction });
    }

    // ── Apprentice (birdsong, crafted persistent) ─────────────────────────────
    // Craft any one card from hand for free; if successful draw a card.
    case 'card.apprenticeCraft': {
      if (state.phase !== 'birdsong') return state;
      const entry = state.craftedPersistents.find(
        e => e.cardId === action.cardId && e.faction === faction && getCard(e.cardId).name === 'Apprentice',
      );
      if (!entry) return state;
      if (!hasCard(state, faction, action.craftCardId)) return state;
      const craftCard = getCard(action.craftCardId);
      if (craftCard.category !== 'item' && craftCard.category !== 'persistent' && craftCard.category !== 'favor') return state;
      return produce(state, draft => {
        // Remove from hand.
        const hi = draft.hands[faction].indexOf(action.craftCardId);
        if (hi >= 0) draft.hands[faction].splice(hi, 1);
        // Apply crafting effect (same as each faction's craft handler).
        if (craftCard.craftVp) draft.scores[faction] = (draft.scores[faction] ?? 0) + craftCard.craftVp;
        if (craftCard.item) draft.itemSupply.push(craftCard.item);
        if (craftCard.category === 'persistent') draft.craftedPersistents.push({ faction, cardId: action.craftCardId });
        else draft.discard.push(action.craftCardId);
        // Draw a card for successful craft.
        drawCard(draft, faction);
        draft.log.push({ turn: draft.turn, faction, message: `Apprentice: crafted ${craftCard.name} for free and drew a card.` });
      });
    }

    // ── Silver-Tongue (any phase, crafted persistent) ─────────────────────────
    // Once per turn: free partial move (up to 2 warriors); return to hand.
    case 'card.silverTongue': {
      const entry = state.craftedPersistents.find(
        e => e.cardId === action.cardId && e.faction === faction && getCard(e.cardId).name === 'Silver-Tongue',
      );
      if (!entry) return state;
      const { from, to, count } = action;
      if (count <= 0 || count > 2) return state;
      if (!adjacent(from, to)) return state;
      const w = state.map.clearings[from]?.warriors[faction] ?? 0;
      if (w < count) return state;
      return produce(state, draft => {
        draft.map.clearings[from]!.warriors[faction] = w - count;
        if (draft.map.clearings[from]!.warriors[faction] === 0)
          delete draft.map.clearings[from]!.warriors[faction];
        draft.map.clearings[to]!.warriors[faction] = (draft.map.clearings[to]!.warriors[faction] ?? 0) + count;
        returnCraftedToHand(draft, faction, action.cardId);
        draft.log.push({ turn: draft.turn, faction, message: `Silver-Tongue: moved ${count} from clearing ${from} to ${to}.` });
      });
    }

    // ── Brazen Demagogue (evening, crafted persistent) ────────────────────────
    // Discard a matching-suit card and take a dominance card from the deck or discard pile.
    case 'card.brazenDemagogue': {
      if (state.phase !== 'evening') return state;
      const entry = state.craftedPersistents.find(
        e => e.cardId === action.cardId && e.faction === faction && getCard(e.cardId).name === 'Brazen Demagogue',
      );
      if (!entry) return state;
      if (!hasCard(state, faction, action.spendCard)) return state;
      // takeDominance must be a dominance card found in the deck or discard.
      const inDeck = state.deck.includes(action.takeDominance);
      const inDiscard = state.discard.includes(action.takeDominance);
      if (!inDeck && !inDiscard) return state;
      const spendCardData = getCard(action.spendCard);
      if (spendCardData.suit !== 'fox' && spendCardData.suit !== 'bird') return state;
      return produce(state, draft => {
        discard(draft, faction, action.spendCard);
        // Remove the dominance card from deck or discard and give it to the player.
        const deckIdx = draft.deck.indexOf(action.takeDominance);
        if (deckIdx >= 0) {
          draft.deck.splice(deckIdx, 1);
        } else {
          const discardIdx = draft.discard.indexOf(action.takeDominance);
          if (discardIdx >= 0) draft.discard.splice(discardIdx, 1);
        }
        draft.hands[faction].push(action.takeDominance);
        draft.log.push({ turn: draft.turn, faction, message: `Brazen Demagogue: discarded ${spendCardData.name} to take a dominance card.` });
      });
    }

    default:
      return state;
  }
}

// ─── Legal actions ────────────────────────────────────────────────────────────

/** Returns all legal card-effect actions for the active faction. */
export function cardEffectLegalActions(state: GameState): Action[] {
  if (state.phase === 'setup' || state.phase === 'gameOver') return [];
  const faction = activeFaction(state);
  const hand = state.hands[faction] ?? [];
  const others = state.factionOrder.filter(f => f !== faction);
  const out: Action[] = [];

  for (const cardId of hand) {
    const card = getCard(cardId);

    // ── Birdsong ──────────────────────────────────────────────────────────────
    if (state.phase === 'birdsong') {
      if (card.name === 'Royal Claim') {
        out.push({ kind: 'card.royalClaim', faction, cardId });
      }
      if (card.name === 'Stand and Deliver!' && others.some(f => (state.hands[f]?.length ?? 0) > 0)) {
        for (const target of others) {
          if ((state.hands[target]?.length ?? 0) > 0)
            out.push({ kind: 'card.standAndDeliver', faction, cardId, target });
        }
      }
      if (card.name === 'Better Burrow Bank') {
        for (const target of others)
          out.push({ kind: 'card.betterBurrowBank', faction, cardId, target });
      }
    }

    // ── Daylight ──────────────────────────────────────────────────────────────
    if (state.phase === 'daylight') {
      if (card.name === 'Tax Collector') {
        for (const [id, cl] of Object.entries(state.map.clearings)) {
          if ((cl.warriors[faction] ?? 0) > 0)
            out.push({ kind: 'card.taxCollector', faction, cardId, clearing: Number(id) });
        }
      }
      if (card.name === 'Command Warren') {
        // One action per possible battle (each adjacent enemy with warriors).
        for (const cl of AUTUMN_MAP.clearings) {
          const cs = state.map.clearings[cl.id];
          if (!cs) continue;
          if ((cs.warriors[faction] ?? 0) === 0) continue; // must have warriors here
          for (const defender of others) {
            const defPieces =
              (cs.warriors[defender] ?? 0)
              + cs.buildings.filter(b => b.faction === defender).length
              + cs.tokens.filter(t => t.faction === defender).length;
            if (defPieces > 0)
              out.push({ kind: 'card.commandWarren', faction, cardId, clearing: cl.id, defender });
          }
        }
      }
      if (card.name === 'Codebreakers') {
        for (const target of others)
          out.push({ kind: 'card.codebreakers', faction, cardId, target });
      }
    }

    // ── Evening ───────────────────────────────────────────────────────────────
    if (state.phase === 'evening' && card.name === 'Cobbler') {
      for (const cl of AUTUMN_MAP.clearings) {
        const w = state.map.clearings[cl.id]?.warriors[faction] ?? 0;
        if (w === 0) continue;
        for (const adj of AUTUMN_MAP.paths) {
          const other = adj[0] === cl.id ? adj[1] : adj[1] === cl.id ? adj[0] : null;
          if (other == null) continue;
          for (let cnt = 1; cnt <= w; cnt++) {
            out.push({ kind: 'card.cobbler', faction, cardId, from: cl.id, to: other, count: cnt });
          }
        }
      }
    }
  }

  // ── Crafted-persistent activations ─────────────────────────────────────────

  // Better Burrow Bank (crafted): reusable each birdsong — stays in play.
  if (state.phase === 'birdsong') {
    const bbbId = hasCraftedPersistent(state, faction, 'Better Burrow Bank');
    if (bbbId) {
      for (const target of others)
        out.push({ kind: 'card.betterBurrowBank', faction, cardId: bbbId as CardId, target });
    }
  }

  // Hidden Warrens: free move in birdsong; card returns to hand after use.
  if (state.phase === 'birdsong') {
    const hwId = hasCraftedPersistent(state, faction, 'Hidden Warrens');
    if (hwId) {
      for (const cl of AUTUMN_MAP.clearings) {
        const w = state.map.clearings[cl.id]?.warriors[faction] ?? 0;
        if (w === 0) continue;
        for (const path of AUTUMN_MAP.paths) {
          const other = path[0] === cl.id ? path[1] : path[1] === cl.id ? path[0] : null;
          if (other == null) continue;
          for (let cnt = 1; cnt <= w; cnt++) {
            out.push({ kind: 'card.hiddenWarrens', faction, cardId: hwId as CardId, from: cl.id, to: other, count: cnt });
          }
        }
      }
    }
  }

  // Feather Rufflers: place 2 warriors in any ruling clearing during daylight; discard.
  if (state.phase === 'daylight') {
    const frId = hasCraftedPersistent(state, faction, 'Feather Rufflers');
    if (frId && getWarriorSupply(state, faction) > 0) {
      for (const id of Object.keys(state.map.clearings)) {
        if (factionRules(state, faction, Number(id))) {
          out.push({ kind: 'card.featherRufflers', faction, cardId: frId as CardId, clearing: Number(id) });
        }
      }
    }
  }

  // Riversteads: draw cards per river clearing with warriors (birdsong).
  if (state.phase === 'birdsong') {
    const rsId = hasCraftedPersistent(state, faction, 'Riversteads');
    if (rsId) {
      const hasRiverWarriors = AUTUMN_MAP.clearings.some(c => c.hasRiver && (state.map.clearings[c.id]?.warriors[faction] ?? 0) > 0);
      if (hasRiverWarriors) out.push({ kind: 'card.riversteads', faction, cardId: rsId as CardId });
    }
  }

  // Supply Train: extra move to/from lastMoveClearing (any phase while lastMove is set).
  if (state.lastMoveClearing !== undefined) {
    const stId = hasCraftedPersistent(state, faction, 'Supply Train');
    if (stId) {
      const dest = state.lastMoveClearing;
      // Moves originating FROM dest.
      for (const path of AUTUMN_MAP.paths) {
        const other = path[0] === dest ? path[1] : path[1] === dest ? path[0] : null;
        if (other == null) continue;
        const w = state.map.clearings[dest]?.warriors[faction] ?? 0;
        for (let cnt = 1; cnt <= w; cnt++)
          out.push({ kind: 'card.supplyTrain', faction, cardId: stId as CardId, from: dest, to: other, count: cnt });
        // Moves going TO dest from other clearing.
        const w2 = state.map.clearings[other]?.warriors[faction] ?? 0;
        for (let cnt = 1; cnt <= w2; cnt++)
          out.push({ kind: 'card.supplyTrain', faction, cardId: stId as CardId, from: other, to: dest, count: cnt });
      }
    }
  }

  // Raiding Party: battle at lastMoveClearing.
  if (state.lastMoveClearing !== undefined) {
    const rpId = hasCraftedPersistent(state, faction, 'Raiding Party');
    if (rpId) {
      const dest = state.lastMoveClearing;
      const cl = state.map.clearings[dest];
      if (cl && (cl.warriors[faction] ?? 0) > 0) {
        for (const f of state.factionOrder.filter(f2 => f2 !== faction)) {
          if ((cl.warriors[f] ?? 0) > 0 || cl.buildings.some(b => b.faction === f) || cl.tokens.some(t => t.faction === f))
            out.push({ kind: 'card.raidingParty', faction, cardId: rpId as CardId, clearing: dest, defender: f });
        }
      }
    }
  }

  // Standard Bearer: battle in lastBattleClearing again.
  if (state.lastBattleClearing !== undefined) {
    const sbId = hasCraftedPersistent(state, faction, 'Standard Bearer');
    if (sbId) {
      const cl2 = state.map.clearings[state.lastBattleClearing];
      if (cl2 && (cl2.warriors[faction] ?? 0) > 0) {
        for (const f of state.factionOrder.filter(f2 => f2 !== faction)) {
          if ((cl2.warriors[f] ?? 0) > 0 || cl2.buildings.some(b => b.faction === f) || cl2.tokens.some(t => t.faction === f))
            out.push({ kind: 'card.standardBearer', faction, cardId: sbId as CardId, clearing: state.lastBattleClearing, defender: f });
        }
      }
    }
  }

  // Tactician: free pre-battle move (any adjacent move).
  {
    const tacId = hasCraftedPersistent(state, faction, 'Tactician');
    if (tacId) {
      for (const cl of AUTUMN_MAP.clearings) {
        const w = state.map.clearings[cl.id]?.warriors[faction] ?? 0;
        if (w === 0) continue;
        for (const path of AUTUMN_MAP.paths) {
          const other = path[0] === cl.id ? path[1] : path[1] === cl.id ? path[0] : null;
          if (other == null) continue;
          for (let cnt = 1; cnt <= w; cnt++)
            out.push({ kind: 'card.tactician', faction, cardId: tacId as CardId, from: cl.id, to: other, count: cnt });
        }
      }
    }
  }

  // Squires: gain 1 extra daylight action by spending squires or a matching-suit card.
  if (state.phase === 'daylight') {
    for (const squireName of ['Fox Squires', 'Mouse Squires', 'Rabbit Squires'] as const) {
      const sqId = hasCraftedPersistent(state, faction, squireName);
      if (!sqId) continue;
      const squireSuit = squireName === 'Fox Squires' ? 'fox' : squireName === 'Mouse Squires' ? 'mouse' : 'rabbit';
      // Spend the squires itself.
      out.push({ kind: 'card.squires', faction, cardId: sqId as CardId, spendCard: sqId as CardId });
      // Spend a matching-suit hand card.
      for (const hid of (state.hands[faction] ?? [])) {
        const hc = getCard(hid);
        if (hc.suit === squireSuit || hc.suit === 'bird')
          out.push({ kind: 'card.squires', faction, cardId: sqId as CardId, spendCard: hid });
      }
    }
  }

  // Friend of X: mark a matching-suit hand card as wildcard.
  if (!state.wildCard) {
    for (const friendName of ['Friend of the Foxes', 'Friend of the Mice', 'Friend of the Rabbits'] as const) {
      const fId = hasCraftedPersistent(state, faction, friendName);
      if (!fId) continue;
      const neededSuit = friendName === 'Friend of the Foxes' ? 'fox' : friendName === 'Friend of the Mice' ? 'mouse' : 'rabbit';
      for (const hid of (state.hands[faction] ?? [])) {
        if (getCard(hid).suit === neededSuit)
          out.push({ kind: 'card.friendWildcard', faction, cardId: fId as CardId, targetCard: hid });
      }
    }
  }

  // Spy Network: give a hand card, take an enemy's crafted persistent.
  if (state.phase === 'daylight') {
    const snId = hasCraftedPersistent(state, faction, 'Spy Network');
    if (snId && (state.hands[faction] ?? []).length > 0) {
      for (const target of others) {
        for (const ep of state.craftedPersistents.filter(e => e.faction === target)) {
          for (const giveId of (state.hands[faction] ?? [])) {
            out.push({ kind: 'card.spyNetwork', faction, cardId: snId as CardId, giveCard: giveId, target, takeCardId: ep.cardId });
          }
        }
      }
    }
  }

  // Shadow Council: birdsong — spend a card, force an enemy to battle in a clearing you rule.
  if (state.phase === 'birdsong') {
    const scId = hasCraftedPersistent(state, faction, 'Shadow Council');
    if (scId) {
      for (const spendId of (state.hands[faction] ?? [])) {
        for (const id of Object.keys(state.map.clearings)) {
          const cid = Number(id);
          if (!factionRules(state, faction, cid)) continue;
          const cl = state.map.clearings[cid]!;
          for (const target of others) {
            if ((cl.warriors[target] ?? 0) > 0)
              out.push({ kind: 'card.shadowCouncil', faction, cardId: scId as CardId, spendCard: spendId, clearing: cid, forceDefender: target });
          }
        }
      }
    }
  }

  // Apprentice: birdsong — craft a hand card for free, draw a card.
  if (state.phase === 'birdsong') {
    const apId = hasCraftedPersistent(state, faction, 'Apprentice');
    if (apId) {
      for (const hid of (state.hands[faction] ?? [])) {
        const hc = getCard(hid);
        if (hc.category === 'item' || hc.category === 'persistent' || hc.category === 'favor')
          out.push({ kind: 'card.apprenticeCraft', faction, cardId: apId as CardId, craftCardId: hid });
      }
    }
  }

  // Silver-Tongue: any phase — free move up to 2 warriors, return to hand.
  {
    const stlId = hasCraftedPersistent(state, faction, 'Silver-Tongue');
    if (stlId) {
      for (const cl of AUTUMN_MAP.clearings) {
        const w = state.map.clearings[cl.id]?.warriors[faction] ?? 0;
        if (w === 0) continue;
        for (const path of AUTUMN_MAP.paths) {
          const other = path[0] === cl.id ? path[1] : path[1] === cl.id ? path[0] : null;
          if (other == null) continue;
          for (let cnt = 1; cnt <= Math.min(w, 2); cnt++)
            out.push({ kind: 'card.silverTongue', faction, cardId: stlId as CardId, from: cl.id, to: other, count: cnt });
        }
      }
    }
  }

  // Brazen Demagogue: evening — discard a fox card, take a dominance card from deck/discard.
  if (state.phase === 'evening') {
    const bdId = hasCraftedPersistent(state, faction, 'Brazen Demagogue');
    if (bdId) {
      const availDominance = [...state.deck, ...state.discard].filter(id => getCard(id).category === 'dominance');
      if (availDominance.length > 0) {
        for (const hid of (state.hands[faction] ?? [])) {
          const hc = getCard(hid);
          if (hc.suit === 'fox' || hc.suit === 'bird') {
            for (const domId of availDominance)
              out.push({ kind: 'card.brazenDemagogue', faction, cardId: bdId as CardId, spendCard: hid, takeDominance: domId });
          }
        }
      }
    }
  }

  return out;
}

// Shared deck (54 cards) for the base game.
//
// Each card is data only — what it *does* lives in the faction or shared
// effect modules. The deck composition mirrors the standard base-game
// distribution closely; effect implementations are stubbed for now and
// filled in by later phases (per-faction crafted items, persistent effects).

import type { CardSuit } from './types';

export type CardId = string;

export type CardCategory =
  | 'ambush'        // playable as defender (or attacker counter) in combat
  | 'dominance'    // separate from main deck; placed face-up to score
  | 'item'         // crafted into the shared item supply
  | 'persistent'   // remains in play with ongoing effect
  | 'immediate'    // one-shot effect, then discarded
  | 'favor';       // "favor of the X" — remove all non-X warriors

export type CraftItem =
  | 'sword'
  | 'hammer'
  | 'crossbow'
  | 'boots'
  | 'bag'
  | 'tea'
  | 'coin'
  | 'torch';

export interface Card {
  id: CardId;
  name: string;
  suit: CardSuit;
  category: CardCategory;
  /** Suit cost to craft (e.g. {fox: 1, rabbit: 1}). Empty for non-craftable. */
  craftCost: Partial<Record<CardSuit, number>>;
  /** VP gained when crafted (items use the supply token value instead). */
  craftVp?: number;
  /** Item produced when this is a craft-an-item card. */
  item?: CraftItem;
}

// ─── Card definitions ───────────────────────────────────────────────────────

let _id = 0;
const card = (
  name: string,
  suit: CardSuit,
  category: CardCategory,
  craftCost: Partial<Record<CardSuit, number>> = {},
  extra: { craftVp?: number; item?: CraftItem } = {},
): Card => ({ id: `c${++_id}`, name, suit, category, craftCost, ...extra });

const c = (cards: Card[]): Card[] => cards;

// Ambushes — one per suit, played as defender (or attacker counter) in battle.
const ambushes: Card[] = c([
  card('Ambush! (fox)', 'fox', 'ambush'),
  card('Ambush! (mouse)', 'mouse', 'ambush'),
  card('Ambush! (rabbit)', 'rabbit', 'ambush'),
  card('Ambush! (bird)', 'bird', 'ambush'),
]);

// Persistent effects.
const persistents: Card[] = c([
  card('Armorers',           'bird',   'persistent', { rabbit: 1 }),
  card('Armorers',           'bird',   'persistent', { rabbit: 1 }),
  card('Brutal Tactics',     'bird',   'persistent', { fox: 2 }),
  card('Royal Claim',        'bird',   'persistent', { bird: 4 }),
  card('Sappers',            'rabbit', 'persistent', { rabbit: 1 }),
  card('Sappers',            'rabbit', 'persistent', { rabbit: 1 }),
  card('Scouting Party',     'rabbit', 'persistent', { rabbit: 2 }),
  card('Scouting Party',     'rabbit', 'persistent', { rabbit: 2 }),
  card('Codebreakers',       'mouse',  'persistent', { mouse: 1 }),
  card('Codebreakers',       'mouse',  'persistent', { mouse: 1 }),
  card('Tax Collector',      'bird',   'persistent', { fox: 1, mouse: 1, rabbit: 1 }),
  card('Tax Collector',      'bird',   'persistent', { fox: 1, mouse: 1, rabbit: 1 }),
  card('Tax Collector',      'bird',   'persistent', { fox: 1, mouse: 1, rabbit: 1 }),
  card('Cobbler',            'rabbit', 'persistent', { rabbit: 2 }),
  card('Cobbler',            'rabbit', 'persistent', { rabbit: 2 }),
  card('Command Warren',     'bird',   'persistent', { fox: 2 }),
  card('Command Warren',     'bird',   'persistent', { fox: 2 }),
  card('Better Burrow Bank', 'bird',   'persistent', { rabbit: 2 }),
  card('Better Burrow Bank', 'bird',   'persistent', { rabbit: 2 }),
  card('Stand and Deliver!', 'mouse',  'persistent', { mouse: 3 }),
  card('Stand and Deliver!', 'mouse',  'persistent', { mouse: 3 }),
]);

// "Favor of the X" — single, expensive, suit-specific board wipe.
const favors: Card[] = c([
  card('Favor of the Foxes',   'fox',    'favor', { fox: 3 }),
  card('Favor of the Mice',    'mouse',  'favor', { mouse: 3 }),
  card('Favor of the Rabbits', 'rabbit', 'favor', { rabbit: 3 }),
]);

// Item-crafting cards. Crafting produces an item token (1 VP unless noted).
const items: Card[] = c([
  // Swords
  card('Mousefolk Sword',   'mouse',  'item', { mouse: 2 }, { item: 'sword', craftVp: 2 }),
  card('Foxfolk Steel',     'fox',    'item', { fox: 2 },   { item: 'sword', craftVp: 2 }),
  card('Arms Trader',       'fox',    'item', { fox: 2 },   { item: 'sword', craftVp: 2 }),
  card('Sword',             'bird',   'item', { fox: 2 },   { item: 'sword', craftVp: 2 }),
  // Crossbows
  card('Crossbow',          'mouse',  'item', { mouse: 1 }, { item: 'crossbow', craftVp: 1 }),
  card('Crossbow',          'fox',    'item', { fox: 1 },   { item: 'crossbow', craftVp: 1 }),
  // Hammers
  card('Smithy',            'fox',    'item', { fox: 2 },   { item: 'hammer', craftVp: 2 }),
  card('Smithy',            'fox',    'item', { fox: 2 },   { item: 'hammer', craftVp: 2 }),
  // Boots
  card('A Visit to Friends','rabbit', 'item', { rabbit: 1 }, { item: 'boots', craftVp: 1 }),
  card('A Visit to Friends','rabbit', 'item', { rabbit: 1 }, { item: 'boots', craftVp: 1 }),
  card('Travel Gear',       'rabbit', 'item', { rabbit: 1 }, { item: 'boots', craftVp: 1 }),
  card('Travel Gear',       'rabbit', 'item', { rabbit: 1 }, { item: 'boots', craftVp: 1 }),
  // Bags
  card('Gently Used Knapsack','mouse','item', { mouse: 1 }, { item: 'bag', craftVp: 1 }),
  card('Root Tea',          'mouse',  'item', { mouse: 1 }, { item: 'tea', craftVp: 2 }),
  card('Root Tea',          'fox',    'item', { fox: 1 },   { item: 'tea', craftVp: 2 }),
  card('Root Tea',          'rabbit', 'item', { rabbit: 1 }, { item: 'tea', craftVp: 2 }),
  // Coin
  card('Anvil',             'fox',    'item', { fox: 1 },   { item: 'coin', craftVp: 2 }),
  card('Bank Check',        'mouse',  'item', { mouse: 1 }, { item: 'coin', craftVp: 2 }),
  // Torch (everyone starts with one in the supply)
  card('Investments',       'rabbit', 'item', { rabbit: 1 }, { item: 'torch', craftVp: 1 }),
  card('Investments',       'fox',    'item', { fox: 1 },   { item: 'torch', craftVp: 1 }),
  // Mouse-in-a-sack
  card('Mouse-in-a-Sack',   'mouse',  'item', { mouse: 1 }, { item: 'bag', craftVp: 1 }),
]);

const allCards: Card[] = [...ambushes, ...persistents, ...favors, ...items];

// Pad with a few extra bird-suit fillers so we land at exactly 54.
while (allCards.length < 54) {
  allCards.push(card('Royal Decree', 'bird', 'immediate', { bird: 2 }));
}

export const SHARED_DECK: readonly Card[] = allCards;

// ─── Dominance cards (separate from main deck) ──────────────────────────────

const dominanceCards: Card[] = c([
  card('Dominance · Foxes',   'fox',    'dominance'),
  card('Dominance · Mice',    'mouse',  'dominance'),
  card('Dominance · Rabbits', 'rabbit', 'dominance'),
  card('Dominance · Birds',   'bird',   'dominance'),
]);

export const DOMINANCE_CARDS: readonly Card[] = dominanceCards;

// ─── Lookups ────────────────────────────────────────────────────────────────

const byId = new Map<CardId, Card>();
for (const k of [...SHARED_DECK, ...DOMINANCE_CARDS]) byId.set(k.id, k);

export function getCard(id: CardId): Card {
  const k = byId.get(id);
  if (!k) throw new Error(`Unknown card id: ${id}`);
  return k;
}

/** Suits available from cards (used for craft-cost satisfaction). */
export function cardSuit(id: CardId): CardSuit {
  return getCard(id).suit;
}

// Shared deck for the Root base game (October 2025 edition).
// Each card has its suit and craft cost. Effect descriptions live in
// src/engine/card-descriptions.ts so the engine stays data-only.

import type { CardSuit } from './types';

export type CardId = string;

export type CardCategory =
  | 'ambush'        // defender plays in battle to deal 2 immediate hits
  | 'dominance'     // separate deck; place face-up to chase a non-VP win
  | 'item'          // craft to add an item token to the supply
  | 'persistent'    // stays in hand; player activates the effect voluntarily
  | 'immediate'     // one-shot: resolve effect, then discard
  | 'favor';        // craft to remove all non-suit pieces in matching clearings

export type CraftItem =
  | 'sword' | 'hammer' | 'crossbow'
  | 'boots'  | 'bag'    | 'tea'
  | 'coin'   | 'torch';

export interface Card {
  id: CardId;
  name: string;
  suit: CardSuit;
  category: CardCategory;
  /** Suit pips required to craft this card (empty → not craftable / no cost). */
  craftCost: Partial<Record<CardSuit, number>>;
  /** VP awarded on craft (item cards use supply token value instead). */
  craftVp?: number;
  /** Item produced when this is a craft-an-item card. */
  item?: CraftItem;
}

// ─── Builder helpers ─────────────────────────────────────────────────────────

let _id = 0;
const card = (
  name: string,
  suit: CardSuit,
  category: CardCategory,
  craftCost: Partial<Record<CardSuit, number>> = {},
  extra: { craftVp?: number; item?: CraftItem } = {},
): Card => ({ id: `c${++_id}`, name, suit, category, craftCost, ...extra });

// ─── Ambush cards ─────────────────────────────────────────────────────────────
// Defender plays in matching-suit clearing to deal 2 hits immediately.

const ambushes: Card[] = [
  card('Ambush! (fox)',    'fox',    'ambush'),
  card('Ambush! (mouse)',  'mouse',  'ambush'),
  card('Ambush! (rabbit)', 'rabbit', 'ambush'),
  card('Ambush! (bird)',   'bird',   'ambush'),
  card('Ambush! (bird)',   'bird',   'ambush'),  // two bird ambushes per rules §2.1.2
];

// ─── Favor cards ──────────────────────────────────────────────────────────────
// Craft to wipe matching-suit clearings of all non-crafter pieces.

const favors: Card[] = [
  card('Favor of the Foxes',   'fox',    'favor', { fox:    3 }),
  card('Favor of the Mice',    'mouse',  'favor', { mouse:  3 }),
  card('Favor of the Rabbits', 'rabbit', 'favor', { rabbit: 3 }),
];

// ─── Item crafting cards ───────────────────────────────────────────────────────
// Crafting produces an item token worth 1 VP unless craftVp specifies otherwise.

const items: Card[] = [
  // Swords
  card('Foxfolk Steel',        'fox',    'item', { fox:    2 }, { item: 'sword',    craftVp: 2 }),
  card('Arms Trader',          'bird',   'item', { fox:    2 }, { item: 'sword',    craftVp: 2 }),
  card('Sword',                'mouse',  'item', { mouse:  2 }, { item: 'sword',    craftVp: 2 }),
  // Crossbows (both cost fox×1 — confirmed from card images)
  card('Crossbow',             'bird',   'item', { fox:    1 }, { item: 'crossbow', craftVp: 1 }),
  card('Crossbow',             'mouse',  'item', { fox:    1 }, { item: 'crossbow', craftVp: 1 }),
  // Hammers (Anvil gives a hammer token, not coin — confirmed from card image)
  card('Anvil',                'fox',    'item', { fox:    1 }, { item: 'hammer',   craftVp: 2 }),
  // Boots
  card('A Visit to Friends',   'rabbit', 'item', { rabbit: 1 }, { item: 'boots',    craftVp: 1 }),
  card('A Visit to Friends',   'rabbit', 'item', { rabbit: 1 }, { item: 'boots',    craftVp: 1 }),
  card('Travel Gear',          'fox',    'item', { fox:    1 }, { item: 'boots',    craftVp: 1 }),
  card('Travel Gear',          'mouse',  'item', { mouse:  1 }, { item: 'boots',    craftVp: 1 }),
  card('Woodland Runners',     'bird',   'item', { rabbit: 1 }, { item: 'boots',    craftVp: 1 }),
  // Bags
  card('Gently Used Knapsack', 'fox',    'item', { fox:    1 }, { item: 'bag',      craftVp: 1 }),
  card('Mouse-in-a-Sack',      'mouse',  'item', { mouse:  1 }, { item: 'bag',      craftVp: 1 }),
  card('Birdy Bindle',         'bird',   'item', { mouse:  1 }, { item: 'bag',      craftVp: 1 }),
  card("Smuggler's Trail",     'rabbit', 'item', { mouse:  1 }, { item: 'bag',      craftVp: 1 }),
  // Tea
  card('Root Tea',             'rabbit', 'item', { rabbit: 1 }, { item: 'tea',      craftVp: 2 }),
  card('Root Tea',             'fox',    'item', { fox:    1 }, { item: 'tea',      craftVp: 2 }),
  card('Root Tea',             'mouse',  'item', { mouse:  1 }, { item: 'tea',      craftVp: 2 }),
  // Torch
  card('Investments',          'mouse',  'item', { mouse:  1 }, { item: 'torch',    craftVp: 1 }),
  // Coins (craft a coin token for +3 VP)
  card('Bake Sale',            'rabbit', 'item', { rabbit: 2 }, { item: 'coin',     craftVp: 3 }),
  card('Protection Racket',    'fox',    'item', { rabbit: 2 }, { item: 'coin',     craftVp: 3 }),
];

// ─── Persistent effect cards — Base game ──────────────────────────────────────
// These are the confirmed base game persistent cards.

const basePersistents: Card[] = [
  // ── Combat modifiers ──────────────────────────────────────────────────────
  card('Armorers',           'bird',   'persistent', { rabbit: 1 }),   // ×1
  card('Sappers',            'bird',   'persistent', { rabbit: 1 }),   // ×1
  card('Brutal Tactics',     'bird',   'persistent', { fox:    2 }),   // ×2
  card('Brutal Tactics',     'bird',   'persistent', { fox:    2 }),
  card('Scouting Party',     'mouse',  'persistent', { rabbit: 2 }),   // ×1

  // ── Birdsong actions ──────────────────────────────────────────────────────
  card('Royal Claim',        'bird',   'persistent', { bird:   4 }),   // ×3
  card('Royal Claim',        'bird',   'persistent', { bird:   4 }),
  card('Royal Claim',        'bird',   'persistent', { bird:   4 }),
  card('Better Burrow Bank', 'rabbit', 'persistent', { rabbit: 2 }),   // ×2
  card('Better Burrow Bank', 'rabbit', 'persistent', { rabbit: 2 }),
  card('Stand and Deliver!', 'fox',    'persistent', { mouse:  3 }),   // ×2
  card('Stand and Deliver!', 'fox',    'persistent', { mouse:  3 }),

  // ── Daylight actions ──────────────────────────────────────────────────────
  card('Tax Collector',      'fox',    'persistent', { fox: 1, mouse: 1, rabbit: 1 }), // ×2
  card('Tax Collector',      'fox',    'persistent', { fox: 1, mouse: 1, rabbit: 1 }),
  card('Command Warren',     'rabbit', 'persistent', { rabbit: 2 }),   // ×1
  card('Codebreakers',       'mouse',  'persistent', { mouse:  1 }),   // ×1

  // ── Evening action ────────────────────────────────────────────────────────
  card('Cobbler',            'rabbit', 'persistent', { rabbit: 2 }),   // ×1
];

// ─── Persistent effect cards — Squires & Disciples deck ───────────────────────
// Replacement persistent cards for the S&D alternate deck.
// Suits and names match the published Squires & Disciples deck.
// Cards kept in byId so old saved games with legacy IDs still resolve.

const legacyPersistents: Card[] = [
  // These had wrong suits in the original mixed deck — kept for save-game compat.
  card('Hidden Warrens',     'rabbit', 'persistent', { rabbit: 1 }),
  card('Riversteads',        'bird',   'persistent', { bird:   2 }),
  card('Supply Train',       'fox',    'persistent', { fox:    1 }),
  card('Raiding Party',      'fox',    'persistent', { fox:    2 }),
  card('Standard Bearer',    'fox',    'persistent', { fox:    2 }),
  card('Tactician',          'fox',    'persistent', { fox:    1 }),
  card('Bold Leadership',    'bird',   'persistent', { bird:   2 }),
  card('Lookouts',           'rabbit', 'persistent', { rabbit: 1 }),
  card('Mice-in-a-Bush',     'rabbit', 'persistent', { rabbit: 1 }),
  card('Fox Squires',        'fox',    'persistent', { fox:    1 }),
  card('Mouse Squires',      'mouse',  'persistent', { mouse:  1 }),
  card('Rabbit Squires',     'rabbit', 'persistent', { rabbit: 1 }),
  card('Friend of the Foxes',   'fox',    'persistent', { fox: 2 }),
  card('Friend of the Mice',    'mouse',  'persistent', { mouse: 2 }),
  card('Friend of the Rabbits', 'rabbit', 'persistent', { rabbit: 2 }),
  card('Spy Network',        'fox',    'persistent', { fox:    2 }),
  card('Shadow Council',     'fox',    'persistent', { fox:    3 }),
  card('Apprentice',         'bird',   'persistent', { bird:   1 }),
  card('Silver-Tongue',      'fox',    'persistent', { fox:    1 }),
  card('Feather Rufflers',   'fox',    'persistent', { fox:    1 }),
  card('Brazen Demagogue',   'fox',    'persistent', { fox:    2 }),
];

const sdPersistents: Card[] = [
  // ── Bird ──────────────────────────────────────────────────────────────────
  card('Silver-Tongue',      'bird',   'persistent', { bird:   1 }),   // ×1
  card('Shadow Council',     'bird',   'persistent', { bird:   2 }),   // ×1
  card('Feather Rufflers',   'bird',   'persistent', { bird:   1 }),   // ×2
  card('Feather Rufflers',   'bird',   'persistent', { bird:   1 }),
  card('Spy Network',        'bird',   'persistent', { bird:   2 }),   // ×1
  card('Sky Couriers',       'bird',   'persistent', { bird:   1 }),   // ×2
  card('Sky Couriers',       'bird',   'persistent', { bird:   1 }),
  // ── Fox ───────────────────────────────────────────────────────────────────
  card('Bold Leadership',    'fox',    'persistent', { fox:    2 }),   // ×1
  card('Fox Squires',        'fox',    'persistent', { fox:    1 }),   // ×1
  card('Apprentice',         'fox',    'persistent', { fox:    1 }),   // ×1
  card('Tactician',          'fox',    'persistent', { fox:    1 }),   // ×1
  card('Supply Train',       'fox',    'persistent', { fox:    1 }),   // ×1
  card('Friend of the Foxes','fox',    'persistent', { fox:    2 }),   // ×1
  // ── Rabbit ────────────────────────────────────────────────────────────────
  card('Riversteads',        'rabbit', 'persistent', { bird:   2 }),   // ×1
  card('The Faithful',       'rabbit', 'persistent', { rabbit: 1 }),   // ×1
  card('Hidden Warrens',     'rabbit', 'persistent', { rabbit: 1 }),   // ×1
  card('Lookouts',           'rabbit', 'persistent', { rabbit: 1 }),   // ×1
  card('Rabbit Squires',     'rabbit', 'persistent', { rabbit: 1 }),   // ×1
  card('Friend of the Rabbits','rabbit','persistent', { rabbit: 2 }),  // ×1
  card('Standard Bearer',    'rabbit', 'persistent', { rabbit: 2 }),   // ×1
  // ── Mouse ─────────────────────────────────────────────────────────────────
  card('Brazen Demagogue',   'mouse',  'persistent', { fox:    2 }),   // ×1
  card('Raiding Party',      'mouse',  'persistent', { fox:    2 }),   // ×1
  card('Friend of the Mice', 'mouse',  'persistent', { mouse:  2 }),   // ×1
  card('Mice-in-a-Bush',     'mouse',  'persistent', { rabbit: 1 }),   // ×1
  card('Mouse Squires',      'mouse',  'persistent', { mouse:  1 }),   // ×1
];

// Kept for reference; all cards are registered in byId via BASE_SHARED_DECK / SD_SHARED_DECK.
void [...basePersistents, ...legacyPersistents];

// ─── Shared decks ────────────────────────────────────────────────────────────

/** Base game deck (default). */
export const BASE_SHARED_DECK: readonly Card[] = [
  ...ambushes,
  ...favors,
  ...items,
  ...basePersistents,
];

/** Squires & Disciples alternate deck — same ambush/favor/item cards,
 *  persistent cards replaced with the S&D set (corrected suits). */
export const SD_SHARED_DECK: readonly Card[] = [
  ...ambushes,
  ...favors,
  ...items,
  ...sdPersistents,
];

/** Default export — base game deck. */
export const SHARED_DECK: readonly Card[] = BASE_SHARED_DECK;

// ─── Dominance cards (separate pile, not shuffled into the deck) ──────────────

export const DOMINANCE_CARDS: readonly Card[] = [
  card('Dominance · Foxes',   'fox',    'dominance'),
  card('Dominance · Mice',    'mouse',  'dominance'),
  card('Dominance · Rabbits', 'rabbit', 'dominance'),
  card('Dominance · Birds',   'bird',   'dominance'),
];

// ─── Lookups ─────────────────────────────────────────────────────────────────

const byId = new Map<CardId, Card>();
for (const k of [...BASE_SHARED_DECK, ...SD_SHARED_DECK, ...DOMINANCE_CARDS]) byId.set(k.id, k);

export function getCard(id: CardId): Card {
  const k = byId.get(id);
  if (!k) throw new Error(`Unknown card id: ${id}`);
  return k;
}

export function cardSuit(id: CardId): CardSuit { return getCard(id).suit; }

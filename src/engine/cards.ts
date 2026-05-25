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
  // Crossbows
  card('Crossbow',             'bird',   'item', { bird:   1 }, { item: 'crossbow', craftVp: 1 }),
  card('Crossbow',             'mouse',  'item', { mouse:  1 }, { item: 'crossbow', craftVp: 1 }),
  // Hammers
  card('Smithy',               'fox',    'item', { fox:    2 }, { item: 'hammer',   craftVp: 2 }),
  // Boots
  card('A Visit to Friends',   'rabbit', 'item', { rabbit: 1 }, { item: 'boots',    craftVp: 1 }),
  card('A Visit to Friends',   'rabbit', 'item', { rabbit: 1 }, { item: 'boots',    craftVp: 1 }),
  card('Travel Gear',          'fox',    'item', { fox:    1 }, { item: 'boots',    craftVp: 1 }),
  card('Travel Gear',          'mouse',  'item', { mouse:  1 }, { item: 'boots',    craftVp: 1 }),
  // Bags
  card('Gently Used Knapsack', 'fox',    'item', { fox:    1 }, { item: 'bag',      craftVp: 1 }),
  card('Mouse-in-a-Sack',      'mouse',  'item', { mouse:  1 }, { item: 'bag',      craftVp: 1 }),
  // Tea
  card('Root Tea',             'rabbit', 'item', { rabbit: 1 }, { item: 'tea',      craftVp: 2 }),
  card('Root Tea',             'fox',    'item', { fox:    1 }, { item: 'tea',      craftVp: 2 }),
  card('Root Tea',             'mouse',  'item', { mouse:  1 }, { item: 'tea',      craftVp: 2 }),
  // Coin
  card('Anvil',                'fox',    'item', { fox:    1 }, { item: 'coin',     craftVp: 2 }),
  // Torch
  card('Investments',          'mouse',  'item', { mouse:  1 }, { item: 'torch',    craftVp: 1 }),
  card('Investments',          'fox',    'item', { fox:    1 }, { item: 'torch',    craftVp: 1 }),
];

// ─── Persistent effect cards ───────────────────────────────────────────────────
// Held in hand; the owner activates the effect at the specified phase.

const persistents: Card[] = [
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
  card('Hidden Warrens',     'rabbit', 'persistent', { rabbit: 1 }),   // ×1
  card('Riversteads',        'bird',   'persistent', { bird:   2 }),   // ×1

  // ── Daylight actions ──────────────────────────────────────────────────────
  card('Tax Collector',      'fox',    'persistent', { fox: 1, mouse: 1, rabbit: 1 }), // ×2
  card('Tax Collector',      'fox',    'persistent', { fox: 1, mouse: 1, rabbit: 1 }),
  card('Command Warren',     'rabbit', 'persistent', { rabbit: 2 }),   // ×1
  card('Codebreakers',       'mouse',  'persistent', { mouse:  1 }),   // ×1

  // ── Evening action ────────────────────────────────────────────────────────
  card('Cobbler',            'rabbit', 'persistent', { rabbit: 2 }),   // ×1

  // ── Movement helpers (return-to-hand) ─────────────────────────────────────
  card('Supply Train',       'fox',    'persistent', { fox:    1 }),   // ×1
  card('Raiding Party',      'fox',    'persistent', { fox:    2 }),   // ×1
  card('Standard Bearer',    'fox',    'persistent', { fox:    2 }),   // ×1
  card('Tactician',          'fox',    'persistent', { fox:    1 }),   // ×1

  // ── Combat helpers (return-to-hand) ───────────────────────────────────────
  card('Bold Leadership',    'bird',   'persistent', { bird:   2 }),   // ×1
  card('Lookouts',           'rabbit', 'persistent', { rabbit: 1 }),   // ×1
  card('Mice-in-a-Bush',     'rabbit', 'persistent', { rabbit: 1 }),   // ×1

  // ── Suit helpers ──────────────────────────────────────────────────────────
  card('Fox Squires',        'fox',    'persistent', { fox:    1 }),   // ×1
  card('Mouse Squires',      'mouse',  'persistent', { mouse:  1 }),   // ×1
  card('Rabbit Squires',     'rabbit', 'persistent', { rabbit: 1 }),   // ×1
  card('Friend of the Foxes',   'fox',    'persistent', { fox: 2 }),   // ×1
  card('Friend of the Mice',    'mouse',  'persistent', { mouse: 2 }), // ×1
  card('Friend of the Rabbits', 'rabbit', 'persistent', { rabbit: 2 }),// ×1

  // ── Card economy ──────────────────────────────────────────────────────────
  card('Spy Network',        'fox',    'persistent', { fox:    2 }),   // ×1
  card('Shadow Council',     'fox',    'persistent', { fox:    3 }),   // ×1
  card('Apprentice',         'bird',   'persistent', { bird:   1 }),   // ×1

  // ── Special ───────────────────────────────────────────────────────────────
  card('Silver-Tongue',      'fox',    'persistent', { fox:    1 }),   // ×1
  card('Feather Rufflers',   'fox',    'persistent', { fox:    1 }),   // ×1
  card('Brazen Demagogue',   'fox',    'persistent', { fox:    2 }),   // ×1
];

// ─── Shared deck ─────────────────────────────────────────────────────────────

export const SHARED_DECK: readonly Card[] = [
  ...ambushes,
  ...favors,
  ...items,
  ...persistents,
];

// ─── Dominance cards (separate pile, not shuffled into the deck) ──────────────

export const DOMINANCE_CARDS: readonly Card[] = [
  card('Dominance · Foxes',   'fox',    'dominance'),
  card('Dominance · Mice',    'mouse',  'dominance'),
  card('Dominance · Rabbits', 'rabbit', 'dominance'),
  card('Dominance · Birds',   'bird',   'dominance'),
];

// ─── Lookups ─────────────────────────────────────────────────────────────────

const byId = new Map<CardId, Card>();
for (const k of [...SHARED_DECK, ...DOMINANCE_CARDS]) byId.set(k.id, k);

export function getCard(id: CardId): Card {
  const k = byId.get(id);
  if (!k) throw new Error(`Unknown card id: ${id}`);
  return k;
}

export function cardSuit(id: CardId): CardSuit { return getCard(id).suit; }

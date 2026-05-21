// Vagabond quest deck — a small pool of side objectives the Vagabond can
// complete for VP. Completing a quest requires being in a clearing of the
// matching suit and exhausting two specific face-up items.

import type { ItemKind, Suit } from '../../types';

export interface QuestCard {
  id: string;
  suit: Suit;
  item1: ItemKind;
  item2: ItemKind;
  baseVp: number;
}

export const QUEST_DECK: readonly QuestCard[] = Object.freeze([
  { id: 'q-fox-1',    suit: 'fox',    item1: 'sword',  item2: 'torch',    baseVp: 1 },
  { id: 'q-fox-2',    suit: 'fox',    item1: 'boots',  item2: 'bag',      baseVp: 1 },
  { id: 'q-fox-3',    suit: 'fox',    item1: 'coin',   item2: 'crossbow', baseVp: 1 },
  { id: 'q-mouse-1',  suit: 'mouse',  item1: 'torch',  item2: 'tea',      baseVp: 1 },
  { id: 'q-mouse-2',  suit: 'mouse',  item1: 'hammer', item2: 'boots',    baseVp: 1 },
  { id: 'q-mouse-3',  suit: 'mouse',  item1: 'sword',  item2: 'coin',     baseVp: 1 },
  { id: 'q-rabbit-1', suit: 'rabbit', item1: 'bag',    item2: 'crossbow', baseVp: 1 },
  { id: 'q-rabbit-2', suit: 'rabbit', item1: 'tea',    item2: 'hammer',   baseVp: 1 },
  { id: 'q-rabbit-3', suit: 'rabbit', item1: 'sword',  item2: 'torch',    baseVp: 1 },
]);

export const QUEST_DISPLAY_SIZE = 3;

export function getQuest(id: string): QuestCard {
  const q = QUEST_DECK.find(c => c.id === id);
  if (!q) throw new Error(`Unknown quest id: ${id}`);
  return q;
}

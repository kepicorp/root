import { describe, expect, it } from 'vitest';
import { BASE_SHARED_DECK, SD_SHARED_DECK, SHARED_DECK, DOMINANCE_CARDS, getCard } from '../cards';

describe('shared deck', () => {
  it('base deck has 46 confirmed cards', () => {
    expect(BASE_SHARED_DECK.length).toBe(46);
  });

  it('Squires & Disciples deck has exactly 54 cards', () => {
    expect(SD_SHARED_DECK.length).toBe(54);
  });

  it('SHARED_DECK is the base game deck by default', () => {
    expect(SHARED_DECK).toBe(BASE_SHARED_DECK);
  });

  it('has 5 ambush cards: 1 fox, 1 mouse, 1 rabbit, 2 bird (§2.1.2)', () => {
    const ambushes = BASE_SHARED_DECK.filter(c => c.category === 'ambush');
    expect(ambushes.length).toBe(5);
    const birdCount = ambushes.filter(a => a.suit === 'bird').length;
    expect(birdCount).toBe(2);
    const suits = new Set(ambushes.map(a => a.suit));
    expect(suits).toEqual(new Set(['fox', 'mouse', 'rabbit', 'bird']));
  });

  it('all cards in both decks have unique ids within each deck, dominance separate', () => {
    // BASE and SD share ambush/favor/item objects — test per-deck uniqueness instead.
    const baseIds = new Set(BASE_SHARED_DECK.map(c => c.id));
    expect(baseIds.size).toBe(BASE_SHARED_DECK.length);
    const sdIds = new Set(SD_SHARED_DECK.map(c => c.id));
    expect(sdIds.size).toBe(SD_SHARED_DECK.length);
    for (const d of DOMINANCE_CARDS) {
      expect(baseIds.has(d.id)).toBe(false);
      expect(sdIds.has(d.id)).toBe(false);
    }
  });

  it('getCard resolves every card in both decks and dominance pile', () => {
    for (const k of [...BASE_SHARED_DECK, ...SD_SHARED_DECK, ...DOMINANCE_CARDS]) {
      expect(getCard(k.id)).toBe(k);
    }
  });

  it('has 4 dominance cards (separate from main deck)', () => {
    expect(DOMINANCE_CARDS.length).toBe(4);
  });

  it('all item cards declare a craftable item', () => {
    for (const k of BASE_SHARED_DECK.filter(c => c.category === 'item')) {
      expect(k.item).toBeDefined();
      expect(Object.keys(k.craftCost).length).toBeGreaterThan(0);
    }
  });
});

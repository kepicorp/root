import { describe, expect, it } from 'vitest';
import { SHARED_DECK, DOMINANCE_CARDS, getCard } from '../cards';

describe('shared deck', () => {
  it('has exactly 64 cards (October 2025 edition, §2.1.2)', () => {
    expect(SHARED_DECK.length).toBe(64);
  });

  it('has 5 ambush cards: 1 fox, 1 mouse, 1 rabbit, 2 bird (§2.1.2)', () => {
    const ambushes = SHARED_DECK.filter(c => c.category === 'ambush');
    expect(ambushes.length).toBe(5);
    const birdCount = ambushes.filter(a => a.suit === 'bird').length;
    expect(birdCount).toBe(2);
    const suits = new Set(ambushes.map(a => a.suit));
    expect(suits).toEqual(new Set(['fox', 'mouse', 'rabbit', 'bird']));
  });

  it('all cards have unique ids', () => {
    const ids = new Set(SHARED_DECK.map(c => c.id));
    expect(ids.size).toBe(SHARED_DECK.length);
  });

  it('getCard resolves every shared-deck and dominance card', () => {
    for (const k of [...SHARED_DECK, ...DOMINANCE_CARDS]) {
      expect(getCard(k.id)).toBe(k);
    }
  });

  it('has 4 dominance cards (separate from main deck)', () => {
    expect(DOMINANCE_CARDS.length).toBe(4);
  });

  it('all item cards declare a craftable item', () => {
    for (const k of SHARED_DECK.filter(c => c.category === 'item')) {
      expect(k.item).toBeDefined();
      expect(Object.keys(k.craftCost).length).toBeGreaterThan(0);
    }
  });
});

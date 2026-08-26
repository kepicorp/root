import { describe, expect, it } from 'vitest';
import { BASE_SHARED_DECK, SD_SHARED_DECK, SHARED_DECK, DOMINANCE_CARDS, getCard } from '../cards';
import { newGame, reduce } from '../state';
import { cardEffectLegalActions } from '../card-effects';

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

describe('card effect legality', () => {
  it('exposes Tax Collector only for clearings with your warriors in daylight', () => {
    const taxCollectorId = BASE_SHARED_DECK.find((c) => c.name === 'Tax Collector' && c.suit === 'fox')!.id;

    let s = newGame({ seed: 9 });
    s = {
      ...s,
      phase: 'daylight',
      activeIndex: s.factionOrder.indexOf('marquise'),
      craftedPersistents: [{ faction: 'marquise', cardId: taxCollectorId }],
      map: {
        clearings: {
          ...s.map.clearings,
          1: { warriors: { marquise: 2 }, buildings: [], tokens: [], vagabondHere: false },
          2: { warriors: { eyrie: 1 }, buildings: [], tokens: [], vagabondHere: false },
        },
      },
    } as any;

    const actions = cardEffectLegalActions(s);
    expect(actions).toContainEqual({ kind: 'card.taxCollector', faction: 'marquise', cardId: taxCollectorId, clearing: 1 });
    expect(actions.some((a: any) => a.kind === 'card.taxCollector' && a.clearing === 2)).toBe(false);
  });

  it('requires a matching-suit or bird card to spend for Squires', () => {
    const foxSquireId = SD_SHARED_DECK.find((c) => c.name === 'Fox Squires' && c.suit === 'fox')!.id;
    const foxCardId = BASE_SHARED_DECK.find((c) => c.name === 'Foxfolk Steel' && c.suit === 'fox')!.id;
    const birdCardId = BASE_SHARED_DECK.find((c) => c.category === 'ambush' && c.suit === 'bird')!.id;
    const mouseCardId = BASE_SHARED_DECK.find((c) => c.name === "Mouse-in-a-Sack" && c.suit === 'mouse')!.id;

    let s = newGame({ seed: 17 });
    s = {
      ...s,
      phase: 'daylight',
      activeIndex: s.factionOrder.indexOf('marquise'),
      craftedPersistents: [{ faction: 'marquise', cardId: foxSquireId }],
      hands: {
        ...s.hands,
        marquise: [foxCardId, mouseCardId, birdCardId],
      },
    } as any;

    const actions = cardEffectLegalActions(s);
    expect(actions).toContainEqual({ kind: 'card.squires', faction: 'marquise', cardId: foxSquireId, spendCard: foxCardId });
    expect(actions).toContainEqual({ kind: 'card.squires', faction: 'marquise', cardId: foxSquireId, spendCard: birdCardId });
    expect(actions.some((a: any) => a.kind === 'card.squires' && a.spendCard === mouseCardId)).toBe(false);
  });

  it('Brazen Demagogue only accepts a matching-suit or bird payment for an available dominance card', () => {
    const brazenId = SD_SHARED_DECK.find((c) => c.name === 'Brazen Demagogue')!.id;
    const foxCardId = BASE_SHARED_DECK.find((c) => c.name === 'Foxfolk Steel' && c.suit === 'fox')!.id;
    const mouseCardId = BASE_SHARED_DECK.find((c) => c.name === "Mouse-in-a-Sack" && c.suit === 'mouse')!.id;
    const dominanceId = DOMINANCE_CARDS[0].id;

    let s = newGame({ seed: 31 });
    s = {
      ...s,
      phase: 'evening',
      activeIndex: s.factionOrder.indexOf('marquise'),
      craftedPersistents: [{ faction: 'marquise', cardId: brazenId }],
      dominanceAvailable: [dominanceId],
      hands: {
        ...s.hands,
        marquise: [foxCardId, mouseCardId],
      },
    } as any;

    const actions = cardEffectLegalActions(s);
    expect(actions).toContainEqual({ kind: 'card.brazenDemagogue', faction: 'marquise', cardId: brazenId, spendCard: foxCardId, takeDominance: dominanceId });
    expect(actions.some((a: any) => a.kind === 'card.brazenDemagogue' && a.spendCard === mouseCardId)).toBe(false);

    const rejected = reduce(s, {
      kind: 'card.brazenDemagogue',
      faction: 'marquise',
      cardId: brazenId,
      spendCard: mouseCardId,
      takeDominance: dominanceId,
    } as any);
    expect(rejected).toBe(s);
  });
});

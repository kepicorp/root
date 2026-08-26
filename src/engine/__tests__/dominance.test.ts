import { describe, expect, it } from 'vitest';
import { BASE_SHARED_DECK, DOMINANCE_CARDS, SD_SHARED_DECK } from '../cards';
import { reduce, newGame } from '../state';

const foxCard = BASE_SHARED_DECK.find(card => card.suit === 'fox')!;
const birdCard = BASE_SHARED_DECK.find(card => card.suit === 'bird')!;

function birdsongState() {
  const state = newGame({ seed: 1 });
  return {
    ...state,
    phase: 'birdsong' as const,
    activeIndex: state.factionOrder.indexOf('marquise'),
  };
}

describe('dominance cards', () => {
  it('takes an available dominance card in birdsong and pays a matching card', () => {
    const base = birdsongState();
    const dominance = DOMINANCE_CARDS[0]!;
    const state = {
      ...base,
      hands: { ...base.hands, marquise: [foxCard.id] },
      dominanceAvailable: [dominance.id],
    };

    const after = reduce(state, { kind: 'system.takeDominance', faction: 'marquise', cardId: dominance.id, spendCard: foxCard.id });

    expect(after.hands.marquise).toEqual([dominance.id]);
    expect(after.discard).toContain(foxCard.id);
    expect(after.dominanceAvailable).not.toContain(dominance.id);
  });

  it('sets a discarded dominance card aside instead of adding it to the discard pile', () => {
    const base = birdsongState();
    const dominance = DOMINANCE_CARDS[0]!;
    const state = {
      ...base,
      hands: { ...base.hands, marquise: [dominance.id, birdCard.id] },
      dominanceAvailable: [DOMINANCE_CARDS[1]!.id],
    };

    const after = reduce(state, { kind: 'system.takeDominance', faction: 'marquise', cardId: DOMINANCE_CARDS[1]!.id, spendCard: dominance.id });

    expect(after.discard).not.toContain(dominance.id);
    expect(after.dominanceAvailable).toContain(dominance.id);
  });

  it('activates dominance from hand at 10 VP without discarding the face-up card', () => {
    const base = birdsongState();
    const dominance = DOMINANCE_CARDS[0]!;
    const state = {
      ...base,
      phase: 'daylight' as const,
      hands: { ...base.hands, marquise: [dominance.id] },
      scores: { ...base.scores, marquise: 10 },
    };

    const after = reduce(state, { kind: 'system.playDominance', faction: 'marquise', cardId: dominance.id });

    expect(after.dominance).toEqual({ faction: 'marquise', suit: 'fox' });
    expect(after.scores.marquise).toBe(0);
    expect(after.discard).not.toContain(dominance.id);
    expect(after.dominanceAvailable).not.toContain(dominance.id);
  });

  it('Brazen Demagogue takes only an available dominance card', () => {
    const base = birdsongState();
    const dominance = DOMINANCE_CARDS[0]!;
    const brazenCard = SD_SHARED_DECK.find(card => card.name === 'Brazen Demagogue')!;
    const state = {
      ...base,
      phase: 'evening' as const,
      hands: { ...base.hands, marquise: [foxCard.id] },
      dominanceAvailable: [dominance.id],
      craftedPersistents: [...base.craftedPersistents, { faction: 'marquise' as const, cardId: brazenCard.id }],
    };
    const brazenId = brazenCard.id;

    const after = reduce(state, { kind: 'card.brazenDemagogue', faction: 'marquise', cardId: brazenId, spendCard: foxCard.id, takeDominance: dominance.id });

    expect(after.hands.marquise).toEqual([dominance.id]);
    expect(after.discard).toContain(foxCard.id);
    expect(after.dominanceAvailable).not.toContain(dominance.id);
  });
});

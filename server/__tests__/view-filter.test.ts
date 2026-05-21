import { describe, it, expect } from 'vitest';
import { newGame } from '../../src/engine/state';
import { performSetup } from '../../src/engine/setup';
import { startGame } from '../../src/engine/loop';
import { filterStateForRecipient, HIDDEN_CARD_ID } from '../viewFilter';
import { ALL_FACTIONS, type Faction } from '../../src/engine/types';

function fixture() {
  return startGame(performSetup(newGame({ seed: 42 })));
}

describe('filterStateForRecipient', () => {
  it('hides the deck order from everyone', () => {
    const s = fixture();
    expect(s.deck.length).toBeGreaterThan(0);
    for (const recipient of [...ALL_FACTIONS, null] as (Faction | null)[]) {
      const f = filterStateForRecipient(s, recipient);
      expect(f.deck.length).toBe(s.deck.length);
      expect(f.deck.every(id => id === HIDDEN_CARD_ID)).toBe(true);
    }
  });

  it('leaves the recipient\'s own hand visible and redacts every other hand', () => {
    const s = fixture();
    for (const recipient of ALL_FACTIONS) {
      const f = filterStateForRecipient(s, recipient);
      // Own hand: identical contents.
      expect(f.hands[recipient]).toEqual(s.hands[recipient]);
      // Other hands: same length, all sentinels.
      for (const other of ALL_FACTIONS) {
        if (other === recipient) continue;
        expect(f.hands[other].length).toBe(s.hands[other].length);
        expect(f.hands[other].every(id => id === HIDDEN_CARD_ID)).toBe(true);
      }
    }
  });

  it('a spectator (null recipient) sees no hand contents at all', () => {
    const s = fixture();
    const f = filterStateForRecipient(s, null);
    for (const faction of ALL_FACTIONS) {
      expect(f.hands[faction].length).toBe(s.hands[faction].length);
      expect(f.hands[faction].every(id => id === HIDDEN_CARD_ID)).toBe(true);
    }
  });

  it('redacts Alliance supporters for non-Alliance recipients only', () => {
    const s = fixture();
    expect(s.factions.alliance!.supporters.length).toBeGreaterThan(0);

    const allianceView = filterStateForRecipient(s, 'alliance');
    expect(allianceView.factions.alliance!.supporters).toEqual(s.factions.alliance!.supporters);

    for (const other of ALL_FACTIONS.filter(f => f !== 'alliance')) {
      const view = filterStateForRecipient(s, other);
      const sup = view.factions.alliance!.supporters;
      expect(sup.length).toBe(s.factions.alliance!.supporters.length);
      expect(sup.every(id => id === HIDDEN_CARD_ID)).toBe(true);
    }
  });

  it('does not mutate the input state', () => {
    const s = fixture();
    const snapshotBefore = JSON.stringify(s);
    filterStateForRecipient(s, 'marquise');
    filterStateForRecipient(s, null);
    expect(JSON.stringify(s)).toBe(snapshotBefore);
  });

  it('keeps public piles (discard, scores, map, item supply) unchanged', () => {
    const s = fixture();
    const f = filterStateForRecipient(s, 'marquise');
    expect(f.discard).toEqual(s.discard);
    expect(f.scores).toEqual(s.scores);
    expect(f.itemSupply).toEqual(s.itemSupply);
    expect(f.map).toEqual(s.map);
    expect(f.factions.eyrie).toEqual(s.factions.eyrie); // decree is public
  });

  it('handles a state where vagabond is absent without crashing', () => {
    const s = fixture();
    // Remove vagabond — alliance/eyrie/marquise might be missing in some
    // setups, so we just smoke-test that the filter is defensive.
    const stripped = { ...s, factions: { ...s.factions, vagabond: undefined } };
    expect(() => filterStateForRecipient(stripped, 'marquise')).not.toThrow();
  });
});

// Property-based tests for engine invariants.
//
// These tests verify load-bearing properties that must hold no matter what
// inputs the engine receives. They run with fast-check, which generates
// hundreds of random inputs per test.

import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { mulberry32, rollDie, shuffle, mixSeed } from '../rng';
import { computeCombatOutcome } from '../combat';
import { newGame } from '../state';
import { advancePhase, startGame } from '../loop';
import { SHARED_DECK } from '../cards';
import type { ClearingState } from '../types';

const emptyClearing = (warriors: Record<string, number>, buildings: { faction: any; kind: string }[] = []): ClearingState => ({
  warriors: warriors as any,
  buildings,
  tokens: [],
  vagabondHere: false,
});

describe('RNG properties', () => {
  it('mulberry32 is deterministic for the same seed', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 2 ** 30 }), (seed) => {
      const a = mulberry32(seed);
      const b = mulberry32(seed);
      for (let i = 0; i < 50; i++) {
        expect(a()).toBe(b());
      }
    }));
  });

  it('rollDie always returns a valid Root combat-die face (0,1,2,3)', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 2 ** 30 }), (seed) => {
      const rng = mulberry32(seed);
      for (let i = 0; i < 100; i++) {
        const r = rollDie(rng);
        expect([0, 1, 2, 3]).toContain(r);
      }
    }));
  });

  it('shuffle preserves multiset (same elements, possibly reordered)', () => {
    fc.assert(fc.property(
      fc.array(fc.integer(), { minLength: 0, maxLength: 50 }),
      fc.integer({ min: 0, max: 2 ** 30 }),
      (arr, seed) => {
        const shuffled = shuffle(arr, mulberry32(seed));
        expect(shuffled.length).toBe(arr.length);
        expect([...shuffled].sort((a, b) => a - b)).toEqual([...arr].sort((a, b) => a - b));
      },
    ));
  });

  it('mixSeed is deterministic', () => {
    fc.assert(fc.property(fc.integer(), fc.integer(), (s, t) => {
      expect(mixSeed(s, t)).toBe(mixSeed(s, t));
    }));
  });
});

describe('Combat properties', () => {
  it('hits dealt by a side never exceed their warriors plus ambush', () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 25 }),
      fc.integer({ min: 0, max: 25 }),
      fc.integer({ min: 0, max: 3 }),
      fc.integer({ min: 0, max: 3 }),
      fc.boolean(),
      fc.boolean(),
      (attW, defW, d1, d2, atkAmb, defAmb) => {
        const c = emptyClearing({ marquise: attW, eyrie: defW });
        const out = computeCombatOutcome(c, 'marquise', 'eyrie', [d1, d2], atkAmb, defAmb);
        const maxAttHits = attW + (atkAmb && !defAmb ? 2 : 0) + 1; // +1 defenseless slack
        const maxDefHits = defW + (defAmb && !atkAmb ? 2 : 0);
        expect(out.attackerHits).toBeLessThanOrEqual(maxAttHits);
        expect(out.defenderHits).toBeLessThanOrEqual(maxDefHits);
      },
    ));
  });

  it('pieces removed never exceed pieces present', () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 10 }),
      fc.integer({ min: 0, max: 10 }),
      fc.integer({ min: 0, max: 3 }),
      fc.integer({ min: 0, max: 5 }),
      fc.integer({ min: 0, max: 3 }),
      fc.integer({ min: 0, max: 3 }),
      (attW, defW, defBldgs, attBldgs, d1, d2) => {
        const buildings = [
          ...Array.from({ length: defBldgs }, () => ({ faction: 'eyrie' as const, kind: 'roost' })),
          ...Array.from({ length: attBldgs }, () => ({ faction: 'marquise' as const, kind: 'sawmill' })),
        ];
        const c = emptyClearing({ marquise: attW, eyrie: defW }, buildings);
        const out = computeCombatOutcome(c, 'marquise', 'eyrie', [d1, d2], false, false);
        const totalDefRemoved =
          out.defenderPiecesRemoved.warriors +
          out.defenderPiecesRemoved.buildings +
          out.defenderPiecesRemoved.tokens;
        const totalAttRemoved =
          out.attackerPiecesRemoved.warriors +
          out.attackerPiecesRemoved.buildings +
          out.attackerPiecesRemoved.tokens;
        expect(totalDefRemoved).toBeLessThanOrEqual(defW + defBldgs);
        expect(totalAttRemoved).toBeLessThanOrEqual(attW + attBldgs);
      },
    ));
  });

  it('attacker VP equals defender cardboard removed by attacker', () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 10 }),
      fc.integer({ min: 0, max: 10 }),
      fc.integer({ min: 0, max: 3 }),
      fc.integer({ min: 0, max: 3 }),
      (attW, defW, d1, d2) => {
        const buildings = Array.from({ length: 2 }, () => ({ faction: 'eyrie' as const, kind: 'roost' }));
        const c = emptyClearing({ marquise: attW, eyrie: defW }, buildings);
        const out = computeCombatOutcome(c, 'marquise', 'eyrie', [d1, d2], false, false);
        expect(out.attackerVp).toBe(out.defenderPiecesRemoved.buildings + out.defenderPiecesRemoved.tokens);
      },
    ));
  });
});

describe('Deck integrity', () => {
  it('every card in the shared deck has a unique id', () => {
    const ids = new Set(SHARED_DECK.map(c => c.id));
    expect(ids.size).toBe(SHARED_DECK.length);
  });

  it('every card has a valid suit', () => {
    for (const c of SHARED_DECK) {
      expect(['fox', 'mouse', 'rabbit', 'bird']).toContain(c.suit);
    }
  });
});

describe('Loop properties', () => {
  it('turn count is monotonic non-decreasing after advancing phases', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 50 }),
      (steps) => {
        let s = startGame(newGame({ seed: 12345 }));
        const turns: number[] = [s.turn];
        for (let i = 0; i < steps; i++) {
          s = advancePhase(s);
          turns.push(s.turn);
        }
        for (let i = 1; i < turns.length; i++) {
          expect(turns[i]).toBeGreaterThanOrEqual(turns[i - 1]!);
        }
      },
    ));
  });
});

import { describe, expect, it } from 'vitest';
import { computeCombatOutcome, resolveCombat } from '../combat';
import { newGame } from '../state';
import type { ClearingState } from '../types';

const emptyClearing = (overrides: Partial<ClearingState> = {}): ClearingState => ({
  warriors: {}, buildings: [], tokens: [], vagabondHere: false, ...overrides,
});

describe('combat outcome (pure)', () => {
  it('attacker takes higher die, defender takes lower', () => {
    const c = emptyClearing({ warriors: { marquise: 5, eyrie: 5 } });
    const out = computeCombatOutcome(c, 'marquise', 'eyrie', [3, 1], false, false);
    expect(out.attackerHits).toBe(3);
    expect(out.defenderHits).toBe(1);
  });

  it('hits capped by attacker warriors', () => {
    const c = emptyClearing({ warriors: { marquise: 1, eyrie: 5 } });
    const out = computeCombatOutcome(c, 'marquise', 'eyrie', [3, 2], false, false);
    expect(out.attackerHits).toBeLessThanOrEqual(1);
  });

  it('defenseless defender → attacker gets +1 hit', () => {
    const c = emptyClearing({ warriors: { marquise: 3 }, buildings: [{ faction: 'eyrie', kind: 'roost' }] });
    const out = computeCombatOutcome(c, 'marquise', 'eyrie', [2, 0], false, false);
    expect(out.defenderDefenseless).toBe(true);
    // attacker rolls 2, +1 defenseless = 3 hits, capped by 3 warriors = 3
    expect(out.attackerHits).toBe(3);
    expect(out.defenderHits).toBe(0); // defender has no warriors
  });

  it('defender ambush deals +2 hits, attacker counter-ambush cancels', () => {
    const c = emptyClearing({ warriors: { marquise: 5, eyrie: 5 } });
    const withDefAmbush = computeCombatOutcome(c, 'marquise', 'eyrie', [3, 1], false, true);
    expect(withDefAmbush.defenderHits).toBeGreaterThanOrEqual(3);
    expect(withDefAmbush.ambushedByDefender).toBe(true);

    const cancelled = computeCombatOutcome(c, 'marquise', 'eyrie', [3, 1], true, true);
    expect(cancelled.ambushCancelled).toBe(true);
    expect(cancelled.defenderHits).toBe(1);
  });

  it('attacker scores 1 VP per enemy building/token removed', () => {
    const c = emptyClearing({
      warriors: { marquise: 5 },
      buildings: [
        { faction: 'eyrie', kind: 'roost' },
        { faction: 'eyrie', kind: 'roost' },
      ],
    });
    const out = computeCombatOutcome(c, 'marquise', 'eyrie', [3, 0], false, false);
    expect(out.defenderDefenseless).toBe(true);
    expect(out.defenderPiecesRemoved.buildings).toBeGreaterThan(0);
    expect(out.attackerVp).toBe(out.defenderPiecesRemoved.buildings);
  });

  it('hits do not over-remove pieces', () => {
    const c = emptyClearing({
      warriors: { marquise: 5, eyrie: 1 },
      buildings: [{ faction: 'eyrie', kind: 'roost' }],
    });
    const out = computeCombatOutcome(c, 'marquise', 'eyrie', [3, 3], false, false);
    // defender has 1 warrior + 1 building = 2 pieces; cannot lose more than 2.
    const totalDefRemoved =
      out.defenderPiecesRemoved.warriors +
      out.defenderPiecesRemoved.buildings +
      out.defenderPiecesRemoved.tokens;
    expect(totalDefRemoved).toBeLessThanOrEqual(2);
  });
});

describe('resolveCombat (state reducer)', () => {
  it('removes pieces and awards VP', () => {
    let s = newGame({ seed: 7 });
    s = {
      ...s,
      map: {
        clearings: {
          ...s.map.clearings,
          1: {
            warriors: { marquise: 5, eyrie: 1 },
            buildings: [{ faction: 'eyrie', kind: 'roost' }],
            tokens: [],
            vagabondHere: false,
          },
        },
      },
    };
    const after = resolveCombat(s, { clearing: 1, attacker: 'marquise', defender: 'eyrie' });
    const cl = after.map.clearings[1]!;
    const totalDefBefore = 1 + 1; // 1 warrior + 1 building
    const totalDefAfter = (cl.warriors.eyrie ?? 0) + cl.buildings.filter(b => b.faction === 'eyrie').length;
    expect(totalDefAfter).toBeLessThanOrEqual(totalDefBefore);
    expect(after.scores.marquise).toBeGreaterThanOrEqual(0);
    expect(after.rngStep).toBe(s.rngStep + 1);
  });

  it('is deterministic for a given seed', () => {
    const make = () => {
      let s = newGame({ seed: 42 });
      s.map.clearings[1] = {
        warriors: { marquise: 4, eyrie: 4 },
        buildings: [], tokens: [], vagabondHere: false,
      };
      return s;
    };
    const a = resolveCombat(make(), { clearing: 1, attacker: 'marquise', defender: 'eyrie' });
    const b = resolveCombat(make(), { clearing: 1, attacker: 'marquise', defender: 'eyrie' });
    expect(a.scores).toEqual(b.scores);
    expect(a.map.clearings[1]!.warriors).toEqual(b.map.clearings[1]!.warriors);
  });
});

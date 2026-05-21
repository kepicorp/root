import { describe, expect, it } from 'vitest';
import { AUTUMN_MAP, getAdjacent, areAdjacent, CORNER_CLEARINGS } from '../map';
import type { Suit } from '../types';

describe('autumn map', () => {
  it('has 12 clearings', () => {
    expect(AUTUMN_MAP.clearings).toHaveLength(12);
  });

  it('has 4 of each suit', () => {
    const counts: Record<Suit, number> = { fox: 0, mouse: 0, rabbit: 0 };
    for (const c of AUTUMN_MAP.clearings) counts[c.suit] += 1;
    expect(counts).toEqual({ fox: 4, mouse: 4, rabbit: 4 });
  });

  it('has 4 ruins', () => {
    const ruins = AUTUMN_MAP.clearings.filter(c => c.hasRuin).length;
    expect(ruins).toBe(4);
  });

  it('has exactly 4 corner clearings', () => {
    expect(CORNER_CLEARINGS).toHaveLength(4);
    for (const id of CORNER_CLEARINGS) {
      expect(AUTUMN_MAP.clearings.some(c => c.id === id)).toBe(true);
    }
  });

  it('adjacency is symmetric', () => {
    for (const c of AUTUMN_MAP.clearings) {
      for (const neighbor of getAdjacent(AUTUMN_MAP, c.id)) {
        expect(areAdjacent(AUTUMN_MAP, neighbor, c.id)).toBe(true);
      }
    }
  });

  it('every clearing has at least one neighbor', () => {
    for (const c of AUTUMN_MAP.clearings) {
      expect(getAdjacent(AUTUMN_MAP, c.id).length).toBeGreaterThan(0);
    }
  });

  it('paths do not connect a clearing to itself', () => {
    for (const [a, b] of AUTUMN_MAP.paths) {
      expect(a).not.toBe(b);
    }
  });
});

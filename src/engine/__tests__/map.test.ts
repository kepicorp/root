import { describe, expect, it } from 'vitest';
import { AUTUMN_MAP, getAdjacent, areAdjacent, CORNER_CLEARINGS, adjacentForests } from '../map';
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

  it('has 7 forests', () => {
    expect(AUTUMN_MAP.forests).toHaveLength(7);
  });

  it('matches the autumn board corner and ruin layout', () => {
    expect(CORNER_CLEARINGS).toEqual([1, 4, 9, 12]);
    expect(AUTUMN_MAP.clearings.map(c => ({
      id: c.id,
      suit: c.suit,
      buildingSlots: c.buildingSlots,
      hasRuin: c.hasRuin,
    }))).toEqual([
      {
        id: 1,
        suit: "fox",
        buildingSlots: 1,
        hasRuin: false
      },
      {
        id: 2,
        suit: "rabbit",
        buildingSlots: 2,
        hasRuin: false
      },
      {
        id: 3,
        suit: "mouse",
        buildingSlots: 2,
        hasRuin: false
      },
      {
        id: 4,
        suit: "rabbit",
        buildingSlots: 2,
        hasRuin: true
      },
      {
        id: 5,
        suit: "mouse",
        buildingSlots: 2,
        hasRuin: false
      },
      {
        id: 6,
        suit: "fox",
        buildingSlots: 2,
        hasRuin: true
      },
      {
        id: 7,
        suit: "mouse",
        buildingSlots: 3,
        hasRuin: true
      },
      {
        id: 8,
        suit: "fox",
        buildingSlots: 2,
        hasRuin: true
      },
      {
        id: 9,
        suit: "mouse",
        buildingSlots: 2,
        hasRuin: false
      },
      {
        id: 10,
        suit: "rabbit",
        buildingSlots: 1,
        hasRuin: false
      },
      {
        id: 11,
        suit: "fox",
        buildingSlots: 2,
        hasRuin: false
      },
      {
        id: 12,
        suit: "rabbit",
        buildingSlots: 1,
        hasRuin: false
      }
    ]);
  });

  it('matches the concept-map path graph', () => {
    expect(new Set(AUTUMN_MAP.paths.map(([a, b]) => String(Math.min(a, b)) + '-' + String(Math.max(a, b))))).toEqual(new Set([
      "1-2",
      "1-4",
      "1-5",
      "10-11",
      "2-3",
      "3-4",
      "3-8",
      "4-6",
      "5-10",
      "5-6",
      "6-10",
      "6-7",
      "6-9",
      "7-12",
      "7-8",
      "8-12",
      "9-11",
      "9-12"
    ]));
    expect(AUTUMN_MAP.paths).toHaveLength(18);
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

  it('forest adjacency is symmetric', () => {
    for (const forest of AUTUMN_MAP.forests) {
      for (const neighbor of adjacentForests(AUTUMN_MAP, forest.id)) {
        expect(adjacentForests(AUTUMN_MAP, neighbor)).toContain(forest.id);
      }
    }
  });
});

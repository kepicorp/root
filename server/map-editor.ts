import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Suit = 'fox' | 'mouse' | 'rabbit';

export interface EditorClearing {
  id: number;
  suit: Suit;
  buildingSlots: number;
  hasRuin: boolean;
  ruinItem?: string;
  hasRiver?: boolean;
  x: number;
  y: number;
}

export interface EditorForest {
  id: string;
  clearings: number[];
  borderPaths: Array<[number, number]>;
  x: number;
  y: number;
}

export interface EditorMap {
  clearings: EditorClearing[];
  paths: Array<[number, number]>;
  forests: EditorForest[];
}

const MAP_PATH = resolve(process.cwd(), 'src/engine/map.ts');
const TEST_PATH = resolve(process.cwd(), 'src/engine/__tests__/map.test.ts');

function formatValue(value: unknown, indent = 0): string {
  const pad = ' '.repeat(indent);
  const next = ' '.repeat(indent + 2);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((item) => `${next}${formatValue(item, indent + 2)}`).join(',\n');
    return `[\n${items}\n${pad}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    const body = entries.map(([key, entryValue]) => `${next}${key}: ${formatValue(entryValue, indent + 2)}`).join(',\n');
    return `{\n${body}\n${pad}}`;
  }
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}

function renderMapFile(map: EditorMap): string {
  const clearings = map.clearings.map((c) => ({
    id: c.id,
    suit: c.suit,
    buildingSlots: c.buildingSlots,
    hasRuin: c.hasRuin,
    ...(c.ruinItem ? { ruinItem: c.ruinItem } : {}),
    ...(c.hasRiver ? { hasRiver: true } : {}),
    x: c.x,
    y: c.y,
  }));
  const paths = map.paths.map(([a, b]) => [a, b] as const);
  const forests = map.forests.map((f) => ({
    id: f.id,
    clearings: f.clearings,
    borderPaths: f.borderPaths,
    x: f.x,
    y: f.y,
  }));

  return `// Static autumn map data.
//
// Standard 12-clearing autumn map. Suit distribution is 4 fox / 4 mouse / 4 rabbit.
// Corner clearings (1, 4, 9, 12) are the board corners for setup and dominance.
// Ruins sit on the four middle-band clearings.
//
// Coordinates are in a 1000 x 800 board-space and get scaled by the renderer.
// Adjacency mirrors the autumn board's clearing network.

import type { Clearing, Path, RootMap, ClearingId, Forest, ForestId } from './types';

const clearings: readonly Clearing[] = ${formatValue(clearings, 0)};

const paths: readonly Path[] = ${formatValue(paths, 0)};

// Seven forest tiles sit between the clearings — each bordered
// by the four clearings that share its cell. The Vagabond is the only
// faction that can move into a forest; forests don't accept warriors,
// buildings, or tokens.
const forests: readonly Forest[] = ${formatValue(forests, 0)};

export const AUTUMN_MAP: RootMap = { clearings, paths, forests };

// ─── Derived helpers ────────────────────────────────────────────────────────

export function getClearing(map: RootMap, id: ClearingId): Clearing {
  const c = map.clearings.find(c => c.id === id);
  if (!c) throw new Error('Unknown clearing: ' + id);
  return c;
}

export function getForest(map: RootMap, id: ForestId): Forest {
  const f = map.forests.find(f => f.id === id);
  if (!f) throw new Error('Unknown forest: ' + id);
  return f;
}

export function getAdjacent(map: RootMap, id: ClearingId): ClearingId[] {
  const result: ClearingId[] = [];
  for (const [a, b] of map.paths) {
    if (a === id) result.push(b);
    else if (b === id) result.push(a);
  }
  return result;
}

export function areAdjacent(map: RootMap, a: ClearingId, b: ClearingId): boolean {
  return map.paths.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  );
}

/** Forests directly accessible from a clearing (the clearing is one of
 *  the forest's bordering clearings). */
export function forestsAtClearing(map: RootMap, c: ClearingId): ForestId[] {
  return map.forests.filter(f => f.clearings.includes(c)).map(f => f.id);
}

/** Adjacent forests share at least one border path. */
export function adjacentForests(map: RootMap, id: ForestId): ForestId[] {
  const f = getForest(map, id);
  return map.forests
    .filter(g => g.id !== id && g.borderPaths.some(p => f.borderPaths.some(q => (p[0] === q[0] && p[1] === q[1]) || (p[0] === q[1] && p[1] === q[0]))))
    .map(g => g.id);
}

export const CORNER_CLEARINGS: readonly ClearingId[] = [1, 4, 9, 12];
`;
}

function renderTestFile(map: EditorMap): string {
  const expected = map.clearings.map((c) => ({
    id: c.id,
    suit: c.suit,
    buildingSlots: c.buildingSlots,
    hasRuin: c.hasRuin,
  }));
  const expectedPaths = Array.from(new Set(map.paths.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`))).sort();

  return `import { describe, expect, it } from 'vitest';
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
    }))).toEqual(${formatValue(expected, 4)});
  });

  it('matches the concept-map path graph', () => {
    expect(new Set(AUTUMN_MAP.paths.map(([a, b]) => String(Math.min(a, b)) + '-' + String(Math.max(a, b))))).toEqual(new Set(${formatValue(expectedPaths, 4)}));
    expect(AUTUMN_MAP.paths).toHaveLength(${map.paths.length});
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
`;
}

export function writeMapFiles(map: EditorMap): void {
  writeFileSync(MAP_PATH, renderMapFile(map), 'utf8');
  writeFileSync(TEST_PATH, renderTestFile(map), 'utf8');
}

export function readCurrentMap(): EditorMap {
  // Load the current source snapshot so the editor starts from the codebase state.
  // This keeps the tool aligned with the authoritative map module.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const source = readFileSync(MAP_PATH, 'utf8');
  const clearingsMatch = source.match(/const clearings: readonly Clearing\[] = ([\s\S]*?);\n\nconst paths:/);
  const pathsMatch = source.match(/const paths: readonly Path\[] = ([\s\S]*?);\n\n\/\/ Seven forest tiles/);
  const forestsMatch = source.match(/const forests: readonly Forest\[] = ([\s\S]*?);\n\nexport const AUTUMN_MAP/);
  if (!clearingsMatch || !pathsMatch || !forestsMatch) throw new Error('Unable to parse current map.ts');
  const clearings = Function(`return ${clearingsMatch[1]};`)() as EditorClearing[];
  const paths = Function(`return ${pathsMatch[1]};`)() as Array<[number, number]>;
  const forests = Function(`return ${forestsMatch[1]};`)() as EditorForest[];
  return { clearings, paths, forests };
}
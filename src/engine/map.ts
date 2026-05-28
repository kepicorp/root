// Static autumn map data.
//
// Standard 12-clearing autumn map. Suit distribution is 4 fox / 4 mouse / 4 rabbit.
// Corner clearings (1, 4, 9, 12) are the starting positions for the corner factions.
// Ruins are placed on 4 clearings.
//
// Coordinates are in a 1000 x 800 board-space and get scaled by the renderer.
// Adjacency mirrors a plausible Root autumn map; precise paths can be tuned later
// without changing the type signature.

import type { Clearing, Path, RootMap, ClearingId, Forest, ForestId } from './types';

const clearings: readonly Clearing[] = [
  // Row 1 (top)
  { id: 1,  suit: 'fox',    buildingSlots: 2, hasRuin: false, x: 160, y: 140 },
  { id: 2,  suit: 'rabbit', buildingSlots: 2, hasRuin: false, x: 400, y: 140 },
  { id: 3,  suit: 'mouse',  buildingSlots: 2, hasRuin: true,  ruinItem: 'crossbow', x: 620, y: 140 },
  { id: 4,  suit: 'fox',    buildingSlots: 1, hasRuin: false, hasRiver: true, x: 850, y: 140 },
  // Row 2 (middle)
  { id: 5,  suit: 'mouse',  buildingSlots: 2, hasRuin: false, x: 160, y: 400 },
  { id: 6,  suit: 'rabbit', buildingSlots: 1, hasRuin: true,  ruinItem: 'hammer',   x: 400, y: 400 },
  { id: 7,  suit: 'fox',    buildingSlots: 2, hasRuin: false, x: 620, y: 400 },
  { id: 8,  suit: 'rabbit', buildingSlots: 2, hasRuin: true,  ruinItem: 'boots',    hasRiver: true, x: 850, y: 400 },
  // Row 3 (bottom)
  { id: 9,  suit: 'rabbit', buildingSlots: 1, hasRuin: false, x: 160, y: 660 },
  { id: 10, suit: 'mouse',  buildingSlots: 2, hasRuin: false, x: 400, y: 660 },
  { id: 11, suit: 'fox',    buildingSlots: 2, hasRuin: true,  ruinItem: 'sword',    hasRiver: true, x: 620, y: 660 },
  { id: 12, suit: 'mouse',  buildingSlots: 2, hasRuin: false, hasRiver: true, x: 850, y: 660 },
];

const paths: readonly Path[] = [
  // Horizontal
  [1, 2], [2, 3], [3, 4],
  [5, 6], [6, 7], [7, 8],
  [9, 10], [10, 11], [11, 12],
  // Vertical
  [1, 5], [2, 6], [3, 7], [4, 8],
  [5, 9], [6, 10], [7, 11], [8, 12],
  // Diagonal forest paths (a few, for adjacency richness)
  [2, 5], [3, 8], [6, 9], [7, 12],
];

// Six forest tiles sit between the 4x3 grid of clearings — each bordered
// by the four clearings that share its cell. The Vagabond is the only
// faction that can move into a forest; forests don't accept warriors,
// buildings, or tokens.
const forests: readonly Forest[] = [
  { id: 'fA', clearings: [1, 2, 5, 6], x: 280, y: 270 },
  { id: 'fB', clearings: [2, 3, 6, 7], x: 510, y: 270 },
  { id: 'fC', clearings: [3, 4, 7, 8], x: 735, y: 270 },
  { id: 'fD', clearings: [5, 6, 9, 10], x: 280, y: 530 },
  { id: 'fE', clearings: [6, 7, 10, 11], x: 510, y: 530 },
  { id: 'fF', clearings: [7, 8, 11, 12], x: 735, y: 530 },
];

export const AUTUMN_MAP: RootMap = { clearings, paths, forests };

// ─── Derived helpers ────────────────────────────────────────────────────────

export function getClearing(map: RootMap, id: ClearingId): Clearing {
  const c = map.clearings.find(c => c.id === id);
  if (!c) throw new Error(`Unknown clearing: ${id}`);
  return c;
}

export function getForest(map: RootMap, id: ForestId): Forest {
  const f = map.forests.find(f => f.id === id);
  if (!f) throw new Error(`Unknown forest: ${id}`);
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

/** Adjacent forests share ≥2 clearings (edge neighbours, not diagonal). */
export function adjacentForests(map: RootMap, id: ForestId): ForestId[] {
  const f = getForest(map, id);
  return map.forests
    .filter(g => g.id !== id && g.clearings.filter(c => f.clearings.includes(c)).length >= 2)
    .map(g => g.id);
}

export const CORNER_CLEARINGS: readonly ClearingId[] = [1, 4, 9, 12];

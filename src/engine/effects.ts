// Shared rule effects that aren't owned by a single faction — Favor wipes
// matching-suit clearings; the helper is used by every craft reducer.

import type { GameState, Faction, ClearingId, CardSuit } from './types';
import { AUTUMN_MAP } from './map';

/** Return N warriors of `faction` from `clearing` back to their supply. */
export function returnWarriorsToSupply(draft: GameState, clearing: ClearingId, faction: Faction, n: number): void {
  const cl = draft.map.clearings[clearing]!;
  const have = cl.warriors[faction] ?? 0;
  const removed = Math.min(have, n);
  cl.warriors[faction] = have - removed;
  if (removed <= 0) return;
  if (faction === 'marquise' && draft.factions.marquise) draft.factions.marquise.warriorSupply += removed;
  else if (faction === 'eyrie' && draft.factions.eyrie) draft.factions.eyrie.warriorSupply += removed;
  else if (faction === 'alliance' && draft.factions.alliance) draft.factions.alliance.warriorSupply += removed;
}

/** Favor of the X — wipe all non-crafting-faction pieces from every
 *  clearing of the named suit. Awards the crafting faction 1 VP per
 *  piece removed. (Bird-suit Favor isn't in the base deck.) */
export function applyFavor(draft: GameState, suit: CardSuit, crafter: Faction): void {
  if (suit === 'bird') return;
  let removed = 0;
  for (const clMeta of AUTUMN_MAP.clearings) {
    if (clMeta.suit !== suit) continue;
    const cl = draft.map.clearings[clMeta.id]!;
    for (const f of ['marquise', 'eyrie', 'alliance', 'vagabond'] as const) {
      if (f === crafter) continue;
      const n = cl.warriors[f] ?? 0;
      if (n > 0) {
        removed += n;
        returnWarriorsToSupply(draft, clMeta.id, f, n);
      }
    }
    const oldB = cl.buildings.length;
    cl.buildings = cl.buildings.filter(b => b.faction === crafter);
    removed += oldB - cl.buildings.length;
    const oldT = cl.tokens.length;
    cl.tokens = cl.tokens.filter(t => t.faction === crafter);
    removed += oldT - cl.tokens.length;
  }
  draft.scores[crafter] += removed;
}

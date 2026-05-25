// Shared helpers for evaluating Decree slots. Used by both the reducer
// (resolveDecree drives the game forward) and the bot (deciding whether
// adding a particular card to a particular slot is safe).
//
// Keeping these in one place ensures the bot's "is this safe?" check stays
// in lockstep with the reducer's actual resolution logic — drift here is
// what causes the Eyrie bot to Turmoil more than it should.

import type { GameState, ClearingId } from '../../types';
import type { CardId } from '../../cards';
import { getCard } from '../../cards';
import { AUTUMN_MAP, getAdjacent } from '../../map';
import type { DecreeSlot } from './state';

/** Lords of the Forest (§7.2.2): Eyrie rule when tied for most warriors+buildings.
 *  Tokens do not count toward rule (§2.5). */
export function eyrieRules(state: GameState, clearing: ClearingId): boolean {
  const cl = state.map.clearings[clearing];
  if (!cl) return false;
  const counts: Record<string, number> = {};
  for (const [f, w] of Object.entries(cl.warriors)) counts[f] = (counts[f] ?? 0) + (w ?? 0);
  for (const b of cl.buildings) counts[b.faction] = (counts[b.faction] ?? 0) + 1;
  const mine = counts.eyrie ?? 0;
  let topOther = 0;
  for (const [f, n] of Object.entries(counts)) {
    if (f !== 'eyrie' && n > topOther) topOther = n;
  }
  return mine > 0 && mine >= topOther;
}

export function suitMatches(cardSuit: string, clearingSuit: string): boolean {
  return cardSuit === 'bird' || cardSuit === clearingSuit;
}

/** Return a clearing where the Eyrie can resolve the given Decree slot for
 *  the given card, or null if no such clearing exists. */
export function findSlotTarget(state: GameState, slot: DecreeSlot, cardId: CardId): ClearingId | null {
  const cardSuit = getCard(cardId).suit;
  for (const c of AUTUMN_MAP.clearings) {
    if (!suitMatches(cardSuit, c.suit)) continue;
    const cl = state.map.clearings[c.id]!;
    if (slot === 'recruit') {
      const hasRoost = cl.buildings.some(b => b.faction === 'eyrie' && b.kind === 'roost');
      if (hasRoost && (state.factions.eyrie?.warriorSupply ?? 0) > 0) return c.id;
    } else if (slot === 'move') {
      if ((cl.warriors.eyrie ?? 0) > 0) {
        for (const nb of getAdjacent(AUTUMN_MAP, c.id)) {
          if (eyrieRules(state, c.id) || eyrieRules(state, nb)) return c.id;
        }
      }
    } else if (slot === 'battle') {
      if ((cl.warriors.eyrie ?? 0) > 0) {
        for (const f of ['marquise', 'alliance', 'vagabond'] as const) {
          if ((cl.warriors[f] ?? 0) > 0 || cl.buildings.some(b => b.faction === f) || cl.tokens.some(t => t.faction === f)) {
            return c.id;
          }
        }
      }
    } else if (slot === 'build') {
      if (!eyrieRules(state, c.id)) continue;
      if (cl.buildings.some(b => b.faction === 'eyrie' && b.kind === 'roost')) continue;
      const usedSlots = cl.buildings.length + cl.tokens.filter(t => t.kind === 'keep').length;
      if (usedSlots < c.buildingSlots && (state.factions.eyrie?.roosts.length ?? 0) < 7) return c.id;
    }
  }
  return null;
}

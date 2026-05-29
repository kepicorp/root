// Eyrie-specific bot logic. The general-purpose priority table in bot.ts
// is fine for non-Eyrie factions, but the Eyrie's Decree is a long-horizon
// commitment and the dumb "pick the first highest-priority legal" picker
// happily stuffs cards into slots it can't fulfill — leading straight to
// Turmoil. This module picks the *safest* addToDecree (and adds at most one
// card per birdsong, so the Decree grows at the rate the bot draws).

import type { GameState, Action } from '../engine/types';
import { getCard } from '../engine/cards';
import { findSlotTarget } from '../engine/factions/eyrie/decree';
import type { DecreeSlot } from '../engine/factions/eyrie/state';

interface AddCandidate { slot: DecreeSlot; cardId: string; score: number }

/** Try to pick a sensible Eyrie action for the current state. Returns null
 *  to fall through to the generic priority picker. */
export function pickEyrieAction(state: GameState, legals: Action[]): Action | null {
  const eyrie = state.factions.eyrie;
  if (!eyrie) return null;
  // During daylight, execute the decree step-by-step. For move actions,
  // pick the destination with the most enemy pieces (mirrors the old
  // resolveDecree auto-resolve heuristic). For other execute kinds,
  // pick the first available clearing.
  if (state.phase === 'daylight' && !eyrie.decreeResolved) {
    const execKinds = ['eyrie.executeRecruit', 'eyrie.executeMove', 'eyrie.executeBattle', 'eyrie.executeBuild'] as const;
    for (const kind of execKinds) {
      const candidates = legals.filter(a => a.kind === kind);
      if (candidates.length === 0) continue;
      if (kind === 'eyrie.executeMove') {
        // Pick the move that ends in the clearing with most enemy pieces.
        let bestAction = candidates[0]!;
        let bestScore = -1;
        for (const a of candidates) {
          const mv = a as Extract<Action, { kind: 'eyrie.executeMove' }>;
          const dc = state.map.clearings[mv.to]!;
          const enemyW = (dc.warriors.marquise ?? 0) + (dc.warriors.alliance ?? 0) + (dc.warriors.vagabond ?? 0);
          const enemyP = dc.buildings.filter((b: {faction: string}) => b.faction !== 'eyrie').length
                       + dc.tokens.filter((t: {faction: string}) => t.faction !== 'eyrie').length;
          const score = enemyW * 2 + enemyP;
          if (score > bestScore) { bestScore = score; bestAction = a; }
        }
        return bestAction;
      }
      return candidates[0]!;
    }
    // No execute actions possible — turmoil is the only option.
    const rd = legals.find(a => a.kind === 'eyrie.resolveDecree');
    if (rd) return rd;
  }
  if (state.phase !== 'birdsong') return null;
  // Must choose a leader first. Commander (Move + Battle viziers) works
  // best for the bot: Move sets up the Battle, and combat removes warriors
  // from the board — preventing supply exhaustion that plagues Recruit-
  // heavy leaders like Builder.
  if (eyrie.needsLeaderChoice) {
    const preferred: Action = { kind: 'eyrie.chooseLeader', leader: 'commander' };
    const hasIt = legals.some(a => a.kind === 'eyrie.chooseLeader' && (a as typeof preferred).leader === 'commander');
    if (hasIt) return preferred;
    return null; // fall through
  }

  // One safe add per birdsong is plenty — keeps the Decree manageable and
  // gives the bot a cushion against the map shifting around it.
  if (eyrie.cardsAddedThisBirdsong >= 1) {
    return legals.find(a => a.kind === 'eyrie.endBirdsong') ?? null;
  }

  const adds = legals.filter(a => a.kind === 'eyrie.addToDecree') as Extract<Action, { kind: 'eyrie.addToDecree' }>[];
  if (adds.length === 0) return null;

  const candidates: AddCandidate[] = [];
  for (const a of adds) {
    if (findSlotTarget(state, a.slot, a.cardId) == null) continue; // unsafe — skip
    candidates.push({ slot: a.slot, cardId: a.cardId, score: scoreAdd(state, a.slot, a.cardId) });
  }

  if (candidates.length === 0) {
    // Every option would force a Decree action we can't fulfill. Better to
    // skip the add this turn — yes, that violates the strict "must add"
    // rule, but it avoids the guaranteed Turmoil that would follow.
    return legals.find(a => a.kind === 'eyrie.endBirdsong') ?? null;
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0]!;
  return { kind: 'eyrie.addToDecree', slot: best.slot, cardId: best.cardId };
}

function scoreAdd(state: GameState, slot: DecreeSlot, cardId: string): number {
  const eyrie = state.factions.eyrie!;
  const cardSuit = getCard(cardId).suit;
  let score = 0;

  // Slot biases — building roosts is by far the largest VP lever; battle
  // is fine if we're stronger but slow to net VP; move is mostly setup.
  if (slot === 'build' && eyrie.roosts.length < 7) score += 50;
  else if (slot === 'recruit' && eyrie.roosts.length > 0) score += 30;
  else if (slot === 'battle') score += 20;
  else if (slot === 'move') score += 10;

  // Bird-suit cards are the most versatile — try not to burn them on a
  // slot that a suit-matched card would also fit.
  if (cardSuit === 'bird' && slot !== 'build') score -= 5;

  // Don't pile cards into a single slot — each one needs fulfilling next turn.
  score -= eyrie.decree[slot].length * 8;

  return score;
}

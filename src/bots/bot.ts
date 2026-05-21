// Simple greedy bot. Phase 6 will replace per-faction with Clockwork-style
// decision tables; this baseline ensures a non-human faction always
// progresses the game and never gets stuck.

import type { GameState, Action, Faction } from '../engine/types';
import { getLegalActions } from '../engine/legal';
import { pickEyrieAction } from './eyrie';

/** Heuristic priorities — higher first. */
const PRIORITY: Record<string, number> = {
  // Score-generating
  'marquise.build':                 100,
  'marquise.craft':                  90,
  'eyrie.resolveDecree':            100,
  'alliance.spreadSympathy':        100,
  'alliance.revolt':                100,
  'alliance.organize':               80,
  'vagabond.exploreRuin':           100,
  'vagabond.aid':                    60,
  'vagabond.strike':                 50,
  // Resource-building
  'marquise.placeWood':              80,
  'marquise.recruit':                70,
  'marquise.overwork':               40,
  'vagabond.refresh':                80,
  'vagabond.move':                   30,
  'eyrie.addToDecree':               60,
  'alliance.mobilize':               40,
  // Battles only when score-positive (default low)
  'marquise.battle':                 20,
  'eyrie.battle':                    20,
  'alliance.battle':                 20,
  // Phase-ending fallbacks
  'eyrie.endBirdsong':               10,
  'marquise.endDaylight':             1,
  'alliance.endDaylight':             1,
  'vagabond.endDaylight':             1,
  'marquise.evening':                10,
  'eyrie.evening':                   10,
  'alliance.evening':                10,
  'vagabond.evening':                10,
  'system.advancePhase':              5,
  'system.endTurn':                   2,
};

export function pickAction(state: GameState): Action | null {
  const legals = getLegalActions(state);
  if (legals.length === 0) return null;
  // Faction-specific picker overrides the priority table where the priority
  // table is too coarse — Eyrie Decree composition is the obvious one.
  const active = state.factionOrder[state.activeIndex];
  if (active === 'eyrie') {
    const eyriePick = pickEyrieAction(state, legals);
    if (eyriePick) return eyriePick;
  }
  // Sort by priority desc; tie-break random-ish by stable order.
  const sorted = legals.slice().sort((a, b) => (PRIORITY[b.kind] ?? 0) - (PRIORITY[a.kind] ?? 0));
  return sorted[0] ?? null;
}

/** Apply bot actions until the active faction is `humanFaction` or the game ends. */
export function playUntilHuman(
  state: GameState,
  reducer: (s: GameState, a: Action) => GameState,
  humanFaction: Faction | null,
  maxSteps = 200,
): GameState {
  let s = state;
  for (let i = 0; i < maxSteps; i++) {
    if (s.winner) return s;
    if (s.phase === 'setup' || s.phase === 'gameOver') return s;
    const active = s.factionOrder[s.activeIndex];
    if (active === humanFaction) return s;
    const a = pickAction(s);
    if (!a) return s;
    const next = reducer(s, a);
    if (next === s) {
      // Stuck — try a system phase advance.
      const adv = reducer(s, { kind: 'system.advancePhase' });
      if (adv === s) return s;
      s = adv;
    } else {
      s = next;
    }
  }
  return s;
}

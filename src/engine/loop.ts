// Turn / phase machine.
//
// Each faction's turn runs Birdsong → Daylight → Evening, then control passes
// to the next faction in factionOrder. After the last faction in the round,
// the global turn counter increments.

import { produce } from 'immer';
import type { GameState, Phase } from './types';

const PHASE_SEQUENCE: readonly Phase[] = ['birdsong', 'daylight', 'evening'];

export function startGame(state: GameState): GameState {
  return produce(state, draft => {
    if (draft.phase !== 'setup') return;
    draft.phase = 'birdsong';
    draft.activeIndex = 0;
    draft.log.push({
      turn: draft.turn,
      faction: 'system',
      message: `Game start: ${draft.factionOrder[0]} birdsong`,
    });
  });
}

export function advancePhase(state: GameState): GameState {
  return produce(state, draft => {
    if (draft.phase === 'setup' || draft.phase === 'gameOver') return;
    const i = PHASE_SEQUENCE.indexOf(draft.phase);
    if (i < 0) return;
    if (i < PHASE_SEQUENCE.length - 1) {
      draft.phase = PHASE_SEQUENCE[i + 1]!;
      const faction = draft.factionOrder[draft.activeIndex]!;
      draft.log.push({
        turn: draft.turn,
        faction: 'system',
        message: `${faction} → ${draft.phase}`,
      });
    } else {
      // End of evening → next faction's birdsong.
      draft.activeIndex = (draft.activeIndex + 1) % draft.factionOrder.length;
      if (draft.activeIndex === 0) draft.turn += 1;
      draft.phase = 'birdsong';
      const faction = draft.factionOrder[draft.activeIndex]!;
      draft.log.push({
        turn: draft.turn,
        faction: 'system',
        message: `${faction} begins birdsong (turn ${draft.turn})`,
      });
    }
  });
}

/** Skip directly to the next faction's birdsong. */
export function endTurn(state: GameState): GameState {
  return produce(state, draft => {
    if (draft.phase === 'setup' || draft.phase === 'gameOver') return;
    draft.activeIndex = (draft.activeIndex + 1) % draft.factionOrder.length;
    if (draft.activeIndex === 0) draft.turn += 1;
    draft.phase = 'birdsong';
    draft.log.push({
      turn: draft.turn,
      faction: 'system',
      message: `Now: ${draft.factionOrder[draft.activeIndex]} birdsong (turn ${draft.turn})`,
    });
  });
}

/** Active faction this turn. */
export function activeFaction(state: GameState) {
  return state.factionOrder[state.activeIndex]!;
}

/** Check victory conditions (30 VP triggers immediate end; other paths are
 *  handled by the dominance / coalition modules in later phases). */
/** Hook fired by every faction's finishXxxTurn helper just after the
 *  phase advances to a new faction's birdsong. Handles per-faction
 *  start-of-turn effects (Eyrie Emergency Orders is the only one in the
 *  base rules: if their hand is empty, draw 1 card before they have to
 *  add to the Decree). */
export function onEnterBirdsong(draft: GameState): void {
  const active = draft.factionOrder[draft.activeIndex];
  if (active === 'eyrie' && draft.factions.eyrie && draft.hands.eyrie.length === 0) {
    const c = draft.deck.pop();
    if (c) {
      draft.hands.eyrie.push(c);
      draft.log.push({ turn: draft.turn, faction: 'eyrie', message: 'Emergency Orders: drew 1 card.' });
    }
  }
}

export function checkVictory(state: GameState): GameState {
  if (state.winner) return state;
  for (const f of state.factionOrder) {
    if (state.scores[f] >= 30) {
      return produce(state, draft => {
        draft.winner = { faction: f, via: 'points' };
        draft.phase = 'gameOver';
        draft.log.push({
          turn: draft.turn,
          faction: 'system',
          message: `${f} reached 30 VP — victory!`,
        });
      });
    }
  }
  return state;
}

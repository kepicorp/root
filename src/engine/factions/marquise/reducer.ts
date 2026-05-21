// Marquise reducer. Phase 1 ships a no-op stub; Phase 2 fills it in.
//
// Phase 2 contract: handle every kind in MarquiseAction. Mutate the draft
// via Immer (use `produce` from immer). Always return the new state.

import { produce } from 'immer';
import type { GameState, Action } from '../../types';

export function marquiseReducer(state: GameState, _action: Action): GameState {
  return produce(state, _draft => {
    // TODO Phase 2: implement Marquise actions.
  });
}

/** Legal actions for the Marquise this turn. Phase 2 fills this in. */
export function marquiseLegalActions(_state: GameState): Action[] {
  return [];
}

// Eyrie reducer stub. Phase 3 fills it in.

import { produce } from 'immer';
import type { GameState, Action } from '../../types';

export function eyrieReducer(state: GameState, _action: Action): GameState {
  return produce(state, _draft => {});
}

export function eyrieLegalActions(_state: GameState): Action[] {
  return [];
}

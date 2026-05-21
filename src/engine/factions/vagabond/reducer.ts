// Vagabond reducer stub. Phase 5 fills it in.

import { produce } from 'immer';
import type { GameState, Action } from '../../types';

export function vagabondReducer(state: GameState, _action: Action): GameState {
  return produce(state, _draft => {});
}

export function vagabondLegalActions(_state: GameState): Action[] {
  return [];
}

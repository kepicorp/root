// Alliance reducer stub. Phase 4 fills it in.

import { produce } from 'immer';
import type { GameState, Action } from '../../types';

export function allianceReducer(state: GameState, _action: Action): GameState {
  return produce(state, _draft => {});
}

export function allianceLegalActions(_state: GameState): Action[] {
  return [];
}

import { produce } from 'immer';
import type { GameState } from '../../types';
import { AUTUMN_MAP } from '../../map';
import { STARTING_ITEMS, INITIAL_VAGABOND_STATE } from './state';

export function setupVagabond(state: GameState): GameState {
  return produce(state, draft => {
    const v = draft.factions.vagabond;
    if (!v) return;
    // Pick first ruin clearing as default start.
    const ruin = AUTUMN_MAP.clearings.find(c => c.hasRuin);
    v.clearing = ruin?.id ?? 3;
    draft.map.clearings[v.clearing]!.vagabondHere = true;
    const startItems = STARTING_ITEMS[v.character];
    for (const kind of startItems) {
      v.items.push({ kind, state: 'face-up', exhausted: false });
    }
    v.relationships = { ...INITIAL_VAGABOND_STATE.relationships };
    draft.log.push({
      turn: draft.turn,
      faction: 'vagabond',
      message: `Setup: ${v.character} at clearing ${v.clearing} with ${startItems.length} items.`,
    });
  });
}

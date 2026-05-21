import { produce } from 'immer';
import type { GameState } from '../../types';
import { AUTUMN_MAP } from '../../map';
import { mulberry32 } from '../../rng';
import { STARTING_ITEMS, INITIAL_VAGABOND_STATE } from './state';
import { QUEST_DECK, QUEST_DISPLAY_SIZE } from './quests';

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
    // Shuffle the quest deck deterministically, deal the top 3 face up.
    const ids = QUEST_DECK.map(q => q.id);
    const rng = mulberry32(draft.seed ^ 0xfa11);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    }
    v.questDeck = ids;
    v.questDisplay = [];
    while (v.questDisplay.length < QUEST_DISPLAY_SIZE && v.questDeck.length > 0) {
      v.questDisplay.push(v.questDeck.shift()!);
    }
    draft.log.push({
      turn: draft.turn,
      faction: 'vagabond',
      message: `Setup: ${v.character} at clearing ${v.clearing} with ${startItems.length} items.`,
    });
  });
}

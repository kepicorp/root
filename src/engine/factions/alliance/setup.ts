import { produce } from 'immer';
import type { GameState } from '../../types';

export function setupAlliance(state: GameState): GameState {
  return produce(state, draft => {
    const a = draft.factions.alliance;
    if (!a) return;
    // Pop 3 cards from the deck into supporters (hidden).
    for (let i = 0; i < 3; i++) {
      const c = draft.deck.pop();
      if (c) a.supporters.push(c);
    }
    draft.log.push({
      turn: draft.turn,
      faction: 'alliance',
      message: `Setup: drew ${a.supporters.length} supporters.`,
    });
  });
}
